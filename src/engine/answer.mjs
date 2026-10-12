/**
 * 答复采集（`docs/design/modules/adapters.md`「收答复主通道」「DOM 兜底通道」）：
 *   · 流捕获 = 监听本任务的答复流请求 / 响应（平台专属协议名见各适配器模块）；请求体交 `adapter.requestPayload.toggles` 读开关载荷；
 *   · 收答复 = 以流为主（流内 FINISHED 结束标记判定完成），未捕获到流 ⇒ DOM 兜底（2s × 3 次稳定）；
 *   · 取消由调用方的 `isCanceled()` 注入（本模块不持有任务状态）。
 */
import { EngineError, normalizeToggles } from './adapters/base.mjs';
import { sleep } from './util.mjs';

/** 挂流监听：请求（含开关载荷）、响应体（SSE 全文） */
export function attachStreamCapture(page, adapter) {
  const capture = { requestSeen: false, responseSeen: 0, bodies: [], payload: null, bodyError: null, at: Date.now() };
  capture.onRequest = (request) => {
    try {
      if (request.method() !== 'POST' || !adapter.stream.match(request.url())) return;
      capture.requestSeen = true;
      if (adapter.capabilities.requestPayloadCapture && adapter.requestPayload?.toggles) {
        const parsed = adapter.requestPayload.toggles(request.postData() ?? '');
        if (parsed) capture.payload = parsed;
      }
    } catch {
      /* 忽略 */
    }
  };
  capture.onResponse = (response) => {
    try {
      if (!adapter.stream.match(response.url())) return;
      const idx = capture.responseSeen++;
      response
        .text()
        .then((body) => {
          capture.bodies[idx] = body;
        })
        .catch((e) => {
          capture.bodyError = String(e?.message ?? e).slice(0, 160);
        });
    } catch {
      /* 忽略 */
    }
  };
  page.on('request', capture.onRequest);
  page.on('response', capture.onResponse);
  return capture;
}

export function detachStreamCapture(page, capture) {
  try {
    page.off('request', capture.onRequest);
    page.off('response', capture.onResponse);
  } catch {
    /* 忽略 */
  }
}

/** 发送确认：发送后是否观测到本任务的答复流请求（未确认 ⇒ E_SEND_FAILED） */
export async function waitForSendConfirm(capture, budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (capture.requestSeen) return true;
    await sleep(200);
  }
  throw new EngineError('E_SEND_FAILED', `发送未确认：${budgetMs}ms 内未观测到答复流请求`);
}

/**
 * 收答复。
 * @returns {Promise<{transport:'sse'|'dom', text:string, thinking:string, note:string}>}
 */
export async function collectAnswer(page, adapter, capture, timeouts, { isCanceled = () => false } = {}) {
  const firstByteDeadline = Date.now() + timeouts.streamFirstByteMs;
  const totalDeadline = Date.now() + timeouts.taskTimeoutMs;
  let transport = 'sse';
  let text = '';
  let thinking = '';
  let note = null;
  if (adapter.capabilities?.streamCapture === false) {
    // 能力声明为「无流」的平台：不空等首字节，直接走 DOM 兜底（adapters.md §2：能力声明据此分支）
    transport = 'dom';
    note = 'no-stream-capability';
  }
  while (transport === 'sse') {
    if (isCanceled()) throw new EngineError('E_CANCELED', '任务已取消');
    const body = capture.bodies[capture.responseSeen - 1];
    if (typeof body === 'string') {
      const parsed = adapter.stream.parse(body);
      if (!parsed.finished) {
        throw new EngineError('E_STREAM_PARSE', '答复流已结束但缺 FINISHED 结束标记（可能被截断）');
      }
      text = parsed.text;
      thinking = parsed.thinking;
      note = 'finished-marker';
      break;
    }
    if (capture.responseSeen > 0 && capture.bodyError && capture.bodies[capture.responseSeen - 1] === undefined) {
      // 响应体读取失败（页面关闭 / 连接中断）⇒ 瞬时错误（调度侧同外包工重试）
      throw new EngineError('E_STREAM_PARSE', `答复流读取失败：${capture.bodyError}`);
    }
    if (!capture.responseSeen && Date.now() > firstByteDeadline) {
      transport = 'dom';
      note = 'no-stream';
      break;
    }
    if (Date.now() > totalDeadline) {
      if (capture.responseSeen) throw new EngineError('E_TIMEOUT', '答复流总时长超限');
      throw new EngineError('E_NO_RESPONSE', '未观测到答复流（首字节超时）');
    }
    await sleep(500);
  }
  if (transport === 'dom') {
    const noStreamCap = note === 'no-stream-capability';
    let last = '';
    let stable = 0;
    while (Date.now() < totalDeadline) {
      if (isCanceled()) throw new EngineError('E_CANCELED', '任务已取消');
      const current = await adapter.dom.collect(page).catch(() => '');
      if (current && current === last) stable++;
      else stable = 0;
      last = current;
      if (current && stable >= 3) break;
      // 无流平台（b7 / §6.5）：「从未取到非空文本」到 streamFirstByteMs 即判 E_NO_RESPONSE（不空等到总超时）
      if (noStreamCap && !last && Date.now() > firstByteDeadline) {
        throw new EngineError('E_NO_RESPONSE', `发送后未观测到新回复（等待 ${timeouts.streamFirstByteMs}ms）${await domDiagnosis(adapter, page)}`);
      }
      await sleep(2000);
    }
    if (!last) {
      throw new EngineError(
        'E_NO_RESPONSE',
        noStreamCap
          ? `发送后未观测到新回复（等待 ${timeouts.streamFirstByteMs}ms）${await domDiagnosis(adapter, page)}`
          : '答复流未捕获，且 DOM 兜底未取到文本',
      );
    }
    if (stable < 3) {
      throw new EngineError('E_TIMEOUT', `DOM 兜底文本未稳定（总时长超限）${noStreamCap ? await domDiagnosis(adapter, page) : ''}`);
    }
    text = last;
    note = 'dom-stable';
  }
  return { transport, text, thinking, note };
}

