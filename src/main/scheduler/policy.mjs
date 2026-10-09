// 调度策略（纯函数与常量）：错误分类、重试 / 降级决策、阶段超时映射、引擎结果解释。
// 设计权威：docs/design/modules/scheduler.md §6（重试与降级）/ §7（阶段超时表）/ §10（与引擎子进程的接口）。
// 本模块不持有状态、不碰 IO —— 便于单元验证。

import { apiError, needsHuman } from '../mcp/errors.mjs';
import { engineErrorToApiError } from '../engine-wire.mjs';

/** 外包工不可用类错误的冷却时长（scheduler.md §6：默认 10 分钟，或人工处理后清除） */
export const COOLDOWN_MS = 10 * 60 * 1000;

/** 瞬时错误退避（3s / 10s；scheduler.md §6） */
export const RETRY_BACKOFF_MS = [3000, 10000];

/** 瞬时（可重试）错误类 */
export const RETRYABLE = new Set(['E_TIMEOUT', 'E_NO_RESPONSE', 'E_SEND_FAILED', 'E_STREAM_PARSE']);

/** 外包工不可用（可降级）错误类 */
export const DEGRADABLE = new Set(['E_LOGIN_REQUIRED', 'E_CAPTCHA_OR_RISK', 'E_SELECTOR_MISSING', 'E_WORKER_UNAVAILABLE']);

/** 阶段 → 超时配置键（阶段超时表逐键对应） */
export const PHASE_TIMEOUT_KEY = {
  opening: 'openingMs',
  uploading: 'uploadingMs',
  sending: 'sendingMs',
  streaming: 'taskTimeoutMs',
  extracting: 'extractingMs',
  finalizing: 'extractingMs',
};

/** 阶段 → 超时错误码（streaming 的「首字节」由引擎侧判 E_NO_RESPONSE，主进程看门狗用总时长判 E_TIMEOUT；
 *  finalizing 为阶段表之外的收尾相位，按 extractingMs / E_OUTBOX_WRITE 归口） */
export const PHASE_TIMEOUT_CODE = {
  opening: 'E_TIMEOUT',
  uploading: 'E_TIMEOUT',
  sending: 'E_SEND_FAILED',
  streaming: 'E_TIMEOUT',
  extracting: 'E_OUTBOX_WRITE',
  finalizing: 'E_OUTBOX_WRITE',
};

/** 某阶段的超时毫秒数（未知阶段按总时长） */
export function phaseLimitMs(timeouts, phase) {
  return timeouts?.[PHASE_TIMEOUT_KEY[phase] || 'taskTimeoutMs'] ?? timeouts?.taskTimeoutMs ?? 300000;
}

/** 某阶段超时的错误码 */
export function phaseTimeoutCode(phase) {
  return PHASE_TIMEOUT_CODE[phase] || 'E_TIMEOUT';
}

/**
 * 失败处置决策（scheduler.md §6）：
 * 瞬时 ⇒ 同外包工重试（≤ retryPerWorker）；不可用类 ⇒ 预热阶段降级（≤ maxFailoverWorkers），
 * 耗尽 / 硬绑定 / 已进入 streaming ⇒ needs_human；其余按错误码表的 needsHuman 列收终态。
 * @param {{code: string, cfg: object, mode: 'priority'|'explicit', retriesOnWorker: number,
 *          triedCount: number, sawStreaming: boolean, nextWorker: object|null}} input
 * @returns {{action:'retry', delayMs:number}|{action:'failover', worker:object}|{action:'finish', state:string}}
 */
export function decideOutcome({ code, cfg, mode, retriesOnWorker, triedCount, sawStreaming, nextWorker }) {
  if (RETRYABLE.has(code) && retriesOnWorker < cfg.retryPerWorker) {
    const delayMs =
      RETRY_BACKOFF_MS[retriesOnWorker] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
    return { action: 'retry', delayMs };
  }
  if (DEGRADABLE.has(code)) {
    const canFailover = mode === 'priority' && !sawStreaming && triedCount < cfg.maxFailoverWorkers;
    if (canFailover && nextWorker) return { action: 'failover', worker: nextWorker };
    // 硬绑定 / 已进入 streaming / 降级耗尽 ⇒ needs_human（错误码 = 最后一次尝试的错误码）
    return { action: 'finish', state: 'needs_human' };
  }
  if (code === 'E_CANCELED') return { action: 'finish', state: 'canceled' };
  return { action: 'finish', state: needsHuman(code) ? 'needs_human' : 'failed' };
}

/** 引擎交付清单归一化（缺席 ⇒ 未产出；textPath 缺省 answer.md） */
export function normalizeDelivery(delivery) {
  if (!delivery || typeof delivery !== 'object') return null;
  return {
    transport: delivery.transport ?? null,
    textPath: delivery.textPath ?? 'answer.md',
    files: Array.isArray(delivery.files) ? delivery.files : [],
    partial: !!delivery.partial,
  };
}

/**
 * 引擎 task.run 的 result ⇒ 统一结果（业务失败走 result.error；取消态不算错误）。
 * @returns {{ok: boolean, canceled?: boolean, error?: Error, delivery?: any, toggles?: any, skippedFiles?: any}}
 */
export function interpretEngineResult(result) {
  if (result && typeof result === 'object') {
    if (result.canceled) {
      return { ok: false, canceled: true, delivery: result.delivery, toggles: result.toggles };
    }
    if (result.error) {
      return {
        ok: false,
        canceled: false,
        error: engineErrorToApiError(result.error),
        delivery: result.delivery,
        toggles: result.toggles,
      };
    }
    return {
      ok: true,
      delivery: result.delivery ?? null,
      toggles: result.toggles ?? null,
      skippedFiles: result.skippedFiles,
    };
  }
  return { ok: false, canceled: false, error: apiError('E_INTERNAL', '引擎返回了无法识别的结果') };
}
