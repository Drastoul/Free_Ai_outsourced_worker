/**
 * 探针 4 —— 开关与真实下载路径实测（DeepSeek，复用登录态）
 *
 * 验证点（对应「第四部分未验证项」的前两条）：
 *   ① 「深度思考 / 智能搜索」开关：能否找到、读取状态、点击切换（前后状态可观测）
 *   ② 开关是否随请求发出（读 chat/completion 的请求载荷里的标志位——权威读法）
 *   ③ 开关打开对答复流的影响（THINK 分片是否出现）
 *   ④ 真实平台的「下载」按钮：点击代码块旁的下载钮 → 是否触发浏览器下载、能否落盘
 *   ⑤ 开关状态的会话默认（新会话是否记住上次状态）
 *
 * 产物：probe/out4/run.log、discovery4.json、downloads/*
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out4');
const DL_DIR = path.join(OUT_DIR, 'downloads');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
for (const d of [OUT_DIR, DL_DIR]) fs.mkdirSync(d, { recursive: true });

const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const disc = { startedAt: new Date().toISOString(), toggles: {}, sends: [], downloads: [], error: null };
const save = () => fs.writeFileSync(path.join(OUT_DIR, 'discovery4.json'), JSON.stringify(disc, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 找开关叶子并采集「状态签名」（叶子与其 4 层祖先的类名 + 关键样式 + aria） */
async function readToggle(label) {
  return await page.evaluate((label) => {
    const nodes = [...document.querySelectorAll('div,span,button,a')].filter((el) => {
      const t = (el.innerText || '').trim();
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && t === label;
    });
    if (!nodes.length) return null;
    const leaf = nodes.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
    leaf.setAttribute('data-probe-toggle', label);
    const chain = [];
    let cur = leaf;
    for (let i = 0; i < 4 && cur; i++) {
      const cs = getComputedStyle(cur);
      chain.push({
        tag: cur.tagName.toLowerCase(),
        cls: (cur.className || '').toString().slice(0, 100),
        aria: cur.getAttribute('aria-checked') ?? cur.getAttribute('aria-pressed') ?? null,
        bg: cs.backgroundColor, color: cs.color, border: cs.borderColor,
      });
      cur = cur.parentElement;
    }
    return { chain };
  }, label);
}

/** 状态签名 = 链条上类名+关键样式拼接（用于前后对照） */
const sig = (t) => (t ? t.chain.map((c) => [c.cls, c.aria, c.bg, c.color, c.border].join('|')).join(' || ') : 'NULL');

async function clickToggle(label) {
  for (let level = 0; level < 3; level++) {
    const target = await page.evaluate(({ label, level }) => {
      const leaf = document.querySelector(`[data-probe-toggle="${label}"]`);
      if (!leaf) return null;
      let el = leaf;
      for (let i = 0; i < level && el.parentElement; i++) el = el.parentElement;
      el.setAttribute('data-probe-click', '1');
      return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 80) };
    }, { label, level });
    if (!target) return null;
    await page.locator('[data-probe-click="1"]').first().click({ timeout: 5000 }).catch(() => {});
    await sleep(900);
    return target;
  }
  return null;
}

