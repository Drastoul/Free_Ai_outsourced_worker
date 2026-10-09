// 外包工名册：视图（list_workers / /healthz 词表）、健康与冷却、选人与降级候选。
// 设计权威：docs/design/modules/scheduler.md §4（选人算法）/ §6（冷却）；docs/design/modules/mcp-server.md §3.1（词表）。

import { apiError } from '../mcp/errors.mjs';
import { COOLDOWN_MS } from './policy.mjs';

export class Workforce {
  /**
   * @param {{config: object, log: object, isBusy?: (workerId: string) => boolean}} deps
   *        isBusy = 该外包工是否正在执行任务（由执行器提供）
   */
  constructor({ config, log, isBusy = () => false }) {
    this.config = config;
    this.log = log;
    this.isBusy = isBusy;
    /** @type {Map<string, {status: string, detail: string|null, at: string, until: number}>} 健康 / 冷却记录 */
    this.health = new Map();
  }

  // -------------------------------------------------------------------------
  // 查找
  // -------------------------------------------------------------------------

  byId(id) {
    return this.config.current.workers.find((w) => w.id === id) || null;
  }

  /** 指定匹配：先按自定义名（trim 后精确），再按条目 id */
  match(nameOrId) {
    const key = String(nameOrId).trim();
    const workers = this.config.current.workers;
    return workers.find((w) => w.name.trim() === key) || workers.find((w) => w.id === key) || null;
  }

  // -------------------------------------------------------------------------
  // 健康与冷却
  // -------------------------------------------------------------------------

  /** 健康记录（冷却到期视作恢复） */
  statusOf(workerId) {
    const rec = this.health.get(workerId);
    if (!rec) return { status: 'ready', detail: null, at: null };
    if (rec.until && Date.now() > rec.until) {
      this.health.delete(workerId);
      return { status: 'ready', detail: null, at: null };
    }
    return { status: rec.status, detail: rec.detail, at: rec.at };
  }

  /** 置冷却（不可用类错误；默认 10 分钟） */
  setCooldown(workerId, code, detail) {
    const status =
      code === 'E_LOGIN_REQUIRED' ? 'login_required' : code === 'E_CAPTCHA_OR_RISK' ? 'captcha_cooling' : 'unavailable';
    this.health.set(workerId, {
      status,
      detail: detail || null,
      at: new Date().toISOString(),
      until: Date.now() + COOLDOWN_MS,
    });
    this.log?.warn(`外包工 ${workerId} 置冷却（${code}；${Math.round(COOLDOWN_MS / 60000)} 分钟）`);
  }

  /**
   * 检查结果写回（b2 设置界面「打开并检查」；口径 = 批次档 b2 §2 评审修复 ⑧）：
   * 成功检查**整体替换**既有健康记录（不叠加）；记录形状 = 既有 `{status, detail, at, until}`（:16）。
   * 词表映射（与引擎 opening 同源）：ready / login_required 同名直映（ready 也记检查时间）；
   * `captcha` ⇒ 内部 `captcha_cooling`（对外词表 `unavailable` + detail「冷却中：验证码 / 风控」）。
   * 冷却语义：ready / login_required ⇒ `until = null`（不置冷却——冷却到期假性回 ready 不适用于登录态）；
   * captcha / unavailable ⇒ 沿用既有冷却（`until = now + COOLDOWN_MS`）。
   * @param {string} workerId
   * @param {{status: 'ready'|'login_required'|'captcha'|'unavailable', detail?: string|null}} result
   * @returns {{status: string, detail: string|null, at: string|null}|null} 写回后的健康视图（statusOf 同形）；
   *          外包工不在名册（如检查期间被删除）⇒ 不写回（else 托盘「我已处理」会以裸 id 报出孤儿记录）
   */
  markChecked(workerId, { status, detail } = {}) {
    if (!this.byId(workerId)) {
      this.log?.warn(`外包工 ${workerId} 已不在名册（可能已被删除），检查结果丢弃不写回`);
      return null;
    }
    const known = ['ready', 'login_required', 'captcha', 'unavailable'];
    let s = status;
    if (!known.includes(s)) {
      this.log?.warn(`外包工 ${workerId} 检查返回未知状态（${JSON.stringify(status)}），按 unavailable 处理`);
      s = 'unavailable';
    }
    const at = new Date().toISOString();
    const text = typeof detail === 'string' && detail ? detail : null;
    if (s === 'ready' || s === 'login_required') {
      // 缓存态：保留至下一次检查 / 任务结果 / 托盘「我已处理」覆盖
      this.health.set(workerId, { status: s, detail: text, at, until: null });
      this.log?.info(`外包工 ${workerId} 检查结果写回：${s}（不置冷却）`);
    } else if (s === 'captcha') {
      this.health.set(workerId, {
        status: 'captcha_cooling',
        detail: text || '冷却中：验证码 / 风控',
        at,
        until: Date.now() + COOLDOWN_MS,
      });
      this.log?.warn(`外包工 ${workerId} 检查结果写回：captcha ⇒ unavailable（冷却 ${Math.round(COOLDOWN_MS / 60000)} 分钟）`);
    } else {
      this.health.set(workerId, { status: 'unavailable', detail: text, at, until: Date.now() + COOLDOWN_MS });
      this.log?.warn(`外包工 ${workerId} 检查结果写回：unavailable（冷却 ${Math.round(COOLDOWN_MS / 60000)} 分钟）`);
    }
    return this.statusOf(workerId);
  }

