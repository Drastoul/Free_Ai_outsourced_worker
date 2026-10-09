/**
 * 探针 1 ——「免费外包」可行性实测（DeepSeek 网页版）
 *
 * 目的（一次跑完，取证 + 采集真实选择器）：
 *   ① Playwright 能否驱动本机 Edge 打开 chat.deepseek.com（零浏览器下载）
 *   ② 登录态：是否需要人工登录；人工登录后能否自动继续
 *   ③ 发送一条消息：输入框 / 发送钮的真实选择器
 *   ④ 取回回复：消息块的真实选择器 + "答完了"的判定方式
 *   ⑤ 网络面：聊天接口 URL + 能否从响应体里读到完整答复（决定后续是否走"读流"方案）
 *   ⑥ 下载面：浏览器下载能否被拦截落盘（后续"取文件"的地基）
 *
 * 产物：probe/out/run.log（全程日志）、probe/out/discovery.json（结构化发现）、
 *       probe/out/answer.md（抓到的回复原文）、probe/out/downloads/（拦截到的下载）
 *
 * 用法：npm run probe:deepseek   （首次会在弹出的 Edge 窗口里要求人工登录一次）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out');
const DL_DIR = path.join(OUT_DIR, 'downloads');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(DL_DIR, { recursive: true });

const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const disc = {
  startedAt: new Date().toISOString(),
  site: 'chat.deepseek.com',
  ui: null, login: null, sends: [], network: [], wire: {}, downloads: [],
  answer: null, error: null,
};
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'discovery.json'), JSON.stringify(disc, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TEST_MESSAGE = '请只回复这一句话，不要有其他内容：探针测试成功';
const LOGIN_WORDS = ['登录', '登入', 'Log in', 'Sign in', 'Sign up'];
const INPUT_SELECTORS = ['#chat-input', 'textarea', 'div[contenteditable="true"]'];
const ANSWER_SELECTORS = ['[class*="ds-markdown"]', '[class*="markdown"]', '[class*="message"]'];

async function firstVisible(page, selectors) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      if (await loc.isVisible()) return { sel, loc };
    } catch {}
  }
  return null;
}

/** 页面态快照：输入框台账 + 按钮台账 + 登录线索 + 消息块候选 */
async function snapshot(page) {
  return await page.evaluate(({ INPUT_SELECTORS, ANSWER_SELECTORS, LOGIN_WORDS }) => {
    const elInfo = (el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        cls: (el.className || '').toString().slice(0, 140),
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        visible: r.width > 0 && r.height > 0,
      };
    };
    const bodyText = document.body.innerText || '';
    return {
      url: location.href,
      title: document.title,
      bodyHead: bodyText.slice(0, 400),
      loginHints: LOGIN_WORDS.filter((w) => bodyText.includes(w)),
      inputs: INPUT_SELECTORS.flatMap((s) => [...document.querySelectorAll(s)].map(elInfo)).slice(0, 10),
      buttons: [...document.querySelectorAll('button,[role="button"]')].slice(0, 60).map((el) => ({
        ...elInfo(el), text: (el.innerText || '').trim().slice(0, 30),
      })),
      answerCandidates: ANSWER_SELECTORS.map((s) => ({
        sel: s, count: document.querySelectorAll(s).length,
        lastTextLen: (() => { const n = document.querySelectorAll(s); const l = n[n.length - 1]; return l ? (l.innerText || '').trim().length : 0; })(),
      })),
    };
  }, { INPUT_SELECTORS, ANSWER_SELECTORS, LOGIN_WORDS });
}

/** 取最后一个"答复块"的文本（按候选选择器顺序试） */
async function lastAnswer(page) {
  return await page.evaluate((ANSWER_SELECTORS) => {
    for (const s of ANSWER_SELECTORS) {
      const els = [...document.querySelectorAll(s)];
      if (!els.length) continue;
      const t = (els[els.length - 1].innerText || '').trim();
      if (t) return { sel: s, text: t };
    }
    return null;
  }, ANSWER_SELECTORS);
}

