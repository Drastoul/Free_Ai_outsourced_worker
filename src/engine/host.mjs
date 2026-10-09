#!/usr/bin/env node
/**
 * 引擎子进程入口（`docs/design/modules/browser-engine.md`、`docs/design/modules/scheduler.md` §10）：
 *   · 协议 = **行分隔 JSON-RPC 2.0 over stdio**；stdout **只出 JSON-RPC 行**，日志一律走 stderr；
 *   · 方法 = `engine.health` / `task.run` / `task.cancel` / `engine.shutdown`；b2 增量 = `worker.check`
 *     （「打开并检查」，语义见 `src/engine/worker-check.mjs`；既有四方法契约不变）；
 *   · 失败口径（主包AI 裁定 2026-10-09）= 业务 / 任务失败走 **`result.error: {code,message,hint?}`**；
 *     JSON-RPC `error` 只承载协议级 / 内部异常（报文不可解析、未知 method 等）；
 *   · 进度事件 = `{event:"task-progress", taskId, phase}`（逐行发出，phase 链见 `scheduler.md` §2）。
 *
 * 本文件只负责「协议面 + 引擎装配」；任务编排见 `src/engine/task-runner.mjs`，
 * 浏览器会话见 `src/engine/browser.mjs`，落盘见 `src/engine/artifacts.mjs`。
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { BrowserHost } from './browser.mjs';
import { defaultUserDataDir, readConfigBrowser, resolveBrowserOptions } from './browser-config.mjs';
import { listAdapters } from './adapters/registry.mjs';
import { EngineError } from './adapters/base.mjs';
import { TaskRunner } from './task-runner.mjs';
import { checkWorker } from './worker-check.mjs';
import { makeLogger, sleep } from './util.mjs';

export { DEFAULT_TIMEOUTS } from './task-runner.mjs';
export { DEFAULT_MAX_FILE_BYTES, sanitizeName, uniqueName, importDownloads } from './artifacts.mjs';

function packageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/** 装配一个引擎实例（浏览器会话 + 任务编排 + 健康/退出） */
export function createEngine({ env = process.env, log = makeLogger(), emit = () => {} } = {}) {
  const userDataDir = defaultUserDataDir(env);
  const browserLog = (m) => log('browser', m);
  const browser = new BrowserHost({
    userDataDir,
    log: browserLog,
    env,
    browserOptions: resolveBrowserOptions({ env, configBrowser: readConfigBrowser(userDataDir, browserLog, env) }),
  });
  const runner = new TaskRunner({ browser, log, emit });
  const startedAt = Date.now();

  function health() {
    return {
      ok: true,
      pid: process.pid,
      version: packageVersion(),
      userDataDir,
      browser: {
        mode: browser.browserOptions.mode,
        channel: browser.browserOptions.channel ?? null,
        sessions: browser.status(),
      },
      adapters: listAdapters().map((a) => ({ id: a.id, platformName: a.platformName, capabilities: a.capabilities })),
      runningTasks: runner.list(),
      uptimeMs: Date.now() - startedAt,
    };
  }

  /** 退出清理（主进程退出前发 engine.shutdown；超时 5 秒强杀由主进程执行） */
  async function shutdown({ graceMs = 4000 } = {}) {
    const closed = await Promise.race([browser.closeAll().catch(() => 0), sleep(graceMs).then(() => 'timeout')]);
    return { ok: true, closed };
  }

  return {
    userDataDir,
    browser,
    runner,
    health,
    shutdown,
    runTask: (params) => runner.run(params),
    cancelTask: (params) => runner.cancel(params),
    // worker.check 仅透传 worker；预算不入协议（协议无预算参数，deadline 权威 = 主进程——scheduler.md §10）
    checkWorker: (params) =>
      checkWorker({ browser, runner, worker: params?.worker, log: (m) => log('check', m) }),
  };
}

/* ────────────────────────────── JSON-RPC 服务端（stdio，行分隔） ────────────────────────────── */

class ProtocolError extends Error {}

/**
 * 启动 stdio JSON-RPC 服务端（`docs/design/modules/scheduler.md` §10）。
 * stdout 只出 JSON-RPC 行；日志走 stderr。
 */
export function startServer({ env = process.env } = {}) {
  const log = makeLogger();
  const writeLine = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const engine = createEngine({ env, log, emit: writeLine });

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  async function handleLine(line) {
    const text = String(line ?? '').trim();
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (e) {
      log('协议', `stdin 收到不可解析的报文（已忽略）：${String(e?.message ?? e).slice(0, 120)}`);
      return;
    }
    const id = msg?.id ?? null;
    const method = msg?.method;
    const params = msg?.params ?? {};
    try {
      if (typeof method !== 'string' || !method) throw new ProtocolError('请求缺 method');
      let result;
      if (method === 'engine.health') {
        result = engine.health();
      } else if (method === 'task.run') {
        if (typeof params?.taskId !== 'string' || !params.taskId) throw new ProtocolError('task.run 缺 taskId');
        result = await engine.runTask(params);
      } else if (method === 'task.cancel') {
        result = engine.cancelTask(params);
      } else if (method === 'worker.check') {
        result = await engine.checkWorker(params);
      } else if (method === 'engine.shutdown') {
        writeLine({ jsonrpc: '2.0', id, result: { ok: true } });
        await engine.shutdown();
        process.exit(0);
      } else {
        throw new ProtocolError(`未知 method：${method}`);
      }
      writeLine({ jsonrpc: '2.0', id, result });
    } catch (e) {
      const code = e instanceof ProtocolError || e instanceof EngineError ? -32602 : -32603;
      log('协议', `请求处理异常 method=${method}：${String(e?.stack ?? e)}`);
      writeLine({
        jsonrpc: '2.0',
        id,
        error: { code, message: String(e?.message ?? e), data: { code: e?.code ?? (code === -32602 ? 'E_PROTOCOL' : 'E_INTERNAL') } },
      });
    }
  }

  rl.on('line', (line) => {
    void handleLine(line);
  });
  rl.on('close', () => {
    log('协议', 'stdin 已关闭（主进程退出？）——关闭浏览器并退出');
    void engine.shutdown().then(() => process.exit(0));
  });

  process.on('uncaughtException', (e) => {
    log('引擎', `未捕获异常：${String(e?.stack ?? e)}`);
    process.exit(1);
  });
  process.on('unhandledRejection', (e) => {
    log('引擎', `未处理的 Promise 拒绝：${String(e?.stack ?? e)}`);
  });

  log('引擎', `已就绪 pid=${process.pid} userData=${engine.userDataDir} 适配器=${listAdapters().map((a) => a.id).join(',')}`);
  return engine;
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectRun) startServer();
