// 错误码表（权威 = docs/design/modules/mcp-server.md「错误码」；hint / needsHuman 逐字对齐）
// 失败信封：MCP 工具结果 isError:true，单个 text 内容块为 JSON {code, message, hint}。

export const ERROR_TABLE = {
  E_BAD_ARGS: { hint: '修正参数后重试', needsHuman: false },
  E_TASK_UNKNOWN: { hint: '核对任务号；重启前任务的产物仍留在 outbox 目录', needsHuman: false },
  E_TASK_ALREADY_SENT: { hint: '改为新派单并携带附件', needsHuman: false },
  E_WORKER_UNKNOWN: { hint: '用 `list_workers` 取可用名单', needsHuman: false },
  E_WORKER_DISABLED: { hint: '启用或改派', needsHuman: false },
  E_WORKER_UNAVAILABLE: { hint: '人工处理后（必要时点托盘「我已处理」清除冷却）再重派', needsHuman: true },
  E_NO_WORKER: { hint: '人工检查登录 / 启用状态', needsHuman: true },
  E_LOGIN_REQUIRED: { hint: '请在打开的窗口登录，然后点托盘「我已处理（清除外包工冷却）」再重派', needsHuman: true },
  E_CAPTCHA_OR_RISK: { hint: '请在窗口人工处理，然后点托盘「我已处理（清除外包工冷却）」再重派', needsHuman: true },
  E_SELECTOR_MISSING: { hint: '该外包工暂不可用；需适配器适配（附截图）', needsHuman: true },
  E_SEND_FAILED: { hint: '自动重试后仍失败；可重派', needsHuman: false },
  E_NO_RESPONSE: { hint: '可重派', needsHuman: false },
  E_TIMEOUT: { hint: '可重派；持续出现请检查平台状态', needsHuman: false },
  E_STREAM_PARSE: { hint: '可重派', needsHuman: false },
  E_CANCELED: { hint: '如需继续请重派', needsHuman: false },
  E_BAD_FILE: { hint: '修正路径与大小后重试', needsHuman: false },
  E_OUTBOX_WRITE: { hint: '检查交付目录权限与磁盘空间', needsHuman: true },
  E_ENGINE_DOWN: { hint: '已自动重启；进行中任务 failed（可重派）', needsHuman: false },
  E_INTERNAL: { hint: '附日志路径', needsHuman: true },
};

/** 错误码全集（19 条） */
export const ERROR_CODES = Object.keys(ERROR_TABLE);

export function isKnownCode(code) {
  return Object.prototype.hasOwnProperty.call(ERROR_TABLE, code);
}

export function needsHuman(code) {
  return isKnownCode(code) ? ERROR_TABLE[code].needsHuman : true; // 未知码按需人工处理兜底（E_INTERNAL 语义）
}

export function hintOf(code) {
  return isKnownCode(code) ? ERROR_TABLE[code].hint : ERROR_TABLE.E_INTERNAL.hint;
}

/** 业务错误（带错误码）；未知码归 E_INTERNAL */
export class ApiError extends Error {
  constructor(code, message, extra = {}) {
    const finalCode = isKnownCode(code) ? code : 'E_INTERNAL';
    super(String(message ?? finalCode));
    this.name = 'ApiError';
    this.code = finalCode;
    this.extra = extra;
  }
}

export function apiError(code, message, extra) {
  return new ApiError(code, message, extra);
}

/** 任意异常 ⇒ 错误信封 {code, message, hint} */
export function toEnvelope(err) {
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message, hint: hintOf(err.code) };
  }
  const message = err?.message ? String(err.message) : String(err ?? '未知错误');
  return { code: 'E_INTERNAL', message, hint: hintOf('E_INTERNAL') };
}

/** 任意异常 ⇒ 任务 error 字段（TaskView / manifest 同形） */
export function toTaskError(err) {
  const env = toEnvelope(err);
  return { ...env, needsHuman: needsHuman(env.code) };
}
