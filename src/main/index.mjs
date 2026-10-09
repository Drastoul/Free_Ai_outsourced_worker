// 应用入口（主进程）：单实例 / 托盘 / 生命周期 / 配置 / 引擎接线 / MCP 服务 / runtime.json / 设置窗口接线（b2，见 src/settings/wiring.mjs）。
// 设计权威：docs/design/overview.md §2（进程与 MCP 接入）、§2.1（二实例唤起）、§2.3（端口策略与 runtime.json）、§4（配置存储）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { createLogger } from './log.mjs';
import { loadConfig } from './config.mjs';
import { createTray } from './tray.mjs';
import { EngineClient } from './engine-client.mjs';
import { Scheduler } from './scheduler/scheduler.mjs';
import { startMcpServer } from './mcp/server.mjs';
import { createSettingsWiring } from '../settings/wiring.mjs';
import { resolveOutboxDir, writeJsonAtomic } from '../shared/outbox.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const engineHostScript = path.join(repoRoot, 'src', 'engine', 'host.mjs');

// 测试 / 多实例隔离：FO_USER_DATA 覆盖 userData（须在读取任何路径前设置）
if (process.env.FO_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.FO_USER_DATA));
}

const wantsQuit = process.argv.slice(1).includes('--quit');

let log = createLogger({ dir: null, console: true });
let tray = null;
let engine = null;
let scheduler = null;
let mcp = null;
let runtimeFile = null;
let quitting = false;
let settings = null;

// ---------------------------------------------------------------------------
// 单实例：二实例启动时唤起已运行实例——打开并聚焦设置窗口（b2；docs/design/overview.md §2.1）；
// 首实例尚未就绪（设置未接线）⇒ 退回托盘通知告知已在运行（不静默）
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 二实例：诉求（退出 / 唤起）已交给首实例，本进程立即退出
  exitBeforeReady();
} else {
  app.on('second-instance', (_event, argv) => {
    if (Array.isArray(argv) && argv.slice(1).includes('--quit')) {
      log.info('收到第二实例的退出请求（--quit）');
      app.quit();
      return;
    }
    log.info('检测到第二实例启动：打开并聚焦设置窗口（单实例）');
    const opened = withSettings((s) => s.openSettings(), { notReadyMessage: null });
    // 首实例仍处启动早期（设置与托盘都未就绪）⇒ 至少留一行日志，不让诉求静默丢失
    if (!opened) {
      log.warn('二实例唤起：设置界面尚未就绪，暂无法打开（已在运行的实例继续运行）');
      tray?.notify({ title: '免费外包已在运行', body: trayInfo() });
    }
  });

  if (wantsQuit) {
    // 无运行实例时收到 --quit：直接退出
    exitBeforeReady();
  } else {
    app.whenReady().then(main).catch((err) => {
      log.error(`启动失败：${err?.stack || err}`);
      app.exit(1);
    });
  }
}

/** ready 前的退出路径：本进程未初始化任何资源（无托盘 / 无引擎 / 无 runtime.json）。
 *  防御：Electron 在 ready 前 quit 偶有不生效 ⇒ 2s 后强制退出，不留僵尸进程。 */
function exitBeforeReady() {
  app.quit();
  const forceExit = setTimeout(() => app.exit(0), 2000);
  forceExit.unref?.();
}

function trayInfo() {
  return mcp?.ok ? `MCP 地址：${mcp.url}` : 'MCP 服务未启动（详见日志）';
}

