/**
 * 任务执行编排（`docs/design/modules/scheduler.md` §2 / §7 / §10）：phase 链 opening → uploading → sending → streaming → extracting → finalizing；
 * 每外包工串行（同一浏览器配置目录单写者）；取消与阶段超时；收尾回报 `result`。
 *
 * 回报口径（主包AI 裁定 2026-10-09）：业务 / 任务失败走 `result.error: {code,message,hint?}`；
 * 取消 ⇒ 成功响应 `canceled:true`（+ 可能的部分 `delivery`）。进度事件 = `{event:"task-progress",taskId,phase}`。
 */
import path from 'node:path';

import { EngineError } from './adapters/base.mjs';
import { getAdapter } from './adapters/registry.mjs';
import {
  applyTogglesWithLog,
  buildTogglesReport,
  collectAnswer,
  attachStreamCapture,
  detachStreamCapture,
  fmtToggles,
  waitForSendConfirm,
} from './answer.mjs';
import {
  DEFAULT_MAX_FILE_BYTES,
  copyAttachments,
  writeDeliverables,
  writeTextFile,
} from './artifacts.mjs';
import { ensureOnPlatform, waitForLoginState } from './opening.mjs';
import { buildErrorReport } from './failure.mjs';
import { SessionPolicy } from './session-policy.mjs';
import { remainingMs, withDeadline } from './util.mjs';

/** 阶段超时默认值（`docs/design/modules/scheduler.md` §7「阶段超时表」，毫秒；可由调用方按配置覆盖） */
export const DEFAULT_TIMEOUTS = Object.freeze({
  openingMs: 60000,
  uploadingMs: 60000,
  sendingMs: 30000,
  streamFirstByteMs: 120000,
  taskTimeoutMs: 300000,
  extractingMs: 60000,
});

export class TaskRunner {
  constructor({ browser, log = () => {}, emit = () => {}, sessionPolicy } = {}) {
    this.browser = browser;
    this.log = log;
    this.emit = emit;
    this.tasks = new Map();
    this.workerLocks = new Map();
    this.sessionPolicy = sessionPolicy ?? new SessionPolicy({ log: (m) => this.log('task', m) });
  }

  /** 进行中的任务 id（供 engine.health） */
  list() {
    return [...this.tasks.keys()];
  }

  /** 取消：给运行中的任务置取消标记；不在执行中 ⇒ canceled:false（调用方按自身状态机处理） */
  cancel(params = {}) {
    const task = this.tasks.get(params?.taskId);
    if (!task) return { taskId: params?.taskId ?? null, canceled: false, note: '任务不在执行中' };
    task.canceled = true;
    this.log('task', `收到取消：${params.taskId}`);
    return { taskId: params.taskId, canceled: true };
  }

