/**
 * 探针 17 —— K8 开关能力位（R8）：页面可设置控件 ↔ 下一次请求载荷随动
 *
 * 已知（勿重复取证）：请求体（分帧 + JSON，ChatService/Chat）含
 *   options.{thinking, enable_plugin, reasoning_effort, model} 与 tools:[{type:"TOOL_TYPE_SEARCH"},…]
 *   （读数：probe/out16/result.json upload.reqFull；响应里另有 chat.lastRequest 帧镜像）
 * 结构（单变量隔离；每步只动一个控件，载荷只比对 scenario / options / tools）：
 *   ① 顶层控件枚举（controls.json）
 *   ② 基线发送 ⇒ P0
 *   ③ 实验 A：工具面板逐项（联网搜索 / 集群）→ 点击 → 行状态 + 面板是否关闭 + 发送 ⇒ 载荷对比
 *   ④ 实验 B：无字图标按钮（toolkit 触发器旁的 icon-button）→ aria/HTML + 点击 + 发送 ⇒ 载荷对比
 *   ⑤ 实验 C：模型菜单（模型 / 思考强度 / 对话长度）→ 枚举 + 换一个档位 → 发送 ⇒ 载荷对比 → 还原
 * 判据：随动 ⇒ toggles=true + 读键映射（接口两键名 thinking_enabled / search_enabled）；无此类控件或不随动 ⇒ toggles=false（如实）。
 * 产物：probe/out17/（run.log + controls.json + panel-toolkit.json + panel-model.json + result.json）
 * 复跑：node probe/probe17-kimi-toggles.mjs（约 2–4 分钟；无需人工；会在 Kimi 当前聊天内追加数条短消息）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out17');
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
const watchdog = setTimeout(() => { log('WATCHDOG 硬超时（290s）'); process.exit(3); }, 290000);
watchdog.unref?.();

const chatReqs = [];
const resps = [];
let ctx, page;

const waitFor = async (fn, ms, step) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch {}
    await sleep(400);
  }
  log(`TIMEOUT 等 ${step} 超时（${ms}ms）`);
  return false;
};

// 请求体（分帧前缀 + JSON）→ 载荷摘要（前缀含非 UTF-8 字节 ⇒ 定位首个 { 或 [ 起解析）
const summarize = (body) => {
  try {
    const s = String(body);
    let i = s.indexOf('{');
    const j0 = s.indexOf('[');
    if (i < 0 || (j0 >= 0 && j0 < i)) i = j0;
    if (i < 0) return { parseError: 'no-json-start', head: s.slice(0, 160) };
    const raw = s.slice(i);
    let j = null;
    try { j = JSON.parse(raw); } catch { const k = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']')); j = JSON.parse(raw.slice(0, k + 1)); }
    const r = Array.isArray(j) ? j[0] : j;
    return { scenario: r.scenario ?? null, options: r.options ?? null, tools: (r.tools || []).map((t) => t.type) };
  } catch (e) {
    return { parseError: String(e.message || e).slice(0, 80), head: String(body).slice(0, 160) };
  }
};
const diffPayload = (a, b) => {
  const out = [];
  for (const k of ['scenario', 'options', 'tools']) {
    const av = JSON.stringify(a?.[k] ?? null), bv = JSON.stringify(b?.[k] ?? null);
    if (av !== bv) out.push(`${k}: ${av} -> ${bv}`);
  }
  return out;
};
const lastRequestOf = (respBody) => {
  if (!respBody) return null;
  const i = respBody.indexOf('"lastRequest":');
  if (i < 0) return null;
  const j = respBody.indexOf('{', i + '"lastRequest":'.length);
  if (j < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = j; k < respBody.length; k++) {
    const c = respBody[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(respBody.slice(j, k + 1)); } catch (e) { return { parseError: String(e.message).slice(0, 80) }; } } }
  }
  return null;
};

try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  ctx.on('close', () => log('!! context closed（外部关闭）'));
  log('browser launched');
  log('RUN START ' + new Date().toISOString());

  page.on('request', (req) => {
    if (req.method() !== 'POST' || !/ChatService\/Chat$/.test(req.url())) return;
    let buf = null; try { buf = req.postDataBuffer(); } catch {}
    const s = buf ? buf.toString('utf8') : (req.postData() || '');
    chatReqs.push({ url: req.url().split('?')[0], len: buf ? buf.length : s.length, text: s });
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
  const readModelTrigger = () => page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const trig = [...document.querySelectorAll('[class*="current-model"]')].find(vis);
    return trig ? (trig.innerText || '').trim().slice(0, 40) : null;
  }).catch(() => null);
  const modelTriggerBefore = await readModelTrigger();   // 实验前的模型/档位（还原目标）
  log('K8 模型当前值（实验前）=' + JSON.stringify(modelTriggerBefore));
  const send = async (txt, label) => {
    const n0 = chatReqs.length, r0 = resps.length;
    await editor.click({ timeout: 8000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await sleep(300);
    await page.keyboard.insertText(txt);
    await sleep(600);
    await editor.press('Enter').catch((e) => log(`${label} enter err ` + e.message.slice(0, 60)));
    const ok = await waitFor(() => chatReqs.length > n0, 8000, `${label} 请求`);
    await waitFor(() => resps.length > r0, 30000, `${label} 响应`);
    const req = chatReqs[n0] || null;
    return { ok, payload: req ? summarize(req.text) : null, resp: resps[r0] || null };
  };
  const closePanels = async () => { await page.keyboard.press('Escape').catch(() => {}); await sleep(300); await page.keyboard.press('Escape').catch(() => {}); await sleep(300); };
  const panelOpen = (kind) => page.evaluate((k) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const sel = k === 'toolkit' ? '[class*="toolkit-panel" i]' : '[class*="model-panel" i],[class*="model-menu" i],[class*="model-selector" i]';
    return [...document.querySelectorAll(sel)].some(vis);
  }, kind).catch(() => false);
  const openToolkit = async () => {
    if (await panelOpen('toolkit')) return true;
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('[class*="toolkit-trigger"]')].find((x) => x.getBoundingClientRect().width > 0);
      if (el) el.setAttribute('data-probe-open', '1');
    });
    await page.locator('[data-probe-open="1"]').first().click({ timeout: 4000 }).catch((e) => log('openToolkit err ' + e.message.slice(0, 60)));
    await sleep(1000);
    return true;
  };

  // ---------- ① 顶层控件枚举 ----------
  const controls = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inSidebar = (el) => !!el.closest('aside,[class*="sidebar-nav"],[class*="sidebar-history"],[class*="sidebar-section"],[class*="sidebar-collapse"],[class*="sidebar-item"]');
    const inMsg = (el) => !!el.closest('[class*="chat-content" i]');
    const info = (el, zone) => {
      const cls = String(el.className || '').slice(0, 100);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(), cls, text: (el.innerText || '').trim().slice(0, 24), zone,
        aria: el.getAttribute('aria-label'), title: el.getAttribute('title'), role: el.getAttribute('role'),
        checked: el.getAttribute('aria-checked'), pressed: el.getAttribute('aria-pressed'), expanded: el.getAttribute('aria-expanded'),
        disabled: el.disabled === true || /disabled/.test(cls), html: el.outerHTML.slice(0, 220),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      };
    };
    const ih = window.innerHeight;
    const sel = 'button,[role="button"],[aria-checked],[aria-pressed],[aria-expanded],[class*="toggle" i],[class*="switch" i],[class*="chip" i],[class*="mode" i],[class*="tool" i],[class*="entry" i],[class*="btn" i]';
    const all = [...document.querySelectorAll(sel)];
    const seen = new Set();
    const out = [];
    for (const el of all) {
      if (inSidebar(el) || inMsg(el) || !vis(el)) continue;
      seen.add(el);
      out.push(info(el, 'sel'));
    }
    const extra = [...document.querySelectorAll('div,span,p,a,li')].filter((el) => {
      if (seen.has(el) || inSidebar(el) || inMsg(el) || !vis(el)) return false;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 10) return false;
      if ([...el.children].some((c) => (c.innerText || '').trim())) return false;
      const r = el.getBoundingClientRect();
      if (r.y < ih * 0.4) return false;
      let cur = ''; try { cur = getComputedStyle(el).cursor; } catch {}
      return cur === 'pointer' || el.hasAttribute('role') || el.tagName === 'A' || el.tagName === 'BUTTON';
    });
    for (const el of extra) out.push(info(el, 'bottom'));
    return { innerHeight: ih, controls: out.slice(0, 80) };
  });
  fs.writeFileSync(path.join(OUT_DIR, 'controls.json'), JSON.stringify(controls, null, 2));
  log('K8 控件数=' + controls.controls.length + ' 清单=' + JSON.stringify(controls.controls.map((c) => `${c.text || '(' + c.cls.split(' ')[0] + ')'}[${c.zone}]`).slice(0, 40)));

  // ---------- ② 基线 ----------
  const base = await send('探针17-基线：请只回复「基线」。', '基线');
  const P0 = base.payload;
  log('K8 P0=' + JSON.stringify(P0));
  log('K8 P0.lastRequest=' + JSON.stringify(lastRequestOf(base.resp?.body)));

  const cycles = [];

  // ---------- ③ 实验 A：工具面板逐项 ----------
  const cycleA = { label: 'toolkit-panel', items: [] };
  {
    await openToolkit();
    const panelA = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const panels = [...document.querySelectorAll('[class*="toolkit-panel" i]')].filter(vis);
      const rows = [];
      for (const p of panels) {
        for (const row of p.querySelectorAll('[class*="toolkit-item"]')) {
          if (!vis(row)) continue;
          const r = row.getBoundingClientRect();
          rows.push({
            cls: String(row.className || '').slice(0, 120), text: (row.innerText || '').trim().slice(0, 60),
            aria: row.getAttribute('aria-label'), checked: row.getAttribute('aria-checked'), pressed: row.getAttribute('aria-pressed'),
            x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), html: row.outerHTML.slice(0, 400),
          });
        }
      }
      return { panelText: panels.map((p) => (p.innerText || '').trim().slice(0, 300)), rows: rows.slice(0, 20) };
    });
    fs.writeFileSync(path.join(OUT_DIR, 'panel-toolkit.json'), JSON.stringify(panelA, null, 2));
    cycleA.panelText = panelA.panelText;
    log('K8 toolkit 面板文本=' + JSON.stringify(panelA.panelText));
    log('K8 toolkit 行=' + JSON.stringify(panelA.rows.map((r) => `${r.text}[${r.cls.split(' ')[0]}]`)));

    // ---- 本段助手 ----
    const readRowOf = (txt) => page.evaluate((t) => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const panels = [...document.querySelectorAll('[class*="toolkit-panel" i]')].filter(vis);
      for (const p of panels) {
        const cands = [...p.querySelectorAll('[class*="toolkit-item"]')].filter((row) => vis(row) && !/toolkit-item__/.test(String(row.className || '')) && (row.innerText || '').includes(t));
        if (!cands.length) continue;
        const row = cands.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
        const st = (x) => ({ tag: x.tagName.toLowerCase(), cls: String(x.className || '').slice(0, 100), checked: x.getAttribute('aria-checked'), pressed: x.getAttribute('aria-pressed'), selected: x.getAttribute('aria-selected') });
        return { found: true, row: st(row), html: row.outerHTML.slice(0, 300) };
      }
      return { notFound: true, panelText: panels.map((p) => (p.innerText || '').trim().slice(0, 200)), rows: panels.flatMap((p) => [...p.querySelectorAll('[class*="toolkit-item"]')].filter((r) => vis(r) && !/toolkit-item__/.test(String(r.className || ''))).map((r) => (r.innerText || '').trim().slice(0, 40))) };
    }, txt).catch((e) => ({ err: String(e.message || e).slice(0, 120) }));
    const clickRowByText = async (txt, label) => {
      const found = await page.evaluate((t) => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const panels = [...document.querySelectorAll('[class*="toolkit-panel" i]')].filter(vis);
        for (const p of panels) {
          const cands = [...p.querySelectorAll('[class*="toolkit-item"]')].filter((row) => vis(row) && !/toolkit-item__/.test(String(row.className || '')) && (row.innerText || '').includes(t));
          if (!cands.length) continue;
          cands.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0].setAttribute('data-probe-ctl', '9');
          return true;
        }
        return false;
      }, txt).catch(() => false);
      if (found) await page.locator('[data-probe-ctl="9"]').first().click({ timeout: 4000 }).catch((e) => log(`K8 ${label} click err ` + e.message.slice(0, 60)));
      return found;
    };
    const readPanelRows = () => page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const panels = [...document.querySelectorAll('[class*="toolkit-panel" i]')].filter(vis);
      return panels.map((p) => ({
        panelCls: String(p.className || '').slice(0, 90),
        text: (p.innerText || '').trim().slice(0, 200),
        rows: [...p.querySelectorAll('[class*="toolkit-item"]')].filter((r) => vis(r) && !/toolkit-item__/.test(String(r.className || '')))
          .map((r) => ({ cls: String(r.className || '').slice(0, 90), text: (r.innerText || '').trim().slice(0, 40), checked: r.getAttribute('aria-checked'), pressed: r.getAttribute('aria-pressed'), selected: r.getAttribute('aria-selected') })),
      }));
    }).catch(() => null);

    // ---- A1 联网搜索：点开子面板（自动搜索 / 关闭搜索）→ 选「关闭搜索」→ 发送 ⇒ 载荷随动？（R8 二键之一） ----
    const item1 = { label: 'toolkit:联网搜索子面板', pre: null, subPanel: null, offSend: null, restorePanel: null, autoSend: null };
    await openToolkit();
    item1.pre = await readRowOf('联网搜索');
    log('K8 A1 pre=' + JSON.stringify(item1.pre).slice(0, 300));
    const openSearch = await clickRowByText('联网搜索', 'A1-开');
    await sleep(900);
    item1.subPanel = await readPanelRows();
    log('K8 A1 子面板=' + JSON.stringify(item1.subPanel));
    const offClicked = await clickRowByText('关闭搜索', 'A1-关闭');
    log('K8 A1 关闭搜索 clicked=' + offClicked);
    await sleep(900);
    const rOff = await send('探针17-关闭联网搜索：请只回复「收到」。', 'A1-off');
    item1.offSend = { ok: rOff.ok, payload: rOff.payload, diffVsP0: diffPayload(P0, rOff.payload), lastRequest: lastRequestOf(rOff.resp?.body) };
    log('K8 A1 关闭搜索 payload=' + JSON.stringify(item1.offSend.payload) + ' diff=' + JSON.stringify(item1.offSend.diffVsP0));
    // 复原：开面板 → 联网搜索 → 自动搜索 → 发送
    await closePanels();
    const reopen1 = await openToolkit();
    const searchAgain = await clickRowByText('联网搜索', 'A1-复原开');
    await sleep(900);
    item1.restorePanel = await readPanelRows();
    log('K8 A1 复原面板=' + JSON.stringify(item1.restorePanel));
    const autoClicked = await clickRowByText('自动搜索', 'A1-自动');
    log('K8 A1 自动搜索 clicked=' + autoClicked);
    await sleep(900);
    const rAuto = await send('探针17-恢复自动搜索：请只回复「收到」。', 'A1-auto');
    item1.autoSend = { ok: rAuto.ok, payload: rAuto.payload, diffVsP0: diffPayload(P0, rAuto.payload) };
    log('K8 A1 自动搜索 payload=' + JSON.stringify(item1.autoSend.payload) + ' diff=' + JSON.stringify(item1.autoSend.diffVsP0));
    cycleA.items.push(item1);

    // ---- A2 集群：模式切换（非开关；面板点击后关闭） ----
    const item2 = { label: 'toolkit:集群', pre: null, click: null, panelAfterClick: null, send: null };
    await closePanels();
    await openToolkit();
    item2.pre = await readRowOf('集群');
    log('K8 A2 pre=' + JSON.stringify(item2.pre).slice(0, 300));
    item2.click = await clickRowByText('集群', 'A2');
    await sleep(900);
    item2.panelAfterClick = await panelOpen('toolkit');
    const rSwarm = await send('探针17-集群：请只回复「收到」。', 'A2-集群');
    item2.send = { ok: rSwarm.ok, payload: rSwarm.payload, diffVsP0: diffPayload(P0, rSwarm.payload) };
    log(`K8 A2 panelAfterClick=${item2.panelAfterClick} payload=` + JSON.stringify(item2.send.payload) + ' diff=' + JSON.stringify(item2.send.diffVsP0));
    await closePanels();
    cycleA.items.push(item2);
    cycles.push(cycleA);
  }

  // ---------- ④ 实验 B：输入区无字图标按钮（仅识别 + 点击观察；不发消息、不参与载荷判据） ----------
  const cycleB = { label: 'icon-button', note: '仅识别/点击观察（不发送）；前序 cycle 的模式残留不影响本段' };
  {
    const info = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const inComposer = (el) => !!el.closest('[class*="chat-editor"],[class*="chat-input"]');
      const el = [...document.querySelectorAll('.icon-button,[class*="icon-button"]')].find((x) => vis(x) && inComposer(x));
      if (!el) return null;
      return { cls: String(el.className || '').slice(0, 120), aria: el.getAttribute('aria-label'), title: el.getAttribute('title'), html: el.outerHTML.slice(0, 400) };
    });
    cycleB.info = info;
    log('K8 B icon-button=' + JSON.stringify(info));
    if (info) {
      await page.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const inComposer = (el) => !!el.closest('[class*="chat-editor"],[class*="chat-input"]');
        const el = [...document.querySelectorAll('.icon-button,[class*="icon-button"]')].find((x) => vis(x) && inComposer(x));
        if (el) el.setAttribute('data-probe-ctl', '8');
      });
      await page.locator('[data-probe-ctl="8"]').first().click({ timeout: 4000 }).catch((e) => log('K8 B click err ' + e.message.slice(0, 60)));
      await sleep(900);
      const after = await page.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const inComposer = (el) => !!el.closest('[class*="chat-editor"],[class*="chat-input"]');
        const el = [...document.querySelectorAll('.icon-button,[class*="icon-button"]')].find((x) => vis(x) && inComposer(x));
        const panels = [...document.querySelectorAll('[class*="panel" i],[class*="modal" i],[class*="popover" i]')].filter(vis);
        return { cls: el ? String(el.className || '').slice(0, 120) : null, aria: el ? el.getAttribute('aria-label') : null, panels: panels.map((p) => ({ cls: String(p.className || '').slice(0, 80), head: (p.innerText || '').trim().slice(0, 80) })).slice(0, 3) };
      });
      cycleB.after = after;
      log('K8 B after=' + JSON.stringify(after));
    } else {
      log('K8 B 输入区内未找到无字图标按钮（跳过）');
    }
    await closePanels();
    cycles.push(cycleB);
  }

  // ---------- ⑤ 实验 C：模型菜单 ----------
  const cycleC = { label: 'model-menu', steps: {} };
  {
    const openModel = async () => {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('[class*="current-model"]')].find((x) => x.getBoundingClientRect().width > 0);
        if (el) el.setAttribute('data-probe-open', 'm');
      });
      await page.locator('[data-probe-open="m"]').first().click({ timeout: 4000 }).catch((e) => log('openModel err ' + e.message.slice(0, 60)));
      await sleep(1000);
    };
    await openModel();
    const panelB = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const trig = [...document.querySelectorAll('[class*="current-model"]')].find(vis);
      const panels = [...document.querySelectorAll('[class*="model" i],[role="menu"],[class*="popover" i],[class*="dropdown" i]')].filter((el) => {
        if (!vis(el) || el === trig || (trig && el.contains(trig))) return false;
        return (el.innerText || '').includes('模型') || (el.innerText || '').includes('思考') || (el.innerText || '').includes('对话长度');
      });
      const items = [];
      for (const p of panels) {
        const leaves = [...p.querySelectorAll('*')].filter((el) => {
          const t = (el.innerText || '').trim();
          return t && t.length < 40 && vis(el) && ![...el.children].some((c) => (c.innerText || '').trim());
        });
        for (const el of leaves) {
          const r = el.getBoundingClientRect();
          items.push({ tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().slice(0, 40), cls: String(el.className || '').slice(0, 80), x: Math.round(r.x), y: Math.round(r.y) });
        }
        break;
      }
      return { triggerText: trig ? (trig.innerText || '').trim().slice(0, 40) : null, panelText: panels.length ? (panels[0].innerText || '').trim().slice(0, 400) : null, items: items.slice(0, 40) };
    });
    fs.writeFileSync(path.join(OUT_DIR, 'panel-model.json'), JSON.stringify(panelB, null, 2));
    cycleC.steps.panel = panelB;
    log('K8 C 当前值=' + JSON.stringify(panelB.triggerText) + ' 面板=' + JSON.stringify(panelB.panelText));
    log('K8 C 项=' + JSON.stringify(panelB.items.map((i) => `${i.text}@y${i.y}`).slice(0, 30)));
    // 找一个可点的模型项（快速 / K2.8）或 思考强度 当前值
    const effortLabel = panelB.items.find((i) => i.text === '进阶' || i.text === '标准' || i.text === '深度');
    const modelOpt = panelB.items.find((i) => /^快速$/.test(i.text)) || panelB.items.find((i) => /K2\.8/.test(i.text));
    const pick = modelOpt || effortLabel;
    if (pick) {
      cycleC.steps.pick = pick;
      await page.evaluate((sel) => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const el = [...document.querySelectorAll('div,span,p')].find((x) => (x.innerText || '').trim() === sel.text && String(x.className || '').slice(0, 80) === sel.cls && vis(x) && !x.closest('[class*="current-model"]'));
        if (el) el.setAttribute('data-probe-ctl', '7');
      }, { text: pick.text, cls: pick.cls });
      const hit = await page.locator('[data-probe-ctl="7"]').first().click({ timeout: 4000 }).then(() => true).catch(() => false);
      cycleC.steps.clicked = { ok: hit, pick };
      log('K8 C 点击=' + JSON.stringify({ ok: hit, text: pick.text, cls: pick.cls }));
      await sleep(1200);
      const trigAfter = await page.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const trig = [...document.querySelectorAll('[class*="current-model"]')].find(vis);
        return trig ? (trig.innerText || '').trim().slice(0, 40) : null;
      });
      cycleC.steps.triggerAfter = trigAfter;
      log('K8 C 切换后=' + JSON.stringify(trigAfter));
      const r = await send('探针17-模型档位：请只回复「收到」。', 'C-model');
      cycleC.steps.send = { ok: r.ok, payload: r.payload, diffVsP0: diffPayload(P0, r.payload) };
      log('K8 C payload=' + JSON.stringify(cycleC.steps.send.payload) + ' diff=' + JSON.stringify(cycleC.steps.send.diffVsP0));
      // 还原：切回实验前的模型标签（triggerText 的首段）
      const orig = (modelTriggerBefore || '').split('\n')[0].trim();
      if (orig && trigAfter && orig !== (trigAfter || '').split('\n')[0].trim()) {
        await openModel();
        await page.evaluate((t) => {
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          const el = [...document.querySelectorAll('div,span,p')].find((x) => (x.innerText || '').trim() === t && vis(x) && ![...x.children].some((c) => (c.innerText || '').trim()) && !x.closest('[class*="current-model"]'));
          if (el) el.setAttribute('data-probe-ctl', '6');
        }, orig);
        const back = await page.locator('[data-probe-ctl="6"]').first().click({ timeout: 4000 }).then(() => true).catch(() => false);
        await sleep(1000);
        const trigBack = await page.evaluate(() => {
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          const trig = [...document.querySelectorAll('[class*="current-model"]')].find(vis);
          return trig ? (trig.innerText || '').trim().slice(0, 40) : null;
        });
        cycleC.steps.restore = { clicked: back, origLabel: orig, triggerAfter: trigBack };
        log('K8 C 还原=' + JSON.stringify(cycleC.steps.restore));
      }
      // ---- C2 思考强度：点当前值 →（若展开）选一个不同档位 → 发送 ⇒ 载荷随动？ ----
      const c2 = { row: null, expanded: null, picked: null, send: null, restore: null };
      await openModel();
      const scanMenu = () => page.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const trig = [...document.querySelectorAll('[class*="current-model"]')].find(vis);
        const panels = [...document.querySelectorAll('[class*="model" i],[role="menu"],[class*="popover" i],[class*="dropdown" i]')].filter((el) => {
          if (!vis(el) || el === trig || (trig && el.contains(trig))) return false;
          return (el.innerText || '').includes('思考强度');
        });
        const p = panels[0];
        if (!p) return { notFound: true };
        const items = [...p.querySelectorAll('*')].filter((el) => {
          const t = (el.innerText || '').trim();
          return t && t.length < 40 && vis(el) && ![...el.children].some((c) => (c.innerText || '').trim());
        }).map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 80), text: (el.innerText || '').trim().slice(0, 30), y: Math.round(r.y) }; });
        const label = items.find((i) => i.text === '思考强度') || null;
        const sameRow = label ? items.filter((i) => Math.abs(i.y - label.y) <= 12 && i.text !== '思考强度') : [];
        return { label, sameRow, items: items.slice(0, 40) };
      }).catch((e) => ({ err: String(e.message || e).slice(0, 120) }));
      c2.row = await scanMenu();
      log('K8 C2 思考强度行=' + JSON.stringify(c2.row));
      const val = (c2.row?.sameRow || [])[0];
      if (val) {
        await page.evaluate((sel) => {
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          const el = [...document.querySelectorAll('div,span,p')].find((x) => (x.innerText || '').trim() === sel.text && String(x.className || '').slice(0, 80) === sel.cls && Math.abs(x.getBoundingClientRect().y - sel.y) <= 12 && vis(x) && !x.closest('[class*="current-model"]'));
          if (el) el.setAttribute('data-probe-ctl', '4');
        }, val);
        await page.locator('[data-probe-ctl="4"]').first().click({ timeout: 4000 }).catch((e) => log('K8 C2 展开 err ' + e.message.slice(0, 60)));
        await sleep(900);
        c2.expanded = await scanMenu();
        c2.expandedChanged = JSON.stringify(c2.row?.items || []) !== JSON.stringify(c2.expanded?.items || []);
        log('K8 C2 展开后=' + JSON.stringify(c2.expanded));
        log('K8 C2 展开是否变化=' + c2.expandedChanged);
        // 档位候选只取 effort 类元素（不混入模型名：cls=name / model-item__label 一律不算）
        const OPTS = ['标准', '进阶', '深度'];
        const opts = (c2.expanded?.items || []).filter((i) => OPTS.includes(i.text) && /effort/i.test(i.cls));
        const pickOpt = opts.find((i) => i.text !== val.text) || null;
        c2.picked = pickOpt;
        if (pickOpt) {
          await page.evaluate((sel) => {
            const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const el = [...document.querySelectorAll('div,span,p')].find((x) => (x.innerText || '').trim() === sel.text && vis(x) && ![...x.children].some((c) => (c.innerText || '').trim()) && !x.closest('[class*="current-model"]'));
            if (el) el.setAttribute('data-probe-ctl', '3');
          }, pickOpt);
          await page.locator('[data-probe-ctl="3"]').first().click({ timeout: 4000 }).catch((e) => log('K8 C2 选择 err ' + e.message.slice(0, 60)));
          await sleep(900);
          const r2 = await send('探针17-思考强度：请只回复「收到」。', 'C2');
          c2.send = { ok: r2.ok, payload: r2.payload, diffVsP0: diffPayload(P0, r2.payload) };
          log('K8 C2 payload=' + JSON.stringify(c2.send.payload) + ' diff=' + JSON.stringify(c2.send.diffVsP0));
          // 还原：重开菜单 → 点回原值
          await closePanels();
          await openModel();
          await scanMenu();
          await page.evaluate((t) => {
            const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const el = [...document.querySelectorAll('div,span,p')].find((x) => (x.innerText || '').trim() === t && vis(x) && ![...x.children].some((c) => (c.innerText || '').trim()) && !x.closest('[class*="current-model"]'));
            if (el) el.setAttribute('data-probe-ctl', '2');
          }, val.text);
          const rb = await page.locator('[data-probe-ctl="2"]').first().click({ timeout: 4000 }).then(() => true).catch(() => false);
          await sleep(600);
          c2.restore = { clicked: rb, target: val.text };
          log('K8 C2 还原=' + JSON.stringify(c2.restore));
        } else {
          c2.note = '展开未变化或无 effort 档位候选 ⇒ 未发送、未改状态（thinking 键无控件读数）';
          log('K8 C2 ' + c2.note);
        }
      } else {
        log('K8 C2 未找到 思考强度 当前值元素');
      }
      cycleC.steps.c2 = c2;
      await closePanels();
    } else {
      log('K8 C 未找到可点模型/档位项');
    }
    await closePanels();
    cycles.push(cycleC);
  }

  const result = {
    controlCount: controls.controls.length,
    baseline: { payload: P0, lastRequest: lastRequestOf(base.resp?.body) },
    cycles,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2));
  log('PROBE17 DONE');
} catch (e) {
  log('PROBE17 FAILED: ' + String(e?.message || e));
  try { fs.writeFileSync(path.join(OUT_DIR, 'error.json'), JSON.stringify({ at: new Date().toISOString(), message: String(e?.message || e) }, null, 2)); } catch {}
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  log('browser closed, exit');
  process.exit(0);
}
