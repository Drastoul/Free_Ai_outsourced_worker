// 设置接线（b2）：设置服务与窗口控制器的实例化，以及托盘三入口 / 二实例唤起 / 交付目录回落事件的回调转发。
// 提取原因 = 批次档 b2 §2「评审修复 ④」的事实条件：设置接线段内联后 index.mjs 实测 317 行（>300 档）⇒ 按该条拆分计划外提、index.mjs 只留调用（外提后 292 行；本切分交付时 295 行，仍 ≤300）。
// 设计权威：docs/design/modules/settings-app.md §1（形态与入口）/ §5（交付目录）/ §7（配置同步）；
// 依赖注入 = 通知（托盘）/ 配置 / 调度器 / 引擎 / 元数据（userData / 版本 / 服务实况）；Electron 面只在 window.mjs（与 preload.cjs），service.mjs 为纯 Node 面（可脱 Electron 单测）。

import { createSettingsService } from './service.mjs';
import { createSettingsWindow, openPathExternal } from './window.mjs';

/**
 * @param {{config: object, scheduler: object, engine: object, log: object, userDataDir: string, version: string,
 *          guidePath?: string, getServiceInfo?: () => object, notify?: Function, env?: object}} deps
 *        guidePath = 「打开随包文档」落点（打包态 = <resources>/guide/agent-onboarding.md；缺省 = 服务内开发期默认）；
 *        notify = 托盘通知（服务未就绪 / 打开失败时明示，不静默）；env = 进程环境（FO_OPEN_SETTINGS 接缝）
 * @returns {{service: object, controller: object, openSettings: Function, openOutbox: Function,
 *            openLogs: Function, openKind: Function, openIfRequested: Function, emitChanged: Function}}
 */
export function createSettingsWiring({
  config,
  scheduler,
  engine,
  log,
  userDataDir,
  version,
  guidePath,
  getServiceInfo = () => ({}),
  notify = () => {},
  env = process.env,
}) {
  let controller = null;
  const service = createSettingsService({
    config,
    scheduler,
    engine,
    log,
    userDataDir,
    version,
    guidePath,
    getServiceInfo,
    broadcast: (snapshot) => controller?.broadcast(snapshot) === true,
  });
  controller = createSettingsWindow({ service, log });

  // 运行期交付目录回落 ⇒ 设置页同步显示实际落点与原因（T11 / M3；事件源 = scheduler.reportOutboxFallback）
  scheduler.on('outbox-fallback', (outbox) => {
    void service.notifyOutboxFallback(outbox);
  });

  /** 打开设置窗口（单例：未销毁 ⇒ 聚焦；已销毁 ⇒ 重建）；initialPage = 可选初始页（T5 首启引导接缝） */
  const openSettings = (initialPage) => controller.open(initialPage);

  /** 托盘入口：按落点解析结果用系统默认程序打开（outbox 实际路径 / 日志目录） */
  async function openKind(kind) {
    const resolved = await service.resolveOpenPath(kind);
    if (!resolved.ok) {
      notify({ title: '免费外包', body: resolved.error });
      return null;
    }
    const opened = await openPathExternal(resolved.path);
    if (!opened.ok) notify({ title: '免费外包', body: opened.error });
    return opened.ok ? opened.path : null;
  }

  /** FO_OPEN_SETTINGS=1 ⇒ 启动即打开设置窗口（开发 / 测试口径，与 FO_USER_DATA / --quit 同列） */
  function openIfRequested() {
    if (!env?.FO_OPEN_SETTINGS) return false;
    log.info('FO_OPEN_SETTINGS=1：启动即打开设置窗口（开发 / 测试口径）');
    controller.open();
    return true;
  }

  return {
    service,
    controller,
    openSettings,
    openOutbox: () => openKind('outbox'),
    openLogs: () => openKind('logs'),
    openKind,
    openIfRequested,
    emitChanged: (reason) => service.emitChanged(reason),
  };
}
