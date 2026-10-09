/**
 * opening 阶段的「页面就绪」：打开平台页 + 登录态判定（`docs/design/modules/adapters.md` §3.6）。
 * 页面操作本身在适配器；本模块只做与平台无关的编排（导航与轮询判定）。
 */
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