/** DOM 采集诊断后缀（b7 / §6.5）：适配器可选提供 `dom.diagnose(page)`；引擎只拼接、不解析；缺失 / 失败 ⇒ 空串 */
async function domDiagnosis(adapter, page) {
  try {
    const diag = typeof adapter?.dom?.diagnose === 'function' ? await adapter.dom.diagnose(page) : null;
    return diag ? `+ 采集诊断：${String(diag).slice(0, 240)}` : '';
  } catch {
    return '';
  }
}

/** 开关核对回报形状：`{configured, payload, ok, checked, unsupported}`（`docs/design/modules/adapters.md` §3.8；`ok` 只比**受支持子键**；未捕获载荷 / 无受支持子键 ⇒ `null`，不伪装绿） */
export function buildTogglesReport(adapter, toggles, capture) {
  const configured = { thinking: !!(toggles?.thinking), search: !!(toggles?.search) };
  const supported = normalizeToggles(adapter?.capabilities?.toggles);
  const checked = ['thinking', 'search'].filter((key) => supported[key]);
  const unsupported = ['thinking', 'search'].filter((key) => !supported[key]);
  const payload = adapter?.capabilities?.requestPayloadCapture ? (capture?.payload ?? null) : null;
  const ok = payload && checked.length ? checked.every((key) => payload[`${key}_enabled`] === configured[key]) : null;
  return { configured, payload, ok, checked, unsupported };
}

/** 开关值的日志化展示（configured 用 thinking/search，payload 用 thinking_enabled/search_enabled；只展示在场键） */
export function fmtToggles(value) {
  if (!value) return '未知';
  const parts = [];
  const thinking = value.thinking ?? value.thinking_enabled;
  const search = value.search ?? value.search_enabled;
  if (thinking !== undefined) parts.push(`thinking:${thinking}`);
  if (search !== undefined) parts.push(`search:${search}`);
  return `{${parts.join(', ')}}`;
}

/**
 * 应用 / 复核外包工开关并记一行「目标值 / 实际值 / 复核结果」（AC-R8-2 日志侧）。
 * b6 起只对**受支持子键的子集**下控件操作与复核（`capabilities.toggles` 归一化后逐键取真）。
 * 失败（元素缺失 / 状态不符）⇒ 原样抛出 `E_SELECTOR_MISSING`（调用方中止，不发送）；无受支持子键 ⇒ 不触及页面（返回 null；调用方守卫已跳过本步）。
 * @param {{page:object, adapter:object, toggles:object, stage:string, log?:Function}} o
 */
export async function applyTogglesWithLog({ page, adapter, toggles, stage, log = () => {} } = {}) {
  const supported = normalizeToggles(adapter?.capabilities?.toggles);
  const wanted = { thinking: !!(toggles?.thinking), search: !!(toggles?.search) };
  const subset = {};
  for (const key of ['thinking', 'search']) if (supported[key]) subset[key] = wanted[key];
  if (!Object.keys(subset).length) return null;
  try {
    const applied = await adapter.applyToggles(page, subset, { log: (m) => log('task', m) });
    const actual = applied?.page ?? null;
    const ok = actual ? Object.entries(subset).every(([key, value]) => actual[key] === value) : applied?.ok !== false;
    log('task', `开关${stage} 目标=${fmtToggles(subset)} 实际=${actual ? fmtToggles(actual) : '未知'} 复核=${ok ? '一致' : '不一致'}`);
    return applied;
  } catch (e) {
    log('task', `开关${stage}失败 目标=${fmtToggles(subset)} 错误=${e?.code ?? ''} ${e?.message ?? e}`);
    throw e;
  }
}
