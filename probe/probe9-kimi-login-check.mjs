/**
 * 探针 9 —— Kimi 登录态只读检查（不发送任何消息，约 15 秒）
 * 目的：判断工具自己的浏览器配置（.browser-profile）里 Kimi 是否已登录。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'probe', 'out9');
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

let ctx;
try {
  ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'msedge', headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  ctx.on('close', () => log('!! context closed（外部关闭）'));
  log('browser launched');
  await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(8000);
  const st = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const has = (w) => t.includes(w);
    return {
      url: location.href,
      loginMarks: ['登录', '登录以同步', '退出登录', '我的 Kimi'].filter(has),
      loggedInGuess: !has('登录'),
      bodyHead: t.slice(0, 220),
      hasEditor: !!document.querySelector('.chat-input-editor'),
    };
  });
  log('STATE loggedInGuess=' + st.loggedInGuess + ' marks=' + JSON.stringify(st.loginMarks) + ' editor=' + st.hasEditor);
  log('STATE url=' + st.url);
  log('STATE bodyHead=' + JSON.stringify(st.bodyHead));
  fs.writeFileSync(path.join(OUT_DIR, 'state.json'), JSON.stringify(st, null, 2));
  log('CHECK DONE');
} catch (e) {
  log('CHECK FAILED: ' + String(e?.message || e));
} finally {
  try { if (ctx) await ctx.close(); } catch {}
  log('browser closed, exit');
  process.exit(0);
}
