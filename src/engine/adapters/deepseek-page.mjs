/**
 * DeepSeek 页面机械（`docs/design/modules/adapters.md` §3.1 元素台账、§3.6 登录 / 异常、§3.8 开关点击策略）。
 * 只做「怎么操作页面」；适配器接口实现（含纯函数）在 `src/engine/adapters/deepseek.mjs`；
 * DOM 兜底与下载按钮在 `src/engine/adapters/deepseek-dom.mjs`。
 * 证据来源：`probe/probe-deepseek.mjs`、`probe2`–`probe6`（真机实测）。
 */
import path from 'node:path';
import { EngineError } from './base.mjs';

/** 页面元素台账（`§3.1`；类名易变 ⇒ 尽量按文案 / 结构定位） */
export const SELECTORS = {
  input: 'textarea（第一个可见；placeholder「给 DeepSeek 发送消息」）',
  send: '聚焦输入框 + insertText + Enter（落地失败兜底逐字 type）',
  newChat: '文案「开启新对话」的可见元素',
  file: 'input[type="file"]',
  answer: '[class*="ds-markdown"]（DOM 兜底；容器取 closest [class*="message"]）',
  toggle: 'div.ds-toggle-button（按文案匹配；aria-checked 为准，--selected 类为辅）',
  download: '文案「下载」的可见元素（取 closest [role="button"],button）',
  completionUrl: 'https://chat.deepseek.com/api/v0/chat/completion',
};

export const NEW_CHAT_TEXT = '开启新对话';
export const TOGGLE_LABELS = { thinking: '深度思考', search: '智能搜索' };
const CLICK_STRATEGIES = ['locator', 'force', 'js-click', 'mouse-center', 'dispatch'];
const LOGIN_WORDS = ['登录', '登入', 'Log in', 'Sign in', 'Sign up'];
const CAPTCHA_WORDS = ['人机验证', '安全验证', '滑动验证', '异常流量', '访问受限', 'verify you are human', 'are you a robot', 'captcha', '验证码'];
export const TOGGLE_WAIT_MS = 15000; // 开关条可能晚于输入框渲染
const STEP_SLEEP_MS = 700; // 每次点击策略后的状态复核间隔（探针 5 口径）
const DOM_TAG = 'data-fo';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 文本是否已落入输入框（探针 1 口径：取一段特征串比对） */
export function textLanded(landed, text) {
  const needle = String(text ?? '').trim().slice(0, 24);
  if (!needle) return false;
  return String(landed ?? '').includes(needle);
}

/** 找可见的 textarea 并打标（返回 locator；找不到 ⇒ null） */
export async function locateInput(page) {
  const found = await page
    .evaluate((tag) => {
      const visible = [...document.querySelectorAll('textarea')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const el = visible[0];
      if (!el) return null;
      el.setAttribute(`${tag}-input`, '1');
      return { placeholder: el.getAttribute('placeholder') };
    }, DOM_TAG)
    .catch(() => null);
  if (!found) return null;
  return page.locator(`[${DOM_TAG}-input="1"]`).first();
}

/** 读单个开关状态（aria 为准，`--selected` 类为辅；顺带给元素打标供 locator 使用） */
export async function readToggle(page, label) {
  return await page.evaluate(
    ({ tag, label }) => {
      const el = [...document.querySelectorAll('div.ds-toggle-button')].find((e) => (e.innerText || '').trim() === label);
      if (!el) return { found: false, aria: null, cls: '', via: null };
      el.setAttribute(`${tag}-toggle`, label);
      const attr = el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed');
      const cls = String(el.className || '');
      return {
        found: true,
        aria: attr ?? (cls.includes('selected') ? 'true' : 'false'),
        cls,
        via: attr != null ? 'aria' : 'class',
      };
    },
    { tag: DOM_TAG, label },
  );
}

/** 读两个开关的整体状态（发送前复核用） */
export async function readToggles(page) {
  const out = {};
  for (const [key, label] of Object.entries(TOGGLE_LABELS)) {
    const r = await readToggle(page, label);
    out[key] = r.found ? r.aria === 'true' : null;
  }
  return out;
}

export async function waitForToggleElement(page, label, budgetMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if ((await readToggle(page, label)).found) return true;
    await sleep(500);
  }
  return false;
}

/** 单级点击策略（`§3.8` 五级兜底之一） */
async function clickToggle(page, label, strategy) {
  const selector = `[${DOM_TAG}-toggle="${label}"]`;
  if (strategy === 'locator') {
    await page.locator(selector).first().click({ timeout: 4000 });
  } else if (strategy === 'force') {
    await page.locator(selector).first().click({ timeout: 4000, force: true });
  } else if (strategy === 'js-click') {
    await page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
  } else if (strategy === 'mouse-center') {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error('元素无 boundingBox');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else if (strategy === 'dispatch') {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    }, selector);
  } else {
    throw new Error(`未知点击策略 ${strategy}`);
  }
}

/**
 * 把单个开关对齐到目标值：首选 locator.click()，失败逐级兜底；每级后以 aria 复核，生效即止。
 * @returns {Promise<{ok:boolean, aria:string|null, via:string|null, attempts:Array<object>}>}
 */
export async function setToggle(page, label, want, log) {
  const attempts = [];
  for (const strategy of CLICK_STRATEGIES) {
    const before = await readToggle(page, label);
    if (!before.found) return { ok: false, aria: null, via: null, attempts };
    if ((before.aria === 'true') === want) return { ok: true, aria: before.aria, via: 'noop', attempts };
    let err = null;
    try {
      await clickToggle(page, label, strategy);
    } catch (e) {
      err = String(e?.message ?? e).slice(0, 160);
    }
    await sleep(STEP_SLEEP_MS);
    const after = await readToggle(page, label);
    attempts.push({ strategy, err, ariaAfter: after.aria });
    log?.(`开关点击 ${label}→${want} 策略=${strategy} 错误=${err ?? '无'} 复核后=${after.aria}`);
    if ((after.aria === 'true') === want) return { ok: true, aria: after.aria, via: strategy, attempts };
  }
  const final = await readToggle(page, label);
  return { ok: false, aria: final.aria, via: null, attempts };
}

