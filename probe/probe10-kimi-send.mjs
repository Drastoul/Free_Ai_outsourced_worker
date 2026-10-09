/**
 * 探针 10 —— Kimi 自动化发送/取回复（第三版：克制版）
 *
 * 前两版教训：
 *  · v1 假阳性（未登录也能打字，误把输入框原文当答复）
 *  · v2 卡死：整页 document.body.innerText 检查把页面主线程拖住 ⇒ evaluate 长时间不返回
 * 本版纪律：① 只用点选式查询，绝不整页 innerText ② 每个 evaluate 限时（超时即判失败）
 *          ③ "真发出去了吗"以**网络请求**为准（聊天接口 POST） ④ 全流程硬超时兜底
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out10');
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
let sent = false, chatPosts = [];

/** 限时 evaluate —— 绝不因页面卡而无限等待 */
const ev = async (fn, arg, ms = 8000) => {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(fn, arg),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('evaluate timeout ' + ms + 'ms')), ms); }),
    ]);
  } finally { clearTimeout(timer); }
};

// 硬超时兜底：无论如何 4 分钟内收工
const watchdog = setTimeout(() => { log('WATCHDOG 硬超时（240s）——收工'); process.exit(3); }, 240000);
watchdog.unref?.();

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  log('browser launched');
  ctx.on('close', () => log('!! context closed（外部关闭）'));

  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const u = req.url();
    if (/\/api\/|apiv2/i.test(u) && /conversation|message|completion|chat/i.test(u)) {
      chatPosts.push(u.split('?')[0]);
      log('CHAT-POST ' + u.split('?')[0]);
    }
  });

  await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('goto ok');

  // 等编辑器（点选式，不用整页文本）
  let ok = false;
  for (let i = 0; i < 15; i++) {
    const has = await ev(() => !!document.querySelector('.chat-input-editor'), null, 5000).catch(() => false);
    if (has) { ok = true; break; }
    await sleep(2000);
  }
  log('editor present=' + ok);
  if (!ok) throw new Error('编辑器未出现');

  // 打字
  const editor = page.locator('.chat-input-editor').first();
  await editor.click({ timeout: 8000 });
  await page.keyboard.insertText(`请只回复这一句话，不要有其他内容：${EXPECT}`);
  await sleep(1200);
  const typed = await ev(() => (document.querySelector('.chat-input-editor')?.innerText || '').trim().slice(0, 40), null, 5000).catch(() => '(读取超时)');
  log('typed=' + JSON.stringify(typed));

  // 发送：等按钮可用 → 点击 → 仍不发出则回车兜底
  const btnCls = await ev(() => { const el = document.querySelector('div.send-button-container'); return el ? (el.className || '').toString() : null; }, null, 5000).catch(() => null);
  log('send button cls=' + JSON.stringify(btnCls));
  const n0 = chatPosts.length;
  await page.locator('div.send-button-container').first().click({ timeout: 8000 }).catch((e) => log('click err ' + e.message.slice(0, 80)));
  await sleep(2500);
  if (chatPosts.length === n0) {
    log('点按钮未见聊天请求 ⇒ 回车兜底');
    await editor.press('Enter').catch((e) => log('enter err ' + e.message.slice(0, 80)));
    await sleep(2500);
  }
  sent = chatPosts.length > n0;
  log('SENT=' + sent + ' chatPosts=' + chatPosts.length);

  // 等答复：点选式查询 —— 找包含预期串的元素，且不在编辑器内
  let hit = null;
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    hit = await ev((exp) => {
      const editors = [...document.querySelectorAll('[contenteditable="true"],.chat-input-editor')];
      const inEditor = (el) => editors.some((ed) => ed === el || ed.contains(el) || el.contains(ed));
      const nodes = document.querySelectorAll('div,span,p');
      let best = null;
      for (const el of nodes) {
        if (inEditor(el)) continue;
        const t = (el.textContent || '').trim();
        if (!t.includes(exp)) continue;
        if (!best || t.length <= (best.textContent || '').trim().length) best = el;
      }
      if (!best) return null;
      return { tag: best.tagName.toLowerCase(), cls: (best.className || '').toString().slice(0, 100), text: (best.textContent || '').trim().slice(0, 80) };
    }, EXPECT, 8000).catch(() => null);
    if (hit) break;
    await sleep(2500);
  }
  log('ANSWER=' + JSON.stringify(hit));
  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify({ sent, chatPosts, answer: hit, typed }, null, 2));
  log('PROBE10 DONE sent=' + sent + ' answer=' + (hit ? 'YES' : 'NO'));
} catch (e) {
  log('PROBE10 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  log('browser closed, exit');
  process.exit(0);
}
