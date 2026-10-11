/**
 * 探针 20 —— b5 第 0 步探针 P2：Kimi 会话复用读数（批次档 §2「第 0 步探针」，T1）
 *
 * 问题：复用机制与平台无关（`capabilities.newChat !== false` 的适配器都在内），Kimi 复用是否安全必须取数、不得猜。
 *   · 判据（`docs/design/modules/adapters.md` §5）：第二次 `send` 是否仍命中
 *     `/kimi.gateway.chat.v1.ChatService/Chat` ∧ 答复完成（分帧 JSON 行流 `parseChatStream` 的 `finished=true`）。
 *   · 附读数（id 级比对）：两次请求体里的 `chat_id`（第 1 单为 null = 新会话由该单建立，故本探针不另点「新建会话」）
 *     与响应 `"chat":{"id":…}` 是否同一会话 ⇒ 「同会话复用」的直接证据。
 *   · 判定行：URL「逐字一致」与「是否命中现状匹配面」分两条（判据只键在命中面）；停止判据 = 页面文案线索 ∪
 *     匹配面主通道 HTTP ≥400（429 / 额度类）。
 *
 * 方法：只读复用 `.browser-profile` 登录态 → 打开 Kimi → **同一会话连续发送 2 单**（短 prompt）。
 * 产物：`probe/out20/run.log`、`probe/out20/result.json`
 * 复跑：`node probe/probe20-b5-kimi-session-reuse.mjs`（约 1–3 分钟；无需人工；会在 Kimi 当前会话内追加 2 条短消息）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { matchStreamUrl, parseChatStream } from '../src/engine/adapters/kimi-stream.mjs';

// 环境坑（照做）：Electron 语境下该变量会让 Playwright 的 msedge 启动路径异常
delete process.env.ELECTRON_RUN_AS_NODE;

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out20');
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
const watchdog = setTimeout(() => { log('WATCHDOG 硬超时（400s）'); process.exit(3); }, 400000);
watchdog.unref?.();

const KIMI_ORIGIN = 'https://www.kimi.com/';
const WAIT_RESP_MS = 120000;
// 风控 / 额度类线索（命中即停，如实报；词表命中会连同命中词一起记日志，便于人工复核）
const RISK_RE = /(429|too many requests|请求过于频繁|请求太频繁|操作过于频繁|额度不足|余额不足|已达上限|人机验证|安全验证|滑动验证|异常流量|访问受限|验证码)/i;

const result = {
  probe: 'probe20-b5-kimi-session-reuse（P2 Kimi 复用读数）',
  startedAt: new Date().toISOString(),
  sends: [], posts: [], verdict: {}, login: null, aborted: null, error: null,
};
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2));

const waitFor = async (fn, ms, step) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch { /* 轮询重试 */ }
    await sleep(400);
  }
  log(`TIMEOUT 等 ${step} 超时（${ms}ms）`);
  return false;
};

/** 请求体（分帧前缀 + JSON）→ 解析首个 JSON 对象（前缀含非 UTF-8 字节 ⇒ 从首个 { 起解析） */
const parseFramed = (body) => {
  const s = String(body ?? '');
  const i = s.indexOf('{');
  if (i < 0) return null;
  const raw = s.slice(i);
  try { return JSON.parse(raw); } catch { /* 尾部可能带帧后缀 */ }
  try { return JSON.parse(raw.slice(0, Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']')) + 1)); } catch { return null; }
};

const riskHit = (text) => {
  const m = String(text ?? '').match(RISK_RE);
  return m ? m[0] : null;
};

