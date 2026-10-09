/**
 * `verify:settings` 起应用与会话驱动（b2 切分④）：取设置窗口 / 驱动面 / 优雅退出。
 *
 * 「取窗口」三条实现（同一入口 `startSettingsApp` 按序尝试；取舍与实测结果）：
 *   ① `_electron`（Playwright 缺省形态——playwright 自解析 electron 并注入 loader.js）
 *      实测（2026-10-09 本机，前置自证）：launch 615ms ⇒ `firstWindow` 命中设置页 ⇒ DOM 读数（4 页签）
 *      ⇒ 二实例 `--quit` 优雅退出 exitCode=0，全通过 ⇒ **主路径**。
 *   ② `_electron`（显式 `executablePath`）：实测 898ms 起、全通过（同上）；作为 ① 的次选
 *      （依赖链更短，不经 playwright 的 loader 注入）。
 *   ③ CDP 退化路径（spawn electron + `FO_OPEN_SETTINGS=1` + `--remote-debugging-port=0` ⇒ 读
 *      `DevToolsActivePort` ⇒ WebSocket 连 CDP）：切分③ 已实测 45/45；若 ①② 都不通则自动落此。
 *   跳过前面的尝试单独强测某条：环境变量 `FO_VERIFY_SETTINGS_DRIVER=cdp`（或 `electron-exec`）。
 * 三条路径共用同一驱动面（`eval` / `evalJson` / `waitDom` / `click` / `clipboard`），用例正文与路径无关。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { _electron } from 'playwright';
import { REPO, appEnv, electronPath, readClipboardRaw, sleep, waitFor } from './settings.driver.mjs';

/** 彻底结束进程树：win32 下 `_electron` 经 cmd.exe 包装启动（shell:true）⇒ 只 kill 外壳会留下孤儿 Electron */
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill();
    }
  } catch {
    /* 忽略：尽力清理 */
  }
}

/** @type {Set<object>} */
const live = new Set();
export function killAll() {
  for (const s of [...live]) {
    try {
      s.kill();
    } catch {
      /* 忽略 */
    }
  }
}

