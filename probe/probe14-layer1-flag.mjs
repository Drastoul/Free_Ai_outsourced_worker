/**
 * 探针 14 —— 层①（真机下载按钮）候选规避实验
 * 假设：Edge 点下载会打开 edge://downloads-hub 页面并导致浏览器崩溃 ⇒ 禁用该 UI 特性后应不再崩。
 * 做法：与 probe6 同流程（CDP 自动落盘 + 点「下载」），但启动参数加 --disable-features=...
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out14');
const SAVE_DIR = path.join(OUT_DIR, 'autosave');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
for (const d of [OUT_DIR, SAVE_DIR]) fs.mkdirSync(d, { recursive: true });
const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => { const l = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`; console.log(l); try { fs.appendFileSync(LOG, l + '\n'); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FLAG = String(process.env.PROBE14_FLAGS || 'msDownloadsHub,DownloadBubble,DownloadBubbleV2,EdgeDownloadsHub');

let ctx;
try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled', `--disable-features=${FLAG}`],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  ctx.on('close', () => log('!! context closed'));
  page.on('close', () => log('!! page closed'));
  log('browser launched with --disable-features=' + FLAG);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVE_DIR, eventsEnabled: true });
  log('CDP 落盘目录 = ' + SAVE_DIR);
  page.on('download', (d) => log('DOWNLOAD event: ' + d.suggestedFilename()));

  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);
  const nc = await page.evaluate(() => { const el = [...document.querySelectorAll('div,button,a,span')].find((e) => (e.innerText || '').trim() === '开启新对话' && e.getBoundingClientRect().width > 0); if (!el) return false; el.setAttribute('data-nc', '1'); return true; });
  if (nc) { await page.locator('[data-nc="1"]').first().click(); await sleep(2500); }

  const input = page.locator('textarea').first();
  await input.click();
  await page.keyboard.insertText('请用一个 python 代码块输出：首行注释 # file: probe_dl4.py，内容为 print("dl4")。代码块外只写"完"。');
  await sleep(400);
  await input.press('Enter');
  let last = '', stable = 0;
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    const cur = await page.evaluate(() => { const els = [...document.querySelectorAll('[class*="ds-markdown"]')]; const el = els[els.length - 1]; return el ? (el.innerText || '').trim() : ''; }).catch(() => '');
    if (cur && cur === last) stable++; else stable = 0;
    last = cur;
    if (cur && stable >= 3) break;
    await sleep(2000);
  }
  log('answer len=' + last.length);

  const btn = await page.evaluate(() => {
    const els = [...document.querySelectorAll('span,div,button,a')].filter((el) => (el.innerText || '').trim() === '下载' && el.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    const c = els[els.length - 1].closest('[role="button"],button') ?? els[els.length - 1];
    c.setAttribute('data-dl', '1');
    return true;
  });
  log('DL button found=' + btn);
  if (btn) {
    await page.locator('[data-dl="1"]').first().click({ timeout: 5000 }).catch((e) => log('click err ' + e.message.slice(0, 80)));
    for (let i = 1; i <= 12; i++) {
      await sleep(1000);
      let alive = true, pages = -1;
      try { pages = ctx.pages().length; } catch { alive = false; }
      const files = fs.readdirSync(SAVE_DIR);
      log(`t+${i}s pages=${pages} files=${JSON.stringify(files)}`);
      if (!alive) break;
    }
  }
  const files = fs.readdirSync(SAVE_DIR).filter((f) => !f.endsWith('.crdownload'));
  log('COMPLETE files=' + JSON.stringify(files));
  if (files.length) log('content=' + JSON.stringify(fs.readFileSync(path.join(SAVE_DIR, files[0]), 'utf8').slice(0, 80)));
  log('PROBE14 DONE 完整落盘=' + (files.length > 0));
} catch (e) {
  log('PROBE14 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  log('exit');
  process.exit(0);
}
