/**
 * 探针 15 —— K1 登录两态判别（已登录 ↔ 未登录，两态各取一组读数）
 *
 * 背景（探针 7/9 教训）：
 *   - Kimi 未登录也能看到输入框并落字（假阳性来源，probe7:104-119 / out7:25,29）；
 *   - 「登录」词消失不可靠（out8:144：LoginWithSMS 之后页面仍含「登录」字样）；
 *   - 「我的 Kimi」两态共有（out7:14 未登录页同屏出现）⇒ 无判别力，不得作 ready 依据。
 *
 * 做法：① 复用 .browser-profile 取「已登录」读数（真实收发链路的登录证据见 out12/out13）；
 *       ② 临时 profileDir（.thincoder/tmp/）取「未登录」读数，并点登录入口取登录弹层形态。
 * 判据：两态互斥项（登录入口文案 / 登录弹层元素）——两态各一组读数，互斥项应在两态取相反值。
 * 产物：probe/out15/run.log + state-loggedin.json + state-guest.json + state-guest-loginclick.json
 * 复跑：node probe/probe15-kimi-login-states.mjs（约 60–120s；无需人工）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out15');
const LOGGEDIN_PROFILE = path.join(ROOT, '.browser-profile');
const GUEST_PROFILE = path.join(ROOT, '.thincoder', 'tmp', 'probe15-guest-profile');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(GUEST_PROFILE, { recursive: true });
const LOG = path.join(OUT_DIR, 'run.log');
const T0 = Date.now();
const log = (...p) => {
  const line = `[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${p.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const watchdog = setTimeout(() => { log('WATCHDOG 硬超时（300s）'); process.exit(3); }, 300000);
watchdog.unref?.();

// 候选判别串：既有两态共有的对照组（「我的 Kimi」），也有候选互斥项（登录入口 / 弹层）
const EXACT_TEXTS = ['登录', '登录以同步历史会话', '退出登录', '我的 Kimi', '查看全部', '新建会话', '微信扫码登录', '手机号码登录', '发送验证码', '企业 SSO 登录'];

// 页面内采集（两态同一函数，保证读数可比）
const COLLECT = (wanted) => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const els = [...document.querySelectorAll('div,span,button,a,p,li,h1,h2,h3')];
  const exact = {};
  for (const w of wanted) {
    exact[w] = els.filter((el) => txt(el) === w).slice(0, 8)
      .map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 80), vis: vis(el) }));
  }
  const body = document.body.innerText || '';
  const words = {};
  for (const w of ['登录', '登录以同步历史会话', '退出登录', '我的 Kimi', '查看全部', '扫码', '验证码']) words[w] = body.includes(w);
  const containers = [...document.querySelectorAll('[class*="login" i],[class*="avatar" i],[class*="account" i],[class*="profile" i],[class*="logout" i]')]
    .slice(0, 30).map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 100), vis: vis(el), text: txt(el).slice(0, 40) }));
  const acc = els.find((el) => /^用户\d{3,}$/.test(txt(el)));
  return {
    url: location.href,
    editor: !!document.querySelector('.chat-input-editor'),
    fileInputs: document.querySelectorAll('input[type="file"]').length,
    bodyHead: body.replace(/\s+/g, ' ').slice(0, 260),
    exact, words, containers,
    accountNameGuess: acc ? { tag: acc.tagName.toLowerCase(), cls: String(acc.className || '').slice(0, 80), text: txt(acc) } : null,
    predicate: {
      // 候选谓词：可见的「登录」入口或「登录以同步历史会话」入口 ⇒ login_required；有账号按钮 ⇒ ready 佐证
      loginEntryVisible: (exact['登录'] || []).some((x) => x.vis) || (exact['登录以同步历史会话'] || []).some((x) => x.vis),
      loginOverlayVisible: (exact['微信扫码登录'] || []).some((x) => x.vis) || (exact['手机号码登录'] || []).some((x) => x.vis) || (exact['发送验证码'] || []).some((x) => x.vis) || (exact['企业 SSO 登录'] || []).some((x) => x.vis),
      userProfileTriggerVisible: (() => { const el = document.querySelector('button.user-profile-trigger'); return !!el && vis(el); })(),
      editorVisible: !!document.querySelector('.chat-input-editor'),
    },
  };
};

async function openAndCollect({ label, profileDir, outFile }) {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(profileDir, {
      channel: 'msedge', headless: false, viewport: null,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    ctx.on('close', () => log(`[${label}] !! context closed（外部关闭）`));
    log(`[${label}] browser launched profile=${profileDir}`);
    await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    log(`[${label}] goto ok`);
    // Kimi 首屏 5–15s：等输入框出现，再额外等侧栏/账号区渲染
    let editor = false;
    for (let i = 0; i < 20; i++) {
      editor = await page.evaluate(() => !!document.querySelector('.chat-input-editor')).catch(() => false);
      if (editor) break;
      await sleep(2000);
    }
    log(`[${label}] editor present=${editor} (waited ${((Date.now() - T0) / 1000).toFixed(1)}s since start)`);
    await sleep(3500);
    const st = await page.evaluate(COLLECT, EXACT_TEXTS);
    fs.writeFileSync(outFile, JSON.stringify(st, null, 2));
    log(`[${label}] url=${st.url}`);
    log(`[${label}] predicate=${JSON.stringify(st.predicate)}`);
    log(`[${label}] exact["登录"]=${JSON.stringify(st.exact['登录'])}`);
    log(`[${label}] exact["登录以同步历史会话"]=${JSON.stringify(st.exact['登录以同步历史会话'])}`);
    log(`[${label}] exact["退出登录"]=${JSON.stringify(st.exact['退出登录'])}`);
    log(`[${label}] exact["我的 Kimi"]=${JSON.stringify(st.exact['我的 Kimi'])}`);
    log(`[${label}] accountNameGuess=${JSON.stringify(st.accountNameGuess)}`);
    log(`[${label}] loginContainers=${JSON.stringify(st.containers.filter((c) => /login/i.test(c.cls)))}`);
    log(`[${label}] bodyHead=${JSON.stringify(st.bodyHead)}`);
    return { ctx, page, st };
  } catch (e) {
    log(`[${label}] FAILED: ${String(e?.message || e)}`);
    try { if (ctx) await ctx.close(); } catch {}
    return null;
  }
}

// ① 已登录态（复用 .browser-profile）
{
  const r = await openAndCollect({ label: 'logged-in', profileDir: LOGGEDIN_PROFILE, outFile: path.join(OUT_DIR, 'state-loggedin.json') });
  if (r) { try { await r.ctx.close(); } catch {} log('logged-in browser closed'); }
}

// ② 未登录态（临时 profileDir，全新未登录）——并点「登录」入口取登录弹层形态
{
  const r = await openAndCollect({ label: 'guest', profileDir: GUEST_PROFILE, outFile: path.join(OUT_DIR, 'state-guest.json') });
  if (r) {
    const { page } = r;
    let best = null;
    for (let idx = 0; idx < 2; idx++) {
      const clicked = await page.evaluate((i) => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const els = [...document.querySelectorAll('div,span,button,a')].filter((el) => (el.innerText || el.textContent || '').trim() === '登录' && vis(el));
        if (!els[i]) return null;
        els[i].setAttribute('data-probe-login', String(i));
        return { n: els.length, tag: els[i].tagName.toLowerCase(), cls: String(els[i].className || '').slice(0, 80) };
      }, idx).catch(() => null);
      if (!clicked) { log(`[guest] 登录入口[${idx}] 不存在，跳过`); continue; }
      log(`[guest] 点登录入口[${idx}] ${JSON.stringify(clicked)}`);
      await page.locator(`[data-probe-login="${idx}"]`).first().click({ timeout: 5000 }).catch((e) => log('[guest] click err ' + e.message.slice(0, 80)));
      await sleep(3500);
      const after = await page.evaluate(COLLECT, EXACT_TEXTS);
      best = after;
      log(`[guest] after-click[${idx}] url=${after.url} overlay=${after.predicate.loginOverlayVisible}`);
      log(`[guest] after-click[${idx}] exact["微信扫码登录"]=${JSON.stringify(after.exact['微信扫码登录'])}`);
      log(`[guest] after-click[${idx}] exact["手机号码登录"]=${JSON.stringify(after.exact['手机号码登录'])}`);
      log(`[guest] after-click[${idx}] exact["发送验证码"]=${JSON.stringify(after.exact['发送验证码'])}`);
      log(`[guest] after-click[${idx}] exact["企业 SSO 登录"]=${JSON.stringify(after.exact['企业 SSO 登录'])}`);
      log(`[guest] after-click[${idx}] loginContainers=${JSON.stringify(after.containers.filter((c) => /login/i.test(c.cls)).slice(0, 8))}`);
      if (after.predicate.loginOverlayVisible) break;
    }
    if (best) fs.writeFileSync(path.join(OUT_DIR, 'state-guest-loginclick.json'), JSON.stringify(best, null, 2));
    try { await r.ctx.close(); } catch {}
    log('guest browser closed');
  }
}

log('PROBE15 DONE');
process.exit(0);
