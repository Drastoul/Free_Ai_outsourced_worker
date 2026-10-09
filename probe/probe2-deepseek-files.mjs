/**
 * 探针 2 ——「免费外包」取件/送件地基实测（DeepSeek 网页版，复用探针 1 的登录态）
 *
 * 验证点：
 *   ① 开新会话：能否找到并点击"开启新对话"（每单独立会话，避免上下文污染）
 *   ② 送件：页面上是否有 input[type=file]；能否用 setInputFiles 附上文件（界面是否显示附件）
 *   ③ 取件-代码块：让 DeepSeek 输出一个带文件名的代码块 → 我们解析成真实文件落盘
 *   ④ 取件-下载：用本地 blob 页面验证"浏览器下载拦截 → 落盘"这条机制是通的
 *   ⑤ 取件-流：解析 chat/completion 的 SSE，直接从网络流还原答复纯文本（对照 DOM 抓取）
 *
 * 产物：probe/out2/run.log、probe/out2/discovery2.json、probe/out2/artifacts/*、probe/out2/downloads/*
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out2');
const DL_DIR = path.join(OUT_DIR, 'downloads');
const ART_DIR = path.join(OUT_DIR, 'artifacts');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
for (const d of [OUT_DIR, DL_DIR, ART_DIR]) fs.mkdirSync(d, { recursive: true });

const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const disc = { startedAt: new Date().toISOString(), steps: {}, attachments: null, extraction: null, downloads: [], sse: null, error: null };
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'discovery2.json'), JSON.stringify(disc, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TASK = [
  '请写一个 Python 脚本，代码块第一行必须是注释 `# file: hello_probe.py`，',
  '脚本功能：打印一行 `hello from probe`。',
  '请把完整代码放在一个 ```python 代码块里，代码块之外只写一句"已完成"。',
].join('');

/** DeepSeek chat/completion 的 SSE → 纯文本（RESPONSE 与 THINK 分开） */
function parseSSE(body) {
  const out = { text: '', thinking: '', events: 0, note: [] };
  let lastPath = null;
  for (const raw of String(body).split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let obj;
    try { obj = JSON.parse(payload); } catch { continue; }
    out.events++;
    if (obj && typeof obj === 'object' && obj.v && typeof obj.v === 'object') {
      if (typeof obj.p === 'string') lastPath = obj.p;
      const frags = obj.v?.response?.fragments;
      if (Array.isArray(frags)) {
        for (const f of frags) {
          if (f.type === 'RESPONSE') { out.text += f.content || ''; lastPath = 'response/fragments/-1/content'; }
          else if (f.type === 'THINK') { out.thinking += f.content || ''; lastPath = 'response/fragments/-1/thinking_content'; }
        }
      }
      if (Array.isArray(obj.v)) { out.note.push('array-form event'); }
    } else if (obj && typeof obj.v === 'string') {
      if (lastPath && lastPath.includes('thinking')) out.thinking += obj.v;
      else out.text += obj.v;
    }
  }
  return out;
}

