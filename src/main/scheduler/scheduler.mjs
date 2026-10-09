// 任务调度器（设计权威：docs/design/modules/scheduler.md）—— 任务表与状态机落定 / 队列与并发 / 派单（选人 + 建任务 + 初始 manifest）/ 终态与持久化 / 取消与补件 / 对外查询；选人与健康 = workforce.mjs，执行循环与阶段看门狗 = execution.mjs，策略常量与决策 = policy.mjs。

import { EventEmitter } from 'node:events';
import { apiError, needsHuman, toTaskError } from '../mcp/errors.mjs';
import { Task, ATTACH_PHASES, isTerminalState } from './task.mjs';
import { Workforce } from './workforce.mjs';
import { TaskRunner } from './execution.mjs';
import { resolveOutboxDir, createTaskDir, writeManifest, markInterruptedManifests } from '../../shared/outbox.mjs';

export class Scheduler extends EventEmitter {
  /** @param {{config: object, engine: object, log: object, notify?: Function}} deps */
  constructor({ config, engine, log, notify = () => {} }) {
    super();
    this.config = config;
    this.engine = engine;
    this.log = log;
    this.notify = notify;

    /** @type {Map<string, Task>} */
    this.tasks = new Map();
    /** @type {Task[]} 排队（FIFO 按 createdAt） */
    this.queue = [];
    this.stopped = false;
    this._lastEngineWarnAt = 0;
    this._lastFallbackKey = null;

    this.workforce = new Workforce({ config, log, isBusy: (id) => this.runner.isWorkerBusy(id) });
    this.runner = new TaskRunner({
      config,
      engine,
      log,
      workforce: this.workforce,
      hooks: {
        getTask: (taskId) => this.tasks.get(taskId) || null,
        finish: (t, state, error) => this.finish(t, state, error),
        persist: (t) => this.persist(t),
        persistSoon: (t) => this.persistSoon(t),
        applyWorkerChange: (t, worker, reason) => this.applyWorkerChange(t, worker, reason),
        emitUpdate: (t) => this.emit('task-update', t),
      },
    });

    this.engine.on?.('ready', () => this.pump());
    this.engine.on?.('exit', () => this.emit('engine-exit'));
  }

  stop() {
    this.stopped = true;
    this.runner?.stop();
  }

  /** list_workers / /healthz 的外包工视图 */
  listWorkers() {
    return this.workforce.list();
  }

  // ── 派单（建任务 + 写初始 manifest + 入队）────────────────────────────────

  async dispatch({ task, worker, files = [] }) {
    const picked = this.workforce.pick(worker);
    const outbox = await resolveOutboxDir(this.config.current.outboxDir, { log: this.log });
    if (!outbox.dir) throw apiError('E_OUTBOX_WRITE', outbox.reason || '交付目录不可用');
    if (outbox.fallback) this.reportOutboxFallback(outbox);

    let created;
    try {
      created = await createTaskDir(outbox.dir);
    } catch (e) {
      throw apiError('E_OUTBOX_WRITE', `创建任务交付目录失败：${e?.message || e}`);
    }

    const t = new Task({
      taskId: created.taskId,
      taskDir: created.taskDir,
      request: { task, files },
      worker: { id: picked.worker.id, name: picked.worker.name, platform: picked.worker.platform },
      selection: { mode: picked.mode, reason: picked.reason },
    });
    this.tasks.set(t.taskId, t);
    await this.persist(t);
    this.queue.push(t);
    this.log.info(`派单 ${t.taskId}：worker=${t.worker.name} mode=${t.selection.mode}；交付目录=${created.taskDir}`);
    this.emit('task-update', t);
    this.pump();
    return t;
  }

  /** 交付目录回落：明示实际路径与回落原因（不静默；同一实际值只通知一次）；
   *  同一时点发 `outbox-fallback` 事件（b2：设置界面据此同步显示实际落点与原因——订阅转发在 src/settings/wiring.mjs） */
  reportOutboxFallback(outbox) {
    const key = `${outbox.dir}|${outbox.reason}`;
    this.log.warn(`交付目录回落：实际路径=${outbox.dir}；原因=${outbox.reason}（配置值=${outbox.configured}）`);
    if (this._lastFallbackKey !== key) {
      this._lastFallbackKey = key;
      this.notify({ title: '免费外包：交付目录已回落', body: `配置目录不可用，产物将落在：${outbox.dir}` });
      this.emit('outbox-fallback', outbox);
    }
  }

