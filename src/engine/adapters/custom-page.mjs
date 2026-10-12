/**
 * 自定义外包工的页面机械（`docs/design/modules/adapters.md` §6.4 通用启发式 · §6.1 登录态）：
 *   · 输入区定位 = `driver.inputSelector` 非空 ⇒ 只用它；否则 `textarea` → `[contenteditable="true"]` → `input[type="text"]`，
 *     取文档序最靠后（页面靠下）的可见者；
 *   · `sendCustom`：填充（聚焦 → 清空 → `insertText`，落地校验失败 ⇒ 逐字 `type` 兜底）→ 发送（`sendButtonSelector` ⇒ 点按钮；否则 Enter）
 *     → 6s 发送确认（输入区已清空 ∨ 出现新回合元素；失败 ⇒ `E_SEND_FAILED`，无流平台的发送确认由本层自担，§2）；
 *   · `checkLoginState` / `loginFailureInfo`：输入区可见 ⇒ `ready`；风控词 ⇒ `captcha`；登录词 / 可见密码框 ⇒ `login_required`；
 *     输入区一直不出现且无登录线索 ⇒ 失败诊断交 `E_SELECTOR_MISSING`（阶段 + 项名 + 候选链 / 实际值）。
 * 只做「怎么操作页面」；装配在 `custom.mjs`，DOM 采集 / 基线与诊断在 `custom-dom.mjs`。
 */
import { EngineError } from './base.mjs';
import { diagnoseCustomDom, hasFreshTurn } from './custom-dom.mjs';

export const CONFIRM_MS = 6000; // 发送确认预算（§6.4：发送后 6s 内确认「输入区已清空 ∨ 出现新回合元素」）
const DOM_TAG = 'data-fo-custom';
const LOGIN_WORDS = ['登录', '登入', 'Log in', 'Sign in', 'Sign up'];
const CAPTCHA_WORDS = ['人机验证', '安全验证', '滑动验证', '异常流量', '访问受限', 'verify you are human', 'are you a robot', 'captcha', '验证码'];
const STEP_MS = 300;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (v, max = 140) => String(v?.message ?? v).replace(/\s+/g, ' ').trim().slice(0, max);

/** 页面内：输入区扫描（可见判定；`tag` 传值 ⇒ 给命中元素打标供 locator 使用） */
const INPUT_SCAN = ({ selector, candidates, tag }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  let hits = [];
  let badSelector = false;
  try {
    hits = [...document.querySelectorAll(selector || candidates.join(', '))].filter(vis);
  } catch {
    badSelector = true;
  }
  if (tag) for (const old of document.querySelectorAll(`[${tag}]`)) old.removeAttribute(tag); // 清旧标（跨任务复用页面时不命中陈旧元素；与 kimi 同口径）
  const el = hits[hits.length - 1] ?? null;
  if (el && tag) el.setAttribute(tag, '1');
  return { found: !!el, badSelector };
};

/** 页面内：登录 / 风控词与可见密码框扫描 */
const WORD_SCAN = ({ loginWords, captchaWords }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const text = (document.body?.innerText || '').slice(0, 20000);
  return {
    login: loginWords.filter((w) => text.includes(w)),
    captcha: captchaWords.filter((w) => text.includes(w)),
    pwdVisible: [...document.querySelectorAll('input[type="password"]')].some(vis),
  };
};

/** 页面内：输入区当前文本与「已清空」判定（输入区消失也视作已清空） */
const INPUT_VALUE_SCAN = ({ selector, candidates }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  let hits = [];
  try {
    hits = [...document.querySelectorAll(selector || candidates.join(', '))].filter(vis);
  } catch {
    hits = [];
  }
  const el = hits[hits.length - 1] ?? null;
  if (!el) return { present: false, empty: true, text: '' };
  const text = 'value' in el ? String(el.value ?? '') : String(el.innerText ?? el.textContent ?? '');
  return { present: true, empty: !text.trim(), text };
};

/** 输入区未找到的定位信息（§6.5：阶段 + 项名 + 实际值 / 候选链；`reason` = 'bad-selector' ⇒ 明示选择器不合法；用户自填值折成单行短串） */
export function inputMissingMessage(cfg, stage, reason = 'not-found') {
  const specified = cfg.driver.inputSelector;
  const shown = specified ? String(specified).replace(/\s+/g, ' ').trim().slice(0, 120) : '自动';
  const detail =
    reason === 'bad-selector'
      ? `inputSelector=${shown} 选择器不合法（querySelectorAll 抛错）`
      : specified
        ? `inputSelector=${shown} 未命中可见元素`
        : `候选 ${cfg.inputCandidates.join('/')} 均未命中可见元素`;
  return `${stage}：输入区未找到（inputSelector=${shown}；${detail}）；若站点需要登录请先在窗口登录`;
}

/** 登录态（§6.1）：输入区可见 ⇒ ready；风控词 ⇒ captcha；登录词 / 可见密码框 ⇒ login_required */
export async function checkLoginState(page, cfg) {
  const snap = await page.evaluate(INPUT_SCAN, { selector: cfg.driver.inputSelector, candidates: cfg.inputCandidates }).catch(() => null);
  const words = await page.evaluate(WORD_SCAN, { loginWords: LOGIN_WORDS, captchaWords: CAPTCHA_WORDS }).catch(() => null);
  if (!snap || !words) return 'login_required'; // 页面上下文异常 ⇒ 保守交人工（既有映射）
  const strongCaptcha = words.captcha.filter((w) => w !== '验证码');
  if (strongCaptcha.length) return 'captcha';
  if (snap.found) return 'ready';
  if (words.login.length || words.pwdVisible) return 'login_required';
  if (words.captcha.length) return 'captcha'; // 「验证码」弱词 + 无输入区 + 无登录线索
  return 'login_required';
}