/** 从答复里抽出代码块 → 落盘 */
function extractFiles(text) {
  const made = [];
  const re = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const lang = m[1] || 'txt';
    const body = m[2];
    const nameM = body.match(/^#\s*file:\s*([^\n]+)/i) || body.match(/^\/\/\s*file:\s*([^\n]+)/i);
    const name = (nameM ? nameM[1].trim() : `code_block_${made.length + 1}.${lang}`).replace(/[\\/:*?"<>|]/g, '_');
    const dest = path.join(ART_DIR, name);
    fs.writeFileSync(dest, body);
    made.push({ lang, name, dest, bytes: Buffer.byteLength(body) });
    log('EXTRACT code block → ' + name + ' (' + Buffer.byteLength(body) + ' bytes, lang=' + lang + ')');
  }
  return made;
}

let ctx;
try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge',
    headless: false,
    viewport: null,
    acceptDownloads: true,
    downloadsPath: DL_DIR,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  log('browser launched (复用登录态)');
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  const completionBodies = [];
  page.on('response', (res) => {
    if (!res.url().includes('/api/v0/chat/completion')) return;
    res.text().then((t) => { completionBodies.push(t); log('WIRE completion body len=' + t.length); save(); })
      .catch((e) => log('WIRE fail ' + e.message.slice(0, 100)));
  });
  page.on('download', async (d) => {
    const dest = path.join(DL_DIR, d.suggestedFilename());
    try { await d.saveAs(dest); } catch (e) { log('download save fail ' + e.message); }
    disc.downloads.push({ name: d.suggestedFilename(), dest, at: Date.now() - T0, source: 'deepseek-page' });
    log('DOWNLOAD(capture) ' + dest);
    save();
  });

  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);

  // ① 开新会话
  const before = page.url();
  const newChat = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div,button,a,span')].filter((el) => {
      const t = (el.innerText || '').trim();
      const r = el.getBoundingClientRect();
      return t === '开启新对话' && r.width > 0;
    });
    const el = cands[0];
    if (!el) return null;
    el.setAttribute('data-probe-newchat', '1');
    return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 100) };
  });
  disc.steps.newChatButton = newChat;
  if (newChat) {
    await page.locator('[data-probe-newchat="1"]').first().click();
    await sleep(2500);
  }
  disc.steps.newChat = { before, after: page.url() };
  log('NEW-CHAT button=' + JSON.stringify(newChat) + ' url: ' + before + ' → ' + page.url());

  // ② 送件探测：页面有没有 file input
  const fileInputs = await page.evaluate(() => [...document.querySelectorAll('input[type="file"]')].map((el) => ({
    accept: el.getAttribute('accept'), multiple: el.multiple, hidden: el.offsetParent === null,
    inDom: true, cls: (el.className || '').toString().slice(0, 80),
  })));
  disc.attachments = { fileInputs };
  log('FILE-INPUT count=' + fileInputs.length + ' ' + JSON.stringify(fileInputs).slice(0, 300));

  let uploadOk = null;
  if (fileInputs.length) {
    const tmp = path.join(ART_DIR, 'probe-upload.txt');
    fs.writeFileSync(tmp, '这是免费外包探针的上传测试文件。\nprobe upload test.\n');
    try {
      await page.locator('input[type="file"]').first().setInputFiles(tmp);
      await sleep(3500);
      const after = await page.evaluate(() => {
        const t = document.body.innerText || '';
        return { hasName: t.includes('probe-upload'), head: t.slice(0, 300) };
      });
      uploadOk = { file: tmp, uiShowsName: after.hasName };
      log('UPLOAD setInputFiles ok, uiShowsName=' + after.hasName);
    } catch (e) {
      uploadOk = { file: tmp, error: String(e.message).slice(0, 200) };
      log('UPLOAD fail: ' + uploadOk.error);
    }
  }
  disc.attachments.upload = uploadOk;
  save();

  // 清掉附件态：刷新页面回到干净会话
  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // ③④⑤ 发任务 → 取答复（DOM + 流双通道）→ 抽代码块落盘
  const input = page.locator('textarea').first();
  await input.click();
  await page.keyboard.insertText(TASK);
  await sleep(400);
  await input.press('Enter');
  log('TASK sent');

  let domText = '', stable = 0, last = '';
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    const t = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="ds-markdown"]')];
      const el = els[els.length - 1];
      return el ? (el.innerText || '').trim() : '';
    });
    if (t && t === last) stable++; else stable = 0;
    last = t;
    if (t && stable >= 3) { domText = t; break; }
    await sleep(2000);
  }
  log('DOM answer len=' + domText.length + ' head=' + JSON.stringify(domText.slice(0, 120)));
  disc.steps.domAnswer = { len: domText.length, head: domText.slice(0, 300) };

  const lastBody = completionBodies[completionBodies.length - 1] ?? '';
  const sse = lastBody ? parseSSE(lastBody) : null;
  if (sse) {
    disc.sse = { events: sse.events, textLen: sse.text.length, textHead: sse.text.slice(0, 300), thinkingLen: sse.thinking.length };
    log('SSE parse: events=' + sse.events + ' textLen=' + sse.text.length + ' thinkingLen=' + sse.thinking.length);
    log('SSE text head=' + JSON.stringify(sse.text.slice(0, 200)));
    if (sse.text) fs.writeFileSync(path.join(OUT_DIR, 'answer-sse.md'), sse.text);
    log('SSE vs DOM 一致=' + (sse.text.trim() === domText.trim()));
    disc.steps.sseMatchesDom = sse.text.trim() === domText.trim();
  }
  if (domText) fs.writeFileSync(path.join(OUT_DIR, 'answer-dom.md'), domText);

  // ③ 抽代码块
  const made = extractFiles(domText || sse?.text || '');
  disc.extraction = made;
  save();

  // ④ 下载拦截机制验证（本地 blob 页面，不依赖平台）
  const dlPage = await ctx.newPage();
  await dlPage.setContent(`<!doctype html><html><body>
    <a id="d" download="probe-download-test.txt">download</a>
    <script>
      const blob = new Blob(['下载拦截测试内容 download-capture-test'], { type: 'text/plain' });
      document.getElementById('d').href = URL.createObjectURL(blob);
    </script></body></html>`);
  const dlPromise = dlPage.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await dlPage.click('#d');
  const dl = await dlPromise;
  if (dl) {
    const dest = path.join(DL_DIR, 'local-' + dl.suggestedFilename());
    await dl.saveAs(dest).catch(() => {});
    disc.downloads.push({ name: dl.suggestedFilename(), dest, source: 'local-blob', at: Date.now() - T0 });
    log('DOWNLOAD mechanism OK → ' + dest + ' exists=' + fs.existsSync(dest));
  } else {
    log('DOWNLOAD mechanism FAIL：15s 内未捕获到下载事件');
  }
  await dlPage.close();
  save();

  log('PROBE2 DONE: extracted=' + made.length + ' downloads=' + disc.downloads.length);
} catch (e) {
  disc.error = String(e?.stack || e);
  save();
  log('PROBE2 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  save();
  log('browser closed, exit');
  process.exit(disc.error ? 1 : 0);
}
