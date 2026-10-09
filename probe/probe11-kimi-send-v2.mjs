/**
 * 探针 11 —— Kimi 自动化发送/取回复（第四版：清空输入框 + 排除用户消息 + 抓回复数据通道）
 *
 * 探针 10 的教训：① 输入框有遗留文字 ⇒ 必须发前清空 ② `user-content__text` = 用户自己的消息
 *                ⇒ 答复判定必须排除用户消息容器 ③ 发送成功以 ChatService/Chat 请求为准（已验证有效）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out11');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
fs.mkdirSync(OUT_DIR, { recursive: true });
const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXPECT = 'Kimi 探针测试成功';
let ctx, page;

const ev = async (fn, arg, ms = 8000) => {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(fn, arg),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('evaluate timeout ' + ms + 'ms')), ms); }),
    ]);
  } finally { clearTimeout(timer); }
};
const watchdog = setTimeout(() => { log('WATCHDOG 硬超时'); process.exit(3); }, 240000);
watchdog.unref?.();

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  ctx.on('close', () => log('!! context closed（外部关闭）'));
  log('browser launched');

  const chatPosts = [];
  let chatResp = null;
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const u = req.url();
    if (/ChatService\/Chat$/.test(u) || /MessageService|ConversationService/.test(u)) {
      chatPosts.push(u.split('?')[0]);
      log('CHAT-POST ' + u.split('?')[0]);
    }
  });
  page.on('response', (res) => {
    const u = res.url();
    if (!/ChatService\/Chat$/.test(u)) return;
    res.text().then((t) => {
      chatResp = t;
      log('CHAT-RESP len=' + t.length + ' head=' + JSON.stringify(t.slice(0, 200)));
    }).catch((e) => log('CHAT-RESP fail ' + e.message.slice(0, 80)));
  });

  await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('goto ok');

  let ok = false;
  for (let i = 0; i < 15; i++) {
    if (await ev(() => !!document.querySelector('.chat-input-editor'), null, 5000).catch(() => false)) { ok = true; break; }
    await sleep(2000);
  }
  log('editor present=' + ok);
  if (!ok) throw new Error('编辑器未出现');

  // 清空输入框（关键修正：先全选删除，再输入）
  const editor = page.locator('.chat-input-editor').first();
  await editor.click({ timeout: 8000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(400);
  await page.keyboard.insertText(`请只回复这一句话，不要有其他内容：${EXPECT}`);
  await sleep(1000);
  const typed = await ev(() => (document.querySelector('.chat-input-editor')?.innerText || '').trim(), null, 5000).catch(() => '(超时)');
  log('typed len=' + typed.length + ' text=' + JSON.stringify(typed.slice(0, 80)));

  const n0 = chatPosts.length;
  await page.locator('div.send-button-container').first().click({ timeout: 8000 }).catch((e) => log('click err ' + e.message.slice(0, 80)));
  await sleep(2500);
  if (chatPosts.length === n0) { log('未见聊天请求 ⇒ 回车兜底'); await editor.press('Enter').catch(() => {}); await sleep(2500); }
  const sent = chatPosts.length > n0;
  log('SENT=' + sent);

  // 答复判定：排除编辑器与用户消息容器（Kimi 用户消息 = user-content__text）
  let hit = null, seenClasses = new Set();
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const r = await ev((exp) => {
      const editors = [...document.querySelectorAll('[contenteditable="true"],.chat-input-editor')];
      const inEditor = (el) => editors.some((ed) => ed === el || ed.contains(el) || el.contains(ed));
      const isUser = (el) => !!el.closest('[class*="user-content"],[class*="user_message"],[class*="user-message"]');
      let best = null; const classes = [];
      for (const el of document.querySelectorAll('div,span,p')) {
        if (inEditor(el) || isUser(el)) continue;
        const t = (el.textContent || '').trim();
        if (!t.includes(exp)) continue;
        classes.push((el.className || '').toString().slice(0, 60));
        if (!best || t.length <= (best.textContent || '').trim().length) best = el;
      }
      return { hit: best ? { tag: best.tagName.toLowerCase(), cls: (best.className || '').toString().slice(0, 100), text: (best.textContent || '').trim().slice(0, 80) } : null, classes: classes.slice(0, 6) };
    }, EXPECT, 8000).catch(() => null);
    if (r?.classes) r.classes.forEach((c) => seenClasses.add(c));
    if (r?.hit) { hit = r.hit; break; }
    await sleep(2500);
  }
  log('ANSWER=' + JSON.stringify(hit));
  log('candidate classes seen=' + JSON.stringify([...seenClasses].slice(0, 10)));
  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify({ sent, chatPosts, typed, answer: hit, candidateClasses: [...seenClasses], chatRespLen: chatResp?.length ?? null, chatRespHead: chatResp?.slice(0, 400) ?? null }, null, 2));
  log('PROBE11 DONE sent=' + sent + ' answer=' + (hit ? 'YES' : 'NO') + ' respLen=' + (chatResp?.length ?? '-'));
} catch (e) {
  log('PROBE11 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  log('browser closed, exit');
  process.exit(0);
}
