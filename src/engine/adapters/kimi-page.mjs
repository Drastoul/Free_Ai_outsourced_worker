/**
 * Kimi 页面机械（`docs/batches/b3-kimi-adapter.md` §2 机制设计 + §5 切分 A 读数 K1/K3/K4/K5）：
 * 选择器台账 / 登录两态判定 / 新会话 / 清空 + 输入 + 落地校验 + 发送（按钮，Enter 兜底）/ 附件上传。
 * 只做「怎么操作页面」；适配器接口实现（capabilities / 纯函数引用）在 `src/engine/adapters/kimi.mjs`；
 * 答复流解析在 `src/engine/adapters/kimi-stream.mjs`；DOM 兜底在 `src/engine/adapters/kimi-dom.mjs`。
 */
import path from 'node:path';
import { EngineError } from './base.mjs';

/** 页面元素台账（类名易变 ⇒ 优先按文案 / 稳定类名定位；证据 = `probe/out15..18`） */
export const SELECTORS = {
  input: 'div.chat-input-editor（contenteditable；无 inputValue ⇒ 落地校验读 innerText）',
  send: 'div.send-button-container（K3：4 次真机点击稳定触发 ChatService/Chat 请求）',
  newChat: '文案「新建会话」的可见元素（div.action-label，n=1；K4）',
  file: 'input[type="file"]（accept=""、multiple；上传成功后 input.files 清空 ⇒ 判据用界面词干或 upload 请求）',
  fileStem: 'p.file-card-info-name（界面只显词干、扩展名以徽标呈现；K5）',
  answer: 'div.chat-content-item.chat-content-item-assistant → … → div.segment-content-box；正文块 = div.paragraph + div.syntax-highlighter.segment-code-content（K9）',
  login: 'button.user-profile-trigger 可见 ⇒ 已登录；文案「登录」/「登录以同步历史会话」可见 ⇒ 未登录（K1）',
  chatUrl: 'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat（POST；K6）',
  uploadUrl: 'https://www.kimi.com/apiv2-files/file/upload（POST；K5）',
};

export const EDITOR_SELECTOR = '.chat-input-editor';
export const SEND_SELECTOR = 'div.send-button-container';
export const NEW_CHAT_TEXT = '新建会话';
export const CHAT_LIST_SELECTOR = '.chat-content-list';
export const FILE_STEM_SELECTOR = 'p.file-card-info-name';
export const PROFILE_TRIGGER_SELECTOR = 'button.user-profile-trigger';
export const LOGIN_TEXTS = ['登录', '登录以同步历史会话'];
export const UPLOAD_URL_RE = /\/apiv2-files\/file\/upload(\?|$)/;

const DOM_TAG = 'data-fo';
const LOGIN_RENDER_WAIT_MS = 12000; // 首屏 5–15s（K1 读数）：账号区未渲染前不作断言
const LOGIN_POLL_MS = 500;
const NEW_CHAT_WAIT_MS = 15000;
const CLICK_WAIT_MS = 8000;
// 风控文案（`adapters.md` §3.6 既有启发式；Kimi 无专项读数 ⇒ 不新增判据）；「验证码」为弱词——
// Kimi 登录弹层同屏含「发送验证码」，故仅在页面连输入区都没有时才作线索调用（见 checkLoginState③）。
const CAPTCHA_WORDS = ['人机验证', '安全验证', '滑动验证', '异常流量', '访问受限', 'verify you are human', 'are you a robot', 'captcha', '验证码'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 文本是否已落入输入框（取一段特征串比对；contenteditable 无 inputValue ⇒ 读 innerText） */
export function textLanded(landed, text) {
  const needle = String(text ?? '').trim().slice(0, 24);
  if (!needle) return false;
  return String(landed ?? '').includes(needle);
}

/** 词干 = 去最后一个扩展名（K5 实测：`probe16-attach.txt` ⇒ 界面文本 `probe16-attach`） */
export function stemOf(name) {
  const s = String(name);
  const i = s.lastIndexOf('.');
  return i > 0 ? s.slice(0, i) : s;
}

async function readEditorText(page) {
  return await page
    .evaluate((sel) => (document.querySelector(sel)?.innerText || '').trim(), EDITOR_SELECTOR)
    .catch(() => '');
}

async function clearEditor(page) {
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(120);
}

/** 按 exact 文案打标后 locator 点击；找不到 / 点击失败 ⇒ false（调用方走兜底） */
async function clickByExactText(page, label, attr) {
  const found = await page
    .evaluate(
      ({ label, attr }) => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
        const el = [...document.querySelectorAll('div,span,button,a')].find((e) => norm(e.innerText || e.textContent) === label && vis(e));
        if (!el) return false;
        el.setAttribute(attr, '1');
        return true;
      },
      { label, attr },
    )
    .catch(() => false);
  if (!found) return false;
  try {
    await page.locator(`[${attr}="1"]`).first().click({ timeout: CLICK_WAIT_MS });
    return true;
  } catch {
    return false;
  } finally {
    await page.evaluate((a) => document.querySelector(`[${a}="1"]`)?.removeAttribute(a), attr).catch(() => {});
  }
}