/**
 * 登录失败诊断钩子（§6.1）：输入区未找到且无登录线索（登录词 / 密码框 / 风控词）⇒ `E_SELECTOR_MISSING` + 候选链；
 * 其余 ⇒ null（由调用方按既有 `ready` / `login_required` / `captcha` 映射处置）。
 */
export async function loginFailureInfo(page, cfg) {
  const snap = await page.evaluate(INPUT_SCAN, { selector: cfg.driver.inputSelector, candidates: cfg.inputCandidates }).catch(() => null);
  if (!snap || snap.found) return null;
  const words = await page.evaluate(WORD_SCAN, { loginWords: LOGIN_WORDS, captchaWords: CAPTCHA_WORDS }).catch(() => null);
  if (!words) return null;
  if (words.login.length || words.pwdVisible || words.captcha.length) return null;
  return { code: 'E_SELECTOR_MISSING', message: inputMissingMessage(cfg, 'opening', snap.badSelector ? 'bad-selector' : 'not-found') };
}

/** 定位输入区（返回 locator；找不到 ⇒ null 与原因，供 message 组词） */
export async function locateInput(page, cfg) {
  const tag = `${DOM_TAG}-input`;
  const snap = await page
    .evaluate(INPUT_SCAN, { selector: cfg.driver.inputSelector, candidates: cfg.inputCandidates, tag })
    .catch(() => null);
  if (!snap?.found) return { locator: null, reason: snap?.badSelector ? 'bad-selector' : 'not-found' };
  return { locator: page.locator(`[${tag}="1"]`).first(), reason: 'ok' };
}

/** 发送（§6.4）：填充 → 发送方式 → 6s 发送确认；失败 ⇒ `E_SELECTOR_MISSING`（输入区 / 按钮）/ `E_SEND_FAILED`（未确认） */
export async function sendCustom(page, text, cfg, { log } = {}) {
  const input = await locateInput(page, cfg);
  if (!input.locator) throw new EngineError('E_SELECTOR_MISSING', inputMissingMessage(cfg, 'sending', input.reason));
  const useButton = !!cfg.driver.sendButtonSelector;
  await fillInput(page, input.locator, text, cfg, { log });
  if (useButton) {
    try {
      await page.locator(cfg.driver.sendButtonSelector).first().click({ timeout: 10000 });
    } catch (e) {
      throw new EngineError('E_SELECTOR_MISSING', `sending：发送按钮不可用（sendButtonSelector=${cfg.driver.sendButtonSelector}）：${short(e)}`);
    }
  } else {
    await input.locator.press('Enter');
  }
  const mode = useButton ? 'button' : 'enter';
  log?.(`自定义发送：方式=${mode}（${useButton ? cfg.driver.sendButtonSelector : 'Enter'}）`);
  const confirmed = await waitForSendConfirmed(page, cfg);
  if (!confirmed) {
    log?.(`自定义驱动诊断：发送未确认（方式=${mode}）；${await diagnoseCustomDom(page, cfg)}`);
    throw new EngineError('E_SEND_FAILED', `sending：发送未确认（发送方式=${mode}；输入区=${cfg.driver.inputSelector || '自动'}）`);
  }
  log?.(`发送已确认（${confirmed}）`);
  return { mode, via: confirmed };
}

/** 填充：聚焦 → 清空 → insertText（落地校验失败 ⇒ 逐字 type 兜底；仍失败 ⇒ `E_SEND_FAILED`） */
async function fillInput(page, locator, text, cfg, { log } = {}) {
  await locator.click({ timeout: 10000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(text);
  await sleep(STEP_MS);
  if ((await readInputState(page, cfg)).text.includes(String(text).trim().slice(0, 24))) return true;
  log?.('任务文本未落入输入区，改用逐字输入兜底');
  await locator.click({ timeout: 10000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: text.length > 2000 ? 0 : 20 });
  await sleep(STEP_MS);
  if (!(await readInputState(page, cfg)).text.includes(String(text).trim().slice(0, 24))) {
    throw new EngineError('E_SEND_FAILED', 'sending：任务文本未落入输入区（insertText 与逐字输入均失败）');
  }
  return true;
}

/** 发送确认（§6.4，6s）：输入区已清空 ∨ 出现新回合元素 */
async function waitForSendConfirmed(page, cfg) {
  const deadline = Date.now() + CONFIRM_MS;
  while (Date.now() < deadline) {
    if ((await readInputState(page, cfg)).empty) return 'input-cleared';
    if (await hasFreshTurn(page, cfg)) return 'new-turn';
    await sleep(STEP_MS);
  }
  return null;
}

function readInputState(page, cfg) {
  return page
    .evaluate(INPUT_VALUE_SCAN, { selector: cfg.driver.inputSelector, candidates: cfg.inputCandidates })
    .catch(() => ({ present: false, empty: true, text: '' }));
}
