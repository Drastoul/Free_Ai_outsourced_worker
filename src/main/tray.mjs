// 托盘：常驻入口、状态与通知（设计权威：docs/design/overview.md §2.1 / §2.3 / §5；设置界面 §1）
// b2 三入口：「打开设置 / 打开交付目录 / 打开日志目录」（回调经 src/main/index.mjs 接线注入；未接线不显示死菜单项）；
// 端口顺延 / 端口不可用 / 人工接管均以托盘通知告知（b1 语义不变）。

import { Menu, Notification, Tray, nativeImage } from 'electron';
import { truncate } from './log.mjs';

/** 生成 16×16 圆点图标（仓库内不放资产文件；BGRA 位图，Windows 原生格式） */
function makeIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4, 0);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const i = (y * size + x) * 4;
      if (d <= 7.2) {
        buf[i] = 0xed; // B
        buf[i + 1] = 0x6f; // G
        buf[i + 2] = 0x2f; // R
        buf[i + 3] = 0xff; // A
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

/**
 * 创建托盘。
 * @param {{version: string, log: object, onQuit: Function, onClearCooldown?: () => (string[]|null),
 *          onOpenSettings?: Function, onOpenOutbox?: Function, onOpenLogs?: Function}} deps
 *        onClearCooldown = 清除全部外包工冷却（人工处理后的恢复路径），返回被恢复的外包工名；
 *        返回 null / undefined 表示服务尚未就绪；未接线（非函数）时菜单不显示该动作
 *        onOpenSettings / onOpenOutbox / onOpenLogs = 托盘三入口（b2；设计 §1）；未接线不显示死菜单项
 */
export function createTray({ version, log, onQuit, onClearCooldown, onOpenSettings, onOpenOutbox, onOpenLogs }) {
  const tray = new Tray(makeIcon());
  const state = { url: null, service: '启动中', port: null, expectedPort: null };

  /** 系统通知（托盘弹窗；不可用时退化为日志） */
  const notify = ({ title, body }) => {
    log.info(`通知：${title} — ${truncate(body || '', 200)}`);
    try {
      if (Notification.isSupported()) {
        new Notification({ title: truncate(title || '免费外包', 80), body: truncate(body || '', 300) }).show();
        return;
      }
    } catch (e) {
      log.warn(`系统通知失败：${e?.message || e}`);
    }
  };

  /** 「我已处理」菜单动作：清除全部外包工冷却（人工登录 / 过验证码之后）；无冷却 ⇒ 中性提示，不报错 */
  const clearCooldowns = () => {
    let names;
    try {
      names = onClearCooldown();
    } catch (e) {
      log.warn(`清除外包工冷却失败：${e?.message || e}`);
      notify({ title: '免费外包：清除冷却失败', body: `${e?.message || e}` });
      return;
    }
    if (names === null || names === undefined) {
      notify({ title: '免费外包', body: '服务尚未就绪，请稍后再试' });
      return;
    }
    const restored = Array.isArray(names) ? names : [];
    notify(
      restored.length
        ? { title: '免费外包：已清除外包工冷却', body: `已恢复：${restored.join('、')}` }
        : { title: '免费外包', body: '当前没有处于冷却中的外包工' },
    );
  };

  /** 托盘动作的守卫包装：同步 / 异步异常都归为通知（不让托盘菜单静默失败） */
  const guard = (label, fn) => () => {
    try {
      const r = fn();
      if (r && typeof r.then === 'function') {
        r.catch((e) => notify({ title: '免费外包', body: `${label}失败：${e?.message || e}` }));
      }
    } catch (e) {
      notify({ title: '免费外包', body: `${label}失败：${e?.message || e}` });
    }
  };

  const rebuild = () => {
    const items = [
      { label: '免费外包', enabled: false },
      { label: `服务：${state.service}`, enabled: false },
      { label: state.url ? `MCP 地址：${state.url}` : 'MCP 地址：未启动', enabled: false },
    ];
    if (state.port && state.expectedPort && state.port !== state.expectedPort) {
      items.push({ label: `（期望端口 ${state.expectedPort} 被占，已顺延）`, enabled: false });
    }
    items.push({ type: 'separator' });
    items.push({ label: `版本 ${version}`, enabled: false });
    items.push({ type: 'separator' });
    // 托盘三入口（b2；设计 §1）：打开设置 / 打开交付目录 / 打开日志目录——未接线不显示死菜单项
    const openItems = [];
    if (typeof onOpenSettings === 'function') openItems.push({ label: '打开设置', click: guard('打开设置', onOpenSettings) });
    if (typeof onOpenOutbox === 'function') openItems.push({ label: '打开交付目录', click: guard('打开交付目录', onOpenOutbox) });
    if (typeof onOpenLogs === 'function') openItems.push({ label: '打开日志目录', click: guard('打开日志目录', onOpenLogs) });
    if (openItems.length) {
      items.push(...openItems);
      items.push({ type: 'separator' });
    }
    // 未接线该动作时（无回调）不显示死菜单项
    if (typeof onClearCooldown === 'function') {
      items.push({ label: '我已处理（清除外包工冷却）', click: clearCooldowns });
      items.push({ type: 'separator' });
    }
    items.push({ label: '退出', click: () => onQuit() });
    tray.setContextMenu(Menu.buildFromTemplate(items));
    tray.setToolTip(
      state.url ? `免费外包 — MCP ${state.url}` : `免费外包 — ${state.service}`,
    );
  };
  rebuild();

  return {
    /** 更新服务状态（端口 / URL / 文本） */
    update({ url, service, port, expectedPort } = {}) {
      if (url !== undefined) state.url = url;
      if (service !== undefined) state.service = service;
      if (port !== undefined) state.port = port;
      if (expectedPort !== undefined) state.expectedPort = expectedPort;
      rebuild();
    },
    notify,
    destroy() {
      try {
        tray.destroy();
      } catch {
        /* 忽略 */
      }
    },
  };
}
