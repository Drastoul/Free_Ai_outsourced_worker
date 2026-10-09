// 引擎行协议纯助手（JSON-RPC 2.0 over stdio 的封包识别与错误映射；无状态、无 IO）。
// 口径（主包AI 裁定，两侧同源）：业务 / 任务失败走 result.error；JSON-RPC error 只承载协议级 / 内部异常。

import { apiError, toEnvelope } from './mcp/errors.mjs';

/** 从一行消息里识别 task-progress 事件（裸形优先；兼容 JSON-RPC 通知两种封装） */
export function pickProgressEvent(msg) {
  if (msg?.event === 'task-progress' && msg.taskId) return { taskId: msg.taskId, phase: msg.phase };
  if (msg?.method === 'task-progress' && msg.params?.taskId) {
    return { taskId: msg.params.taskId, phase: msg.params.phase };
  }
  if (msg?.method === 'event' && msg.params?.event === 'task-progress' && msg.params.taskId) {
    return { taskId: msg.params.taskId, phase: msg.params.phase };
  }
  return null;
}

/** 协议级错误 ⇒ ApiError（业务失败不走这里；能从中提取 E_* 码时保留，否则按 E_ENGINE_DOWN 兜底） */
export function fromRpcError(error) {
  const message = typeof error?.message === 'string' ? error.message : JSON.stringify(error ?? {});
  const dataCode = typeof error?.data?.code === 'string' ? error.data.code : null;
  const m = /E_[A-Z_]+/.exec(message);
  const code = dataCode || (m ? m[0] : 'E_ENGINE_DOWN');
  return apiError(code, `引擎协议错误：${message.slice(0, 300)}`);
}

/** result.error（业务失败）⇒ ApiError；非对象按文本兜底 */
export function engineErrorToApiError(error) {
  if (!error) return null;
  if (typeof error === 'string') return apiError('E_INTERNAL', error);
  const code = typeof error.code === 'string' ? error.code : 'E_INTERNAL';
  return apiError(code, typeof error.message === 'string' ? error.message : toEnvelope(error).message);
}