  // ── 队列与并发（scheduler.md §5）─────────────────────────────────────────

  removeFromQueue(t) {
    const i = this.queue.indexOf(t);
    if (i >= 0) this.queue.splice(i, 1);
  }

  /** 出队复核：可用 ⇒ 原样执行；不可用 ⇒ 按降级规则处理（指定 / 降级耗尽 ⇒ 终态） */
  recheckQueued(t) {
    const code = this.workforce.unavailableCode(t.worker.id);
    if (!code) return { action: 'keep' };
    if (t.selection.mode === 'explicit') {
      return {
        action: 'terminal',
        state: needsHuman(code) ? 'needs_human' : 'failed',
        error: apiError(code, `排队期间外包工不可用（${t.worker.name}）`),
      };
    }
    const next = this.workforce.nextAvailable(new Set([t.worker.id]));
    if (next) return { action: 'degrade', worker: next, code, reason: `排队期降级：${t.worker.name} 不可用（${code}）` };
    return {
      action: 'terminal',
      state: 'needs_human',
      error: apiError(code, `排队期间外包工不可用（${t.worker.name}），且无下一可用外包工（降级耗尽）`),
    };
  }

  /** 出队与启动（FIFO；每外包工并发 1 / 全局并发见配置） */
  pump() {
    if (this.stopped) return;
    const cfg = this.config.current.scheduler;
    for (const t of [...this.queue]) {
      if (this.runner.activeCount() >= cfg.globalConcurrency) return;
      if (t.state !== 'queued') {
        this.removeFromQueue(t);
        continue;
      }
      if (this.runner.activeCountFor(t.worker.id) >= cfg.perWorkerConcurrency) continue;
      if (!this.engine.isAlive() || !this.engine.isReady()) {
        const now = Date.now();
        if (now - this._lastEngineWarnAt > 30000) {
          this._lastEngineWarnAt = now;
          this.log.warn('引擎未就绪，任务保持在队列等待（引擎就绪后自动继续）');
        }
        continue;
      }

      const check = this.recheckQueued(t);
      if (check.action === 'terminal') {
        t.recordAttempt(t.worker.id, check.error.code);
        this.finish(t, check.state, check.error);
        continue;
      }
      if (check.action === 'degrade') {
        const fromWorker = t.worker.id;
        this.applyWorkerChange(t, check.worker, check.reason);
        t.recordAttempt(fromWorker, check.code || 'E_WORKER_UNAVAILABLE');
        void this.persistSoon(t);
      }
      this.removeFromQueue(t);
      this.startTask(t);
    }
  }

  /** 换人（含降级轨迹写入 selection.reason；被换下的外包工计入已尝试集合，防跨阶段重复选中） */
  applyWorkerChange(t, worker, reason) {
    const prevId = t.worker?.id;
    const prev = t.worker?.name ?? '?';
    if (prevId) {
      if (!(t._triedWorkers instanceof Set)) t._triedWorkers = new Set();
      t._triedWorkers.add(prevId);
    }
    t.worker = { id: worker.id, name: worker.name, platform: worker.platform };
    t.selection = { mode: t.selection.mode, reason: `${t.selection.reason} → ${reason}` };
    this.log.info(`任务 ${t.taskId} 换人：${prev} → ${worker.name}（${reason}）`);
  }

  startTask(t) {
    t.markRunning();
    this.log.info(`任务 ${t.taskId} 开始执行：worker=${t.worker.name}`);
    this.runner.start(t);
  }

  /** 阶段进度入口：由实际订阅方（执行器）处理，见 execution.mjs 的 onProgress（引擎 progress 事件单点入口） */

  // ── 终态与持久化 ────────────────────────────────────────────────────────

