/**
 * 探针 3 —— 取件主通道定稿（DeepSeek，复用登录态）
 *
 * 修正与验证：
 *   ① SSE 解析器修正：只在"内容路径"上追加；status 之类的事件不得混进正文
 *   ② 多文件提取：让 DeepSeek 一次输出两个代码块 → 解析成两个真实文件
 *   ③ DOM 兜底通道：把最后一个助手回合里的所有 markdown 块**拼起来**（探针 2 只取了最后一块 ⇒ 漏内容）
 *   ④ 对话选项探测：深度思考 / 联网搜索 两个开关的存在与形态（供后续"任务选项"设计）
 *   ⑤ 计时：一条真实代码任务的端到端耗时
 *
 * 产物：probe/out3/run.log、raw-sse.txt（原始流，供解析器对照）、artifacts/*、discovery3.json
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out3');
const ART_DIR = path.join(OUT_DIR, 'artifacts');
const DL_DIR = path.join(OUT_DIR, 'downloads');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
for (const d of [OUT_DIR, ART_DIR, DL_DIR]) fs.mkdirSync(d, { recursive: true });

const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const disc = { startedAt: new Date().toISOString(), toggles: null, dom: null, sse: null, files: [], timings: {}, error: null };
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'discovery3.json'), JSON.stringify(disc, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TASK = [
  '请输出两个文件的内容，各自放在一个代码块里：',
  '第一个：```python 代码块，第一行注释为 `# file: greet.py`，内容为打印 hello-outsource；',
  '第二个：```markdown 代码块，第一行注释为 `<!-- file: README.md -->`，内容为一行标题 # 外包测试。',
  '代码块之外只回复"完成"两个字。',
].join('\n');

/** 修正版 SSE → 纯文本：仅在内容路径上累积；status / 元数据事件不入正文 */
function parseSSE(body) {
  const out = { text: '', thinking: '', events: 0, skipped: [] };
  let lastPath = null;
  const appendTo = (pathStr, chunk) => {
    if (!pathStr) return false;
    if (/fragments\/-?\d+\/content$/.test(pathStr)) { out.text += chunk; return true; }
    if (/thinking_content$/.test(pathStr)) { out.thinking += chunk; return true; }
    return false;
  };
  for (const raw of String(body).split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let obj;
    try { obj = JSON.parse(payload); } catch { continue; }
    out.events++;
    if (obj && typeof obj === 'object' && obj.p && typeof obj.p === 'string') {
      // 带路径的事件：SET 用于非内容路径；APPEND（或省略）用于内容
      if (obj.p.endsWith('/content') || obj.p.endsWith('thinking_content')) {
        lastPath = obj.p;
        if (typeof obj.v === 'string' && obj.o !== 'SET') appendTo(lastPath, obj.v);
        else if (typeof obj.v === 'string' && obj.o === 'SET') { appendTo(lastPath, obj.v); }
      } else {
        lastPath = obj.p;
        if (obj.o === 'SET' || obj.o === undefined) out.skipped.push({ path: obj.p, v: typeof obj.v === 'string' ? obj.v : typeof obj.v });
      }
      const frags = obj?.v?.response?.fragments;
      if (Array.isArray(frags)) {
        for (const f of frags) {
          if (f.type === 'RESPONSE') { out.text += f.content || ''; lastPath = 'response/fragments/-1/content'; }
          else if (f.type === 'THINK') { out.thinking += f.content || ''; lastPath = 'response/fragments/-1/thinking_content'; }
        }
      }
    } else if (obj && typeof obj.v === 'string') {
      appendTo(lastPath, obj.v);
    }
  }
  return out;
}