  #progress(taskId, phase) {
    this.emit({ event: 'task-progress', taskId, phase });
  }

  #throwIfCanceled(task) {
    if (task.canceled) throw new EngineError('E_CANCELED', '任务已取消');
  }

  /** 同一外包工串行（同一浏览器配置目录单写者；全局并发由主进程调度控制） */
  async #acquireWorkerLock(workerId) {
    const key = String(workerId);
    const prev = this.workerLocks.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    this.workerLocks.set(
      key,
      prev.then(() => gate),
    );
    return prev.then(() => release);
  }

  /**
   * 执行一条任务。
   * @param {object} params `{taskId, worker:{id,name,platform}, prompt, files[], outboxDir, toggles, timeouts?, limits?}`
   * @returns {Promise<object>} `{taskId, canceled, error, delivery?, toggles?, skippedFiles?}`（失败走 `error`）
   */
  async run(params = {}) {
    const taskId = typeof params?.taskId === 'string' && params.taskId ? params.taskId : null;
    if (!taskId) throw new EngineError('E_BAD_ARGS', 'task.run 缺 taskId'); // 协议级 ⇒ 调用方转 JSON-RPC error
    const result = { taskId, canceled: false, error: null };

    const missing = [];
    if (!params?.worker || typeof params.worker !== 'object') missing.push('worker');
    else {
      if (!params.worker.id) missing.push('worker.id');
      if (!params.worker.platform) missing.push('worker.platform');
    }
    if (typeof params?.prompt !== 'string' || !params.prompt.trim()) missing.push('prompt');
    if (typeof params?.outboxDir !== 'string' || !params.outboxDir) missing.push('outboxDir');
    if (missing.length) {
      result.error = { code: 'E_BAD_ARGS', message: `task.run 缺必填参数：${missing.join('、')}` };
      return result;
    }

    const worker = params.worker;
    const outboxDir = params.outboxDir;
    const files = Array.isArray(params.files) ? params.files : [];
    const toggles = params.toggles ?? {};
    const timeouts = { ...DEFAULT_TIMEOUTS, ...(params.timeouts ?? {}) };
    const limits = { maxFileBytes: DEFAULT_MAX_FILE_BYTES, ...(params.limits ?? {}) };
    const task = {
      taskId,
      workerId: worker.id,
      canceled: false,
      startedAt: Date.now(),
      page: null,
      text: '',
      transport: null,
    };
    let adapter = null;
    let page = null;
    let capture = null;
    let openingTimedOut = false;

    const release = await (async () => {
      // 登记先于等锁：等锁期间到达的取消才能落到任务标记上（避免取消丢失窗口）
      this.tasks.set(taskId, task);
      return await this.#acquireWorkerLock(worker.id);
    })();
    try {
      this.#throwIfCanceled(task);
      adapter = getAdapter(worker.platform);
      if (!adapter) throw new EngineError('E_WORKER_UNAVAILABLE', `平台适配器未注册：${worker.platform}`);

      // ── opening：打开页面 → 登录检查 → 会话复用判定（未复用则新会话）→ 应用外包工开关（整体受 openingMs 预算约束）──
      this.#progress(taskId, 'opening');
      const openingDeadline = Date.now() + timeouts.openingMs;
      try {
        await withDeadline(
          async () => {
            page = await this.browser.sessionPage(worker.id);
            task.page = page;
            const nav = await ensureOnPlatform(page, adapter, openingDeadline);
            this.log('task', `打开页面（${nav.via}）${page.url()}`);
            const loginState = await waitForLoginState(page, adapter, remainingMs(openingDeadline));
            if (loginState === 'captcha') {
              throw new EngineError('E_CAPTCHA_OR_RISK', '检测到验证码 / 风控线索：请在浏览器窗口人工处理，然后点托盘「我已处理（清除外包工冷却）」再重派');
            }
            if (loginState !== 'ready') {
              throw new EngineError('E_LOGIN_REQUIRED', `登录态不可用（${loginState}）：请在打开的浏览器窗口完成登录，然后点托盘「我已处理（清除外包工冷却）」再重派`);
            }
            if (adapter.capabilities.newChat !== false) {
              const decision = this.sessionPolicy.decide({ workerId: worker.id, now: Date.now(), config: params.session, page });
              if (decision.reuse) this.log('task', `复用会话（taskCount=${decision.taskCount} idleMs=${decision.idleMs ?? 'n/a'}）`);
              else {
                await adapter.openSession(page, { log: (m) => this.log('task', m) });
                this.sessionPolicy.markNewSession(worker.id, { reason: decision.reason, page, at: Date.now() });
              }
            }
            if (adapter.capabilities.toggles) {
              await applyTogglesWithLog({ page, adapter, toggles, stage: '应用', log: this.log });
            }
          },
          openingDeadline,
          () => new EngineError('E_TIMEOUT', `opening 阶段超时（${timeouts.openingMs}ms）`),
        );
      } catch (e) {
        if (e?.code === 'E_TIMEOUT') openingTimedOut = true;
        throw e;
      }
      this.#throwIfCanceled(task);

      // ── uploading：附件（送件，决策 H）──
      this.#progress(taskId, 'uploading');
      if (files.length) {
        if (!adapter.capabilities.upload) {
          throw new EngineError('E_WORKER_UNAVAILABLE', '该平台适配器不支持送件（upload）');
        }
        copyAttachments(outboxDir, files, this.log);
        await adapter.uploadFiles(page, files, { timeoutMs: timeouts.uploadingMs, log: (m) => this.log('task', m) });
        this.log('task', `送件完成：${files.length} 个附件`);
      }
      this.#throwIfCanceled(task);

      // ── sending：发送前复核开关 → 发送 → 发送确认 ──
      this.#progress(taskId, 'sending');
      capture = attachStreamCapture(page, adapter);
      if (adapter.capabilities.toggles) {
        await applyTogglesWithLog({ page, adapter, toggles, stage: '发送前复核', log: this.log });
      }
      await adapter.send(page, params.prompt, { log: (m) => this.log('task', m) });
      await waitForSendConfirm(capture, timeouts.sendingMs);
      this.log('task', '已发送（观测到 chat/completion 请求）');
      this.#throwIfCanceled(task);

      // ── streaming：流为主，DOM 兜底 ──
      this.#progress(taskId, 'streaming');
      const answer = await collectAnswer(page, adapter, capture, timeouts, { isCanceled: () => task.canceled });
      task.text = answer.text;
      task.transport = answer.transport;
      this.log('task', `答复就绪 transport=${answer.transport}（${answer.note}）${answer.text.length} 字符`);
      this.#throwIfCanceled(task);

      // ── extracting：取件三层 + 落盘 ──
      this.#progress(taskId, 'extracting');
      const written = await writeDeliverables({
        page,
        adapter,
        outboxDir,
        answer,
        limits,
        extractingMs: timeouts.extractingMs,
        since: task.startedAt,
        settleDownloads: (o) => this.browser.settleDownloads(worker.id, o),
        log: this.log,
        throwIfCanceled: () => this.#throwIfCanceled(task),
      });
      result.delivery = written.delivery;
      if (written.skippedFiles.length) result.skippedFiles = written.skippedFiles;

      // ── finalizing ──
      this.#progress(taskId, 'finalizing');
      if (task.canceled) {
        // 取消在落盘后才到达：产物保留，状态按取消回报（主进程据此置 canceled）
        result.canceled = true;
        result.delivery.partial = true;
      }
      result.toggles = buildTogglesReport(adapter, toggles, capture);
      this.log(
        'task',
        `开关核对 目标=${fmtToggles(result.toggles.configured)} 载荷=${result.toggles.payload ? fmtToggles(result.toggles.payload) : '未捕获'} 结果=${result.toggles.ok === null ? '未知' : result.toggles.ok ? '一致' : '不一致'}`,
      );
      this.log('task', `完成 taskId=${taskId} 文件=${result.delivery.files.length} 个（${((Date.now() - task.startedAt) / 1000).toFixed(1)}s）`);
    } catch (e) {
      const err = e instanceof EngineError ? e : new EngineError('E_UNKNOWN', String(e?.message ?? e));
      if (err.code === 'E_CANCELED') {
        result.canceled = true;
        const partial = err.data?.partialDelivery ?? null;
        if (partial?.skippedFiles?.length) result.skippedFiles = partial.skippedFiles;
        if (task.text) {
          try {
            writeTextFile(path.join(outboxDir, 'answer.md'), task.text);
            result.delivery = { ...(partial ?? {}), transport: partial?.transport ?? task.transport ?? null, textPath: 'answer.md', files: partial?.files ?? [], partial: true };
          } catch (werr) {
            this.log('task', `取消后写入部分产物失败：${String(werr?.message ?? werr).slice(0, 140)}`);
          }
        } else if (partial) {
          result.delivery = partial;
        }
        this.log('task', `已取消 taskId=${taskId}`);
      } else {
        result.error = await buildErrorReport(err, { page: task.page, outboxDir, log: this.log });
        if (openingTimedOut) {
          // opening 超时的残留：闭包可能仍在后台操作页面，而每外包工锁已在 finally 释放——
          // 关闭该外包工上下文，使残留操作随页面一起失效，下一单重新启动干净上下文（登录态保留）
          this.log('task', 'opening 超时：关闭该外包工浏览器上下文，避免残留步骤影响下一单');
          await this.browser.close(worker.id).catch(() => {});
        }
        if (capture?.payload) result.toggles = buildTogglesReport(adapter, toggles, capture);
        this.log('task', `失败 taskId=${taskId} code=${err.code} ${err.message}`);
      }
    } finally {
      try {
        if (page && capture) detachStreamCapture(page, capture);
      } catch (e) {
        this.log('task', `卸载流监听失败（忽略）：${String(e?.message ?? e).slice(0, 120)}`);
      }
      if (adapter && adapter.capabilities.newChat !== false) {
        this.sessionPolicy.recordOutcome(worker.id, { outcome: result.canceled === true ? 'canceled' : result.error ? 'error' : 'done', at: Date.now() });
      }
      this.tasks.delete(taskId);
      try {
        release();
      } catch {
        /* 忽略 */
      }
      try {
        this.browser.closeHubPages(worker.id);
      } catch (e) {
        this.log('task', `downloads-hub 页面处置失败（忽略）：${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
    return result;
  }
}
