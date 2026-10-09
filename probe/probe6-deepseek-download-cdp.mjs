/**
 * 探针 6 —— 真实平台「下载」路径定论（DeepSeek，复用登录态）
 *
 * 已知：点「下载」→ 触发真实下载事件（文件名 deepseek_python_<日期>_<hash>.py），
 *       但 Playwright 侧随后报「page/context closed」，saveAs 落盘失败（复现 2 次）。
 * 本探针要回答：① 浏览器进程是否真的死了，还是只是页面关了 ② 改用「CDP 自动落盘」
 *       （Browser.setDownloadBehavior）能否拿到文件 ③ 页面关闭后 context 里还有没有可用页面。
 *
 * 产物：probe/out6/run.log、discovery6.json、autosave/*
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out6');
const SAVE_DIR = path.join(OUT_DIR, 'autosave');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
for (const d of [OUT_DIR, SAVE_DIR]) fs.mkdirSync(d, { recursive: true });

const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const disc = { events: [], downloads: [], autosaved: [], alive: [], error: null };
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'discovery6.json'), JSON.stringify(disc, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ctx, page;
const alive = async (tag) => {
  let pages = -1, connected = null;
  try { pages = ctx.pages().length; } catch (e) { pages = 'ERR:' + String(e.message).slice(0, 60); }
  try { connected = ctx.browser()?.isConnected?.() ?? 'n/a'; } catch { connected = 'ERR'; }
  const dirFiles = fs.readdirSync(SAVE_DIR);
  const rec = { at: ((Date.now() - T0) / 1000).toFixed(1), tag, pages, connected, files: dirFiles };
  disc.alive.push(rec);
  log(`ALIVE[${tag}] pages=${pages} browserConnected=${connected} files=${JSON.stringify(dirFiles)}`);
  save();
};

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null, acceptDownloads: true,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  log('browser launched');
  ctx.on('close', () => log('!! context closed'));
  page.on('close', () => log('!! page closed'));
  page.on('crash', () => log('!! page crashed'));
  ctx.on('page', (p) => log('!! new page: ' + p.url().slice(0, 120)));

  // CDP：浏览器自动落盘（不经 saveAs）
  let cdp = null;
  try {
    cdp = await ctx.newCDPSession(page);
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVE_DIR, eventsEnabled: true });
    log('CDP Browser.setDownloadBehavior ok → ' + SAVE_DIR);
  } catch (e) { log('CDP setDownloadBehavior fail: ' + String(e.message).slice(0, 140)); }

  page.on('download', (d) => {
    disc.downloads.push({ name: d.suggestedFilename(), at: ((Date.now() - T0) / 1000).toFixed(1) });
    log('DOWNLOAD event name=' + d.suggestedFilename());
    save();
  });
  page.on('response', (res) => {
    if (!res.url().includes('/api/v0/chat/completion')) return;
    log('WIRE completion len seen');
  });

  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);
  const nc = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,button,a,span')].find((e) => (e.innerText || '').trim() === '开启新对话' && e.getBoundingClientRect().width > 0);
    if (!el) return false; el.setAttribute('data-newchat', '1'); return true;
  });
  if (nc) { await page.locator('[data-newchat="1"]').first().click(); await sleep(2500); }
  await alive('after-newchat');

  const input = page.locator('textarea').first();
  await input.click();
  await page.keyboard.insertText('请用一个 python 代码块输出：首行注释 # file: probe_dl3.py，内容为 print("dl3")。代码块外只写"完"。');
  await sleep(300);
  await input.press('Enter');
  let last = '', stable = 0;
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    const cur = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="ds-markdown"]')];
      const el = els[els.length - 1];
      return el ? (el.innerText || '').trim() : '';
    }).catch(() => '');
    if (cur && cur === last) stable++; else stable = 0;
    last = cur;
    if (cur && stable >= 3) break;
    await sleep(2000);
  }
  log('answer ready len=' + last.length);
  await alive('after-answer');

  const btn = await page.evaluate(() => {
    const els = [...document.querySelectorAll('span,div,button,a')].filter((el) => (el.innerText || '').trim() === '下载' && el.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    const clickable = els[els.length - 1].closest('[role="button"],button') ?? els[els.length - 1];
    clickable.setAttribute('data-dl', '1');
    return { cls: (clickable.className || '').toString().slice(0, 80) };
  });
  log('DL-BUTTON ' + JSON.stringify(btn));
  if (btn) {
    await page.locator('[data-dl="1"]').first().click({ timeout: 6000 }).catch((e) => log('dl click err ' + e.message.slice(0, 100)));
    for (let i = 1; i <= 12; i++) { await sleep(1000); await alive('t+' + i + 's'); }
  }
  const files = fs.readdirSync(SAVE_DIR);
  disc.autosaved = files;
  log('AUTOSAVE files=' + JSON.stringify(files));
  if (files.length) {
    const p = path.join(SAVE_DIR, files[0]);
    disc.autosavedHead = fs.readFileSync(p, 'utf8').slice(0, 200);
    log('AUTOSAVE head=' + JSON.stringify(disc.autosavedHead));
  }
  log('PROBE6 DONE');
} catch (e) {
  disc.error = String(e?.stack || e);
  log('PROBE6 FAILED: ' + String(e?.message || e));
} finally {
  save();
  try { if (ctx) await ctx.close(); } catch {}
  log('browser closed, exit');
  process.exit(0);
}