/** 设置入口守卫：尚未接线（启动早期）⇒ 明示，不静默；notReadyMessage=null 时不发通知（调用方自行告知） */
function withSettings(fn, { notReadyMessage = '设置界面尚未就绪，请稍后再试' } = {}) {
  if (!settings) {
    if (notReadyMessage) tray?.notify({ title: '免费外包', body: notReadyMessage });
    return null;
  }
  return fn(settings);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const userData = app.getPath('userData');
  await fs.promises.mkdir(userData, { recursive: true });
  log = createLogger({ dir: userData, console: true });
  const version = app.getVersion();
  const startedAt = new Date().toISOString();
  log.info(`免费外包启动：version=${version} pid=${process.pid} userData=${userData}`);
  if (process.env.FO_USER_DATA) log.info(`（userData 由 FO_USER_DATA 覆盖：${process.env.FO_USER_DATA}）`);

  app.setAppUserModelId('free-outsource');

  // 托盘（常驻入口；通知面 +「我已处理」冷却恢复动作）
  tray = createTray({
    version,
    log,
    onQuit: () => app.quit(),
    // 人工处理后的恢复路径（scheduler.md §6）：清全部外包工冷却；服务尚未起来 ⇒ null（菜单给中性提示）
    onClearCooldown: () => (scheduler ? scheduler.workforce.clearAllHealth() : null),
    // 托盘三入口（b2；设计 §1）：打开设置 / 打开交付目录 / 打开日志目录
    onOpenSettings: () => withSettings((s) => s.openSettings()),
    onOpenOutbox: () => void withSettings((s) => s.openOutbox()),
    onOpenLogs: () => void withSettings((s) => s.openLogs()),
  });
  tray.update({ service: '启动中' });

  // 配置
  const config = await loadConfig({ userDataDir: userData, log });
  log.info(`配置载入：${config.file}（期望端口 ${config.current.mcp.port}，外包工 ${config.current.workers.length} 个；交付目录配置值 ${config.current.outboxDir}）`);

  // 引擎子进程（崩溃自动重启；就绪前任务排队）
  engine = new EngineClient({
    hostScript: engineHostScript,
    cwd: repoRoot,
    userDataDir: userData,
    configFile: config.file,
    version,
    log,
    notify: (n) => tray?.notify(n),
  });
  engine.start();

  // 调度器
  scheduler = new Scheduler({
    config,
    engine,
    log,
    notify: (n) => tray?.notify(n),
  });

  // 设置接线（b2）：服务 + 窗口控制器 + 托盘三入口 / 二实例 / 回落事件（细节见 src/settings/wiring.mjs）
  settings = createSettingsWiring({
    config,
    scheduler,
    engine,
    log,
    userDataDir: userData,
    version,
    notify: (n) => tray?.notify(n),
    getServiceInfo: () => ({
      ok: mcp?.ok === true,
      url: mcp?.url ?? null,
      port: mcp?.port ?? null,
      reason: mcp?.reason ?? null,
    }),
  });
  settings.openIfRequested();

  // 交付目录实际路径解析（启动时点；回落 ⇒ 明示）
  const outbox = await resolveOutboxDir(config.current.outboxDir, { log });
  if (!outbox.dir) {
    log.error(`交付目录不可用：${outbox.reason}`);
    tray.notify({ title: '免费外包：交付目录不可用', body: outbox.reason });
  } else if (outbox.fallback) {
    scheduler.reportOutboxFallback(outbox);
  } else {
    log.info(`交付目录：${outbox.dir}`);
  }

  // 重启扫描：非终态 manifest 标记 interrupted（不自动重跑）
  try {
    await scheduler.markInterrupted();
  } catch (e) {
    log.warn(`重启扫描失败：${e?.message || e}`);
  }

  // MCP 服务（端口顺延 ≤ +120；全占 ⇒ 不启动 + 明示）
  mcp = await startMcpServer({ version, config, scheduler, log });
  if (mcp.ok) {
    runtimeFile = await writeRuntimeFile({ userData, host: mcp.host, port: mcp.port, version, startedAt });
    tray.update({
      url: mcp.url,
      service: '运行中',
      port: mcp.port,
      expectedPort: config.current.mcp.port,
    });
    if (mcp.port !== config.current.mcp.port) {
      tray.notify({
        title: 'MCP 地址已变化，请更新宿主配置',
        body: `期望端口 ${config.current.mcp.port} 被占用，实际地址：${mcp.url}`,
      });
    }
  } else {
    tray.update({ service: '未启动（端口不可用）', url: null });
    tray.notify({
      title: '免费外包：端口不可用',
      body: `${mcp.reason}；请释放占用端口的程序，或改写配置 mcp.port 后重启`,
    });
  }

  // 服务状态就绪 ⇒ 推一次快照（接入指引页据实况显示「运行中 / 未启动 + 原因 / 建议」）
  void settings?.emitChanged('服务状态');

  app.on('window-all-closed', () => {
    /* 托盘常驻：不随窗口关闭退出 */
  });
}

async function writeRuntimeFile({ userData, host, port, version, startedAt }) {
  const file = path.join(userData, 'runtime.json');
  await writeJsonAtomic(file, {
    pid: process.pid,
    host,
    port,
    url: `http://${host}:${port}/mcp`,
    version,
    startedAt,
  });
  log.info(`runtime.json 已写：${file}（port=${port}）`);
  return file;
}

// ---------------------------------------------------------------------------
// 退出清理（runtime.json 尽力删除；引擎先关上下文再退出）
// ---------------------------------------------------------------------------

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  log.info('退出：开始清理');
  cleanup()
    .catch((e) => log.warn(`清理异常：${e?.message || e}`))
    .finally(() => app.exit(0));
});

async function cleanup() {
  try {
    scheduler?.stop();
  } catch {
    /* 忽略 */
  }
  if (mcp?.ok) {
    try {
      await withTimeout(mcp.close(), 3000, 'MCP 服务关闭超时');
    } catch (e) {
      log.warn(`MCP 服务关闭异常：${e?.message || e}`);
    }
  }
  try {
    await engine?.shutdown();
  } catch (e) {
    log.warn(`引擎停机异常：${e?.message || e}`);
  }
  removeRuntimeFile();
  try {
    tray?.destroy();
  } catch {
    /* 忽略 */
  }
  log.info('退出清理完成');
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function removeRuntimeFile() {
  if (!runtimeFile) return;
  try {
    fs.rmSync(runtimeFile, { force: true });
    log.info(`runtime.json 已删除：${runtimeFile}`);
  } catch (e) {
    log.warn(`runtime.json 删除失败：${e?.message || e}`);
  }
  runtimeFile = null;
}

// 崩溃 / 强退兜底：尽力删除 runtime.json（进程被强杀时不保证）
process.on('exit', () => {
  try {
    if (runtimeFile) fs.rmSync(runtimeFile, { force: true });
  } catch {
    /* 忽略 */
  }
});
