// 任务执行器：驱动一次任务的引擎调用与阶段推进、重试 / 降级落实、阶段超时看门狗、取消与补件重启的引擎侧动作。
// 设计权威：docs/design/modules/scheduler.md §6（重试与降级）/ §7（阶段超时）/ §8（取消）/ §10（引擎接口）。
// 与 Scheduler 的分工：本类只管「把一个 running 任务跑到底」；任务表 / 队列 / manifest 落盘 / 终态落定由 Scheduler 负责（经 hooks 回调）。

import { apiError } from '../mcp/errors.mjs';
import { PHASES } from './task.mjs';
import {
  DEGRADABLE,
  decideOutcome,
  interpretEngineResult,
  normalizeDelivery,
  phaseLimitMs,
  phaseTimeoutCode,
} from './policy.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TaskRunner {
  /**
   * @param {{config: object, engine: object, log: object, workforce: object,
   *          hooks: {getTask: Function, finish: Function, persist: Function, persistSoon: Function,
   *                  applyWorkerChange: Function, emitUpdate: Function}}} deps
   */
  constructor({ config, engine, log, workforce, hooks }) {
    this.config = config;
    this.engine = engine;
    this.log = log;
    this.workforce = workforce;
    this.hooks = hooks;
    /** @type {Map<string, {controller: AbortController, phase: string, limitMs: number, deadline: number, sawStreaming: boolean}>} */
    this.runs = new Map();

    this.watchdog = setInterval(() => this.tickWatchdog(), 1000);
    this.watchdog.unref?.();
    this.engine.on?.('progress', (ev) => this.onProgress(ev));
  }

  stop() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  activeCount() {
    return this.runs.size;
  }

  /** 该外包工当前正在执行的任务数（每外包工并发判定用；scheduler.perWorkerConcurrency） */
  activeCountFor(workerId) {
    let n = 0;
    for (const taskId of this.runs.keys()) {
      const t = this.hooks.getTask(taskId);
      if (t && t.worker?.id === workerId && t.state === 'running') n += 1;
    }
    return n;
  }

  isWorkerBusy(workerId) {
    return this.activeCountFor(workerId) > 0;
  }

  // -------------------------------------------------------------------------
  // 启动与停止
  // -------------------------------------------------------------------------

  /** 起跑（调用方已把任务置 running）：建运行记录 → opening → 执行循环 */
  start(t) {
    this.runs.set(t.taskId, {
      controller: new AbortController(),
      phase: 'opening',
      limitMs: 0,
      deadline: 0,
      sawStreaming: false,
    });
    this.setPhase(t, 'opening');
    void this.runLoop(t).catch((err) => {
      this.log.error(`任务 ${t.taskId} 运行异常：${err?.stack || err}`);
      if (t.state === 'running') {
        this.hooks.finish(t, 'failed', apiError('E_INTERNAL', `内部错误：${err?.message || err}`));
      }
    });
  }

  /** 停止运行记录（终态落定 / 取消时调用；中止在途引擎调用） */
  stopRun(taskId, reason = '任务已终结') {
    const run = this.runs.get(taskId);
    if (!run) return;
    run.deadline = 0;
    try {
      run.controller.abort(apiError('E_CANCELED', reason));
    } catch {
      /* 忽略 */
    }
    this.runs.delete(taskId);
  }

  /** 通知引擎尽力停止（取消 / 补件重启 / 看门狗超时） */
  async cancelEngineTask(taskId) {
    try {
      await this.engine.call('task.cancel', { taskId }, { timeoutMs: 5000 });
    } catch (e) {
      this.log?.warn(`通知引擎取消 ${taskId} 失败：${e?.message || e}`);
    }
  }

  /** 补件重启：以完整文件列表重新执行该次预发送执行（仍未发送、不消耗平台额度） */
  async restartForAttach(t) {
    t._attachEpoch = (t._attachEpoch || 0) + 1;
    await this.cancelEngineTask(t.taskId);
  }

  // -------------------------------------------------------------------------
  // 执行循环
  // -------------------------------------------------------------------------

  async runLoop(t) {
    const run = this.runs.get(t.taskId);
    let retriesOnWorker = 0;
    // 已尝试外包工集合：跨「排队期降级 + 运行期降级」累计（任务上持有，避免出队换人后计数偏松）
    const triedWorkers = t._triedWorkers instanceof Set ? t._triedWorkers : new Set();
    if (t.worker?.id) triedWorkers.add(t.worker.id);
    t._triedWorkers = triedWorkers;

    while (t.state === 'running') {
      const epoch = t._attachEpoch || 0;

      // 执行前复核该外包工（配置可能已变）
      const preCode = this.workforce.unavailableCode(t.worker.id);
      if (preCode) {
        const preErr = apiError(preCode, `执行前复核：外包工不可用（${t.worker.name}）`);
        t.recordAttempt(t.worker.id, preCode);
        const decision = this.decide(t, preCode, { retriesOnWorker, triedWorkers, sawStreaming: run.sawStreaming });
        const ret = await this.applyDecision(t, decision, { triedWorkers, error: preErr });
        if (ret === 'finished') return;
        retriesOnWorker = ret === 'retry' ? retriesOnWorker + 1 : 0;
        if (t.state !== 'running') return;
        continue;
      }

      const worker = this.workforce.byId(t.worker.id);
      run.controller = new AbortController();
      this.setPhase(t, 'opening');

      let outcome;
      try {
        const result = await this.engine.call(
          'task.run',
          {
            taskId: t.taskId,
            worker: { id: worker.id, name: worker.name, platform: worker.platform },
            prompt: t.request.task,
            files: [...t.request.files],
            outboxDir: t.taskDir,
            toggles: { ...(worker.toggles || { thinking: false, search: false }) },
            // 配置值透传（引擎接口的可选覆盖项；缺省时引擎用同一套设计默认值）
            timeouts: { ...this.config.current.limits.timeouts },
            limits: { maxFileBytes: this.config.current.limits.maxFileBytes },
          },
          { timeoutMs: 0, signal: run.controller.signal },
        );
        outcome = interpretEngineResult(result);
      } catch (e) {
        outcome = { ok: false, error: e, canceled: false };
      }

      if (t.state !== 'running') return; // 已取消 / 已终结
      if ((t._attachEpoch || 0) !== epoch) continue; // 补件重启：不计入尝试

      // 失败时也按字段语义吸收部分产物（缺席 ⇒ 未产出）
      if (outcome.delivery) t.delivery = normalizeDelivery(outcome.delivery);
      if (outcome.toggles) t.toggles = outcome.toggles;
      if (Array.isArray(outcome.skippedFiles)) t.skippedFiles = outcome.skippedFiles;

      if (outcome.ok) {
        t.recordAttempt(t.worker.id, 'done');
        this.workforce.clearHealth(t.worker.id);
        this.hooks.finish(t, 'done', null);
        return;
      }
      if (outcome.canceled) {
        t.recordAttempt(t.worker.id, 'E_CANCELED');
        this.hooks.finish(t, 'canceled', null);
        return;
      }

      const err = outcome.error;
      t.recordAttempt(t.worker.id, err.code);
      if (DEGRADABLE.has(err.code)) this.workforce.setCooldown(t.worker.id, err.code, err.message);

      const decision = this.decide(t, err.code, {
        retriesOnWorker,
        triedWorkers,
        sawStreaming: run.sawStreaming,
      });
      const ret = await this.applyDecision(t, decision, { triedWorkers, error: err });
      if (ret === 'finished') return;
      if (ret === 'retry') retriesOnWorker += 1;
      else if (ret === 'failover') retriesOnWorker = 0;
      if (t.state !== 'running') return;
    }
  }

  /** 组装策略输入（下一候选只作决策素材；真正换人在 applyDecision 落实） */
  decide(t, code, { retriesOnWorker, triedWorkers, sawStreaming }) {
    return decideOutcome({
      code,
      cfg: this.config.current.scheduler,
      mode: t.selection.mode,
      retriesOnWorker,
      triedCount: triedWorkers.size,
      sawStreaming: !!sawStreaming,
      nextWorker: this.workforce.nextAvailable(triedWorkers),
    });
  }

  /** 落实决策；返回 'retry' | 'failover' | 'finished' */
  async applyDecision(t, decision, { triedWorkers, error }) {
    if (decision.action === 'retry') {
      this.log.warn(`任务 ${t.taskId} 瞬时失败，${decision.delayMs}ms 后同外包工重试（${t.worker.name}）`);
      await this.waitWhileRunning(t, decision.delayMs);
      return t.state === 'running' ? 'retry' : 'finished';
    }
    if (decision.action === 'failover') {
      this.hooks.applyWorkerChange(t, decision.worker, `降级：${error?.code || '不可用'}`);
      triedWorkers.add(decision.worker.id);
      await this.hooks.persist(t);
      this.hooks.emitUpdate(t);
      return 'failover';
    }
    this.hooks.finish(t, decision.state, error || null);
    return 'finished';
  }

  /** 可中断等待（取消 / 终结即返回） */
  async waitWhileRunning(t, ms) {
    const deadline = Date.now() + ms;
    while (t.state === 'running' && Date.now() < deadline) {
      await sleep(Math.min(200, Math.max(1, deadline - Date.now())));
    }
  }

  // -------------------------------------------------------------------------
  // 阶段与看门狗
  // -------------------------------------------------------------------------

  setPhase(t, phase) {
    t.phase = phase;
    const run = this.runs.get(t.taskId);
    if (run) {
      run.phase = phase;
      run.limitMs = phaseLimitMs(this.config.current.limits.timeouts, phase);
      run.deadline = Date.now() + run.limitMs;
      if (phase === 'streaming' || phase === 'extracting' || phase === 'finalizing') run.sawStreaming = true;
    }
    void this.hooks.persistSoon(t);
    this.hooks.emitUpdate(t);
  }

  onProgress({ taskId, phase }) {
    const t = this.hooks.getTask(taskId);
    if (!t || t.state !== 'running') return;
    if (!PHASES.includes(phase)) return;
    this.setPhase(t, phase);
  }

  /** 主进程看门狗：按阶段表判超时（错误码见 policy.PHASE_TIMEOUT_CODE），并尽力停止引擎侧执行 */
  tickWatchdog() {
    const now = Date.now();
    for (const [taskId, run] of this.runs) {
      const t = this.hooks.getTask(taskId);
      if (!t || t.state !== 'running') continue;
      if (!run.deadline || now <= run.deadline) continue;
      const code = phaseTimeoutCode(run.phase);
      const msg = `阶段 ${run.phase} 超时（> ${run.limitMs}ms）`;
      run.deadline = 0;
      this.log.warn(`任务 ${taskId}：${msg} ⇒ ${code}`);
      try {
        run.controller.abort(apiError(code, msg));
      } catch {
        /* 忽略 */
      }
      void this.cancelEngineTask(taskId); // 随后的重试 / 终结不再需要这一趟
    }
  }
}
