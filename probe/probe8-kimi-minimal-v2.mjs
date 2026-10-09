/**
 * 探针 8 —— Kimi 最小验证 v2（修正版）
 *
 * v1（探针 7）教训：① Kimi 未登录也能看到输入框与文本落地（假阳性来源）② 未登录发送会弹登录二维码
 * ③ 判"答复到达"必须排除输入框自身。
 *
 * v2 流程：开页 → 页面内挂提示条 → 等人工登录完成（轮询"登录"线索消失）→ 发送（点发送钮 + 校验输入框已清空）
 *         → 等答复（排除输入框与编辑器祖先的文本命中）→ 采集聊天接口与上传能力。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out8');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
fs.mkdirSync(OUT_DIR, { recursive: true });

const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const disc = { site: 'kimi-v2', login: null, send: null, answer: null, posts: [], error: null };
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'discovery8.json'), JSON.stringify(disc, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXPECT = 'Kimi 探针测试成功';
const BANNER = 'data-probe-banner';
let ctx, page;

const injectBanner = (text) => page.evaluate(({ text, id }) => {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;right:0;padding:10px 16px;background:#1f6feb;color:#fff;font:14px/1.5 sans-serif;text-align:center;';
    document.body.appendChild(el);
  }
  el.textContent = text;
}, { text, id: BANNER });

const removeBanner = () => page.evaluate((id) => { const el = document.getElementById(id); if (el) el.remove(); }, BANNER);

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null, acceptDownloads: true,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  log('browser launched');
  page = ctx.pages()[0] ?? (await ctx.newPage());
  ctx.on('close', () => log('!! context closed（窗口被关闭或浏览器退出——外部原因）'));
  page.on('close', () => log('!! page closed'));
  page.on('crash', () => log('!! page crashed'));
  ctx.on('page', (p) => log('!! new page: ' + p.url().slice(0, 100)));

  const seen = new Set();
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const u = req.url();
    if (!/kimi|moonshot|apitd/i.test(u)) return;
    const key = u.split('?')[0];
    if (seen.has(key)) return;
    seen.add(key);
    disc.posts.push(key);
    log('NET-POST ' + key);
    save();
  });
  let lastWire = 0;
  page.on('response', (res) => {
    const u = res.url();
    if (!/Chat|chat/i.test(u) || res.request().method() !== 'POST') return;
    res.text().then((t) => { lastWire = t.length; log('WIRE chat body len=' + t.length + ' head=' + JSON.stringify(t.slice(0, 160))); }).catch(() => {});
  });

  await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  log('goto ok: ' + page.url());
  await sleep(3500);
  await injectBanner('【免费外包·探针】请在此窗口登录 Kimi（短信或扫码均可）——**登录期间请勿关闭本窗口**；登录完成后探针会自动继续。');

  // 等输入框
  for (let i = 0; i < 60; i++) {
    const has = await page.evaluate(() => [...document.querySelectorAll('[contenteditable="true"],textarea')].some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }));
    if (has) break;
    await sleep(2000);
  }
  log('input present');

  // 等人工登录（判据：页面出现"登录"线索 → 消失 = 已登录）
  let loggedIn = false;
  const ldeadline = Date.now() + 12 * 60 * 1000;
  let lastTick = 0;
  while (Date.now() < ldeadline) {
    const st = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return { loginWord: t.includes('登录'), marks: ['登录以同步', '登录', '退出登录'].filter((w) => t.includes(w)) };
    });
    // 已登录判据：登录词消失（Kimi 登录后侧栏不再出现「登录」）
    if (!st.loginWord) { loggedIn = true; break; }
    if (Date.now() - lastTick > 15000) { lastTick = Date.now(); log('waiting login… marks=' + JSON.stringify(st.marks)); await injectBanner('【免费外包·探针】等待 Kimi 登录中…（登录完成后自动继续）'); }
    await sleep(2500);
  }
  disc.login = { loggedIn };
  log('login state: loggedIn=' + loggedIn);
  save();
  if (!loggedIn) throw new Error('12 分钟内未完成登录');
  await injectBanner('【免费外包·探针】登录成功，正在发送测试消息…');
  await sleep(1200);

  // 发送：填入 → 等发送钮可用 → 点击 → 校验输入框清空
  const target = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = [...document.querySelectorAll('[contenteditable="true"],textarea')].filter(vis).pop();
    if (!el) return null;
    el.setAttribute('data-probe-input', '1');
    return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 90) };
  });
  log('input target=' + JSON.stringify(target));
  const input = page.locator('[data-probe-input="1"]').first();
  await input.click();
  await page.keyboard.insertText(TASK());
  await sleep(1200);
  const beforeText = await page.evaluate(() => { const el = document.querySelector('[data-probe-input="1"]'); return (el?.innerText || el?.value || '').trim(); });
  const btn = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = [...document.querySelectorAll('div.send-button-container,button')].filter(vis).find((e) => /send-button-container/.test(e.className || ''));
    if (!el) return null;
    el.setAttribute('data-probe-send', '1');
    return { cls: (el.className || '').toString().slice(0, 90) };
  });
  log('send button=' + JSON.stringify(btn) + ' disabled=' + /disabled/.test(btn?.cls || ''));
  await page.locator('[data-probe-send="1"]').first().click({ timeout: 5000 }).catch((e) => log('send click err ' + e.message.slice(0, 100)));
  await sleep(2500);
  const afterText = await page.evaluate(() => { const el = document.querySelector('[data-probe-input="1"]'); return (el?.innerText || el?.value || '').trim(); });
  disc.send = { before: beforeText.slice(0, 60), after: afterText.slice(0, 60), cleared: afterText.length === 0 };
  log('send check: cleared=' + disc.send.cleared + ' beforeLen=' + beforeText.length + ' afterLen=' + afterText.length);
  save();

  // 等答复：命中"预期串"且不在编辑器/其祖先内；同时记录答复元素的形状
  let ok = false, where = null;
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const hit = await page.evaluate((exp) => {
      const editors = [...document.querySelectorAll('[contenteditable="true"]')];
      const inEditor = (el) => editors.some((ed) => ed === el || ed.contains(el) || el.contains(ed));
      const all = [...document.querySelectorAll('div,span,p,section,article')];
      let best = null;
      for (const el of all) {
        if (inEditor(el)) continue;
        const t = (el.textContent || '').trim();
        if (!t.includes(exp)) continue;
        if (!best || t.length <= (best.textContent || '').trim().length) best = el;
      }
      if (!best) return null;
      return { tag: best.tagName.toLowerCase(), cls: (best.className || '').toString().slice(0, 120), text: (best.textContent || '').trim().slice(0, 100) };
    }, EXPECT);
    if (hit) { ok = true; where = hit; break; }
    await sleep(2500);
  }
  disc.answer = { ok, where };
  log('ANSWER ok=' + ok + ' ' + JSON.stringify(where));
  save();
  if (ok) await injectBanner('【免费外包·探针】成功取到 Kimi 答复 —— 探针完成，窗口即将关闭。');
  await sleep(1500);
  log('PROBE8 DONE ok=' + ok);
} catch (e) {
  disc.error = String(e?.stack || e);
  save();
  log('PROBE8 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  save();
  log('browser closed, exit');
  process.exit(disc.error ? 1 : 0);
}

function TASK() {
  return `请只回复这一句话，不要有其他内容：${EXPECT}`;
}
