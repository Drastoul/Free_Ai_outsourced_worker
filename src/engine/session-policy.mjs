/**
 * 会话复用策略（b5；机制权威 = `docs/design/modules/browser-engine.md` §9，
 * 落地合同与判据 = `docs/batches/b5-session-reuse.md` §2）。
 *
 * 职责：维护「同一外包工连续任务复用同一聊天会话」的内存态单元，并在 opening 阶段给出
 * 「复用 / 新建」判定；每次引擎 run 结束时按 result 写回终态。
 *
 * 边界：不 import Playwright、不触碰页面（`pageRef` 仅作身份比对）；不落盘；
 * 不做服务端会话有效性预检（U4）；不做上下文压缩 / 预热。
 */

/** 设计默认值（与 `src/main/config-schema.mjs` 的 `DEFAULT_CONFIG.session` 两处须一致） */
export const DEFAULT_SESSION_CONFIG = Object.freeze({
  reuse: true,
  ttlMs: 600000,
  maxTasksPerSession: 5,
});

/**
 * 会话复用状态机（引擎内存态、按 `workerId` 隔离）。
 *
 * 不变量（批次档 §2 机制设计 1）：单元实例锚定引擎进程生命周期——单实例装配于 `createEngine`、
 * 由引擎级 `TaskRunner`（构造一次）持有、跨 `task.run` 复用（不随单重建）；引擎重启 ⇒ 实例消失 ⇒ 首单 `absent`。
 */
export class SessionPolicy {
  /**
   * @param {object} [opts]
   * @param {(m: string) => void} [opts.log] 日志回调（`TaskRunner` 装配时注入）
   */
  constructor({ log = () => {} } = {}) {
    this.log = log;
    /** @type {Map<string, {pageRef: unknown, sessionStartedAt: number, taskCount: number, lastTaskEndedAt: number|null, lastOutcome: string|null}>} */
    this.units = new Map();
  }

  /**
   * 判定本次任务是否复用会话（opening 阶段、`openSession` 之前调用）。
   * 判定顺序（批次档 §2 机制设计 3；首个命中为准）：
   *   disabled → absent → replaced → error → canceled → ttl → count → reuse
   *
   * @param {object} params
   * @param {string} params.workerId
   * @param {number} params.now 取时点（可注入，供单测判定 TTL 边界）
   * @param {object} [params.config] 会话配置（缺省 / 缺键回落 `DEFAULT_SESSION_CONFIG`）
   * @param {unknown} params.page 当前页面（仅取身份作 `pageRef` 比对）
   * @returns {{reuse: boolean, reason: string, taskCount: number, idleMs: number|null}}
   *          reason 域 = disabled | absent | replaced | error | canceled | ttl | count | reuse
   */
  decide({ workerId, now, config, page } = {}) {
    const cfg = { ...DEFAULT_SESSION_CONFIG, ...(config ?? {}) };
    if (cfg.reuse === false) {
      return { reuse: false, reason: 'disabled', taskCount: 0, idleMs: null };
    }

    const unit = this.units.get(String(workerId));
    if (!unit) {
      return { reuse: false, reason: 'absent', taskCount: 0, idleMs: null };
    }

    const idleMs = unit.lastTaskEndedAt == null ? null : Math.max(0, now - unit.lastTaskEndedAt);
    if (unit.pageRef !== page) {
      return { reuse: false, reason: 'replaced', taskCount: unit.taskCount, idleMs };
    }
    if (unit.lastOutcome === 'error') {
      return { reuse: false, reason: 'error', taskCount: unit.taskCount, idleMs };
    }
    if (unit.lastOutcome === 'canceled') {
      return { reuse: false, reason: 'canceled', taskCount: unit.taskCount, idleMs };
    }
    if (unit.lastTaskEndedAt != null && now > unit.lastTaskEndedAt + cfg.ttlMs) {
      return { reuse: false, reason: 'ttl', taskCount: unit.taskCount, idleMs };
    }
    if (unit.taskCount >= cfg.maxTasksPerSession) {
      return { reuse: false, reason: 'count', taskCount: unit.taskCount, idleMs };
    }
    return { reuse: true, reason: 'reuse', taskCount: unit.taskCount, idleMs };
  }

  /**
   * 登记「本单已开新会话」（调用点 = `TaskRunner.run` 的 opening 段，判定之后）。
   * 语义：把单元的会话起点与页面身份刷新到当前值，`taskCount` 归零
   *（`lastOutcome` / `lastTaskEndedAt` 保留至本单写回时覆盖）。
   *
   * @param {string} workerId
   * @param {object} params
   * @param {string} params.reason `decide()` 给出的原因（不含 `reuse`）
   * @param {unknown} params.page 当前页面（取身份作 `pageRef`）
   * @param {number} params.at 取时点
   */
  markNewSession(workerId, { reason, page, at } = {}) {
    const key = String(workerId);
    const prev = this.units.get(key);
    this.units.set(key, {
      pageRef: page,
      sessionStartedAt: at,
      taskCount: 0,
      lastTaskEndedAt: prev?.lastTaskEndedAt ?? null,
      lastOutcome: prev?.lastOutcome ?? null,
    });
    this.log(`新会话（原因=${reason}）`);
  }

  /**
   * 写回本次引擎 run 的终态（调用点 = `TaskRunner.run` 的 `finally`，per-attempt）。
   * 规则（批次档 §2 机制设计 4）：`done` 才 `taskCount++`；均更新 `lastTaskEndedAt` / `lastOutcome`；
   * 记账守卫（仅 `newChat !== false` 的适配器）在调用点执行；无单元（未开过会话）⇒ 不记账。
   *
   * @param {string} workerId
   * @param {object} params
   * @param {'done'|'error'|'canceled'} params.outcome
   * @param {number} params.at 取时点
   */
  recordOutcome(workerId, { outcome, at } = {}) {
    const unit = this.units.get(String(workerId));
    if (!unit) return;
    unit.lastOutcome = outcome;
    unit.lastTaskEndedAt = at;
    if (outcome === 'done') unit.taskCount += 1;
  }
}
