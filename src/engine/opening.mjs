/**
 * opening 阶段的「页面就绪」：打开平台页 + 登录态判定（`docs/design/modules/adapters.md` §3.6 / §6.1）。
 * 页面操作本身在适配器；本模块只做与平台无关的编排（导航与轮询判定）。
 */
import { EngineError } from './adapters/base.mjs';
import { remainingMs, sleep } from './util.mjs';

/** 打开平台页（已在平台上则复用当前页） */
export async function ensureOnPlatform(page, adapter, deadline) {
  const target = new URL(adapter.url);
  let currentHost = '';
  try {
    currentHost = new URL(page.url()).host;
  } catch {
    currentHost = '';
  }
  if (currentHost === target.host) return { via: 'reuse' };
  await page.goto(adapter.url, { waitUntil: 'domcontentloaded', timeout: Math.max(5000, remainingMs(deadline)) });
  return { via: 'goto' };
}

/**
 * 登录态检查：轮询到「可用」或稳定判出「需人工」为止（登录 / 风控页稳定 6s 即早退，窗口留给人工）。
 * @returns {Promise<'ready'|'login_required'|'captcha'>}
 */
export async function waitForLoginState(page, adapter, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let last = null;
  let stableSince = 0;
  while (Date.now() < deadline) {
    const state = await adapter.checkLogin(page);
    if (state === 'ready') return state;
    if (state !== last) {
      last = state;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= 6000) {
      return state;
    }
    await sleep(1000);
  }
  return last ?? 'login_required';
}

/**
 * 登录失败的回报（b7）：可选钩子 `adapter.loginFailure(page)` 给出具体诊断（返回 `{code, message}`）⇒ 用它；
 * 否则按既有登录态映射（`captcha` ⇒ `E_CAPTCHA_OR_RISK`；其余 ⇒ `E_LOGIN_REQUIRED`）。
 * 供 task-runner（opening 阶段）与 worker-check（检查面）共用（`docs/design/modules/adapters.md` §6.1）。
 */
export async function loginFailureError(state, adapter, page) {
  if (state !== 'ready' && typeof adapter?.loginFailure === 'function') {
    try {
      const diag = await adapter.loginFailure(page);
      if (diag?.code) return new EngineError(diag.code, diag.message);
    } catch {
      /* 诊断自身失败 ⇒ 不掩盖主因，落回既有映射 */
    }
  }
  if (state === 'captcha') {
    return new EngineError('E_CAPTCHA_OR_RISK', '检测到验证码 / 风控线索：请在浏览器窗口人工处理，然后点托盘「我已处理（清除外包工冷却）」再重派');
  }
  return new EngineError('E_LOGIN_REQUIRED', `登录态不可用（${state}）：请在打开的浏览器窗口完成登录，然后点托盘「我已处理（清除外包工冷却）」再重派`);
}