/** 读登录信号（两态互斥项 + 风控词；页面内一次采集，保证可比） */
async function readLoginSignals(page) {
  return await page
    .evaluate(
      ({ loginTexts, triggerSel, editorSel, captchaWords }) => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
        const els = [...document.querySelectorAll('div,span,button,a,p,li,h1,h2,h3')];
        const loginEntry = loginTexts.some((w) => els.some((el) => norm(el.innerText || el.textContent) === w && vis(el)));
        const trigger = document.querySelector(triggerSel);
        const body = (document.body?.innerText || '').slice(0, 20000);
        return {
          loginEntry,
          profileTrigger: !!trigger && vis(trigger),
          editorVisible: !!document.querySelector(editorSel),
          captcha: captchaWords.filter((w) => body.includes(w)),
        };
      },
      { loginTexts: LOGIN_TEXTS, triggerSel: PROFILE_TRIGGER_SELECTOR, editorSel: EDITOR_SELECTOR, captchaWords: CAPTCHA_WORDS },
    )
    .catch(() => ({ loginEntry: false, profileTrigger: false, editorVisible: false, captcha: [] }));
}

/**
 * 登录 / 风控检测（K1 两态互斥判据；父侧裁定口径）：
 *   ① 可见的 exact「登录」/「登录以同步历史会话」入口 ⇒ `login_required`（未登录态读数）；
 *   ② 两者皆无且 `button.user-profile-trigger` 可见 ⇒ `ready`（已登录态读数）；
 *   ③ 首屏账号区未渲染（两态信号皆无）⇒ 轮询等待渲染（最多 `LOGIN_RENDER_WAIT_MS`），
 *      避免把「加载中」按 6s 稳定窗口误判成未登录（`src/engine/opening.mjs` 的非 ready 早退口径）；
 *   ④ 风控文案 ⇒ `captcha`（强词直接判；弱词「验证码」仅在无输入区时判——登录弹层因此不误判）。
 * 注：「我的 Kimi」两态共有（`probe/out7/run.log:14`）⇒ 不得作 ready 依据。
 */
export async function checkLoginState(page) {
  const deadline = Date.now() + LOGIN_RENDER_WAIT_MS;
  for (;;) {
    const snap = await readLoginSignals(page);
    const strongCaptcha = snap.captcha.filter((w) => w !== '验证码');
    if (strongCaptcha.length) return 'captcha';
    if (snap.loginEntry) return 'login_required';
    if (snap.profileTrigger) return 'ready';
    if (snap.captcha.length && !snap.editorVisible) return 'captcha';
    if (Date.now() >= deadline) return 'login_required'; // 账号区未渲染 ⇒ 保守判未登录（§3.6「输入框长时间不出现」口径）
    await sleep(LOGIN_POLL_MS);
  }
}

/** 会话区（`.chat-content-list`）为空 = 空会话（K4 判据：须按会话区判定，body 级会被侧栏历史项名反证） */
async function waitSessionCleared(page, budgetMs, log) {
  const deadline = Date.now() + budgetMs;
  let notedAbsent = false;
  while (Date.now() < deadline) {
    const snap = await page
      .evaluate(
        ({ listSel, editorSel }) => {
          const lists = [...document.querySelectorAll(listSel)];
          return {
            lists: lists.length,
            empty: lists.every((el) => !(el.innerText || '').trim()),
            editor: !!document.querySelector(editorSel),
          };
        },
        { listSel: CHAT_LIST_SELECTOR, editorSel: EDITOR_SELECTOR },
      )
      .catch(() => null);
    if (snap?.empty && snap.editor) {
      if (snap.lists === 0 && !notedAbsent) {
        // 容器缺失也算空会话（首页空态）；日志留痕，避免将来容器改名时静默放行
        notedAbsent = true;
        log?.('会话区容器不存在（.chat-content-list=0），按空会话判定');
      }
      return true;
    }
    await sleep(400);
  }
  return false;
}

/**
 * 新会话（capabilities.newChat 时逐单执行；K4 读数）：
 * 点侧栏「新建会话」⇒ 等会话区清空；点击失败 / 未清空 ⇒ 兜底导航首页（首页 = 空态）。
 * 两路都未清空 ⇒ `E_TIMEOUT`（不带着上一单上下文发送）。
 */
