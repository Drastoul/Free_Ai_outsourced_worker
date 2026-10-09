/**
 * 失败收尾：失败截图（页面结构异常 / 风控 / 超时的留证，`docs/design/modules/outbox.md`）
 * 与业务失败回报形状 `{code, message, hint?, screenshot?}`（`docs/design/modules/mcp-server.md` 错误码表）。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 需要留证的错误码（其余失败不截图） */
const SCREENSHOT_CODES = new Set(['E_SELECTOR_MISSING', 'E_CAPTCHA_OR_RISK', 'E_TIMEOUT', 'E_NO_RESPONSE', 'E_STREAM_PARSE']);

/** 面向调用方的下一步建议（按错误码给 hint） */
const HINTS = {
  E_LOGIN_REQUIRED: '请在打开的浏览器窗口完成登录后重新派单',
  E_CAPTCHA_OR_RISK: '请在浏览器窗口完成验证 / 风控处理后重新派单',
  E_SELECTOR_MISSING: '页面结构可能已变化：需人工核查该平台适配器（已留失败截图）',
  E_WORKER_UNAVAILABLE: '该外包工暂不可用：检查平台适配器与浏览器配置',
  E_STREAM_PARSE: '答复流可能被截断：可直接重试该单',
  E_OUTBOX_WRITE: '交付目录不可写：检查 outbox 路径权限',
};

/** 失败截图（best-effort；失败只记日志，不影响回报） */
export async function maybeScreenshot(page, outboxDir, code, log = () => {}) {
  if (!page || !outboxDir || !SCREENSHOT_CODES.has(code)) return null;
  try {
    const dir = path.join(outboxDir, 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const rel = `screenshots/failure-${code}.png`;
    await page.screenshot({ path: path.join(outboxDir, rel), timeout: 15000 });
    log('task', `失败截图 → ${rel}`);
    return rel;
  } catch (e) {
    log('task', `失败截图失败（忽略）：${String(e?.message ?? e).slice(0, 140)}`);
    return null;
  }
}

/** 业务失败回报形状（含提示与截图路径；`hint` 仅对有建议的码出现） */
export async function buildErrorReport(err, { page, outboxDir, log = () => {} } = {}) {
  const screenshot = await maybeScreenshot(page, outboxDir, err?.code, log);
  return {
    code: err?.code ?? 'E_UNKNOWN',
    message: String(err?.message ?? err),
    ...(HINTS[err?.code] ? { hint: HINTS[err.code] } : {}),
    ...(screenshot ? { screenshot } : {}),
  };
}