/** 发送：点输入框 → 填文本 → 找发送钮点 / 否则回车 */
async function send(page, input, text) {
  const rec = { at: Date.now() - T0, sel: input.sel, mode: null, ok: false, note: null };
  try {
    await input.loc.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(text);
    await sleep(400);
    const landed = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      return (el.value !== undefined ? el.value : el.innerText) || '';
    }, input.sel);
    rec.landed = landed;
    if (!String(landed).includes('探针')) {
      // 兜底：逐字敲（更慢但更接近真人）
      await input.loc.click();
      await page.keyboard.type(text, { delay: 25 });
      rec.mode = 'type';
    } else {
      rec.mode = 'insertText';
    }
    const sendBtn = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('button,[role="button"],div[class*="send"]')];
      const hit = cands.find((el) => {
        const s = ((el.getAttribute('aria-label') || '') + ' ' + (el.className || '') + ' ' + (el.innerText || '')).toLowerCase();
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && /send|发送/.test(s);
      });
      if (!hit) return null;
      hit.setAttribute('data-probe-send', '1');
      return { aria: hit.getAttribute('aria-label'), cls: (hit.className || '').toString().slice(0, 100) };
    });
    if (sendBtn) {
      await page.locator('[data-probe-send="1"]').first().click();
      rec.mode += '+click(' + JSON.stringify(sendBtn) + ')';
    } else {
      await input.loc.press('Enter');
      rec.mode += '+Enter';
    }
    rec.ok = true;
  } catch (e) {
    rec.note = e.message;
  }
  log('SEND ' + JSON.stringify(rec).slice(0, 400));
  disc.sends.push(rec);
  save();
  return rec;
}

/** 等答复出现并稳定下来（"答完了"）。 */
async function waitAnswer(page, budgetMs, tag) {
  const end = Date.now() + budgetMs;
  let last = '', stable = 0, lastLog = '';
  while (Date.now() < end) {
    const a = await lastAnswer(page);
    const t = a?.text ?? '';
    if (t && t === last) stable++; else stable = 0;
    last = t;
    const brief = `len=${t.length} stable=${stable} sel=${a?.sel ?? '-'}`;
    if (brief !== lastLog) { log(`  [${tag}] ${brief}`); lastLog = brief; }
    if (t && stable >= 3) return { sel: a.sel, text: t, seconds: ((Date.now() - (end - budgetMs)) / 1000).toFixed(1) };
    if (!t && Date.now() > end - budgetMs + 45000) {
      // 45s 还没吐字 → 大概率卡在登录/弹窗，交给外层处理
      return { sel: null, text: '', stuck: true };
    }
    await sleep(2000);
  }
  return { sel: null, text: last, timeout: true };
}

