/**
 * `verify:pack` 起打包态应用 + 取设置窗口（b4 切分 3；段 B 起应用面 / 段 D 读 DOM 面）。
 *
 * 驱动面（对照 b2 `settings.session.mjs` 的取舍，含实测读数）：
 *   · 「取窗口」走 **CDP**：spawn `release/win-unpacked/免费外包.exe --remote-debugging-port=0` ⇒
 *     等 `DevToolsActivePort`（userData 内；兜底解析 stderr「DevTools listening on ws://…」）
 *     ⇒ WebSocket 连设置页目标 ⇒ 读 DOM。口径 = 批次档 b4 §2·P2 段 D「读数 = b2 既有 CDP 读 DOM 接缝」，
 *     与冻结面「测试接缝：CDP 读 DOM（--remote-debugging-port=0）」一致。
 *   · 实测说明（2026-10-11 探针）：`_electron.launch({executablePath: 打包 exe})` 也可行（launch 5031ms、
 *     首窗 url 带 `?page=guide`），但它依赖 Playwright 内部注入路径——显式 executablePath 时启动器不注入
 *     `-r server/electron/loader.js`（playwright-core `lib/coreBundle.js:45681-45696`），批次读数通道
 *     以设计指定的 CDP（公开协议）为准，不吃未文档化行为。
 *   · 本模块只读：不点页签 / 不写 DOM。
 * 环境口径：起应用必剥 ELECTRON_RUN_AS_NODE（见 pack.driver.packAppEnv）；FO_USER_DATA 隔离；
 * 优雅退出 = 二实例 `--quit`（同一 FO_USER_DATA ⇒ 同一单实例锁）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { killTree, quitApp, spawnPackagedApp, waitFor } from './pack.driver.mjs';

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

/** 等 DevTools 端点：优先 `DevToolsActivePort` 文件（userData 内），兜底 stderr 的 DevTools 行 */
function findDevtools(userData, child, timeoutMs = 90000) {
  const file = path.join(userData, 'DevToolsActivePort');
  return waitFor(
    () => {
      try {
        const line = fs.readFileSync(file, 'utf8').split('\n')[0].trim();
        if (/^\d+$/.test(line)) return { port: Number(line) };
      } catch {
        /* 未就位 */
      }
      const m = String(child.err || '').match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) return { port: Number(m[1]) };
      return null;
    },
    timeoutMs,
    300,
  );
}

function makeSession({ userData, child, cdp }) {
  const session = {
    driver: 'cdp',
    userData,
    child,
    /** 在设置页求值（CDP Runtime.evaluate；返回 Promise 时会被等待） */
    eval: (expr) => cdp.eval(expr),
    /** 求值并 JSON 化（支持同步值与 Promise；undefined ⇒ null） */
    async evalJson(expr) {
      const raw = await session.eval(
        `Promise.resolve(${expr}).then((v) => (v === undefined ? 'null' : JSON.stringify(v)))`,
      );
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    /** 轮询页面表达式直到返回真值 */
    waitDom(expr, timeoutMs = 10000) {
      return waitFor(() => session.eval(expr), timeoutMs, 200);
    },
    /** 优雅退出：二实例 `--quit` ⇒ 等首实例退出码 */
    async quit() {
      const r = await quitApp(child, userData);
      if (r.ok) live.delete(session);
      else session.kill();
      return r.ok;
    },
    kill() {
      try {
        cdp.close();
      } catch {
        /* 忽略 */
      }
      killTree(child);
      live.delete(session);
    },
  };
  return session;
}

/** 设置窗口就绪（FOUI + 快照 + 四页签——与 b2 同一判据） */
async function waitReady(session) {
  const ok = await session.waitDom(
    `(typeof window.FOUI === 'object' && window.FOUI.state && window.FOUI.state.snapshot
      && document.querySelectorAll('[data-page]').length === 4) ? 'ready' : null`,
    90000,
  );
  if (!ok) throw new Error('设置窗口未在预算内就绪（FOUI / 快照 / 四页签）');
}

/**
 * 起打包态应用并取设置窗口。
 * @param {{userData: string, envExtra?: object, args?: string[]}} opts
 *        envExtra：附加入 spawn env（如段 D 的 `FO_OPEN_SETTINGS: ''`——清空 b2 驱动的默认开窗接缝）
 * @returns {Promise<object>} 会话（eval / evalJson / waitDom / quit / kill）
 */
export async function startPackApp({ userData, envExtra = {}, args = [] }) {
  const child = spawnPackagedApp({ userData, args: ['--remote-debugging-port=0', ...args], envExtra });
  try {
    const devtools = await findDevtools(userData, child);
    if (!devtools) {
      throw new Error(`未等到 DevTools 端点（DevToolsActivePort / stderr 行；app 退出=${child.exitCode !== null}）`);
    }
    const deadline = Date.now() + 60000;
    let cdp = null;
    while (Date.now() < deadline && !cdp) {
      let list = [];
      try {
        const res = await fetch(`http://127.0.0.1:${devtools.port}/json/list`);
        list = await res.json();
      } catch {
        /* 重试 */
      }
      const pages = list.filter((t) => t.type === 'page' && !String(t.url).startsWith('devtools://'));
      const target = pages.find((t) => String(t.url).includes('settings/index.html'));
      if (target) {
        const candidate = new Cdp(target.webSocketDebuggerUrl);
        try {
          await candidate.ready;
          if ((await candidate.eval('typeof window.FOUI')) === 'object') cdp = candidate;
          else candidate.close();
        } catch {
          candidate.close();
        }
      }
      if (!cdp) await new Promise((r) => setTimeout(r, 400));
    }
    if (!cdp) throw new Error('未连上设置窗口 CDP 目标');
    const session = makeSession({ userData, child, cdp });
    await waitReady(session);
    live.add(session);
    return session;
  } catch (e) {
    killTree(child);
    throw e;
  }
}
