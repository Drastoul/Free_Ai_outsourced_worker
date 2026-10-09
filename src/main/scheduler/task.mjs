// 任务模型与状态机（设计权威：docs/design/modules/scheduler.md §2 / §3）
// 状态：queued / running / done / failed / canceled / needs_human（终态 = done / failed / canceled / needs_human）
// 阶段：opening → uploading → sending → streaming → extracting → finalizing

export const TERMINAL_STATES = new Set(['done', 'failed', 'canceled', 'needs_human']);

export const PHASES = ['opening', 'uploading', 'sending', 'streaming', 'extracting', 'finalizing'];

/** 进入 streaming 之前 = 预热阶段（降级只发生在预热阶段） */
export const PREWARM_PHASES = new Set(['opening', 'uploading', 'sending']);

/** attach_files 有效窗口：尚未发送（queued / running 的 opening / uploading） */
export const ATTACH_PHASES = new Set(['opening', 'uploading']);

export function isTerminalState(state) {
  return TERMINAL_STATES.has(state);
}

function workerShape(worker) {
  if (!worker) return null;
  return { id: worker.id, name: worker.name, platform: worker.platform };
}

function deliveryShape(delivery) {
  if (!delivery) return null;
  const files = Array.isArray(delivery.files) ? delivery.files : [];
  return {
    transport: delivery.transport ?? null,
    textPath: delivery.textPath ?? 'answer.md',
    files: files.map((f) => ({
      name: f?.name ?? null,
      relPath: f?.relPath ?? null,
      bytes: f?.bytes ?? null,
      sha256: f?.sha256 ?? null,
    })),
  };
}

export class Task {
  /**
   * @param {{taskId: string, taskDir: string, request: {task: string, files: string[]},
   *          worker: {id: string, name: string, platform: string},
   *          selection: {mode: 'priority'|'explicit', reason: string}}} init
   */
  constructor({ taskId, taskDir, request, worker, selection }) {
    this.taskId = taskId;
    this.taskDir = taskDir;
    this.state = 'queued';
    this.phase = null;
    this.worker = workerShape(worker);
    this.selection = { mode: selection.mode, reason: selection.reason };
    this.attempts = [];
    this.request = { task: request.task, files: [...(request.files || [])] };
    this.error = null;
    this.timings = { createdAt: new Date().toISOString(), startedAt: null, finishedAt: null };
    this.delivery = null;
    this.skippedFiles = [];
    this.toggles = null;
    this.interrupted = undefined;

    // —— 运行时字段（不进 manifest / TaskView）——
    this.persistChain = Promise.resolve();
  }

  /** 终态判定 */
  isTerminal() {
    return isTerminalState(this.state);
  }

  /** 进入 running（含阶段复位） */
  markRunning() {
    this.state = 'running';
    this.timings.startedAt = new Date().toISOString();
  }

  /** 记录一次尝试（每次尝试写 attempts：{worker, result, at}） */
  recordAttempt(workerId, result, at = new Date().toISOString()) {
    this.attempts.push({ worker: workerId, result, at });
  }

  /** 落定终态（error 仅 done / canceled 为 null） */
  settle(state, error) {
    this.state = state;
    this.phase = null;
    this.error = state === 'done' || state === 'canceled' ? null : error;
    this.timings.finishedAt = new Date().toISOString();
  }

  /** manifest（outbox.md §3 字段清单；单一写者 = 主进程） */
  toManifest() {
    const m = {
      taskId: this.taskId,
      state: this.state,
      worker: this.worker,
      selection: { mode: this.selection.mode, reason: this.selection.reason },
      attempts: this.attempts.map((a) => ({ worker: a.worker, result: a.result, at: a.at })),
      request: { task: this.request.task, files: [...this.request.files] },
      delivery: this.delivery,
      skippedFiles: this.skippedFiles,
      toggles: this.toggles,
      timings: { ...this.timings },
      error: this.error,
    };
    if (this.interrupted) m.interrupted = this.interrupted;
    return m;
  }

  /** TaskView（mcp-server.md §3 契约形状） */
  toView() {
    return {
      taskId: this.taskId,
      state: this.state,
      phase: this.phase,
      worker: workerShape(this.worker),
      selection: { mode: this.selection.mode, reason: this.selection.reason },
      attempts: this.attempts.map((a) => ({ worker: a.worker, result: a.result, at: a.at })),
      error: this.error
        ? {
            code: this.error.code,
            message: this.error.message,
            hint: this.error.hint,
            needsHuman: !!this.error.needsHuman,
          }
        : null,
      timings: { ...this.timings },
      delivery: deliveryShape(this.delivery),
    };
  }
}