// ────────────────────────────── 主流程 ──────────────────────────────
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
  log('browser launched: channel=msedge, profile=' + PROFILE_DIR);
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const u = req.url();
    if (!/api|chat|completion/i.test(u)) return;
    if (disc.network.some((n) => n.url === u)) return;
    disc.network.push({ url: u, at: Date.now() - T0 });
    log('NET-POST ' + u);
    save();
  });

  page.on('response', (res) => {
    const u = res.url();
    if (res.request().method() !== 'POST' || !/\/api\//.test(u)) return;
    res.text().then((t) => {
      disc.wire[u] = { status: res.status(), len: t.length, head: t.slice(0, 800) };
      log('WIRE-BODY ok ' + u + ' status=' + res.status() + ' len=' + t.length);
      save();
    }).catch((e) => log('WIRE-BODY fail ' + u + ' :: ' + String(e.message).slice(0, 140)));
  });

  page.on('download', async (d) => {
    const name = d.suggestedFilename();
    const dest = path.join(DL_DIR, name);
    try { await d.saveAs(dest); } catch (e) { log('download save fail: ' + e.message); }
    disc.downloads.push({ name, dest, at: Date.now() - T0 });
    log('DOWNLOAD ' + name + ' → ' + dest);
    save();
  });

  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  log('goto ok: ' + page.url());

  // ① 等输入框出现（若平台把登录放在更前面，这里会一直等）
  let input = null;
  const deadline = Date.now() + 15 * 60 * 1000;
  const t0wait = Date.now();
  while (Date.now() < deadline) {
    input = await firstVisible(page, INPUT_SELECTORS);
    if (input) break;
    if ((Date.now() - t0wait) % 30000 < 2500) log('waiting input… url=' + page.url());
    await sleep(2000);
  }
  if (!input) throw new Error('15 分钟内未出现输入框');
  log('INPUT found: ' + input.sel + '（耗时 ' + ((Date.now() - t0wait) / 1000).toFixed(1) + 's）');

  let snap = await snapshot(page);
  disc.ui = snap;
  save();
  log('snapshot#1 title=' + JSON.stringify(snap.title) + ' url=' + snap.url);
  log('  loginHints=' + JSON.stringify(snap.loginHints) + ' bodyHead=' + JSON.stringify(snap.bodyHead.slice(0, 160)));
  log('  inputs=' + JSON.stringify(snap.inputs));
  log('  answerCandidates=' + JSON.stringify(snap.answerCandidates));
  for (const b of snap.buttons.filter((b) => b.visible).slice(0, 12)) {
    log('  btn aria=' + JSON.stringify(b.ariaLabel) + ' role=' + b.role + ' text=' + JSON.stringify(b.text));
  }

  // ② 若页面在要登录 → 等人工登录完成
  async function waitLoginDone(maxMs) {
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      const s = await snapshot(page);
      if (s.loginHints.length === 0) return s;
      log('  等待人工登录中… loginHints=' + JSON.stringify(s.loginHints));
      await sleep(6000);
    }
    return null;
  }
  if (snap.loginHints.length) {
    log('检测到登录词，等待人工登录（浏览器窗口里请完成登录）…');
    const done = await waitLoginDone(15 * 60 * 1000);
    if (!done) throw new Error('等待人工登录超时');
    disc.login = { needed: true, at: Date.now() - T0 };
    log('人工登录完成，继续');
    snap = await snapshot(page);
    disc.ui = snap;
    save();
  } else {
    disc.login = { needed: false, at: Date.now() - T0 };
  }

  // ③ 发送测试消息（最多两轮：第一轮可能被登录弹窗吞掉）
  let result = null;
  for (let round = 1; round <= 2; round++) {
    input = (await firstVisible(page, INPUT_SELECTORS)) ?? input;
    await send(page, input, TEST_MESSAGE);
    log('round ' + round + ' 等待答复…');
    result = await waitAnswer(page, 300000, 'r' + round);
    if (result.text && !result.timeout) break;
    if (result.stuck) {
      const s = await snapshot(page);
      log('卡住：snapshot loginHints=' + JSON.stringify(s.loginHints) + ' bodyHead=' + JSON.stringify(s.bodyHead.slice(0, 200)));
      if (s.loginHints.length) {
        log('疑似未登录，等人工登录后重发…');
        const done = await waitLoginDone(15 * 60 * 1000);
        if (!done) break;
        continue;
      }
    }
    break;
  }

  // ④ 收尾：落答复原文 + 终态快照
  snap = await snapshot(page);
  disc.uiFinal = snap;
  if (result?.text) {
    disc.answer = { sel: result.sel, seconds: result.seconds ?? null, len: result.text.length, head: result.text.slice(0, 500) };
    fs.writeFileSync(path.join(OUT_DIR, 'answer.md'), result.text);
    log('ANSWER sel=' + result.sel + ' len=' + result.text.length + ' seconds=' + result.seconds);
    log('ANSWER head=' + JSON.stringify(result.text.slice(0, 200)));
  } else {
    disc.answer = null;
    log('ANSWER 未取到（timeout=' + (result?.timeout ?? false) + ' stuck=' + (result?.stuck ?? false) + '）');
  }
  log('downloads=' + disc.downloads.length + ' wireBodies=' + Object.keys(disc.wire).length);
  save();
  log('PROBE DONE');
} catch (e) {
  disc.error = String(e?.stack || e);
  save();
  log('PROBE FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  save();
  log('browser closed, exit');
  process.exit(disc.error ? 1 : 0);
}