  finish(t, state, error) {
    if (t.state !== 'running' && t.state !== 'queued') return;
    // 防御：failed / needs_human 必须带错误（TaskView / manifest 的 error 字段不可缺）
    const finalError =
      error || (state === 'done' || state === 'canceled' ? null : apiError('E_INTERNAL', '任务失败（未提供错误码）'));
    t.settle(state, finalError ? toTaskError(finalError) : null);
    this.removeFromQueue(t);
    this.runner.stopRun(t.taskId);
    void this.persistSoon(t);
    this.emit('task-update', t);
    const suffix = `${t.error ? ` code=${t.error.code}` : ''}${t.delivery ? ` transport=${t.delivery.transport}` : ''}`;
    this.log.info(`任务 ${t.taskId} 终态=${state}${suffix}`);
    if (state === 'needs_human') {
      this.notify({
        title: `免费外包：任务需人工处理（${t.error?.code || '未知'}）`,
        body: `${t.error?.message || ''}${t.error?.hint ? `；${t.error.hint}` : ''}`,
      });
    }
    this.pump();
  }

  persist(t) {
    return writeManifest(t.taskDir, t.toManifest());
  }

  /** 串行化落盘（manifest 单一写者；不阻塞调用方） */
  persistSoon(t) {
    t.persistChain = t.persistChain
      .then(() => this.persist(t))
      .catch((e) => this.log.warn(`任务 ${t.taskId} manifest 落盘失败：${e?.message || e}`));
    return t.persistChain;
  }

  // ── 对外查询 / 取消 / 补件 ──────────────────────────────────────────────

  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /** 长轮询：等终态或到点（任务不会因等待中断） */
  async waitForTask(taskId, timeoutMs) {
    const t = this.tasks.get(taskId);
    if (!t) throw apiError('E_TASK_UNKNOWN', `任务号不存在：${taskId}`);
    const deadline = Date.now() + Math.max(0, timeoutMs);
    const self = this;
    while (!isTerminalState(t.state) && Date.now() < deadline) {
      const remain = deadline - Date.now();
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          self.off('task-update', onUpdate);
          resolve();
        };
        const onUpdate = (task) => {
          if (task === t) done();
        };
        const timer = setTimeout(done, Math.min(250, Math.max(1, remain)));
        self.on('task-update', onUpdate);
      });
    }
    return t;
  }

  async cancel(taskId) {
    const t = this.tasks.get(taskId);
    if (!t) throw apiError('E_TASK_UNKNOWN', `任务号不存在：${taskId}`);
    if (isTerminalState(t.state)) return t;
    const wasRunning = t.state === 'running';
    // 先落终态（循环不再起新尝试），再尽力通知引擎停止（幂等；覆盖竞态里新起的执行）；页面不关闭、已写产物保留
    if (t.delivery) t.delivery = { ...t.delivery, partial: true };
    this.finish(t, 'canceled', null);
    if (wasRunning) await this.runner.cancelEngineTask(taskId);
    return t;
  }

  /**
   * 附件补送：queued ⇒ 追加（执行时随 task.run 上传）；running(opening/uploading) ⇒ 追加后重启该次预发送执行。
   * 已发送之后 ⇒ E_TASK_ALREADY_SENT。
   */
  async attachFiles(taskId, files) {
    const t = this.tasks.get(taskId);
    if (!t) throw apiError('E_TASK_UNKNOWN', `任务号不存在：${taskId}`);
    const allowed = t.state === 'queued' || (t.state === 'running' && t.phase && ATTACH_PHASES.has(t.phase));
    if (!allowed) {
      throw apiError(
        'E_TASK_ALREADY_SENT',
        `任务 ${taskId} 已发送（state=${t.state}${t.phase ? `, phase=${t.phase}` : ''}），无法补送附件`,
      );
    }
    t.request.files.push(...files);
    await this.persist(t);
    if (t.state === 'running') await this.runner.restartForAttach(t);
    this.log.info(`任务 ${taskId} 补送附件 ${files.length} 个；当前文件数=${t.request.files.length}`);
    this.emit('task-update', t);
    return t;
  }

  /** 重启扫描（scheduler.md §9）：非终态 manifest 标记 interrupted，不自动重跑 */
  async markInterrupted() {
    const resolved = await resolveOutboxDir(this.config.current.outboxDir, { log: this.log });
    if (!resolved.dir) return [];
    const marked = await markInterruptedManifests(resolved.dir, { log: this.log });
    for (const m of marked) {
      this.log.warn(`重启扫描：任务 ${m.taskId} 原状态 ${m.previousState} ⇒ 标记 interrupted（不自动重跑）`);
    }
    return marked;
  }
}
