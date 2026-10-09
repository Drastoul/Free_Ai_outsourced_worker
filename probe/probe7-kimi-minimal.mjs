/**
 * 探针 7 —— Kimi 最小验证（第二平台可行性）
 *
 * 目标（不为 b3 做完整适配器，只回答"这套架构能否接第二个平台"）：
 *   ① 能否打开 kimi.com 并识别登录态（需要人工登录一次）
 *   ② 输入框 / 发送动作 是否可用
 *   ③ 答复能否取回（DOM 出现预期文本 = 通过；并记录答复所在元素，供 b3 写选择器台账）
 *   ④ 采集：聊天接口的 URL 形态（POST 白名单）、是否有文件上传 input（送件能力）
 *
 * 产物：probe/out7/run.log、discovery7.json
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out7');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
fs.mkdirSync(OUT_DIR, { recursive: true });

const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const disc = { site: 'kimi', steps: {}, posts: [], inputs: null, answer: null, error: null };
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'discovery7.json'), JSON.stringify(disc, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXPECT = 'Kimi 探针测试成功';
let ctx, page;

async function dumpUi(tag) {
  const ui = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const info = (el) => ({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 110), ph: el.getAttribute('placeholder'), aria: el.getAttribute('aria-label'), ce: el.getAttribute('contenteditable') });
    return {
      url: location.href, title: document.title,
      bodyHead: (document.body.innerText || '').slice(0, 300),
      editables: [...document.querySelectorAll('[contenteditable="true"],[contenteditable=""]')].filter(vis).map(info).slice(0, 8),
      textareas: [...document.querySelectorAll('textarea')].filter(vis).map(info).slice(0, 8),
      fileInputs: [...document.querySelectorAll('input[type="file"]')].map((el) => ({ accept: (el.getAttribute('accept') || '').slice(0, 80), multiple: el.multiple })),
      sendCands: [...document.querySelectorAll('button,[role="button"],div[class*="send"]')].filter(vis).map((el) => ({ ...info(el), text: (el.innerText || '').trim().slice(0, 20) })).filter((b) => /发送|send/i.test((b.aria || '') + ' ' + (b.cls || '') + ' ' + (b.text || ''))).slice(0, 6),
    };
  });
  log(`UI[${tag}] url=${ui.url}`);
  log(`UI[${tag}] title=${JSON.stringify(ui.title)} bodyHead=${JSON.stringify(ui.bodyHead.slice(0, 160))}`);
  log(`UI[${tag}] editables=${JSON.stringify(ui.editables)}`);
  log(`UI[${tag}] textareas=${JSON.stringify(ui.textareas)}`);
  log(`UI[${tag}] fileInputs=${JSON.stringify(ui.fileInputs)} sendCands=${JSON.stringify(ui.sendCands)}`);
  disc.steps[tag] = ui;
  save();
  return ui;
}

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null, acceptDownloads: true,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  log('browser launched');
  page = ctx.pages()[0] ?? (await ctx.newPage());

  const seen = new Set();
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const u = req.url();
    if (!/kimi|moonshot/i.test(u)) return;
    const key = u.split('?')[0];
    if (seen.has(key)) return;
    seen.add(key);
    disc.posts.push(key);
    log('NET-POST ' + key);
    save();
  });

  await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  log('goto ok: ' + page.url());
  await sleep(4000);
  await dumpUi('landing');

  // 登录轮询：等输入框出现（含人工登录窗口）
  let ready = false;
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const ed = [...document.querySelectorAll('[contenteditable="true"],textarea')].filter(vis);
      return { url: location.href, hasInput: ed.length > 0, bodyHead: (document.body.innerText || '').slice(0, 120) };
    });
    if (st.hasInput) { ready = true; log('INPUT ready @ ' + st.url); break; }
    if (Date.now() - lastLog > 20000) { lastLog = Date.now(); log('waiting login/input… url=' + st.url + ' body=' + JSON.stringify(st.bodyHead.slice(0, 90))); }
    await sleep(2500);
  }
  if (!ready) throw new Error('10 分钟内未出现输入框（登录未完成？）');
  const ui = await dumpUi('ready');

  // 发送
  const sendInfo = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = [...document.querySelectorAll('[contenteditable="true"],textarea')].filter(vis).pop();
    if (!el) return null;
    el.setAttribute('data-probe-input', '1');
    return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 90) };
  });
  log('INPUT target=' + JSON.stringify(sendInfo));
  const input = page.locator('[data-probe-input="1"]').first();
  await input.click();
  await page.keyboard.insertText(`请只回复这一句话，不要有其他内容：${EXPECT}`);
  await sleep(500);
  const landed = await page.evaluate(() => {
    const el = document.querySelector('[data-probe-input="1"]');
    return el ? ((el.value !== undefined ? el.value : el.innerText) || '').slice(0, 60) : '';
  });
  log('text landed=' + JSON.stringify(landed));
  await input.press('Enter');
  log('sent (Enter)');

  // 等答复：在页面文本里找预期串（第二平台先验"能不能拿到答复"）
  let ok = false, where = null;
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const hit = await page.evaluate((exp) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let el = walker.currentNode, found = null;
      while (el) {
        const t = el.textContent || '';
        if (t.includes(exp)) {
          // 取最深的命中元素
          if (!found || (el.textContent || '').length <= (found.textContent || '').length) found = el;
        }
        el = walker.nextNode();
      }
      if (!found) return null;
      return { tag: found.tagName.toLowerCase(), cls: (found.className || '').toString().slice(0, 110), text: (found.textContent || '').slice(0, 80) };
    }, EXPECT);
    if (hit) { ok = true; where = hit; break; }
    await sleep(2500);
  }
  disc.answer = { ok, where };
  log('ANSWER found=' + ok + ' where=' + JSON.stringify(where));
  save();
  await dumpUi('after-answer');
  log('POSTS seen: ' + JSON.stringify(disc.posts));
  log('PROBE7 DONE ok=' + ok);
} catch (e) {
  disc.error = String(e?.stack || e);
  save();
  log('PROBE7 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  save();
  log('browser closed, exit');
  process.exit(disc.error ? 1 : 0);
}
