/**
 * 探针 5 —— 开关点击策略定稿 + 下载落盘复验（DeepSeek，复用登录态）
 *
 * 背景：探针 4 发现 ①开关状态可读（div.ds-toggle-button 的 --selected 类 + aria）②请求载荷带
 * thinking_enabled / search_enabled（权威读法）③真实下载事件可捕获；但「点击切换未生效」且
 * 「下载落盘时上下文已关闭」（探针 4 把点击错误吞掉了，需逐策略重试并记录错误）。
 *
 * 本轮验证：
 *   ① 找到能真正切换开关的点击策略（逐策略试，记录每步 aria 变化与点击错误）
 *   ② 切换后读请求载荷（thinking_enabled / search_enabled）为权威证据
 *   ③ 深度思考开启后答复流出现 THINK 分片（对照探针 3 的 RESPONSE-only 基线）
 *   ④ 「下载」按钮 → 下载事件 → 落盘成功 + 文件内容核对
 *
 * 产物：probe/out5/run.log、discovery5.json、downloads/*
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out5');
const DL_DIR = path.join(OUT_DIR, 'downloads');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
for (const d of [OUT_DIR, DL_DIR]) fs.mkdirSync(d, { recursive: true });

const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const disc = { startedAt: new Date().toISOString(), toggle: {}, payloads: [], sse: null, download: null, error: null };
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'discovery5.json'), JSON.stringify(disc, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page, ctx;

/** 读开关状态（aria 为准，类名为辅） */
async function readToggle(label) {
  return await page.evaluate((label) => {
    const el = [...document.querySelectorAll('div.ds-toggle-button')].find((e) => (e.innerText || '').trim() === label);
    if (!el) return null;
    el.setAttribute('data-tg', label);
    return { aria: el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed'), cls: (el.className || '').toString() };
  }, label);
}

/** 多策略点击，逐策略读状态，返回可用策略 */
async function setToggle(label, want) {
  const attempts = [];
  const stateOf = async () => (await readToggle(label))?.aria === 'true';
  for (const strat of ['locator', 'force', 'js-click', 'mouse-center', 'dispatch']) {
    if ((await stateOf()) === want) break;
    const err = await (async () => {
      try {
        if (strat === 'locator') await page.locator(`[data-tg="${label}"]`).first().click({ timeout: 4000 });
        else if (strat === 'force') await page.locator(`[data-tg="${label}"]`).first().click({ timeout: 4000, force: true });
        else if (strat === 'js-click') await page.evaluate((l) => document.querySelector(`[data-tg="${l}"]`).click(), label);
        else if (strat === 'mouse-center') {
          const box = await page.locator(`[data-tg="${label}"]`).first().boundingBox();
          if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        } else if (strat === 'dispatch') {
          await page.evaluate((l) => {
            const el = document.querySelector(`[data-tg="${l}"]`);
            for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
              el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
            }
          }, label);
        }
        return null;
      } catch (e) { return String(e.message).slice(0, 160); }
    })();
    await sleep(700);
    const now = await stateOf();
    attempts.push({ strat, err, ariaAfter: now });
    log(`  [setToggle ${label}→${want}] ${strat}: err=${err ?? 'none'} ariaAfter=${now}`);
    if (now === want) return { ok: true, strategy: strat, attempts };
  }
  return { ok: false, strategy: null, attempts };
}