let page;
let ctx;
try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null, acceptDownloads: true, downloadsPath: DL_DIR,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  log('browser launched');

  const payloads = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !req.url().includes('/api/v0/chat/completion')) return;
    const body = req.postData() ?? '';
    payloads.push(body);
    let brief = body.slice(0, 300);
    try {
      const j = JSON.parse(body);
      brief = JSON.stringify({ thinking_enabled: j.thinking_enabled, search_enabled: j.search_enabled, model: j.model_type, keys: Object.keys(j).slice(0, 12) });
    } catch {}
    log('REQ-PAYLOAD ' + brief);
  });
  page.on('download', async (d) => {
    const dest = path.join(DL_DIR, d.suggestedFilename());
    try { await d.saveAs(dest); } catch (e) { log('dl save fail: ' + e.message); }
    disc.downloads.push({ name: d.suggestedFilename(), dest, at: Date.now() - T0 });
    log('DOWNLOAD captured → ' + dest);
  });
  page.on('console', (m) => { if (m.type() === 'error') log('PAGE-ERR ' + m.text().slice(0, 150)); });

  await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3000);

  // 开新会话
  const nc = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,button,a,span')].find((e) => (e.innerText || '').trim() === '开启新对话' && e.getBoundingClientRect().width > 0);
    if (!el) return false; el.setAttribute('data-probe-newchat', '1'); return true;
  });
  if (nc) { await page.locator('[data-probe-newchat="1"]').first().click(); await sleep(2500); }

  // ⑤ 新会话默认状态
  const d1 = await readToggle('深度思考'); const d2 = await readToggle('智能搜索');
  disc.toggles.initial = { thinking: d1, search: d2 };
  log('TOGGLE initial 深度思考 found=' + !!d1 + ' 智能搜索 found=' + !!d2);
  log('  sig(深度思考)=' + sig(d1).slice(0, 300));
  log('  sig(智能搜索)=' + sig(d2).slice(0, 300));
  save();

  const sendOnce = async (text, tag) => {
    const input = page.locator('textarea').first();
    await input.click();
    await input.press('Control+A');
    await input.press('Backspace');
    await page.keyboard.insertText(text);
    await sleep(300);
    const t = Date.now();
    await input.press('Enter');
    // 等答复稳定
    let last = '', stable = 0;
    const end = Date.now() + 240000;
    while (Date.now() < end) {
      const cur = await page.evaluate(() => {
        const els = [...document.querySelectorAll('[class*="ds-markdown"]')];
        const el = els[els.length - 1];
        return el ? (el.innerText || '').trim() : '';
      });
      if (cur && cur === last) stable++; else stable = 0;
      last = cur;
      if (cur && stable >= 3) break;
      await sleep(2000);
    }
    const ms = Date.now() - t;
    disc.sends.push({ tag, ms, payload: payloads[payloads.length - 1] ?? null, answerLen: last.length, answerHead: last.slice(0, 120) });
    log(`SEND[${tag}] done in ${(ms / 1000).toFixed(1)}s answerLen=${last.length}`);
    save();
    return last;
  };

  // A：默认状态发一条（看默认标志位）
  await sendOnce('请只回复两个字：收到', 'A-default');

  // ① + ② 打开两个开关
  const before = { th: sig(await readToggle('深度思考')), se: sig(await readToggle('智能搜索')) };
  const c1 = await clickToggle('深度思考');
  const c2 = await clickToggle('智能搜索');
  await sleep(600);
  const after = { th: sig(await readToggle('深度思考')), se: sig(await readToggle('智能搜索')) };
  disc.toggles.afterClick = { before, after, clicked: { thinking: c1, search: c2 },
    changed: { thinking: before.th !== after.th, search: before.se !== after.se } };
  log('TOGGLE clicked: thinking=' + JSON.stringify(c1) + ' search=' + JSON.stringify(c2));
  log('TOGGLE sig changed: thinking=' + (before.th !== after.th) + ' search=' + (before.se !== after.se));
  log('  after sig(深度思考)=' + after.th.slice(0, 300));
  save();
  await sendOnce('请用一个 python 代码块输出：首行注释 # file: probe_dl.py，内容为 print("dl")。代码块外只写"完"。', 'B-toggles-on');
  const answerB = disc.sends[disc.sends.length - 1]?.answerHead ?? '';

  // ④ 真实下载路径：点代码块旁的「下载」
  const dlBtn = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div,span,button,a')].filter((el) => (el.innerText || '').trim() === '下载' && el.getBoundingClientRect().width > 0);
    if (!els.length) return null;
    const last = els[els.length - 1];
    last.setAttribute('data-probe-dl', '1');
    return { count: els.length, cls: (last.className || '').toString().slice(0, 100), tag: last.tagName.toLowerCase() };
  });
  log('DL-BUTTON found=' + JSON.stringify(dlBtn));
  disc.downloads.push({ step: 'button-found', dlBtn });
  if (dlBtn) {
    let got = false;
    const waitDl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await page.locator('[data-probe-dl="1"]').first().click({ timeout: 5000 }).catch((e) => log('dl click err ' + e.message.slice(0, 80)));
    const d = await waitDl;
    if (d) {
      got = true;
      const dest = path.join(DL_DIR, 'clicked-' + d.suggestedFilename());
      await d.saveAs(dest).catch(() => {});
      disc.downloads.push({ step: 'click-capture', name: d.suggestedFilename(), dest, ok: fs.existsSync(dest) });
      log('DL-BUTTON → download captured: ' + d.suggestedFilename() + ' exists=' + fs.existsSync(dest));
    }
    if (!got) {
      await sleep(1200);
      const menu = await page.evaluate(() => {
        const vis = [...document.querySelectorAll('div,li,span,button')].filter((el) => {
          const r = el.getBoundingClientRect();
          const t = (el.innerText || '').trim();
          return r.width > 0 && r.height > 0 && t.length > 0 && t.length < 40;
        }).map((el) => (el.innerText || '').trim());
        const uniq = [...new Set(vis)];
        return uniq.filter((t) => /下载|复制|\.py|\.txt|Markdown|格式/.test(t)).slice(0, 20);
      });
      disc.downloads.push({ step: 'menu-probe', menu });
      log('DL-BUTTON 无下载事件；菜单候选=' + JSON.stringify(menu));
      // 若弹出菜单，点第一个像「下载」的项
      const clicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('div,li,span,button,a')].find((e) => {
          const t = (e.innerText || '').trim();
          const r = e.getBoundingClientRect();
          return r.width > 0 && /^下载/.test(t) && t.length < 30;
        });
        if (!el) return null;
        el.setAttribute('data-probe-dl2', '1');
        return (el.innerText || '').trim();
      });
      if (clicked) {
        const waitDl2 = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
        await page.locator('[data-probe-dl2="1"]').first().click({ timeout: 5000 }).catch(() => {});
        const d2 = await waitDl2;
        if (d2) {
          const dest = path.join(DL_DIR, 'menu-' + d2.suggestedFilename());
          await d2.saveAs(dest).catch(() => {});
          disc.downloads.push({ step: 'menu-capture', name: d2.suggestedFilename(), dest, ok: fs.existsSync(dest) });
          log('DL-MENU → download captured: ' + d2.suggestedFilename());
        } else {
          log('DL-MENU 点击后仍无下载事件');
        }
      }
    }
  }
  save();

  // ③ 关掉两个开关 → 再发一条（看标志位回到 false）
  const b2 = { th: sig(await readToggle('深度思考')), se: sig(await readToggle('智能搜索')) };
  await clickToggle('深度思考');
  await clickToggle('智能搜索');
  await sleep(600);
  const a2 = { th: sig(await readToggle('深度思考')), se: sig(await readToggle('智能搜索')) };
  disc.toggles.afterClickOff = { changed: { thinking: b2.th !== a2.th, search: b2.se !== a2.se } };
  log('TOGGLE off 切换生效: thinking=' + (b2.th !== a2.th) + ' search=' + (b2.se !== a2.se));
  await sendOnce('请只回复两个字：好的', 'C-toggles-off');

  log('PROBE4 DONE downloads=' + disc.downloads.filter((d) => d.dest).length);
} catch (e) {
  disc.error = String(e?.stack || e);
  save();
  log('PROBE4 FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  save();
  log('browser closed, exit');
  process.exit(disc.error ? 1 : 0);
}