export async function openNewSession(page, url, { log } = {}) {
  if (await clickByExactText(page, NEW_CHAT_TEXT, `${DOM_TAG}-newchat`)) {
    log?.('已点「新建会话」');
    if (await waitSessionCleared(page, NEW_CHAT_WAIT_MS, log)) return { via: 'button' };
    log?.('点击后会话区未清空，改用导航首页兜底');
  } else {
    log?.('未找到「新建会话」元素，改用导航首页');
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await waitSessionCleared(page, NEW_CHAT_WAIT_MS, log)) return { via: 'navigate' };
  throw new EngineError('E_TIMEOUT', '新会话未就绪：会话区仍含上一单内容');
}

/**
 * 发送（K3 / D2）：聚焦 → 清空 → `insertText` → 落地校验（读 `innerText`）→ 点 `div.send-button-container`；
 * 点击失败 ⇒ Enter 兜底（K3 实测可发，6 次运行一致——不留死路径）。
 * 发送确认由引擎侧观测 `ChatService/Chat` 请求（`src/engine/answer.mjs`），本函数只负责触发。
 */
export async function sendText(page, text, { log } = {}) {
  if ((await page.locator(EDITOR_SELECTOR).count()) === 0) {
    throw new EngineError('E_SELECTOR_MISSING', '输入框（div.chat-input-editor）不存在——页面结构可能已变化');
  }
  const editor = page.locator(EDITOR_SELECTOR).first();
  await editor.click({ timeout: 10000 });
  await clearEditor(page);
  await page.keyboard.insertText(text);
  await sleep(300);
  let landed = await readEditorText(page);
  if (!textLanded(landed, text)) {
    log?.('任务文本未落入输入框，改用逐字输入兜底');
    await editor.click({ timeout: 10000 });
    await clearEditor(page);
    await page.keyboard.type(text, { delay: text.length > 2000 ? 0 : 20 });
    await sleep(300);
    landed = await readEditorText(page);
    if (!textLanded(landed, text)) {
      throw new EngineError('E_SEND_FAILED', '任务文本未落入输入框（insertText 与逐字输入均失败）');
    }
  }
  try {
    await page.locator(SEND_SELECTOR).first().click({ timeout: CLICK_WAIT_MS });
    return { mode: 'button' };
  } catch (e) {
    log?.(`发送按钮点击失败（${String(e?.message ?? e).slice(0, 120)}），改用 Enter 兜底`);
    await editor.press('Enter');
    return { mode: 'enter' };
  }
}

/** 界面已出现的附件词干数（K5：界面只显词干；按词干判定，不得按全名——全名不出现会假阴性） */
async function countShownStems(page, stems) {
  const texts = await page
    .evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => (el.innerText || el.textContent || '').trim()), FILE_STEM_SELECTOR)
    .catch(() => []);
  return stems.filter((s) => texts.some((t) => t.includes(s))).length;
}

/**
 * 送件（K5）：`input[type="file"]`（multiple）⇒ `setInputFiles`，等**界面词干**（`p.file-card-info-name`）
 * 或 **upload 请求**（`/apiv2-files/file/upload`）确认。`input.files` 上传后被消费清空 ⇒ 不作判据。
 */
export async function uploadFilesViaInput(page, files, { timeoutMs = 60000, log } = {}) {
  const inputs = page.locator('input[type="file"]');
  await inputs.first().waitFor({ state: 'attached', timeout: Math.min(timeoutMs, 30000) }).catch(() => {});
  if ((await inputs.count()) === 0) {
    throw new EngineError('E_SELECTOR_MISSING', '未找到附件输入框 input[type="file"]');
  }
  const stems = files.map((f) => stemOf(path.basename(String(f))));
  let uploadResponses = 0;
  const onResponse = (res) => {
    try {
      if (UPLOAD_URL_RE.test(res.url()) && res.status() < 400) uploadResponses++;
    } catch {
      /* 忽略 */
    }
  };
  page.on('response', onResponse);
  try {
    await inputs.first().setInputFiles(files);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((await countShownStems(page, stems)) === stems.length) return { uploaded: stems, via: 'ui-stem' };
      if (uploadResponses >= files.length) return { uploaded: stems, via: 'upload-request' };
      await sleep(500);
    }
    log?.(`上传后未观测到全部词干 / upload 请求：${stems.join('、')}`);
    throw new EngineError('E_TIMEOUT', `上传未确认（界面词干 / upload 请求）：${stems.join('、')}`);
  } finally {
    try {
      page.off('response', onResponse);
    } catch {
      /* 忽略 */
    }
  }
}
