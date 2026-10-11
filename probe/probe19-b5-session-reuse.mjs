/**
 * 探针 19 —— b5 第 0 步探针 P1：DeepSeek 会话复用直验（批次档 §2「第 0 步探针」，T1）
 *
 * 问题（决定条件项 D7）：同一 DeepSeek 会话内连续两次发送，「复用后」的请求 URL 面是否变化。
 *   · 不变 ⇒ `src/engine/adapters/deepseek-stream.mjs` 的 `matchStreamUrl`（`/api/v0/chat/completion`）不动（D7 不触发）；
 *   · 变化 ⇒ 走 T2 条件项 D7（扩匹配面）。
 *
 * 方法：只读复用 `.browser-profile` 登录态 → 打开 DeepSeek → 新会话 → **同一会话连续发送 8 单**（短 prompt；
 *   每单记请求 URL 全量 + `chat_session_id` + `parent_message_id` + 答复完成标记 + 答复长度，答复取值 = SSE
 *   主通道 `parseSSE`，DOM 末块作对照）→ idle 60s → 再发 1 单（⑧ 的「idle 60s 后仍可用」下界读数）。
 *
 * 判据（逐单读数 + 判定行）：
 *   · URL 面：「逐字一致」与「是否命中现状匹配面」分两条判定行（D7 只键在命中面）。
 *   · 会话 id：全部非空 `chat_session_id` 是否同值（第 1 单可能为空 = 新会话尚未建立）⇒「判定-chat_session_id：一致/不一致」。
 *   · ② 上下文上限（有界探测）：8 连发中首次「取到读数且 finished≠true」的 k；8/8 完成 ⇒ 「上限未探到」（未捕获单另行披露）。
 *   · ⑧ 下界：idle 60s 后同会话再发仍可用（finished=true）。
 *   · 停止判据：页面文案线索 ∪ 匹配面主通道 HTTP ≥400（429 / 额度类；响应体不进页面文本，故须按状态判）。
 *
 * 产物：`probe/out19/run.log`、`probe/out19/result.json`
 * 复跑：`node probe/probe19-b5-session-reuse.mjs`（约 3–5 分钟；无需人工；会在 DeepSeek 当前会话内追加 9 条短消息）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { matchStreamUrl, parseSSE } from '../src/engine/adapters/deepseek-stream.mjs';

// 环境坑（照做）：Electron 语境下该变量会让 Playwright 的 msedge 启动路径异常
delete process.env.ELECTRON_RUN_AS_NODE;

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out19');
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
const watchdog = setTimeout(() => { log('WATCHDOG 硬超时（540s）'); process.exit(3); }, 540000);
watchdog.unref?.();

const SEND_N = 8;           // ② 有界探测：同会话连发 8 单
const IDLE_MS = 60000;      // ⑧ 下界：idle 60s
const WAIT_RESP_MS = 90000; // 单次答复等待上限（out4 实测 8.1–8.3s；90s 足够，且总时长受 watchdog 约束）
const DEEPSEEK_ORIGIN = 'https://chat.deepseek.com/';
// 风控 / 额度类线索（命中即停，如实报；词表命中会连同命中词一起记日志，便于人工复核）
const RISK_RE = /(429|too many requests|请求过于频繁|请求太频繁|操作过于频繁|额度不足|余额不足|额度已满|已达上限|人机验证|安全验证|滑动验证|异常流量|访问受限|验证码|please verify)/i;

const result = {
  probe: 'probe19-b5-session-reuse（P1 DeepSeek 复用直验）',
  startedAt: new Date().toISOString(),
  sends: [], posts: [], verdict: {}, aborted: null, error: null,
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

/** 风控 / 额度线索检查（页面尾部文本 + 指定文本） */
const riskHit = (text) => {
  const m = String(text ?? '').match(RISK_RE);
  return m ? m[0] : null;
};