  clearHealth(workerId) {
    if (this.health.delete(workerId)) {
      this.log?.info(`外包工 ${workerId} 健康状态恢复为 ready`);
    }
  }

  /**
   * 人工处理后的恢复路径（scheduler.md §6：冷却「默认 10 分钟，或人工处理后清除」）：清除全部外包工冷却。
   * @returns {string[]} 被恢复的外包工名（无冷却 ⇒ 空数组，不报错）
   */
  clearAllHealth() {
    const restored = [];
    for (const id of [...this.health.keys()]) {
      const w = this.byId(id);
      const cooling = this.statusOf(id).status !== 'ready';
      this.clearHealth(id);
      if (cooling) restored.push(w ? w.name : id);
    }
    return restored;
  }

  /** 外包工不可用原因码；可用 ⇒ null */
  unavailableCode(workerId) {
    const w = this.byId(workerId);
    if (!w) return 'E_WORKER_UNAVAILABLE';
    if (!w.enabled) return 'E_WORKER_DISABLED';
    const h = this.statusOf(workerId);
    if (h.status === 'login_required') return 'E_LOGIN_REQUIRED';
    if (h.status !== 'ready') return 'E_WORKER_UNAVAILABLE';
    return null;
  }

  // -------------------------------------------------------------------------
  // 对外词表（list_workers / /healthz）
  // -------------------------------------------------------------------------

  /** status ∈ ready | login_required | busy | unavailable | disabled（冷却态 captcha_cooling 一律映射为 unavailable） */
  list() {
    return this.config.current.workers.map((w) => {
      const base = { id: w.id, name: w.name, platform: w.platform, enabled: !!w.enabled };
      if (!w.enabled) return { ...base, status: 'disabled', lastCheckedAt: null };
      const h = this.statusOf(w.id);
      let status = 'ready';
      let detail;
      if (h.status === 'captcha_cooling') {
        status = 'unavailable';
        detail = '冷却中：验证码 / 风控';
      } else if (h.status !== 'ready') {
        status = h.status;
        if (h.detail) detail = h.detail;
      } else if (this.isBusy(w.id)) {
        status = 'busy';
      }
      return { ...base, status, ...(detail ? { detail } : {}), lastCheckedAt: h.at ?? null };
    });
  }

  // -------------------------------------------------------------------------
  // 选人（scheduler.md §4）
  // -------------------------------------------------------------------------

  /**
   * 派单期选人：返回 {worker, mode, reason}；拒绝 ⇒ 抛 ApiError（同步拒绝、不建任务）。
   * 指定 = 硬绑定（不降级）；优先级路径 = 第一个健康者（即使正忙也选它，任务排队）。
   */
  pick(specified) {
    const workers = this.config.current.workers;
    if (specified !== undefined && specified !== null && String(specified).trim() !== '') {
      const w = this.match(specified);
      if (!w) {
        const names = workers.map((x) => x.name).join('、') || '（无已登记外包工）';
        throw apiError('E_WORKER_UNKNOWN', `未找到名为「${String(specified).trim()}」的外包工；可用：${names}`);
      }
      if (!w.enabled) throw apiError('E_WORKER_DISABLED', `外包工「${w.name}」已被停用`);
      const code = this.unavailableCode(w.id);
      if (code === 'E_LOGIN_REQUIRED') {
        throw apiError('E_LOGIN_REQUIRED', `外包工「${w.name}」需要登录（指定为硬绑定，不降级）`);
      }
      if (code) {
        throw apiError('E_WORKER_UNAVAILABLE', `外包工「${w.name}」当前不可用（指定为硬绑定，不降级）`);
      }
      return { worker: w, mode: 'explicit', reason: `指定「${w.name}」；健康` };
    }

    const skipped = [];
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      if (!w.enabled) {
        skipped.push(`${w.name}:已停用`);
        continue;
      }
      const code = this.unavailableCode(w.id);
      if (code) {
        skipped.push(`${w.name}:${code}`);
        continue;
      }
      return { worker: w, mode: 'priority', reason: `优先级第 ${i + 1}；健康` };
    }
    throw apiError('E_NO_WORKER', `派单时无任何可用外包工${skipped.length ? `；跳过：${skipped.join('、')}` : ''}`);
  }

  /** 降级候选：按数组顺序取下一个「未尝试过 ∧ 启用 ∧ 健康」的外包工 */
  nextAvailable(tried) {
    for (const w of this.config.current.workers) {
      if (tried.has(w.id)) continue;
      if (!w.enabled) continue;
      if (this.unavailableCode(w.id)) continue;
      return w;
    }
    return null;
  }
}