/** 判 SSE 里的 THINK 分片长度 */
function parseSSE(body) {
  const out = { text: '', thinking: '', events: 0 };
  let lastPath = null;
  const add = (p, chunk) => {
    if (!p) return;
    if (/fragments\/-?\d+\/content$/.test(p)) out.text += chunk;
    else if (/thinking_content$/.test(p)) out.thinking += chunk;
  };
  for (const raw of String(body).split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let o; try { o = JSON.parse(payload); } catch { continue; }
    out.events++;
    if (o && typeof o === 'object' && o.p && typeof o.p === 'string') {
      lastPath = o.p;
      if (typeof o.v === 'string') { if (o.o !== 'SET' || /content$/.test(o.p)) add(o.p, o.v); }
      const fr = o?.v?.response?.fragments;
      if (Array.isArray(fr)) for (const f of fr) {
        if (f.type === 'RESPONSE') { out.text += f.content || ''; lastPath = 'response/fragments/-1/content'; }
        else if (f.type === 'THINK') { out.thinking += f.content || ''; lastPath = 'response/fragments/-1/thinking_content'; }
      }
    } else if (o && typeof o.v === 'string') add(lastPath, o.v);
  }
  return out;
}

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null, acceptDownloads: true, downloadsPath: DL_DIR,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  log('browser launched');
  page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('close', () => log('!! page closed'));
  ctx.on('close', () => log('!! context closed'));
  page.on('crash', () => log('!! page crashed'));

  let lastBody = '';
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !req.url().includes('/api/v0/chat/completion')) return;
    try {
      const j = JSON.parse(req.postData() ?? '{}');
      disc.payloads.push({ thinking: j.thinking_enabled, search: j.search_enabled, model: j.model_type });
      log('REQ-PAYLOAD thinking=' + j.thinking_enabled + ' search=' + j.search_enabled + ' model=' + j.model_type);
      save();
    } catch {}
  });
  page.on('response', (res) => {
    if (!res.url().includes('/api/v0/chat/completion')) return;
    res.text().then((t) => { lastBody = t; log('WIRE body len=' + t.length); }).catch((e) => log('WIRE fail ' + e.message.slice(0, 80)));
  });
  const dlEvents = [];
  page.on('download', async (d) => {
    const dest = path.join(DL_DIR, d.suggestedFilename());
    let ok = false, err = null;
    for (let i = 0; i < 3 && !ok; i++) {
      try { await d.saveAs(dest); ok = fs.existsSync(dest); } catch (e) { err = String(e.message).slice(0, 120); await sleep(800); }
    }
    dlEvents.push({ name: d.suggestedFilename(), dest, ok, err });
    disc.download = dlEvents[dlEvents.length - 1];
    log('DOWNLOAD ' + (ok ? 'saved' : 'FAILED') + ' → ' + dest + (ok ? ' size=' + fs.statSync(dest).size : ' err=' + err));
    save();
  });

  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);
  const nc = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,button,a,span')].find((e) => (e.innerText || '').trim() === '开启新对话' && e.getBoundingClientRect().width > 0);
    if (!el) return false; el.setAttribute('data-newchat', '1'); return true;
  });
  if (nc) { await page.locator('[data-newchat="1"]').first().click(); await sleep(2500); }

  disc.toggle.initial = { thinking: await readToggle('深度思考'), search: await readToggle('智能搜索') };
  log('TOGGLE initial ' + JSON.stringify(disc.toggle.initial));
  save();

  // ① 设 深度思考=ON、智能搜索=OFF（一次发出即同时验证两个方向）
  const r1 = await setToggle('深度思考', true);
  const r2 = await setToggle('智能搜索', false);
  disc.toggle.setting = { thinking: r1, search: r2 };
  log('TOGGLE set result thinking=' + JSON.stringify({ ok: r1.ok, via: r1.strategy }) + ' search=' + JSON.stringify({ ok: r2.ok, via: r2.strategy }));
  save();

  // ② 发送：要求输出代码块（同时服务下载验证）
  const input = page.locator('textarea').first();
  await input.click();
  await page.keyboard.insertText('请用一个 python 代码块输出：首行注释 # file: probe_dl2.py，内容为 print("dl2")。代码块外只写"完"。');
  await sleep(300);
  const tSend = Date.now();
  await input.press('Enter');
  let last = '', stable = 0;
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const cur = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="ds-markdown"]')];
      const el = els[els.length - 1];
      return el ? (el.innerText || '').trim() : '';
    });
    if (cur && cur === last) stable++; else stable = 0;
    last = cur;
    if (cur && stable >= 3) break;
    await sleep(2000);
  }
  log('SEND done in ' + ((Date.now() - tSend) / 1000).toFixed(1) + 's answerLen=' + last.length);
  const sse = lastBody ? parseSSE(lastBody) : null;
  disc.sse = sse ? { events: sse.events, textLen: sse.text.length, thinkingLen: sse.thinking.length, thinkingHead: sse.thinking.slice(0, 120) } : null;
  log('SSE: events=' + (sse?.events ?? '-') + ' textLen=' + (sse?.text.length ?? '-') + ' thinkingLen=' + (sse?.thinking.length ?? '-'));
  save();

  // ④ 下载按钮 → 落盘 → 内容核对
  const btn = await page.evaluate(() => {
    const els = [...document.querySelectorAll('span,div,button,a')].filter((el) => (el.innerText || '').trim() === '下载' && el.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    const last = els[els.length - 1];
    const clickable = last.closest('[role="button"],button') ?? last;
    clickable.setAttribute('data-dl', '1');
    return { tag: clickable.tagName.toLowerCase(), cls: (clickable.className || '').toString().slice(0, 80) };
  });
  log('DL-BUTTON ' + JSON.stringify(btn));
  if (btn) {
    await page.locator('[data-dl="1"]').first().click({ timeout: 6000 }).catch((e) => log('dl click err ' + e.message.slice(0, 100)));
    await sleep(4000);
    if (disc.download?.ok) {
      const head = fs.readFileSync(disc.download.dest, 'utf8').slice(0, 200);
      disc.download.contentHead = head;
      log('DL content head=' + JSON.stringify(head));
    } else {
      log('DL 未落盘，检查菜单/事件：download=' + JSON.stringify(disc.download));
    }
  }
  save();

  // 还原：深度思考=OFF
  const r3 = await setToggle('深度思考', false);
  log('restore 深度思考→off ok=' + r3.ok + ' via=' + r3.strategy);
  disc.toggle.restore = { ok: r3.ok, via: r3.strategy };
  save();
  log('PROBE5 DONE');
} catch (e) {
  disc.error = String(e?.stack || e);
  save();
  log('PROBE5 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  save();
  log('browser closed, exit');
  process.exit(disc.error ? 1 : 0);
}