let ctx, page;
const posts = [];   // 全部 POST（URL 全量 + 是否命中现状匹配面 + 请求体派生字段；不存原始载荷）
const resps = [];   // 答复流响应（parseSSE 读数）
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

  // 请求面读数：URL 全量（含查询串）+ 现状匹配面命中判定 + chat_session_id（自证用）
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const url = req.url();
    if (!url.startsWith(DEEPSEEK_ORIGIN)) return;
    const entry = { at: +Date.now() - T0, url, matched: matchStreamUrl(url), sessionId: null, parentId: null, keys: null, toggles: null };
    try {
      const j = JSON.parse(req.postData() ?? '');
      entry.keys = Object.keys(j).slice(0, 8);
      entry.sessionId = j.chat_session_id ?? null;
      entry.parentId = j.parent_message_id ?? null;
      // 开关实值（读键同 src/engine/adapters/deepseek.mjs 的 requestPayload.toggles）⇒ 供解读正文通道读数
      entry.toggles = { thinking: j.thinking_enabled ?? null, search: j.search_enabled ?? null };
    } catch { /* 非 JSON 载荷：只留 URL 读数 */ }
    posts.push(entry);
    log(`POST[${posts.length}] url=${url} match=${entry.matched} chat_session_id=${entry.sessionId === null ? 'null' : (entry.sessionId ?? 'n/a')}`);
  });

  // 答复面读数：现状匹配面命中的响应 → parseSSE（引擎主通道同款纯函数）
  page.on('response', (res) => {
    const url = res.url();
    if (!url.startsWith(DEEPSEEK_ORIGIN) || res.request().method() !== 'POST') return;
    const entry = { at: +Date.now() - T0, url, matched: matchStreamUrl(url), status: res.status(), len: null, events: null, finished: null, thinkingLen: null, text: '', err: null };
    resps.push(entry);
    if (entry.matched && entry.status >= 400) {
      httpErrors.push({ at: entry.at, url, status: entry.status });
      log(`!! HTTP ${entry.status}（匹配面主通道）—— 计入停止判据`);
    }
    res.text().then((t) => {
      const parsed = parseSSE(t);
      entry.len = t.length; entry.events = parsed.events; entry.finished = parsed.finished; entry.thinkingLen = parsed.thinking.length; entry.text = parsed.text.slice(0, 2000);
      const sid = (t.match(/"chat_session_id"\s*:\s*"([^"]+)"/) || [])[1] || null;
      entry.sessionIdInBody = sid;
      log(`RESP url=${url} status=${entry.status} len=${t.length} events=${parsed.events} finished=${parsed.finished} answerLen=${parsed.text.length} thinkingLen=${parsed.thinking.length} respSessionId=${sid ?? 'n/a'}`);
    }).catch((e) => { entry.err = String(e?.message || e).slice(0, 120); log(`RESP fail url=${url} ${entry.err}`); });
  });

  await page.goto(DEEPSEEK_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);
  const editorOk = await waitFor(() => page.locator('textarea').count().then((n) => n > 0), 30000, '输入框（textarea）');
  log('editor present=' + editorOk);
  if (!editorOk) throw new Error('输入框未出现（登录态可能失效 / 页面改版）');

  // 新会话（判据前置：本探针的第一单即该会话的第一条消息）
  const nc = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,button,a,span')].find(
      (e) => (e.innerText || '').trim() === '开启新对话' && e.getBoundingClientRect().width > 0,
    );
    if (!el) return false;
    el.setAttribute('data-probe-newchat', '1');
    return true;
  }).catch(() => false);
  if (nc) { await page.locator('[data-probe-newchat="1"]').first().click({ timeout: 6000 }).catch(() => {}); await sleep(2500); }
  log('新会话元素=' + nc + '（未找到 ⇒ 沿用当前会话，第一单读数仍有效）');
  result.newChatClicked = nc;
  save();

  /** 单次发送 + 读数（URL 全量 / chat_session_id / 答复完成标记 / 答复长度 / 取样来源） */
  const sendOnce = async (tag, text) => {
    const p0 = posts.length;
    const t0 = Date.now();
    const input = page.locator('textarea').first();
    await input.click({ timeout: 10000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(text);
    await sleep(300);
    const landed = await input.inputValue().catch(() => '');
    log(`SEND[${tag}] 落字=${landed.includes(text.slice(0, 10))} prompt=${JSON.stringify(text.slice(0, 40))}`);
    await input.press('Enter');

    const gotReq = await waitFor(() => posts.length > p0, 20000, `${tag} 请求`);
    let post = null;
    let extraPosts = [];
    if (gotReq) {
      await sleep(1500); // 观测窗：同窗口若还有第二笔请求（重试 / 预抢占），一并留痕
      const windowPosts = posts.slice(p0);
      post = windowPosts.find((p) => p.matched) ?? windowPosts[0] ?? null; // 优先现状匹配面命中的那一笔
      extraPosts = windowPosts.filter((p) => p !== post);
    }
    let resp = null;
    if (gotReq) {
      await waitFor(() => resps.some((r) => r.url === post.url && r.at >= t0 - T0 && r.len !== null), WAIT_RESP_MS, `${tag} 响应（parseSSE 完成）`);
      resp = resps.filter((r) => r.url === post.url && r.at >= t0 - T0).pop() ?? null;
    }
    const domText = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="ds-markdown"]')];
      const el = els[els.length - 1];
      return el ? (el.innerText || '').trim() : '';
    }).catch(() => '');
    const bodyTail = await page.evaluate(() => (document.body?.innerText || '').slice(-4000)).catch(() => '');
    // 停止判据 = 页面文案线索 ∪ 匹配面主通道 HTTP 状态（响应体不进页面文本，故须按状态判）
    const httpRisk = resp && resp.status >= 400 ? `HTTP ${resp.status}` : null;
    const risk = riskHit(domText + '\n' + bodyTail) ?? httpRisk;

    const rec = {
      tag, at: +Date.now() - T0, ms: Date.now() - t0,
      prompt: text,
      url: post?.url ?? null, matched: post?.matched ?? null,
      sessionId: post?.sessionId ?? null, parentId: post?.parentId ?? null, reqKeys: post?.keys ?? null, reqToggles: post?.toggles ?? null,
      extraPosts: extraPosts.map((p) => ({ url: p.url, matched: p.matched, sessionId: p.sessionId })),
      resp: resp ? { status: resp.status, len: resp.len, events: resp.events, finished: resp.finished, thinkingLen: resp.thinkingLen ?? null, sessionIdInBody: resp.sessionIdInBody ?? null, err: resp.err } : null,
      answerSource: resp ? 'sse(parseSSE)' : (domText ? 'dom(末块对照)' : null),
      answer: resp?.text ?? '', answerLen: resp?.text?.length ?? null, answerHead: (resp?.text ?? domText).slice(0, 60),
      thinkingLen: resp?.thinkingLen ?? null,
      domLen: domText.length, risk,
    };
    result.sends.push(rec);
    log(`SEND[${tag}] url=${rec.url} matched=${rec.matched} sessionId=${rec.sessionId === null ? 'null' : (rec.sessionId ?? '未捕获')} parentId=${rec.parentId ?? 'null'} 开关实值=${JSON.stringify(rec.reqToggles ?? '未捕获')}`);
    log(`SEND[${tag}] finished=${rec.resp?.finished ?? '未取到'} answerLen=${rec.answerLen ?? '未取到'} thinkingLen=${rec.thinkingLen ?? '未取到'} domLen=${domText.length} 取值来源=${rec.answerSource ?? '未取到'}`);
    if (!resp) log(`SEND[${tag}] 读数未取到：${gotReq ? '响应未捕获（完成标记 / 长度不可判）' : '请求未捕获（URL / 会话 id 不可判）'}`);
    if (risk) log(`SEND[${tag}] 风控/额度/HTTP 线索命中=「${risk}」`);
    save();
    return { risk };
  };

  for (let i = 1; i <= SEND_N; i++) {
    const r = await sendOnce(`S${i}`, `探针19 第${i}次：请只回复两个字「收到」。`);
    if (r.risk) { result.aborted = `风控/额度线索：${r.risk}`; log('ABORT —— 命中风控/额度线索，停止后续发送（如实报，不重试）'); break; }
  }

  if (!result.aborted) {
    log(`IDLE ${IDLE_MS / 1000}s 开始（⑧ 下界读数）`);
    await sleep(IDLE_MS);
    log(`IDLE ${IDLE_MS / 1000}s 结束`);
    const r = await sendOnce('S9-idle60s', '探针19 idle 之后：请只回复两个字「收到」。');
    if (r.risk) result.aborted = `风控/额度线索：${r.risk}`;
  }

  // ---------- 判定（逐单读数 → 判定行） ----------
  const sends = result.sends.filter((s) => s.url);
  const urls = sends.map((s) => s.url);
  const urlAllSame = urls.length >= 2 && urls.every((u) => u === urls[0]);
  const matchAll = sends.length > 0 && sends.every((s) => s.matched === true);
  const idsAll = sends.map((s) => s.sessionId).filter((x) => x != null && x !== '');
  const idConsistent = idsAll.length > 0 && idsAll.every((x) => x === idsAll[0]); // 全部非空 id 同值（含第 1 单；第 1 单为空则不参与）
  const firstBatch = result.sends.filter((s) => /^S\d+$/.test(s.tag) && s.url);
  const uncaptured = firstBatch.filter((s) => !s.resp).length;
  // 只把「取到读数且未完成」计为首次失败 / 截断；未取到的单另行披露（未读数不得写成结论）
  const firstBad = firstBatch.findIndex((s) => s.resp && s.resp.finished !== true);
  const idleSend = sends.find((s) => s.tag === 'S9-idle60s') ?? null;

  result.verdict = {
    urlFace: { allSame: urlAllSame, allMatched: matchAll, urls: [...new Set(urls)], matchStreamUrl: matchAll ? '命中（D7 不触发：deepseek-stream.mjs 的 matchStreamUrl 不动）' : '存在未命中（D7 触发：需扩匹配面）' },
    sessionId: { first: sends[0]?.sessionId ?? null, allIds: [...new Set(idsAll)], consistent: idConsistent },
    contextLimit: firstBad === -1 ? `N=${firstBatch.length} 单全部 finished=true（未捕获 ${uncaptured} 单）⇒ 上限未探到（默认维持 5）` : `第 ${firstBad + 1} 单首次 finished≠true ⇒ k=${firstBad + 1}（有效单 ${firstBatch.length}、未捕获 ${uncaptured}）`,
    idle60s: idleSend ? { finished: idleSend.resp?.finished ?? null, sessionId: idleSend.sessionId, usable: idleSend.resp?.finished === true } : null,
    httpErrors: httpErrors.length ? httpErrors : null,
  };

  log('================ 判定行 ================');
  log(`判定-URL逐字一致：${urlAllSame ? '是（第 2 单起与第 1 单逐字一致）' : '否（存在不同 URL）'}`);
  log(`判定-URL面（是否命中现状匹配面 /api/v0/chat/completion）：${matchAll ? '不变（逐单全部命中）' : '变化（存在未命中）'}`);
  if (result.verdict.urlFace.urls.length) log(`  URL 全量：${result.verdict.urlFace.urls.join(' | ')}`);
  log(`判定-chat_session_id：${idConsistent ? '一致' : (idsAll.length ? '不一致' : '未取到足够读数')} —— 第 1 单=${sends[0]?.sessionId === null ? 'null' : (sends[0]?.sessionId ?? '未取到')}；全部非空 id=${idsAll.length ? [...new Set(idsAll)].join(' / ') : '未取到'}`);
  log(`判定-D7：${matchAll ? '不触发（stream.match 保持现状）' : '触发（需扩 deepseek-stream.mjs 的 matchStreamUrl）'}`);
  log(`判定-上下文上限②：${result.verdict.contextLimit}`);
  log(`判定-idle60s 下界⑧：${idleSend ? (idleSend.resp?.finished === true ? `可用（finished=true，sessionId=${idleSend.sessionId ?? '未捕获'}）` : '不可用（finished≠true）') : '未执行'}`);
  log(`PROBE19 DONE sends=${sends.length} aborted=${result.aborted ?? '无'}`);
} catch (e) {
  result.error = String(e?.stack || e);
  log('PROBE19 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  result.posts = posts; // 全部 POST 读数（含未命中现状匹配面的 URL 全量）随产物落盘
  save();
  log('browser closed, exit');
  process.exit(result.error ? 1 : 0);
}
