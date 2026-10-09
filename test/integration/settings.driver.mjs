/**
 * `verify:settings` 共享读数工具（b2 切分④）：轮询 / 端口 / 隔离目录 / 配置与日志读数 / 剪贴板 / MCP 客户端。
 * 「起应用 + 取设置窗口」的驱动面见同目录 `settings.session.mjs`。
 * 环境口径：起应用一律剥 `ELECTRON_RUN_AS_NODE`；`FO_USER_DATA` 隔离到 `.thincoder/tmp/verify-settings/`
 * （不碰真实 %APPDATA%）；中文断言一律 UTF-8 感知写法。
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..');
export const TMP = path.join(REPO, '.thincoder', 'tmp', 'verify-settings');
const require = createRequire(path.join(REPO, 'package.json'));
export const electronPath = require('electron');
export const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轮询直到 fn 返回真值（或超时 ⇒ null；fn 抛错按未就绪处理） */
export async function waitFor(fn, timeoutMs = 20000, stepMs = 200) {
  const t0 = Date.now();
  for (;;) {
    const v = await Promise.resolve().then(() => fn()).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(stepMs);
  }
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

/** 占住一个端口（返回 server；调用方负责 close。已被别的程序占用 ⇒ 同样满足「占住」语义） */
export function blockPort(port) {
  const srv = net.createServer();
  return new Promise((resolve) => {
    srv.once('error', () => resolve(srv));
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

export function freshUserData(name) {
  const dir = path.join(TMP, name);
  try {
    // Windows：上轮实例句柄释放可能有滞后 ⇒ 带重试（句柄仍在则带明确提示失败，不静默降级）
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    throw new Error(`清理临时 userData 失败（可能仍有上轮实例持有该目录）：${dir}；${e?.message || e}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 起应用环境：剥 ELECTRON_RUN_AS_NODE（否则 electron 以纯 Node 模式启动）+ FO_USER_DATA / FO_OPEN_SETTINGS 接缝 */
export function appEnv(userData, extra = {}) {
  const env = { ...process.env, FO_USER_DATA: userData, FO_OPEN_SETTINGS: '1', ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/** 写隔离配置（b1 测试同形：browser.mode=edge，不依赖未安装的随包 Chromium） */
export function writeConfig(userData, { port, outboxDir, workers, browser, limits } = {}) {
  fs.mkdirSync(userData, { recursive: true });
  const cfg = {
    version: 1,
    mcp: { port, host: '127.0.0.1', token: '' },
    browser: browser || { mode: 'edge', channel: 'msedge', headless: false },
    outboxDir,
    workers,
  };
  if (limits) cfg.limits = limits;
  fs.writeFileSync(path.join(userData, 'config.json'), `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

export function readConfig(userData) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  } catch {
    return null;
  }
}

export async function waitConfig(userData, pred, timeoutMs = 10000) {
  return waitFor(() => {
    const c = readConfig(userData);
    return c && pred(c) ? c : null;
  }, timeoutMs, 150);
}

export function readRuntime(userData) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
  } catch {
    return null;
  }
}

export async function waitRuntime(userData, pred = () => true, timeoutMs = 90000) {
  return waitFor(() => {
    const rt = readRuntime(userData);
    return rt && pred(rt) ? rt : null;
  }, timeoutMs);
}

export async function healthz(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    return await res.json();
  } catch {
    return null;
  }
}

export function readAppLog(userData) {
  try {
    return fs.readFileSync(path.join(userData, 'logs', 'app.log'), 'utf8');
  } catch {
    return '';
  }
}

/** 系统剪贴板读数（PowerShell；UTF-8 显式——③ 实测写法，中文路径不乱码） */
export function readClipboardRaw() {
  return new Promise((resolve) => {
    const ps = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw'],
      { windowsHide: true },
    );
    let out = '';
    ps.stdout.on('data', (d) => {
      out += d;
    });
    ps.stderr.on('data', () => {});
    ps.on('error', () => resolve({ ok: false, text: '', error: 'powershell 不可用' }));
    ps.on('close', (code) => resolve({ ok: code === 0, text: out, error: code === 0 ? '' : `exit ${code}` }));
  });
}

/** MCP 客户端（与 verify:loop 同法：initialize 握手 + tools/call） */
export async function makeMcpClient(port) {
  let rpcId = 1;
  const post = async (body, sessionId) => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, text: await res.text() };
  };
  const init = await post({
    jsonrpc: '2.0',
    id: rpcId++,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify-settings', version: '1.0.0' } },
  });
  const sessionId = init.headers.get('mcp-session-id');
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
  return {
    async call(name, args) {
      const r = await post({ jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name, arguments: args } }, sessionId);
      let json = null;
      try {
        json = JSON.parse(r.text);
      } catch {
        /* 保持 null */
      }
      const payload = json?.result?.content?.[0]?.text;
      let data = null;
      try {
        data = payload ? JSON.parse(payload) : null;
      } catch {
        /* 保持 null */
      }
      return { status: r.status, isError: json?.result?.isError === true, data, raw: r.text.slice(0, 400) };
    },
  };
}