/** 等最后一个助手回合的 DOM 文本稳定（连续 3 次读数一致，每次间隔 1s；最多等 budgetMs） */
export async function settleAnswerDom(page, { budgetMs = 10000, log } = {}) {
  const deadline = Date.now() + budgetMs;
  let last = null;
  let stable = 0;
  while (Date.now() < deadline) {
    const text = await page
      .evaluate(() => {
        const blocks = [...document.querySelectorAll('[class*="ds-markdown"]')];
        const el = blocks[blocks.length - 1];
        return el ? (el.innerText || '').trim() : '';
      })
      .catch(() => '');
    if (text && text === last) stable++;
    else stable = 0;
    last = text;
    if (text && stable >= 2) return true;
    await sleep(1000);
  }
  log?.('DOM 未在预算内稳定，仍尝试点击下载');
  return false;
}

/** 登录 / 风控检测（`§3.6`；启发式） */
export async function checkLoginState(page) {
  const snap = await page
    .evaluate(
      ({ loginWords, captchaWords }) => {
        const text = (document.body?.innerText || '').slice(0, 20000);
        const inputVisible = [...document.querySelectorAll('textarea')].some((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        return {
          inputVisible,
          login: loginWords.filter((w) => text.includes(w)),
          captcha: captchaWords.filter((w) => text.includes(w)),
        };
      },
      { loginWords: LOGIN_WORDS, captchaWords: CAPTCHA_WORDS },
    )
    .catch(() => ({ inputVisible: false, login: [], captcha: [] }));

  // 风控文案（除登录流程也常见的「验证码」外）命中即判 captcha
  const strongCaptcha = snap.captcha.filter((w) => w !== '验证码');
  if (strongCaptcha.length) return 'captcha';
  if (!snap.inputVisible && snap.captcha.length && !snap.login.length) return 'captcha';
  if (!snap.inputVisible && snap.login.length) return 'login_required';
  if (snap.inputVisible) return 'ready';
  return 'login_required'; // 输入框不出现 ⇒ 未登录（§3.6）
}

/** 新会话：点「开启新对话」；按钮缺失 / 点击失败 ⇒ 回退重新打开平台页（仍是干净会话） */
export async function openNewSession(page, url) {
  const found = await page
    .evaluate(
      ({ tag, label }) => {
        const el = [...document.querySelectorAll('div,button,a,span')].find(
          (e) => (e.innerText || '').trim() === label && e.getBoundingClientRect().width > 0,
        );
        if (!el) return false;
        el.setAttribute(`${tag}-newchat`, '1');
        return true;
      },
      { tag: DOM_TAG, label: NEW_CHAT_TEXT },
    )
    .catch(() => false);
  if (found) {
    try {
      await page.locator(`[${DOM_TAG}-newchat="1"]`).first().click({ timeout: 6000 });
      await sleep(2500);
      await page.evaluate((tag) => document.querySelector(`[${tag}-newchat="1"]`)?.removeAttribute(`${tag}-newchat`), DOM_TAG).catch(() => {});
      return { via: 'button' };
    } catch {
      /* 落到 navigate 兜底 */
    }
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  return { via: 'navigate' };
}

/** 发送：聚焦输入框 → 清空 → insertText →（落地失败兜底逐字 type）→ Enter */
export async function sendText(page, text, { log } = {}) {
  const input = await locateInput(page);
  if (!input) throw new EngineError('E_SELECTOR_MISSING', '输入框（textarea）不存在——页面结构可能已变化');
  await input.click({ timeout: 10000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(text);
  await sleep(300);
  let landed = await input.inputValue().catch(() => '');
  if (!textLanded(landed, text)) {
    log?.('任务文本未落入输入框，改用逐字输入兜底');
    await input.click({ timeout: 10000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(text, { delay: text.length > 2000 ? 0 : 20 });
    await sleep(300);
    landed = await input.inputValue().catch(() => '');
    if (!textLanded(landed, text)) {
      throw new EngineError('E_SEND_FAILED', '任务文本未落入输入框（insertText 与逐字输入均失败）');
    }
  }
  await input.press('Enter');
  return { mode: 'enter' };
}

/** 送件（决策 H）：`setInputFiles` 后等界面出现文件名 */
export async function uploadFilesViaInput(page, files, { timeoutMs = 60000, log } = {}) {
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({ state: 'attached', timeout: Math.min(timeoutMs, 30000) }).catch(() => {});
  if ((await page.locator('input[type="file"]').count()) === 0) {
    throw new EngineError('E_SELECTOR_MISSING', '未找到附件输入框 input[type="file"]');
  }
  await input.setInputFiles(files);
  const names = files.map((f) => path.basename(f));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const shown = await page
      .evaluate((want) => {
        // 只扫页面尾部（输入区 / 附件条在 DOM 末尾；长会话时避免全页 innerText 开销）
        const text = (document.body?.innerText || '').slice(-20000);
        return want.filter((n) => text.includes(n));
      }, names)
      .catch(() => []);
    if (shown.length === names.length) return { uploaded: names };
    await sleep(1000);
  }
  log?.(`上传后界面未出现全部文件名：${names.join('、')}`);
  throw new EngineError('E_TIMEOUT', `上传后界面未出现全部文件名：${names.join('、')}`);
}
