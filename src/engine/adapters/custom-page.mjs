/**
 * 自定义外包工的页面机械·登录态与装配（`docs/design/modules/adapters.md` §6.1 登录态 · §6.4 发送/确认；b8）：
 *   · `checkLoginState` / `loginFailureInfo`：输入区可见 ⇒ `ready`；风控词 ⇒ `captcha`；登录词 / 可见密码框 ⇒ `login_required`；
 *     输入区一直不出现且无登录线索 ⇒ 失败诊断交 `E_SELECTOR_MISSING`（阶段 + 项名 + 候选链 / 实际值）；
 *   · `sendCustom`（装配）：写入（机械在 `custom-write.mjs`）→ 发送（`sendButtonSelector` ⇒ 点按钮；否则发送前复核焦点 ⇒ `Enter`）
 *     → 6s 发送确认（输入区已清空 ∨ 出现新回合元素）；失败 ⇒ 定位类 `E_SELECTOR_MISSING` / 其余 `E_SEND_FAILED`。
 * 本件越 300 行档位后按其既定拆分点拆出 `custom-write.mjs`（输入区访问 + 写入轴全部机械）；DOM 采集 / 诊断在 `custom-dom.mjs`，
 * 遮挡处置在 `custom-overlay.mjs`。
 */
import { EngineError } from './base.mjs';
import { diagnoseCustomDom, hasFreshTurn } from './custom-dom.mjs';
import { focusInput, inputMissingMessage, inputSnapshot, oneLine, overlayBudget, readInputState, writeIntoInput } from './custom-write.mjs';
import { sleep } from '../util.mjs';

export const CONFIRM_MS = 6000; // 发送确认预算（§6.4：发送后 6s 内确认「输入区已清空 ∨ 出现新回合元素」；b7 既有口径 I④）
const LOGIN_WORDS = ['登录', '登入', 'Log in', 'Sign in', 'Sign up'];
const CAPTCHA_WORDS = ['人机验证', '安全验证', '滑动验证', '异常流量', '访问受限', 'verify you are human', 'are you a robot', 'captcha', '验证码'];
const STEP_MS = 300;

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

/** 登录态（§6.1）：输入区可见 ⇒ ready；风控词 ⇒ captcha；登录词 / 可见密码框 ⇒ login_required */
export async function checkLoginState(page, cfg) {
  const snap = await inputSnapshot(page, cfg);
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
  const snap = await inputSnapshot(page, cfg);
  if (!snap || snap.found) return null;
  const words = await page.evaluate(WORD_SCAN, { loginWords: LOGIN_WORDS, captchaWords: CAPTCHA_WORDS }).catch(() => null);
  if (!words) return null;
  if (words.login.length || words.pwdVisible || words.captcha.length) return null;
  return { code: 'E_SELECTOR_MISSING', message: inputMissingMessage(cfg, 'opening', snap.badSelector ? 'bad-selector' : 'not-found') };
}

/** 发送（§6.4）：写入 → 发送方式（按钮 / Enter）→ 6s 发送确认；失败 ⇒ 定位类 `E_SELECTOR_MISSING` / 其余 `E_SEND_FAILED` */
export async function sendCustom(page, text, cfg, { log } = {}) {
  await writeIntoInput(page, cfg, text, { log, overlayDeadline: overlayBudget() }); // 遮挡处置预算：本调用共享
  const useButton = !!cfg.driver.sendButtonSelector;
  if (useButton) {
    try {
      await page.locator(cfg.driver.sendButtonSelector).first().click({ timeout: 10000 });
    } catch (e) {
      throw new EngineError('E_SELECTOR_MISSING', `sending：发送按钮不可用（sendButtonSelector=${oneLine(cfg.driver.sendButtonSelector, 120)}）：${oneLine(e, 140)}`);
    }
  } else {
    await focusInput(page, cfg).catch(() => {}); // 发送前复核焦点（未聚焦 ⇒ 重新聚焦一次；仍不行由发送确认兜住）
    await page.keyboard.press('Enter');
  }
  const mode = useButton ? 'button' : 'enter';
  log?.(`自定义发送：方式=${mode}（${useButton ? cfg.driver.sendButtonSelector : 'Enter'}）`);
  const confirmed = await waitForSendConfirmed(page, cfg);
  if (!confirmed) {
    const census = await diagnoseCustomDom(page, cfg);
    log?.(`自定义驱动诊断：发送未确认（方式=${mode}）；${census}`);
    throw new EngineError('E_SEND_FAILED', `sending：发送未确认（发送方式=${mode}；输入区=${oneLine(cfg.driver.inputSelector, 120) || '自动'}）+ 采集诊断：${census}`);
  }
  log?.(`发送已确认（${confirmed}）`);
  return { mode, via: confirmed };
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