function makeSession({ driver, userData, child, app = null, cdp = null, page = null, clipboardElectron = null }) {
  const session = {
    driver,
    userData,
    child,
    app,
    page,
    /** 在设置页求值（Playwright page.evaluate / CDP Runtime.evaluate；返回 Promise 时会被等待） */
    eval: (expr) => (page ? page.evaluate(expr) : cdp.eval(expr)),
    /** 求值并 JSON 化（支持同步值与 Promise；undefined ⇒ null） */
    async evalJson(expr) {
      const raw = await session.eval(`Promise.resolve(${expr}).then((v) => (v === undefined ? 'null' : JSON.stringify(v)))`);
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    /** 轮询页面表达式直到返回真值 */
    waitDom(expr, timeoutMs = 10000) {
      return waitFor(() => session.eval(expr), timeoutMs, 200);
    },
    /** 点击节点（选择器找不到 ⇒ 抛错，不静默） */
    async click(selector) {
      await session.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
    },
    /** 关闭设置窗口（应用常驻语义下应仍存活） */
    async closeWindow() {
      if (page) await page.close();
      else await cdp.send('Page.close');
    },
    /** 读系统剪贴板（Electron 主进程 API 优先；CDP 路径回退 PowerShell） */
    async clipboard() {
      if (clipboardElectron) {
        try {
          return await clipboardElectron();
        } catch {
          /* 落回 PowerShell */
        }
      }
      const r = await readClipboardRaw();
      return r.text;
    },
    /** 优雅退出：二实例 `--quit`（应用自身通道）→ 等进程退出码 */
    async quit() {
      const exited = waitFor(() => (child.exitCode !== null ? true : null), 45000, 250);
      const quitter = spawn(electronPath, ['.', '--quit'], { cwd: REPO, env: appEnv(userData, {}), stdio: 'ignore', windowsHide: true });
      quitter.on('error', () => {}); // spawn 失败不得成为无人处理的 'error' 事件（会记到当前用例头上）
      const ok = await exited;
      if (app) {
        try {
          await Promise.race([app.close().catch(() => {}), sleep(6000)]);
        } catch {
          /* 忽略 */
        }
      }
      if (ok) live.delete(session);
      else session.kill();
      return ok === true;
    },
    kill() {
      try {
        if (cdp) cdp.close();
      } catch {
        /* 忽略 */
      }
      killTree(child);
      live.delete(session);
    },
  };
  return session;
}

/** 等 FOUI 就绪 + 四页签 + 快照已取（窗口可用性判据） */
async function waitReady(session) {
  const ok = await session.waitDom(
    `(typeof window.FOUI === 'object' && window.FOUI.state && window.FOUI.state.snapshot && document.querySelectorAll('[data-page]').length === 4) ? 'ready' : null`,
    60000,
  );
  if (!ok) throw new Error('设置窗口未在预算内就绪（FOUI / 快照 / 四页签）');
}

/** ① `_electron` 缺省形态；`executablePath` 非空 = ② 显式二进制形态 */
async function electronSession({ userData, envExtra }, executablePath = null) {
  const opts = { args: ['.'], cwd: REPO, env: appEnv(userData, envExtra), timeout: 90000 };
  if (executablePath) opts.executablePath = executablePath;
  const app = await _electron.launch(opts);
  try {
    let page = await app.firstWindow({ timeout: 60000 });
    const isSettings = (p) => String(p.url()).includes('settings/index.html');
    if (!isSettings(page)) {
      const other = await waitFor(async () => {
        const p = await app.waitForEvent('window', { timeout: 5000 }).catch(() => null);
        return p && isSettings(p) ? p : null;
      }, 30000, 100);
      if (other) page = other;
    }
    if (!isSettings(page)) throw new Error(`未取到设置窗口（首个窗口 url=${page.url()}）`);
    const session = makeSession({
      driver: executablePath ? 'electron-exec' : 'electron',
      userData,
      child: app.process(),
      app,
      page,
      clipboardElectron: () => app.evaluate(({ clipboard }) => clipboard.readText()),
    });
    await waitReady(session);
    live.add(session);
    return session;
  } catch (e) {
    try {
      await Promise.race([app.close().catch(() => {}), sleep(5000)]);
    } catch {
      /* 忽略 */
    }
    const proc = app.process();
    killTree(proc);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// ③ CDP 退化路径（切分③ 实证：spawn + DevToolsActivePort + CDP over WebSocket）
// ---------------------------------------------------------------------------

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(true));
      this.ws.addEventListener('error', (e) => reject(new Error(`CDP 连接失败：${e?.message || e}`)));
    });
    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message || 'CDP 错误'}`));
      else p.resolve(msg.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return p;
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r?.exceptionDetails) throw new Error(`页面求值异常：${r.exceptionDetails.text || ''} ${r.result?.description || ''}`);
    return r?.result?.value;
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* 忽略 */
    }
  }
}

async function cdpSession({ userData, envExtra }) {
  const child = spawn(electronPath, ['.', '--remote-debugging-port=0'], {
    cwd: REPO,
    env: appEnv(userData, envExtra),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  try {
    const port = await waitFor(() => {
      try {
        const line = fs.readFileSync(path.join(userData, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
        return /^\d+$/.test(line) ? Number(line) : null;
      } catch {
        return null;
      }
    }, 60000);
    if (!port) throw new Error('未等到 DevToolsActivePort（--remote-debugging-port=0）');
    const deadline = Date.now() + 40000;
    let cdp = null;
    while (Date.now() < deadline && !cdp) {
      let list = [];
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        list = await res.json();
      } catch {
        /* 重试 */
      }
      const pages = list.filter((t) => t.type === 'page' && !String(t.url).startsWith('devtools://'));
      const target = pages.find((t) => String(t.url).includes('settings/index.html')) || pages[0];
      if (target) {
        const candidate = new Cdp(target.webSocketDebuggerUrl);
        try {
          await candidate.ready;
          if ((await candidate.eval('typeof window.fo')) === 'object') cdp = candidate;
          else candidate.close();
        } catch {
          candidate.close();
        }
      }
      if (!cdp) await sleep(400);
    }
    if (!cdp) throw new Error('未连上设置页 CDP 目标');
    const session = makeSession({ driver: 'cdp', userData, child, cdp });
    await waitReady(session);
    live.add(session);
    return session;
  } catch (e) {
    killTree(child);
    throw e;
  }
}

/**
 * 起应用并取设置窗口（同一入口按序尝试三条路径；见文件头「取窗口」）。
 * @param {{userData: string, envExtra?: object}} opts
 * @returns {Promise<object>} 会话（eval / evalJson / waitDom / click / clipboard / quit / kill）
 */
export async function startSettingsApp({ userData, envExtra = {} }) {
  const forced = String(process.env.FO_VERIFY_SETTINGS_DRIVER || '').trim().toLowerCase();
  const ladder =
    forced === 'cdp'
      ? [['cdp', cdpSession]]
      : forced === 'electron-exec'
        ? [['electron-exec', (o) => electronSession(o, electronPath)]]
        : [
            ['electron', electronSession],
            ['electron-exec', (o) => electronSession(o, electronPath)],
            ['cdp', cdpSession],
          ];
  const errors = [];
  for (const [name, attempt] of ladder) {
    try {
      const session = await attempt({ userData, envExtra });
      console.log(`[verify:settings] 取窗口路径 = ${session.driver}`);
      return session;
    } catch (e) {
      errors.push(`${name}: ${e?.message || e}`);
    }
  }
  throw new Error(`设置窗口未就绪（${ladder.length} 条路径均失败）：\n${errors.join('\n')}`);
}