let ctx, page;
const posts = [];
const resps = [];
const httpErrors = []; // 匹配面主通道的 HTTP ≥400 读数（停止判据之一）

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  ctx.on('close', () => log('!! context closed（外部关闭）'));
  log('browser launched');
  log('RUN START ' + new Date().toISOString());

  // 请求面读数：URL 全量（含查询串）+ 现状匹配面命中判定 + 请求体 chat_id（自证用）
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const url = req.url();
    if (!url.startsWith(KIMI_ORIGIN)) return;
    const entry = { at: +Date.now() - T0, url, matched: matchStreamUrl(url), chatId: null, scenario: null, keys: null };
    try {
      const j = parseFramed(req.postData() ?? '');
      if (j) { entry.keys = Object.keys(j).slice(0, 8); entry.chatId = j.chat_id ?? null; entry.scenario = j.scenario ?? null; }
    } catch { /* 非 JSON 载荷：只留 URL 读数 */ }
    posts.push(entry);
    log(`POST[${posts.length}] url=${url} match=${entry.matched} chat_id=${entry.chatId === null ? 'null' : (entry.chatId ?? 'n/a')}`);
  });

  // 答复面读数：现状匹配面命中的响应 → parseChatStream（引擎主通道同款纯函数）+ 响应内 chat.id
  page.on('response', (res) => {
    const url = res.url();
    if (!url.startsWith(KIMI_ORIGIN) || res.request().method() !== 'POST') return;
    const entry = { at: +Date.now() - T0, url, matched: matchStreamUrl(url), status: res.status(), len: null, events: null, finished: null, thinkingLen: null, text: '', chatId: null, err: null };
    resps.push(entry);
    if (entry.matched && entry.status >= 400) {
      httpErrors.push({ at: entry.at, url, status: entry.status });
      log(`!! HTTP ${entry.status}（匹配面主通道）—— 计入停止判据`);
    }
    res.text().then((t) => {
      const parsed = parseChatStream(t);
      entry.len = t.length; entry.events = parsed.events; entry.finished = parsed.finished; entry.thinkingLen = parsed.thinking.length; entry.text = parsed.text.slice(0, 2000);
      entry.chatId = (t.match(/"chat":\s*\{[^}]*?"id":\s*"([0-9a-fA-F-]{8,})"/) || [])[1] || null;
      log(`RESP url=${url} status=${entry.status} len=${t.length} events=${parsed.events} finished=${parsed.finished} answerLen=${parsed.text.length} thinkingLen=${parsed.thinking.length} chatId=${entry.chatId ?? 'n/a'}`);
    }).catch((e) => { entry.err = String(e?.message || e).slice(0, 120); log(`RESP fail url=${url} ${entry.err}`); });
  });

  await page.goto(KIMI_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('goto ok');
  const editorOk = await waitFor(() => page.locator('.chat-input-editor').count().then((n) => n > 0), 30000, '输入框（.chat-input-editor）');
  // 登录态读数：账号区可能晚于编辑器渲染 ⇒ 轮询到任一信号出现（或 8s 上限）再落读数（避免把「渲染中」当成「无信号」）
  const readLogin = () => page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
    const trigger = document.querySelector('button.user-profile-trigger');
    const loginEntry = [...document.querySelectorAll('div,span,button,a,p,li,h1,h2,h3')]
      .some((el) => ['登录', '登录以同步历史会话'].includes(norm(el.innerText || el.textContent)) && vis(el));
    return { profileTrigger: !!trigger && vis(trigger), loginEntry, editor: !!document.querySelector('.chat-input-editor'), url: location.href };
  }).catch(() => null);
  const tLogin = Date.now();
  let loginSnap = await readLogin();
  while (!(loginSnap?.profileTrigger || loginSnap?.loginEntry) && Date.now() - tLogin < 8000) {
    await sleep(500);
    loginSnap = await readLogin();
  }
  result.login = { ...(loginSnap ?? {}), waitedMs: Date.now() - tLogin, settled: !!(loginSnap?.profileTrigger || loginSnap?.loginEntry) };
  log('editor present=' + editorOk + ' 登录读数=' + JSON.stringify(result.login));
  save();
  if (!editorOk) throw new Error('编辑器未出现（登录态可能丢失 / 需人工过验证码）——本探针不猜测结论');

  const editor = page.locator('.chat-input-editor').first();

  /** 单次发送 + 读数（URL 全量 / chat_id / 答复完成标记 / 答复长度 / 取样来源） */
  const sendOnce = async (tag, text) => {
    const p0 = posts.length;
    const t0 = Date.now();
    await editor.click({ timeout: 8000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await sleep(300);
    await page.keyboard.insertText(text);
    await sleep(700);
    const landed = await page.evaluate(() => (document.querySelector('.chat-input-editor')?.innerText || '').trim()).catch(() => '');
    log(`SEND[${tag}] 落字=${landed.includes(text.slice(0, 10))} prompt=${JSON.stringify(text.slice(0, 40))}`);
    await page.locator('div.send-button-container').first().click({ timeout: 8000 }).catch(async (e) => {
      log(`SEND[${tag}] 发送按钮点击失败（${String(e?.message || e).slice(0, 80)}），改用 Enter 兜底`);
      await editor.press('Enter').catch(() => {});
    });

    const gotReq = await waitFor(() => posts.length > p0, 20000, `${tag} 请求`);
    let post = null;
    if (gotReq) {
      await sleep(1500); // 观测窗：同窗口若还有第二笔请求，一并留痕
      const windowPosts = posts.slice(p0);
      post = windowPosts.find((p) => p.matched) ?? windowPosts[0] ?? null; // 优先现状匹配面命中的那一笔
    }
    let resp = null;
    if (gotReq) {
      await waitFor(() => resps.some((r) => r.url === post.url && r.at >= t0 - T0 && r.len !== null), WAIT_RESP_MS, `${tag} 响应（parseChatStream 完成）`);
      resp = resps.filter((r) => r.url === post.url && r.at >= t0 - T0).pop() ?? null;
    }
    const domText = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const turns = [...document.querySelectorAll('div.chat-content-item.chat-content-item-assistant')].filter(vis);
      const turn = turns[turns.length - 1];
      return turn ? (turn.innerText || '').trim() : '';
    }).catch(() => '');
    const bodyTail = await page.evaluate(() => (document.body?.innerText || '').slice(-4000)).catch(() => '');
    // 停止判据 = 页面文案线索 ∪ 匹配面主通道 HTTP 状态（响应体不进页面文本，故须按状态判）
    const httpRisk = resp && resp.status >= 400 ? `HTTP ${resp.status}` : null;
    const risk = riskHit(bodyTail) ?? httpRisk;

    const rec = {
      tag, at: +Date.now() - T0, ms: Date.now() - t0,
      prompt: text,
      url: post?.url ?? null, matched: post?.matched ?? null, chatId: post?.chatId ?? null, reqKeys: post?.keys ?? null,
      resp: resp ? { status: resp.status, len: resp.len, events: resp.events, finished: resp.finished, thinkingLen: resp.thinkingLen ?? null, chatId: resp.chatId, err: resp.err } : null,
      answerSource: resp ? 'stream(parseChatStream)' : (domText ? 'dom(末回合对照)' : null),
      answer: resp?.text ?? '', answerLen: resp?.text?.length ?? null, answerHead: (resp?.text ?? domText).slice(0, 60),
      thinkingLen: resp?.thinkingLen ?? null,
      domLen: domText.length, risk,
    };
    result.sends.push(rec);
    log(`SEND[${tag}] url=${rec.url} matched=${rec.matched} chat_id=${rec.chatId === null ? 'null' : (rec.chatId ?? '未捕获')}`);
    log(`SEND[${tag}] finished=${rec.resp?.finished ?? '未取到'} answerLen=${rec.answerLen ?? '未取到'} thinkingLen=${rec.thinkingLen ?? '未取到'} domLen=${domText.length} 取值来源=${rec.answerSource ?? '未取到'} 响应chat.id=${rec.resp?.chatId ?? '未取到'}`);
    if (!resp) log(`SEND[${tag}] 读数未取到：${gotReq ? '响应未捕获（完成标记 / 长度不可判）' : '请求未捕获（URL / 会话 id 不可判）'}`);
    if (risk) log(`SEND[${tag}] 风控/额度/HTTP 线索命中=「${risk}」`);
    save();
    return { risk };
  };

  const r1 = await sendOnce('S1', '探针20 第1次：请只回复两个字「收到」。');
  if (!r1.risk) {
    const r2 = await sendOnce('S2', '探针20 第2次：请只回复两个字「好的」。');
    if (r2.risk) result.aborted = `风控/额度线索：${r2.risk}`;
  } else {
    result.aborted = `风控/额度线索：${r1.risk}`;
    log('ABORT —— 命中风控/额度线索，停止后续发送（如实报，不重试）');
  }

  // ---------- 判定（逐单读数 → 判定行） ----------
  const sends = result.sends.filter((s) => s.url);
  const urls = sends.map((s) => s.url);
  const urlAllSame = urls.length >= 2 && urls.every((u) => u === urls[0]);
  const matchAll = sends.length > 0 && sends.every((s) => s.matched === true);
  const finishedAll = sends.length >= 2 && sends.every((s) => s.resp?.finished === true);
  const s1RespChatId = sends[0]?.resp?.chatId ?? null;
  const s2ReqChatId = sends[1]?.chatId ?? null;
  // 复用判定取严：第 2 单请求体里的 chat_id 必须等于第 1 单响应给出的会话 id（新建会话不满足该式）
  const idConsistent = !!(s2ReqChatId && s1RespChatId && s2ReqChatId === s1RespChatId);

  result.verdict = {
    urlFace: { allSame: urlAllSame, allMatched: matchAll, urls: [...new Set(urls)], matchStreamUrl: matchAll ? '命中（D7 同形处置不触发：kimi-stream.mjs 的 matchStreamUrl 不动）' : '存在未命中（Kimi 侧需验并处置匹配面）' },
    session: { s1ReqChatId: sends[0]?.chatId ?? null, s1RespChatId, s2ReqChatId, s2RespChatId: sends[1]?.resp?.chatId ?? null, consistent: idConsistent },
    finishedAll,
    httpErrors: httpErrors.length ? httpErrors : null,
  };

  log('================ 判定行 ================');
  log(`判定-URL逐字一致：${urlAllSame ? '是（第 2 单与第 1 单逐字一致）' : '否（存在不同 URL）'}`);
  log(`判定-URL面（是否命中现状匹配面 /kimi.gateway.chat.v1.ChatService/Chat）：${matchAll ? '不变（逐单全部命中）' : '变化（存在未命中）'}`);
  if (result.verdict.urlFace.urls.length) log(`  URL 全量：${result.verdict.urlFace.urls.join(' | ')}`);
  log(`判定-chat_id：${idConsistent ? '一致' : (s2ReqChatId ? '不一致' : '未取到足够读数')} —— 第 1 单请求=${sends[0]?.chatId === null ? 'null' : (sends[0]?.chatId ?? '未取到')}；第 1 单响应=${s1RespChatId ?? '未取到'}；第 2 单请求=${s2ReqChatId ?? '未取到'}；第 2 单响应=${sends[1]?.resp?.chatId ?? '未取到'}`);
  log(`判定-答复完成：${finishedAll ? '两单 finished=true' : '存在 finished≠true（读数见 result.json）'}`);
  log(`PROBE20 DONE sends=${sends.length} aborted=${result.aborted ?? '无'}`);
} catch (e) {
  result.error = String(e?.stack || e);
  log('PROBE20 FAILED: ' + String(e?.message || e));
  if (!result.verdict?.urlFace) log('判定行：未取到 —— 卡点见上方 FAILED 行（不猜测结论）');
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  result.posts = posts; // 全部 POST 读数（含未命中现状匹配面的 URL 全量）随产物落盘
  save();
  log('browser closed, exit');
  process.exit(result.error ? 1 : 0);
}
