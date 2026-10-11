/**
 * 探针 16 —— K3（Enter 兜底能否发送）+ K4（点「新建会话」与 chat.id 判据）+ K5（附件上传实测）
 *
 * 已证前提（勿重复）：发送 = 点 div.send-button-container（4 次真机证据）；每次导航首页 = 空态、每次发送建新会话 id。
 * 本探针三段（同一浏览器会话、同一登录态 profile 内）：
 *   ① K3：登录态下先按 Enter（不点按钮），看是否出现 ChatService/Chat 请求 ⇒ 兜底可用性；
 *   ② K4：点侧栏「新建会话」⇒ 页面不含上一单消息文本 ∧ 本次发送后 chat.id ≠ 上一单 chat.id；
 *   ③ K5：setInputFiles 传 .txt ⇒ 界面出现文件名 ∧ 请求体含文件名 / 附件引用。
 * 判据逐项见 §2 K3/K4/K5 行。产物：probe/out16/（run.log + result.json）
 * 复跑：node probe/probe16-kimi-newchat-enter-upload.mjs（约 2–4 分钟；无需人工；每跑一次会在 Kimi 产生 3 条新会话）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out16');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
const TMP_DIR = path.join(ROOT, '.thincoder', 'tmp');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });
const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const watchdog = setTimeout(() => { log('WATCHDOG 硬超时（290s）'); process.exit(3); }, 290000);
watchdog.unref?.();

const TXT_A = '探针16-A：请只回复「收到A」。';
const TXT_B = '探针16-B：请只回复「收到B」。';
const TXT_C = '探针16-C：附件已上传，请只回复「收到C」。';
const ATTACH_NAME = 'probe16-attach.txt';
const ATTACH_PREFIX = 'probe16';   // 防止 UI 截断显示造成假阴性（如 "probe16-att..."）
const ATTACH_PATH = path.join(TMP_DIR, ATTACH_NAME);
fs.writeFileSync(ATTACH_PATH, '探针16 附件内容（K5 实测）\n');

const extractChatId = (body) => {
  const m = body.match(/"chat":\s*\{[^}]*?"id":\s*"([0-9a-fA-F-]{8,})"/);
  return m ? m[1] : null;
};

const result = { enter: {}, newChat: {}, upload: {}, errors: [] };
let ctx, page;
const chatReqs = [];   // { url, len, text }
const resps = [];      // { len, body }
const net = [];        // 附件窗口内的网络请求（method + path）

const waitFor = async (fn, ms, step) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch {}
    await sleep(400);
  }
  log(`TIMEOUT 等 ${step} 超时（${ms}ms）`);
  return false;
};

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  ctx.on('close', () => log('!! context closed（外部关闭）'));
  log('browser launched');

  page.on('request', (req) => {
    const u = req.url();
    if (req.method() !== 'POST') return;
    try { net.push(req.method() + ' ' + u.split('?')[0]); } catch {}
    if (!/ChatService\/Chat$/.test(u)) return;
    let buf = null; try { buf = req.postDataBuffer(); } catch {}
    const s = buf ? buf.toString('utf8') : (req.postData() || '');
    chatReqs.push({ url: u.split('?')[0], len: buf ? buf.length : s.length, text: s });
    log(`CHAT-POST len=${buf ? buf.length : s.length}`);
  });
  page.on('response', (res) => {
    if (!/ChatService\/Chat$/.test(res.url())) return;
    res.text().then((t) => { resps.push({ len: t.length, body: t }); log(`CHAT-RESP len=${t.length}`); })
      .catch((e) => { resps.push({ len: -1, body: '' }); log('CHAT-RESP fail ' + e.message.slice(0, 60)); });
  });

  await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('goto ok');
  let editorOk = false;
  for (let i = 0; i < 20; i++) {
    editorOk = await page.evaluate(() => !!document.querySelector('.chat-input-editor')).catch(() => false);
    if (editorOk) break;
    await sleep(2000);
  }
  log('editor present=' + editorOk);
  if (!editorOk) throw new Error('编辑器未出现（登录态可能丢失）');
  await sleep(3000);

  const editor = page.locator('.chat-input-editor').first();
  const typeText = async (txt) => {
    await editor.click({ timeout: 8000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await sleep(300);
    await page.keyboard.insertText(txt);
    await sleep(800);
    return page.evaluate(() => (document.querySelector('.chat-input-editor')?.innerText || '').trim());
  };

  // ---------- ① K3：Enter 是否触发发送 ----------
  const typedA = await typeText(TXT_A);
  log('K3 typedA=' + JSON.stringify(typedA.slice(0, 60)));
  const nReq0 = chatReqs.length;
  await editor.press('Enter').catch((e) => log('K3 enter err ' + e.message.slice(0, 60)));
  const enterSent = await waitFor(() => chatReqs.length > nReq0, 8000, 'Enter 触发的 ChatService/Chat 请求');
  const editorAfterEnter = await page.evaluate(() => (document.querySelector('.chat-input-editor')?.innerText || '').trim()).catch(() => '');
  result.enter = { typed: typedA.slice(0, 80), enterSent, editorAfterEnter: editorAfterEnter.slice(0, 80) };
  log(`K3 enterSent=${enterSent} editorAfterEnter=${JSON.stringify(editorAfterEnter.slice(0, 60))}`);

  let clickSent = null;
  if (!enterSent) {
    await page.locator('div.send-button-container').first().click({ timeout: 8000 }).catch((e) => log('K3 click err ' + e.message.slice(0, 60)));
    clickSent = await waitFor(() => chatReqs.length > nReq0, 8000, '按钮触发的 ChatService/Chat 请求');
    log('K3 clickSent=' + clickSent);
  }
  result.enter.clickSent = clickSent;
  // 等第一单响应体 + DOM 出现 A 文本（K4 的「上一单」基线）
  await waitFor(() => resps.length >= 1, 40000, 'A 单响应体');
  const chatIdA = extractChatId(resps[0]?.body || '');
  log(`K4 chatIdA=${chatIdA} respLenA=${resps[0]?.len}`);
  const domHasA = await waitFor(() => page.evaluate((t) => (document.body.innerText || '').includes(t), TXT_A).catch(() => false), 20000, 'DOM 出现 A 文本');
  log('K4 domHasA=' + domHasA);

  // ---------- ② K4：点「新建会话」→ 发送 B ----------
  const urlBefore = page.url();
  const ncEl = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const els = [...document.querySelectorAll('div,span,button,a')].filter((el) => (el.innerText || el.textContent || '').trim() === '新建会话' && vis(el));
    if (!els.length) return null;
    els[0].setAttribute('data-probe-nc', '1');
    return { n: els.length, tag: els[0].tagName.toLowerCase(), cls: String(els[0].className || '').slice(0, 90) };
  }).catch(() => null);
  log('K4 新建会话元素=' + JSON.stringify(ncEl));
  let clickedOk = false;
  if (ncEl) {
    await page.locator('[data-probe-nc="1"]').first().click({ timeout: 8000 }).catch((e) => log('K4 click err ' + e.message.slice(0, 60)));
    clickedOk = true;
    await sleep(3000);
  } else {
    log('K4 未找到「新建会话」元素 —— 记录为无');
  }
  // 新会话落地：等编辑器再次可用 + 采样「上一单消息文本」是否仍在**会话区**（K4 判据①；全页 body 含侧栏历史项名，另记录）
  await waitFor(() => page.evaluate(() => !!document.querySelector('.chat-input-editor')).catch(() => false), 15000, '新会话编辑器');
  const urlAfter = page.url();
  const scopeCheck = (t) => page.evaluate((tt) => {
    const lists = [...document.querySelectorAll('.chat-content-list')];
    const mainHas = lists.some((el) => (el.innerText || '').includes(tt));
    const bodyHas = (document.body.innerText || '').includes(tt);
    const src = [...document.querySelectorAll('*')]
      .filter((el) => (el.innerText || '').includes(tt) && ![...el.children].some((c) => (c.innerText || '').includes(tt)))
      .slice(0, 4).map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 70), text: (el.innerText || '').trim().slice(0, 50) }));
    return { url: location.href, lists: lists.length, mainHas, bodyHas, src };
  }, t).catch(() => null);
  const ncSamples = [];
  let ncClearedMs = null, ncScope = null;
  const ncT0 = Date.now();
  for (let i = 0; i < 30; i++) {
    const s = await scopeCheck(TXT_A);
    if (s) {
      ncSamples.push({ t: +((Date.now() - ncT0) / 1000).toFixed(1), mainHas: s.mainHas, bodyHas: s.bodyHas, lists: s.lists, src: s.src });
      ncScope = s;
      if (!s.mainHas) { ncClearedMs = Date.now() - ncT0; break; }
    }
    await sleep(400);
  }
  log(`K4 urlBefore=${urlBefore} urlAfter=${urlAfter} 会话区含A=${ncScope?.mainHas} 全页含A=${ncScope?.bodyHas} lists=${ncScope?.lists} 会话区清空耗时=${ncClearedMs}ms`);
  log('K4 含A文本来源=' + JSON.stringify(ncScope?.src));

  // 发 B（按钮路径，稳定）
  const typedB = await typeText(TXT_B);
  log('K4 typedB=' + JSON.stringify(typedB.slice(0, 60)));
  const nReq1 = chatReqs.length, nResp1 = resps.length;
  await page.locator('div.send-button-container').first().click({ timeout: 8000 }).catch((e) => log('K4 sendB err ' + e.message.slice(0, 60)));
  const sentB = await waitFor(() => chatReqs.length > nReq1, 8000, 'B 单请求');
  await waitFor(() => resps.length > nResp1, 40000, 'B 单响应体');
  const chatIdB = extractChatId(resps[nResp1]?.body || '');
  log(`K4 sentB=${sentB} chatIdB=${chatIdB}`);
  result.newChat = {
    element: ncEl, clicked: clickedOk, urlBefore, urlAfter,
    mainHasA_after: ncScope?.mainHas ?? null, bodyHasA_after: ncScope?.bodyHas ?? null,
    listsAfter: ncScope?.lists ?? null, clearedMs: ncClearedMs, samples: ncSamples,
    domHasA_beforeLast: domHasA,
    chatIdA, chatIdB, newChatId: !!chatIdB && !!chatIdA && chatIdB !== chatIdA,
  };

  // ---------- ③ K5：附件上传 ----------
  const fileInputs = await page.evaluate(() => [...document.querySelectorAll('input[type="file"]')].map((el) => ({ accept: el.getAttribute('accept') || '', multiple: el.multiple })));
  log('K5 fileInputs=' + JSON.stringify(fileInputs));
  const nReq2 = chatReqs.length, nResp2 = resps.length;
  const netBefore = net.length;
  await page.locator('input[type="file"]').first().setInputFiles(ATTACH_PATH).catch((e) => log('K5 setInputFiles err ' + e.message.slice(0, 80)));
  // 快速采样器（轻量）：文件名（全名 + 前缀 token）是否在页面文本 / 可见元素 / input.files 里
  const quickScan = () => page.evaluate(({ n, prefix }) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const hit = (s) => (s || '').includes(n) || (s || '').includes(prefix);
    const cand = [...document.querySelectorAll('*')].filter((el) => { const t = el.textContent || ''; return hit(t) && t.length < 400; });
    const leaf = cand.filter((el) => ![...el.children].some((c) => hit(c.textContent || '')));
    const visHit = leaf.find(vis) || cand.find(vis);
    const inp = document.querySelector('input[type="file"]');
    return {
      bodyHas: (document.body.innerText || '').includes(n),
      bodyHasPrefix: (document.body.innerText || '').includes(prefix),
      chips: leaf.slice(0, 6).map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 70), vis: vis(el), text: (el.textContent || '').trim().slice(0, 50) })),
      visHit: visHit ? { tag: visHit.tagName.toLowerCase(), cls: String(visHit.className || '').slice(0, 70), text: (visHit.textContent || '').trim().slice(0, 50) } : null,
      nFiles: inp && inp.files ? inp.files.length : -1,
    };
  }, { n: ATTACH_NAME, prefix: ATTACH_PREFIX }).catch((e) => ({ err: String(e.message || e).slice(0, 120) }));
  // 深度扫描：文件名出现在哪里（含 shadow DOM / 属性 / input.value）
  const deepScanFileUi = () => page.evaluate(({ n, prefix }) => {
    const found = [];
    const visOf = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const tok = (s) => (s.includes(n) ? 'full' : (s.includes(prefix) ? 'prefix' : null));
    const walk = (root, depth) => {
      if (depth > 6) return;
      for (const el of root.querySelectorAll('*')) {
        const tag = el.tagName.toLowerCase();
        const meta = { tag, cls: String(el.className || '').slice(0, 80) };
        let it = ''; try { it = el.innerText || ''; } catch {}
        if (tok(it)) found.push({ where: 'innerText', tok: tok(it), vis: visOf(el), ...meta });
        const tc = el.textContent || '';
        if (tok(tc) && tc.length < 400) found.push({ where: 'textContent', tok: tok(tc), vis: visOf(el), ...meta });
        for (const a of ['title', 'aria-label', 'alt', 'placeholder']) {
          const v = el.getAttribute && el.getAttribute(a);
          if (v && tok(String(v))) found.push({ where: 'attr:' + a, tok: tok(String(v)), vis: visOf(el), ...meta, v: String(v).slice(0, 60) });
        }
        if (tag === 'input' && el.value && tok(String(el.value))) found.push({ where: 'input.value', tok: tok(String(el.value)), vis: visOf(el), ...meta, v: String(el.value).slice(0, 100) });
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    };
    walk(document, 0);
    const files = [...document.querySelectorAll('input[type="file"]')].map((el) => ({
      value: String(el.value || '').slice(0, 120), nFiles: el.files ? el.files.length : -1,
      vis: (() => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })(), html: el.outerHTML.slice(0, 160),
    }));
    const body = document.body.innerText || '';
    return { bodyHas: body.includes(n), bodyHasPrefix: body.includes(prefix), found: found.slice(0, 14), files };
  }, { n: ATTACH_NAME, prefix: ATTACH_PREFIX }).catch((e) => ({ err: String(e.message || e).slice(0, 150) }));

  // 连采 8s：文件名（全名或前缀）是否在界面出现过（bodyHas / 可见元素命中）
  const uiSamples = [];
  let uiShowsFile = false;
  for (let i = 0; i < 20; i++) {
    const s = await quickScan();
    if (s && !s.err) {
      uiSamples.push({ t: +(i * 0.4).toFixed(1), bodyHas: s.bodyHas, bodyHasPrefix: s.bodyHasPrefix, visHit: s.visHit, chips: s.chips, nFiles: s.nFiles });
      if (s.bodyHas || s.bodyHasPrefix || s.visHit) uiShowsFile = true;
    }
    await sleep(400);
  }
  const fileUi = await deepScanFileUi();
  const uiFullNameInUi = uiSamples.some((s) => s.bodyHas);
  const uiStemInUi = uiSamples.some((s) => (s.chips || []).length > 0 || !!s.visHit);
  log(`K5 uiShowsFile=${uiShowsFile} 全名入界面=${uiFullNameInUi} 词干/芯片入界面=${uiStemInUi} 芯片文本=${JSON.stringify(fileUi?.found?.[0]?.v ?? uiSamples[0]?.visHit?.text ?? null)}`);
  log('K5 fileUi=' + JSON.stringify(fileUi));
  log('K5 界面采样=' + JSON.stringify(uiSamples.filter((s, i) => i === 0 || i === 1 || i === uiSamples.length - 1)));
  log('K5 上传窗口内请求=' + JSON.stringify(net.slice(netBefore)));

  // 带附件发送 C
  const typedC = await typeText(TXT_C);
  log('K5 typedC=' + JSON.stringify(typedC.slice(0, 60)));
  await page.locator('div.send-button-container').first().click({ timeout: 8000 }).catch((e) => log('K5 sendC err ' + e.message.slice(0, 60)));
  const sentC = await waitFor(() => chatReqs.length > nReq2, 8000, 'C 单请求');
  await waitFor(() => resps.length > nResp2, 40000, 'C 单响应体');
  await sleep(2500);   // 留出可能的客户端重试窗口（实测出现过双发）
  const reqCands = chatReqs.slice(nReq2);
  const respCands = resps.slice(nResp2);
  const fileId = respCands.map((r) => (r.body.match(/"files":\s*\[\s*\{\s*"id":\s*"([^"]+)"/) || [])[1]).find(Boolean) || null;
  const reqHasName = reqCands.some((r) => r.text.includes(ATTACH_NAME));
  const reqHasFileId = !!fileId && reqCands.some((r) => r.text.includes(fileId));
  const reqWithFile = (fileId && reqCands.find((r) => r.text.includes(fileId))) || reqCands[reqCands.length - 1] || null;
  const fileBlock = (reqCands.map((r) => (r.text.match(/"file":\{[^}]*\}/) || [])[0]).find(Boolean)) || null;
  const reqNameCtx = reqCands.map((r) => r.text).find((t) => t.includes(ATTACH_NAME)) || '';
  const reqNameSnippet = reqNameCtx ? reqNameCtx.slice(Math.max(0, reqNameCtx.indexOf(ATTACH_NAME) - 240), reqNameCtx.indexOf(ATTACH_NAME) + 160) : '';
  const reqHead = reqWithFile ? reqWithFile.text.replace(/[^\x20-\x7E\u4e00-\u9fa5]+/g, ' ').slice(0, 300) : '';
  const respC = respCands.map((r) => r.body).find((b) => b.includes(ATTACH_NAME)) || respCands[0]?.body || '';
  const respHasName = respC.includes(ATTACH_NAME);
  const respNameCtx = respHasName ? respC.slice(Math.max(0, respC.indexOf(ATTACH_NAME) - 200), respC.indexOf(ATTACH_NAME) + 120).replace(/[^\x20-\x7E\u4e00-\u9fa5]+/g, ' ') : '';
  const filesFrameIdx = respC.indexOf('"mask":"chat.files"');
  const filesFrame = filesFrameIdx >= 0 ? respC.slice(Math.max(0, filesFrameIdx - 120), filesFrameIdx + 420).replace(/[^\x20-\x7E\u4e00-\u9fa5]+/g, ' ') : null;
  log(`K5 sentC=${sentC} posts=${reqCands.length} resps=${respCands.length} reqHasName=${reqHasName} reqHasFileId=${reqHasFileId} fileBlock=${JSON.stringify(fileBlock)} respHasName=${respHasName} fileId=${fileId}`);
  if (reqNameSnippet) log('K5 reqNameSnippet=' + JSON.stringify(reqNameSnippet.replace(/[^\x20-\x7E\u4e00-\u9fa5]+/g, ' ')));
  if (respNameCtx) log('K5 respNameCtx=' + JSON.stringify(respNameCtx));
  if (filesFrame) log('K5 filesFrame=' + JSON.stringify(filesFrame));
  // 发送后：等 DOM 稳定后看用户消息气泡里是否出现文件名
  await sleep(2500);
  const postSend = await quickScan();
  log('K5 发送后界面=' + JSON.stringify(postSend));
  result.upload = { fileInputs, uiShowsFile, uiFullNameInUi, uiStemInUi, uiSamples, fileUi, postSend, sentC, reqLen: reqWithFile?.len ?? null, reqHasName, reqHasFileId, reqHead, reqFull: reqWithFile?.text ?? null, respHasName, fileId, filesFrame, uploadWindowNet: net.slice(netBefore) };

  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2));
  log('PROBE16 DONE enter=' + enterSent + ' newChatId=' + result.newChat.newChatId + ' upload=' + uiShowsFile);
} catch (e) {
  result.errors.push(String(e?.message || e));
  log('PROBE16 FAILED: ' + String(e?.message || e));
  try { fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2)); } catch {}
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  log('browser closed, exit');
  process.exit(0);
}
