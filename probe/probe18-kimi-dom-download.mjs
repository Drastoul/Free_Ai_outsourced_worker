/**
 * 探针 18 —— K7（代码块「下载」按钮有无 + CDP 落盘）+ K9（多块答复的助手回合 DOM 结构与采集范围）
 *
 * 已证前提（勿重复取证）：答复正文块 = `div.paragraph`（out13:6）；用户消息类名含 user（out10/11）
 * 本探针要点：Kimi 助手回合里除正文外还有「思考过程」区（toolcall-rollup / thinking-container），
 *   其文本块同样是 `div.paragraph` ⇒ 分别验证「朴素采集」与「排除思考区后采集」两种口径的读数。
 * 流程：① 要一条「段落 + 代码块 + 段落」的多块答复 → 等响应体 + DOM 稳定
 *       ② K9：结构发现（助手回合容器链 / 正文块路径 / 思考区判定）→ 两种采集口径对照 → dom-answer.html
 *       ③ K7：找「下载」文案按钮（含 hover 复扫）→ 找到 ⇒ 点击 + 下载事件 + CDP 落盘复验（崩溃坑规避同 probe14）
 * 产物：probe/out18/（run.log + result.json + dom-answer.html）
 * 复跑：node probe/probe18-kimi-dom-download.mjs（约 1–2 分钟；无需人工；会在 Kimi 当前聊天追加 1 条消息）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out18');
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const watchdog = setTimeout(() => { log('WATCHDOG 硬超时（280s）'); process.exit(3); }, 280000);
watchdog.unref?.();

const EXPECT = '探针18 多块答复';
const CODE_NAME = 'kimi_probe18.py';
const ASK = `请严格按此格式回复，不要多余内容：第一行写「${EXPECT}」；然后写一句不超过 30 字的说明；然后给出一个 python 代码块（首行注释 # file: ${CODE_NAME}，内容为 print("kimi18")）；最后再写一句结尾。`;

let ctx, page;
const resps = [];
const chatReqBodies = [];
const result = { k9: {}, k7: {} };

const waitFor = async (fn, ms, step) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch {}
    await sleep(500);
  }
  log(`TIMEOUT 等 ${step} 超时（${ms}ms）`);
  return false;
};

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled',
      '--disable-features=msDownloadsHub,DownloadBubble,DownloadBubbleV2,EdgeDownloadsHub'],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  ctx.on('close', () => log('!! context closed（外部关闭）'));
  page.on('close', () => log('!! page closed'));
  page.on('crash', () => log('!! page crashed'));
  ctx.on('page', (p) => log('!! new page: ' + p.url().slice(0, 90)));
  page.on('download', (d) => log('DOWNLOAD event: ' + d.suggestedFilename()));
  log('browser launched（已禁用 downloads-hub 特性，规避 probe14 崩溃坑）');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SAVE_DIR, eventsEnabled: true });
  log('CDP 落盘目录 = ' + SAVE_DIR);

  page.on('response', (res) => {
    if (!/ChatService\/Chat$/.test(res.url())) return;
    res.text().then((t) => { resps.push({ len: t.length, body: t }); log('CHAT-RESP len=' + t.length); })
      .catch((e) => { resps.push({ len: -1, body: '' }); log('CHAT-RESP fail ' + e.message.slice(0, 60)); });
  });
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !/ChatService\/Chat$/.test(req.url())) return;
    let buf = null; try { buf = req.postDataBuffer(); } catch {}
    chatReqBodies.push(buf ? buf.toString('utf8') : (req.postData() || ''));
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
  await sleep(2500);

  const n0 = resps.length;
  const editor = page.locator('.chat-input-editor').first();

  // 模型状态复位（b3 探针轮曾把账号默认模型切到 K3；本轮先回到「快速」并对读菜单当前值）
  const readModelTrigger = () => page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const trig = [...document.querySelectorAll('[class*="current-model"]')].find(vis);
    return trig ? (trig.innerText || '').trim().slice(0, 40) : null;
  }).catch(() => null);
  const modelBefore = await readModelTrigger();
  log('模型当前值=' + JSON.stringify(modelBefore));
  if (modelBefore && !modelBefore.split('\n')[0].includes('快速')) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('[class*="current-model"]')].find((x) => x.getBoundingClientRect().width > 0);
      if (el) el.setAttribute('data-probe-open', 'm');
    });
    await page.locator('[data-probe-open="m"]').first().click({ timeout: 4000 }).catch((e) => log('model open err ' + e.message.slice(0, 60)));
    await sleep(1000);
    await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const el = [...document.querySelectorAll('div,span,p')].filter((x) => (x.innerText || '').trim() === '快速' && vis(x) && ![...x.children].some((c) => (c.innerText || '').trim()) && !x.closest('[class*="current-model"]')).pop();
      if (el) el.setAttribute('data-probe-ctl', '5');
    });
    await page.locator('[data-probe-ctl="5"]').first().click({ timeout: 4000 }).catch((e) => log('model pick err ' + e.message.slice(0, 60)));
    await sleep(1200);
    log('模型复位后=' + JSON.stringify(await readModelTrigger()));
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(400);
  }
  result.modelRestore = { before: modelBefore, after: await readModelTrigger() };
  log('模型状态=' + JSON.stringify(result.modelRestore));
  await editor.click({ timeout: 8000 });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(300);
  await page.keyboard.insertText(ASK);
  await sleep(600);
  await editor.press('Enter').catch((e) => log('enter err ' + e.message.slice(0, 60)));
  log('sent');
  await waitFor(() => resps.length > n0, 30000, '响应体');
  // 等 DOM 出现预期串（最多 30s），再等 4s 让尾块渲染
  await waitFor(() => page.evaluate((e) => (document.body.innerText || '').includes(e), EXPECT).catch(() => false), 30000, 'DOM 出现预期串');
  await sleep(4000);
  log('答复就绪');
  // K9 发送用的请求载荷（记录模型，确认已回默认）
  try {
    const reqBody = chatReqBodies[chatReqBodies.length - 1];
    if (reqBody) {
      const s = String(reqBody);
      const i = s.indexOf('{');
      let j = null;
      try { j = JSON.parse(s.slice(i)); } catch { const k = s.lastIndexOf('}'); try { j = JSON.parse(s.slice(i, k + 1)); } catch {} }
      result.k9Request = j ? { scenario: j.scenario, options: j.options, tools: (j.tools || []).map((t) => t.type) } : { head: s.slice(0, 120) };
      log('K9 请求载荷=' + JSON.stringify(result.k9Request));
    }
  } catch (e) { log('K9 载荷解析失败 ' + String(e.message).slice(0, 80)); }

  // ---------- ② K9：结构发现 + 两种采集口径 ----------
  const k9 = await page.evaluate((exp) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const cls = (el) => String(el.className || '').slice(0, 120);
    const pathOf = (el, n = 5) => { const p = []; let c = el; for (let i = 0; i < n && c; i++) { p.push(c.tagName.toLowerCase() + '.' + String(c.className || '').split(' ')[0]); c = c.parentElement; } return p.join('>'); };
    const inThink = (el) => !!el.closest('[class*="toolcall-content" i],[class*="thinking-container" i]');
    // 结构候选
    const structure = [...document.querySelectorAll('[class*="chat-content-item" i],[class*="segment" i]')].filter(vis).slice(-30)
      .map((el) => ({ cls: cls(el), len: (el.innerText || '').length, hasCopy: /复制/.test(el.innerText || ''), path: pathOf(el, 4) }));
    // 全部正文块（段落 + 代码）及路径 + 是否在思考区
    const paras = [...document.querySelectorAll('div.paragraph')].filter(vis)
      .map((el) => ({ text: (el.innerText || '').trim().slice(0, 60), think: inThink(el), path: pathOf(el, 5) }));
    const codes = [...document.querySelectorAll('.segment-code-content,pre')].filter(vis)
      .map((el) => ({ text: (el.innerText || '').trim().slice(0, 60), think: inThink(el), path: pathOf(el, 5) }));
    // 助手回合容器 = 最后一个含「复制」且有正文块的 segment-container / chat-content-item
    const turnCands = [...document.querySelectorAll('[class*="segment-container" i],[class*="chat-content-item" i],[class*="segment" i]')]
      .filter((el) => vis(el) && /复制/.test(el.innerText || '') && el.querySelector('div.paragraph'));
    const turn = turnCands[turnCands.length - 1] || null;
    // 口径 A（朴素）：回合内全部 paragraph + pre
    const naive = turn ? [...turn.querySelectorAll('div.paragraph,pre')].filter(vis).map((el) => (el.innerText || '').trim()) : [];
    // 口径 B（排除思考区）：非思考区的 paragraph + segment-code-content，按 DOM 顺序取块
    const aBlockEls = turn ? [...turn.querySelectorAll('div.paragraph,.segment-code-content')].filter((el) => vis(el) && !inThink(el)) : [];
    const aBlocks = aBlockEls.map((el) => ({ kind: el.matches('.segment-code-content') ? 'code' : 'para', text: (el.innerText || '').trim() }));
    const aParas = aBlocks.filter((b) => b.kind === 'para').map((b) => b.text);
    const aCodes = aBlocks.filter((b) => b.kind === 'code').map((b) => b.text);
    const turnText = turn ? (turn.innerText || '') : '';
    const html = turn ? turn.outerHTML.slice(0, 40000) : null;
    const userTurn = [...document.querySelectorAll('[class*="chat-content-item-user" i]')].filter(vis).slice(-1)[0] || null;
    return {
      structure, paras, codes,
      turnCls: turn ? cls(turn) : null, turnPath: turn ? pathOf(turn, 5) : null, turnTextLen: turnText.length,
      userTurnCls: userTurn ? cls(userTurn) : null,
      naive, naiveLen: naive.join('\n\n').length,
      answer: { paras: aParas, codes: aCodes, blocks: aBlocks, joined: aBlocks.map((b) => b.text).join('\n\n') },
      turnText: turnText.slice(0, 400),
      buttons: turn ? [...turn.querySelectorAll('button,[role="button"],span,div')].filter((el) => vis(el) && ['复制', '分享', '下载', '编辑', '重试'].includes((el.innerText || '').trim())).map((el) => (el.innerText || '').trim()).slice(0, 8) : [],
      html,
    };
  }, EXPECT).catch((e) => ({ err: String(e.message || e).slice(0, 150) }));
  result.k9 = k9;
  log('K9 结构候选=' + JSON.stringify((k9.structure || []).slice(-8).map((s) => `${s.cls}[len${s.len},copy${s.hasCopy}]`)));
  log('K9 助手回合容器=' + JSON.stringify(k9.turnCls) + ' path=' + JSON.stringify(k9.turnPath) + ' 文本长度=' + k9.turnTextLen);
  log('K9 用户回合容器=' + JSON.stringify(k9.userTurnCls));
  log('K9 段落块(全)=' + JSON.stringify((k9.paras || []).map((p) => `[${p.think ? 'think' : 'body'}]${p.text.slice(0, 30)}`)));
  log('K9 代码块(全)=' + JSON.stringify((k9.codes || []).map((p) => `[${p.think ? 'think' : 'body'}]${p.text.slice(0, 40)}`)));
  log('K9 朴素口径 len=' + k9.naiveLen + ' 头=' + JSON.stringify((k9.naive || []).slice(0, 3).map((t) => t.slice(0, 30))));
  log('K9 排除思考区口径 paras=' + JSON.stringify((k9.answer?.paras || []).map((t) => t.slice(0, 40))) + ' codes=' + JSON.stringify((k9.answer?.codes || []).map((t) => t.slice(0, 40))));
  log('K9 回合内按钮文案=' + JSON.stringify(k9.buttons));
  if (k9.html) fs.writeFileSync(path.join(OUT_DIR, 'dom-answer.html'), k9.html);

  const collected = k9.answer?.joined || '';
  const naiveText = (k9.naive || []).join('\n\n');
  const thinkBlocks = [...(k9.paras || []), ...(k9.codes || [])].filter((p) => p.think);
  result.k9Check = {
    answerLen: collected.length,
    answerHasExpect: collected.includes(EXPECT),
    answerHasCodeName: collected.includes(CODE_NAME),
    answerBlocks: (k9.answer?.blocks || []).length,   // 采集块数（全部经 !inThink 过滤的 DOM 顺序块）
    answerHasButtons: /复制|分享/.test(collected),
    answerHasUserAsk: collected.includes(ASK.slice(0, 12)),
    thinkBlockCount: thinkBlocks.length,
    // 结构性判定（不依赖语言）：朴素口径是否真的含了思考块文本
    naiveHasThinking: thinkBlocks.length > 0 && thinkBlocks.some((tb) => (k9.naive || []).some((n) => (n || '').startsWith(tb.text.slice(0, 20)))),
    naiveHasButtons: /复制|分享/.test(naiveText),
    turnTextHasButtons: /复制|分享/.test(k9.turnText || ''),
    collected,
  };
  log('K9 采集对照=' + JSON.stringify({ ...result.k9Check, collected: undefined }));

  // ---------- ③ K7：下载按钮（含 hover 复扫） ----------
  const scanDl = () => page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const hits = [...document.querySelectorAll('span,div,button,a')].filter((el) => (el.innerText || '').trim() === '下载' && vis(el));
    return hits.map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 70) }));
  }).catch(() => []);
  let dl = await scanDl();
  log('K7 下载按钮（静态）=' + JSON.stringify(dl));
  // hover 代码块与助手回合后再扫（有的平台 hover 才出按钮）
  const hoverTargets = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const code = [...document.querySelectorAll('.segment-code')].filter(vis).pop();
    const turn = [...document.querySelectorAll('[class*="segment-container" i]')].filter((el) => vis(el) && /复制/.test(el.innerText || '')).pop();
    if (code) code.setAttribute('data-hv', '1');
    if (turn) turn.setAttribute('data-hv', '2');
    return { code: !!code, turn: !!turn };
  });
  log('K7 hover 目标=' + JSON.stringify(hoverTargets));
  let afterHoverCode = null, afterHoverTurn = null;
  if (hoverTargets.code) { await page.locator('[data-hv="1"]').hover({ timeout: 4000 }).catch(() => {}); await sleep(800); afterHoverCode = await scanDl(); log('K7 hover 代码块后=' + JSON.stringify(afterHoverCode)); }
  if (hoverTargets.turn) { await page.locator('[data-hv="2"]').hover({ timeout: 4000 }).catch(() => {}); await sleep(800); afterHoverTurn = await scanDl(); log('K7 hover 助手回合后=' + JSON.stringify(afterHoverTurn)); }
  // 全页「下载」文案元素（含侧栏「下载桌面端」等，仅作对照，不算代码块下载按钮）
  const pageWide = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => (el.innerText || '').trim() === '下载').slice(0, 5).map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60) })));
  result.k7 = { static: dl, afterHoverCode, afterHoverTurn, pageWide };
  if (!dl.length) {
    log('K7 结论读数：无「下载」文案按钮（代码块头仅有「复制」）');
  } else {
    // 找到 ⇒ 点击 + CDP 落盘复验
    await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const el = [...document.querySelectorAll('span,div,button,a')].filter((x) => (x.innerText || '').trim() === '下载' && vis(x)).pop();
      const c = el.closest('[role="button"],button') ?? el;
      c.setAttribute('data-dl', '1');
    });
    await page.locator('[data-dl="1"]').first().click({ timeout: 5000 }).catch((e) => log('K7 click err ' + e.message.slice(0, 80)));
    const timeline = [];
    for (let i = 1; i <= 14; i++) {
      await sleep(1000);
      let alive = true, pages = -1, fsFiles = [];
      try { pages = ctx.pages().length; } catch { alive = false; }
      try { fsFiles = fs.readdirSync(SAVE_DIR); } catch {}
      timeline.push({ t: i, pages, alive, files: fsFiles });
      log(`K7 t+${i}s pages=${pages} alive=${alive} files=${JSON.stringify(fsFiles)}`);
      if (!alive) break;
    }
    const done = fs.readdirSync(SAVE_DIR).filter((f) => !f.endsWith('.crdownload'));
    result.k7.attempt = { timeline, completedFiles: done };
    log('K7 完整落盘=' + (done.length > 0));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2));
  log('PROBE18 DONE');
} catch (e) {
  log('PROBE18 FAILED: ' + String(e?.message || e));
  try { fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2)); } catch {}
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  log('browser closed, exit');
  process.exit(0);
}
