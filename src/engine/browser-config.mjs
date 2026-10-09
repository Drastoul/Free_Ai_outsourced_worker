/**
 * 引擎的配置与路径解析（`docs/design/modules/browser-engine.md` §2–§4）：
 * userData 位置、外包工配置目录与下载暂存区、浏览器启动选项、暂存区文件名安全化。
 * 引擎**只读**配置（写权在主进程；config.json 的 browser 段仅作启动选项来源之一）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 默认 userData（`docs/design/overview.md` §2.3 / §4）：主进程以 `FO_USER_DATA` 传给引擎子进程
 * （与主进程 `app.setPath('userData', …)` 同源）；`FREE_OUTSOURCE_USER_DATA` 为引擎侧开发 / 自测别名；
 * 两者缺省 ⇒ `%APPDATA%\free-outsource`。
 */
export function defaultUserDataDir(env = process.env) {
  const override = env.FO_USER_DATA || env.FREE_OUTSOURCE_USER_DATA;
  if (override) return path.resolve(override);
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'free-outsource');
}

/** 目录名安全化（worker id 用作目录名） */
export function safeSegment(raw) {
  const s = String(raw ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+$/, '');
  return s || 'worker';
}

/** 只读窥视配置的 browser 段（引擎不写配置；路径优先用主进程传的 `FO_CONFIG_FILE`） */
export function readConfigBrowser(userDataDir, log = () => {}, env = process.env) {
  try {
    const file = env.FO_CONFIG_FILE ? path.resolve(env.FO_CONFIG_FILE) : path.join(userDataDir, 'config.json');
    if (!fs.existsSync(file)) return null;
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    return cfg?.browser ?? null;
  } catch (e) {
    log(`读取 config.json 的 browser 段失败（按默认继续）：${String(e?.message ?? e).slice(0, 160)}`);
    return null;
  }
}

/**
 * 浏览器启动选项（`browser-engine.md` §3）。
 * 来源优先级：环境变量（测试 / 开发用）→ config.json 的 browser 段 → 出厂默认（随包 chromium）。
 * 有头模式是硬约束（登录 / 验证码需人工窗口）——headless 恒为 false。
 */
export function resolveBrowserOptions({ env = process.env, configBrowser = null } = {}) {
  const mode = env.FREE_OUTSOURCE_BROWSER_MODE || configBrowser?.mode || 'chromium';
  const explicitChannel = env.FREE_OUTSOURCE_BROWSER_CHANNEL || configBrowser?.channel || '';
  const channel = explicitChannel || (mode === 'edge' ? 'msedge' : undefined);
  return { mode, channel };
}

/** 暂存区文件名安全化（只取 basename + 去非法字符；正式命名净化在交付落盘处执行） */
export function stagedName(raw) {
  const name = String(raw ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim();
  return name || 'download';
}

/** 同盘 rename；跨盘（EXDEV）⇒ copy + 删源 */
export function moveFileSafe(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    if (e?.code !== 'EXDEV') throw e;
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}
