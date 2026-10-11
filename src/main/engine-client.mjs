// 引擎客户端：与引擎子进程的逐行 JSON-RPC（stdio）通信（设计权威：docs/design/modules/scheduler.md §10）
// 信封 = 标准 JSON-RPC 2.0：请求 {jsonrpc,id,method,params}；成功 {jsonrpc,id,result}；协议级错误 {jsonrpc,id,error}
// 业务 / 任务失败不走 JSON-RPC error，走 result.error（由调用方处理）。
// 进度事件：{event:"task-progress", taskId, phase}（接收侧容忍裸形 / JSON-RPC 通知两种封装）。
// 引擎 stdout 只出 JSON-RPC 行；日志走 stderr（转发到主进程日志）。

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import { apiError } from './mcp/errors.mjs';
import { fromRpcError, pickProgressEvent } from './engine-wire.mjs';
import { truncate } from './log.mjs';

const RESTART_WINDOW_MS = 10 * 60 * 1000;
const MAX_RESTARTS_IN_WINDOW = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class EngineClient extends EventEmitter {
  /**
   * @param {{hostScript: string, cwd?: string, userDataDir: string, configFile: string, version?: string,
   *          log: object, notify?: Function, extraEnv?: object}} options
   *        extraEnv = 附加子进程环境变量（b4 打包态注入 PLAYWRIGHT_BROWSERS_PATH；缺省 {} = 不注入）
   */
  constructor({
    hostScript, cwd, userDataDir, configFile, version = '0.0.0', log, notify = () => {}, extraEnv = {},
  }) {
    super();
    this.hostScript = hostScript;
    this.cwd = cwd;
    this.userDataDir = userDataDir;
    this.configFile = configFile;
    this.version = version;
    this.log = log;
    this.notify = notify;
    this.extraEnv = extraEnv || {};

    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.stopping = false;
    this.ready = false;
    this.restartTimes = [];
    this.restartTimer = null;
    this.lastExit = null;
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  /** 启动子进程（幂等）；启动后异步探活（健康即 emit 'ready'） */
  start() {
    if (this.child || this.stopping) return;
    this.log.info(`启动引擎子进程：${this.hostScript}`);
    let child;
    try {
      child = spawn(process.execPath, [this.hostScript], {
        cwd: this.cwd,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          FO_USER_DATA: this.userDataDir,
          FO_CONFIG_FILE: this.configFile,
          FO_APP_VERSION: this.version,
          ...this.extraEnv,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (e) {
      this.log.error(`引擎子进程启动失败：${e?.message || e}`);
      this.scheduleRestart();
      return;
    }
    this.child = child;
    this.ready = false;

    child.on('error', (e) => {
      this.log.error(`引擎子进程错误：${e?.message || e}`);
      this.handleExit(null, null, e);
    });
    child.on('exit', (code, signal) => this.handleExit(code, signal));

    readline.createInterface({ input: child.stdout }).on('line', (line) => this.onLine(line));
    readline
      .createInterface({ input: child.stderr })
      .on('line', (line) => this.log.info(`[引擎] ${truncate(line, 500)}`));

    void this.waitHealthy();
  }

  isAlive() {
    return !!this.child && !this.child.killed;
  }

  isReady() {
    return this.ready && this.isAlive();
  }

  /** 轮询 engine.health 直至成功或超时（引擎初始化可能较慢） */
  async waitHealthy(maxMs = 20000) {
    const childAtStart = this.child;
    const t0 = Date.now();
    while (this.child === childAtStart && this.isAlive() && Date.now() - t0 < maxMs) {
      try {
        const result = await this.call('engine.health', {}, { timeoutMs: 4000 });
        if (this.child !== childAtStart) return null;
        this.ready = true;
        this.log.info(`引擎就绪：${truncate(JSON.stringify(result ?? {}), 300)}`);
        this.emit('ready', result);
        return result;
      } catch {
        await sleep(1000);
      }
    }
    if (this.child === childAtStart && this.isAlive()) {
      this.log.warn('引擎健康检查未通过（继续后台运行；任务将保持在队列等待）');
    }
    return null;
  }

  handleExit(code, signal, error) {
    const child = this.child;
    if (!child) return; // 幂等：「error」与「exit」可能连续触发，只处理一次
    this.child = null;
    this.ready = false;
    this.lastExit = { code, signal, at: new Date().toISOString() };

    // 在途请求全部失败（设计：引擎崩溃 ⇒ 进行中任务 E_ENGINE_DOWN）
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) {
      clearTimeout(p.timer);
      p.reject(apiError('E_ENGINE_DOWN', `引擎子进程不可用（已退出${code != null ? `，code=${code}` : ''}）`));
    }

    this.log.warn(
      `引擎子进程退出${code != null ? ` code=${code}` : ''}${signal ? ` signal=${signal}` : ''}${error ? ` err=${error?.message || error}` : ''}`,
    );
    this.emit('exit', { code, signal, error });

    this.scheduleRestart();
  }

  /** 自动重启：指数退避，10 分钟内最多 3 次（browser-engine.md §6） */
  scheduleRestart() {
    if (this.stopping) return;
    const now = Date.now();
    this.restartTimes = this.restartTimes.filter((t) => now - t < RESTART_WINDOW_MS);
    if (this.restartTimes.length >= MAX_RESTARTS_IN_WINDOW) {
      this.log.error('引擎在 10 分钟内已重启 3 次，停止自动重启；请检查日志后重启应用');
      this.notify({ title: '免费外包', body: '引擎多次崩溃，已停止自动重启（详见日志）' });
      return;
    }
    const delay = Math.min(500 * 2 ** this.restartTimes.length, 8000);
    this.restartTimes.push(now);
    this.log.info(`将在 ${delay}ms 后重启引擎（近 10 分钟第 ${this.restartTimes.length} 次）`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopping) this.start();
    }, delay);
  }

  /** 优雅停机：engine.shutdown → 先等内容自然退出（关上下文），再超时强杀（browser-engine.md §6：超时 5 秒） */
  async shutdown({ shutdownTimeoutMs = 3000, killTimeoutMs = 5000 } = {}) {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    if (!child) return;
    const exited = new Promise((resolve) => child.once('exit', () => resolve('exit')));
    try {
      await this.call('engine.shutdown', {}, { timeoutMs: shutdownTimeoutMs });
    } catch (e) {
      this.log.warn(`engine.shutdown 未正常完成：${truncate(e?.message || e, 200)}`);
    }
    if (this.child !== child) return; // 已自行退出
    // 给引擎关闭浏览器上下文的时间（超时 5 秒后再强杀）
    const r = await Promise.race([exited, sleep(killTimeoutMs).then(() => 'timeout')]);
    if (r === 'timeout' && this.child === child) {
      this.log.warn('引擎子进程未在 5 秒内退出，强制结束');
      try {
        child.kill();
      } catch {
        /* 忽略 */
      }
      const r2 = await Promise.race([exited, sleep(2000).then(() => 'timeout')]);
      if (r2 === 'timeout' && this.child === child) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* 忽略 */
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 请求 / 响应
  // -------------------------------------------------------------------------

  /**
   * 发一次 JSON-RPC 请求。
   * @param {string} method
   * @param {object} params
   * @param {{timeoutMs?: number, signal?: AbortSignal}} [options] timeoutMs<=0 = 不设超时
   */
  call(method, params = {}, { timeoutMs = 30000, signal } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isAlive()) {
        reject(apiError('E_ENGINE_DOWN', '引擎子进程未运行'));
        return;
      }
      if (signal?.aborted) {
        reject(signal.reason instanceof Error ? signal.reason : apiError('E_CANCELED', '请求已中止'));
        return;
      }
      const id = this.nextId++;
      let timer = null;
      const onAbort = () => {
        this.pending.delete(id);
        if (timer) clearTimeout(timer);
        reject(signal.reason instanceof Error ? signal.reason : apiError('E_CANCELED', '请求已中止'));
      };
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          signal?.removeEventListener?.('abort', onAbort);
          reject(apiError('E_TIMEOUT', `引擎响应超时（${method} > ${timeoutMs}ms）`));
        }, timeoutMs);
      }
      signal?.addEventListener?.('abort', onAbort, { once: true });

      this.pending.set(id, { resolve, reject, timer, signal, onAbort });
      const message = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
      try {
        this.child.stdin.write(message, (err) => {
          if (err) {
            this.pending.delete(id);
            if (timer) clearTimeout(timer);
            signal?.removeEventListener?.('abort', onAbort);
            reject(apiError('E_ENGINE_DOWN', `写入引擎 stdin 失败：${err.message}`));
          }
        });
      } catch (e) {
        this.pending.delete(id);
        if (timer) clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        reject(apiError('E_ENGINE_DOWN', `写入引擎 stdin 失败：${e?.message || e}`));
      }
    });
  }

  /** 单行处理：响应 / 进度事件 / 其他（宽容解析，见文件头） */
  onLine(line) {
    const s = line.trim();
    if (!s) return;
    let msg;
    try {
      msg = JSON.parse(s);
    } catch {
      this.log.warn(`[引擎] stdout 非 JSON 行（已忽略）：${truncate(s, 300)}`);
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    // 响应（有 id 且有 result 或 error）
    if (msg.id !== undefined && msg.id !== null && ('result' in msg || 'error' in msg)) {
      const p = this.pending.get(msg.id);
      if (!p) {
        this.log.debug(`引擎响应 id=${msg.id} 无对应在途请求`);
        return;
      }
      this.pending.delete(msg.id);
      if (p.timer) clearTimeout(p.timer);
      p.signal?.removeEventListener?.('abort', p.onAbort);
      if (msg.error) p.reject(fromRpcError(msg.error));
      else p.resolve(msg.result);
      return;
    }

    // 进度事件（裸形优先；兼容 JSON-RPC 通知两种封装）
    const ev = pickProgressEvent(msg);
    if (ev) {
      this.emit('progress', { taskId: ev.taskId, phase: ev.phase });
      return;
    }

    this.log.debug(`[引擎] 未识别消息（已忽略）：${truncate(s, 300)}`);
  }
}
