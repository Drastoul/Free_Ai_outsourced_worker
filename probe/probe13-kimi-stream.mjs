/**
 * 探针 13 —— Kimi 回复数据通道定论（存全量流 + 确认正文在流内）
 * 已知：发送 = ChatService/Chat（POST）；响应 = JSON 流（{"op":"set",...} / heartbeat）。
 * 本轮：存全量流到文件，轮询流内是否出现答复正文；并记录答复在 DOM 里的类名（供 b3 写选择器台账）。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out13');
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
    return await Promise.race([page.evaluate(fn, arg), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); })]);
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

  let body = '';
  page.on('request', (req) => { if (req.method() === 'POST' && /ChatService\/Chat$/.test(req.url())) log('CHAT-POST'); });
  page.on('response', (res) => {
    if (!/ChatService\/Chat$/.test(res.url())) return;
    res.text().then((t) => { body = t; log('CHAT-RESP len=' + t.length); }).catch((e) => log('CHAT-RESP fail ' + e.message.slice(0, 60)));
  });

  await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('goto ok');
  for (let i = 0; i < 15; i++) {
    if (await ev(() => !!document.querySelector('.chat-input-editor'), null, 5000).catch(() => false)) break;
    await sleep(2000);
  }
  const editor = page.locator('.chat-input-editor').first();
  await editor.click({ timeout: 8000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(400);
  await page.keyboard.insertText(`请只回复这一句话，不要有其他内容：${EXPECT}。另外写一个 python 代码块，首行注释 # file: kimi_dl.py，内容为 print("kimi")。`);
  await sleep(1000);
  await page.locator('div.send-button-container').first().click({ timeout: 8000 }).catch(() => {});
  log('sent (click)');

  // 轮流等：流内出现正文 / DOM 出现"助手消息"类元素
  let inStream = false, domClass = null;
  const end = Date.now() + 150000;
  while (Date.now() < end) {
    if (body.includes(EXPECT)) inStream = true;
    const d = await ev((exp) => {
      const editors = [...document.querySelectorAll('[contenteditable="true"],.chat-input-editor')];
      const inEditor = (el) => editors.some((ed) => ed === el || ed.contains(el) || el.contains(ed));
      const hasUser = (el) => !!el.closest('[class*="user"]');
      const cand = [...document.querySelectorAll('div,span,p')].filter((el) => {
        if (inEditor(el) || hasUser(el)) return false;
        const t = (el.textContent || '').trim();
        // 助手消息：文本里出现预期串，且元素自身类名不含列表容器特征
        return t.includes(exp) && !/chat-content-list|chat-content-container/.test((el.className || '').toString());
      });
      if (!cand.length) return null;
      cand.sort((a, b) => (a.textContent || '').trim().length - (b.textContent || '').trim().length);
      const el = cand[0];
      return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 110), len: (el.textContent || '').trim().length, head: (el.textContent || '').trim().slice(0, 80) };
    }, EXPECT, 8000).catch(() => null);
    if (d) domClass = d;
    if (inStream || domClass) break;
    await sleep(2500);
  }
  log('IN-STREAM=' + inStream + ' DOM=' + JSON.stringify(domClass));
  fs.writeFileSync(path.join(OUT_DIR, 'chat-resp.txt'), body);
  const found = body.includes(EXPECT) ? body.slice(Math.max(0, body.indexOf(EXPECT) - 120), body.indexOf(EXPECT) + 200) : '';
  log('stream ctx=' + JSON.stringify(found.replace(/[^\x20-\x7E\u4e00-\u9fa5]+/g, ' ')));
  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify({ inStream, domClass, respLen: body.length }, null, 2));
  log('PROBE13 DONE inStream=' + inStream + ' respLen=' + body.length);
  await sleep(1500);
} catch (e) {
  log('PROBE13 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  log('browser closed, exit');
  process.exit(0);
}