function extractFiles(text) {
  const made = [];
  const re = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const lang = m[1] || 'txt';
    const body = m[2];
    const nameM = body.match(/^(?:#|\/\/|<!--)\s*file:\s*([^\s>]+)/i);
    const name = (nameM ? nameM[1].trim() : `code_block_${made.length + 1}.${lang || 'txt'}`).replace(/[\\/:*?"<>|]/g, '_');
    const dest = path.join(ART_DIR, name);
    fs.writeFileSync(dest, body);
    made.push({ lang, name, dest, bytes: Buffer.byteLength(body), head: body.slice(0, 60) });
    log('EXTRACT → ' + name + ' (' + Buffer.byteLength(body) + 'B, lang=' + lang + ')');
  }
  return made;
}

let ctx;
try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null, acceptDownloads: true, downloadsPath: DL_DIR,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  log('browser launched');
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  let rawSSE = '';
  page.on('response', (res) => {
    if (!res.url().includes('/api/v0/chat/completion')) return;
    res.text().then((t) => { rawSSE = t; log('WIRE body len=' + t.length); }).catch(() => {});
  });

  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);

  // ④ 对话选项探测（只读）
  disc.toggles = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('div,button,span,label')) {
      const t = (el.innerText || '').trim();
      const r = el.getBoundingClientRect();
      if (!r.width || t.length > 24) continue;
      if (/深度思考|联网搜索|DeepThink|Search/i.test(t)) {
        out.push({ text: t, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 90), role: el.getAttribute('role') });
      }
    }
    const uniq = [];
    for (const o of out) if (!uniq.some((u) => u.text === o.text && u.cls === o.cls)) uniq.push(o);
    return uniq.slice(0, 20);
  });
  log('TOGGLES: ' + JSON.stringify(disc.toggles).slice(0, 500));
  save();

  // 发任务
  const input = page.locator('textarea').first();
  await input.click();
  await page.keyboard.insertText(TASK);
  await sleep(400);
  const tSend = Date.now();
  await input.press('Enter');
  log('TASK sent');

  // DOM 兜底通道：把最后一个助手回合的所有 markdown 块拼起来
  let domText = '', stable = 0, last = '';
  const end = Date.now() + 300000;
  while (Date.now() < end) {
    const t = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('[class*="ds-markdown"]')];
      if (!blocks.length) return '';
      // 以最后一个块的最近公共祖先容器为界，取该容器内的全部块（尽量只覆盖最后一条回复）
      const lastB = blocks[blocks.length - 1];
      let scope = lastB.closest('[class*="message"]') || lastB.parentElement?.parentElement?.parentElement || document.body;
      const inScope = blocks.filter((b) => scope.contains(b));
      const picked = (inScope.length ? inScope : blocks.slice(-1));
      return picked.map((b) => (b.innerText || '').trim()).filter(Boolean).join('\n\n');
    });
    if (t && t === last) stable++; else stable = 0;
    last = t;
    if (t && stable >= 3) { domText = t; break; }
    await sleep(2000);
  }
  const domMs = Date.now() - tSend;
  log('DOM answer len=' + domText.length + ' in ' + (domMs / 1000).toFixed(1) + 's head=' + JSON.stringify(domText.slice(0, 120)));
  disc.dom = { len: domText.length, ms: domMs, head: domText.slice(0, 400) };

  if (rawSSE) {
    fs.writeFileSync(path.join(OUT_DIR, 'raw-sse.txt'), rawSSE);
    const sse = parseSSE(rawSSE);
    disc.sse = { events: sse.events, textLen: sse.text.length, thinkingLen: sse.thinking.length, text: sse.text.slice(0, 600), skippedSample: sse.skipped.slice(0, 8) };
    log('SSE text len=' + sse.text.length + ' events=' + sse.events + ' thinkingLen=' + sse.thinking.length);
    log('SSE text=' + JSON.stringify(sse.text));
    fs.writeFileSync(path.join(OUT_DIR, 'answer-sse.md'), sse.text);
    disc.files = extractFiles(sse.text);   // 主通道：流
    disc.sseMatchesDom = sse.text.trim() === domText.trim();
    log('SSE vs DOM 一致=' + disc.sseMatchesDom);
  } else {
    log('SSE 未捕获，退回 DOM 提取');
    disc.files = extractFiles(domText);
  }
  if (domText) fs.writeFileSync(path.join(OUT_DIR, 'answer-dom.md'), domText);
  disc.timings = { domMs, totalMs: Date.now() - tSend };
  save();
  log('PROBE3 DONE files=' + disc.files.length + ' → ' + disc.files.map((f) => f.name).join(','));
} catch (e) {
  disc.error = String(e?.stack || e);
  save();
  log('PROBE3 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  save();
  log('browser closed, exit');
  process.exit(disc.error ? 1 : 0);
}
