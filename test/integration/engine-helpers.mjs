/**
 * 引擎集成测试共享辅助件（`verify:engine` **四个**测试文件共用；从 `engine.test.mjs` 抽件；custom 侧页面已移入 `custom-fixtures.mjs`）：
 *   · `freshRoot` / `writeBrowserConfig` / `makeBrowser` —— 临时目录与浏览器装配（一律临时 profileDir，绝不用探针 profile）；
 *   · `startFixtureServer` / `closeFixtureServer` —— 本地 fixture 页服务器（通用页：blob 下载页 / 无开关页 / 会话复用页
 *     + 答复路由；**custom 侧 fixture 页**在 `custom-fixtures.mjs`，并入 pages 表与 `/custom-sent` 路由）。
 *
 * 浏览器选择 = 配置 `browser.mode/edge` + `channel=msedge`（本机实测通道；可用 FREE_OUTSOURCE_BROWSER_MODE/CHANNEL 覆盖）。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const { BrowserHost, resolveBrowserOptions } = await load('src/engine/browser.mjs');
import { customFixtureInit, customFixturePages, handleCustomFixtureRequest } from './custom-fixtures.mjs';

// 防止外部环境把探针 profile 注入本测试（本测试一律使用临时 profileDir）
delete process.env.FREE_OUTSOURCE_PROFILE_DIR;

/** 测试临时根（各测试文件用各自的基目录，避免并行跑测试时互踩） */
export function tempBase(name) {
  return path.join(REPO, '.thincoder', 'tmp', name);
}

const TMP = tempBase('verify-engine');

export const DOWNLOAD_BODY = '引擎下载捕获 verify-ok\n';
export const TEXTAREA_PLACEHOLDER = '给 DeepSeek 发送消息';

export function freshRoot(name, baseDir = TMP) {
  const dir = path.join(baseDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 写 browser 段配置（走应用的配置读取路径：readConfigBrowser → resolveBrowserOptions） */
export function writeBrowserConfig(userDataDir, browser = { mode: 'edge', channel: 'msedge' }) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    `${JSON.stringify({ version: 1, browser }, null, 2)}\n`,
    'utf8',
  );
}

export function makeBrowser(userDataDir, logs = []) {
  writeBrowserConfig(userDataDir);
  return new BrowserHost({
    userDataDir,
    log: (m) => logs.push(m),
    browserOptions: resolveBrowserOptions({ env: process.env, configBrowser: { mode: 'edge', channel: 'msedge' } }),
  });
}

/**
 * 会话复用 fixture 页（`engine.session.test.mjs` 用）：
 * 可见 textarea（placeholder 与 DeepSeek 同款 ⇒ 真实 checkLogin 判 ready）；Enter ⇒ 追加「本单回合-N」块
 * + 按 `behaviors` 列表逐单取通道（stream=POST /api/chat 取本地答复 / hang=POST /api/hang 永不回包 / drop=不发请求）。
 * `#chat` 内 `.message-container > .ds-markdown` 结构供真实 DOM 兜底（`deepseek-dom.collectDomAnswer`）使用。
 */
function sessionPageHtml(search) {
  const behaviors = (search.get('behaviors') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return `<!doctype html><html><body>
    <div id="chat"></div>
    <textarea id="ta" placeholder="${TEXTAREA_PLACEHOLDER}"></textarea>
    <script>
      const chat = document.getElementById('chat');
      const ta = document.getElementById('ta');
      window.__foModes = ${JSON.stringify(behaviors)};
      window.__foSends = 0;
      window.__foReset = () => { chat.innerHTML = ''; };
      function appendTurn(text) {
        const msg = document.createElement('div');
        msg.className = 'message-container';
        const block = document.createElement('div');
        block.className = 'ds-markdown';
        block.textContent = text;
        msg.appendChild(block);
        chat.appendChild(msg);
      }
      ta.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        const mode = window.__foModes.shift() ?? 'stream';
        window.__foSends += 1;
        if (mode === 'drop') return;
        appendTurn('本单回合-' + window.__foSends);
        fetch(mode === 'hang' ? '/api/hang' : '/api/chat', { method: 'POST', body: ta.value }).catch(() => {});
      });
    </script>
    </body></html>`;
}

/** fixture 页服务器：blob 下载页（正常名 / 穿越名）+ 无开关页（Enter 会真的提交，用作「是否发送」的观测点）+ 会话复用页与答复路由 */
export function startFixtureServer() {
  const state = { sent: 0, sentBodies: [], chatRequests: 0, hangRequests: 0, openSessions: 0, ...customFixtureInit() };
  const pages = {
    '/dl-normal': `<!doctype html><html><body>
      <a id="dl" download="verify-dl.txt">下载</a>
      <script>document.getElementById('dl').href = URL.createObjectURL(new Blob([${JSON.stringify(DOWNLOAD_BODY)}], { type: 'text/plain' }));</script>
      </body></html>`,
    '/dl-hostile': `<!doctype html><html><body>
      <a id="dl" download="..\\..\\a:b?c.py">下载</a>
      <script>document.getElementById('dl').href = URL.createObjectURL(new Blob(["穿越名\\n"], { type: 'text/plain' }));</script>
      </body></html>`,
    '/no-toggle': `<!doctype html><html><body>
      <form id="f" method="POST" action="/sent">
        <textarea id="ta" placeholder="${TEXTAREA_PLACEHOLDER}"></textarea>
      </form>
      <script>
        document.getElementById('ta').addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('f').requestSubmit(); }
        });
      </script>
      </body></html>`,
    ...customFixturePages(),
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/sent') {
      state.sent += 1;
      const chunks = [];
      for await (const c of req) chunks.push(c);
      state.sentBodies.push(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('sent');
      return;
    }
    if (await handleCustomFixtureRequest(req, res, url, state)) return;
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      state.chatRequests += 1;
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`应答-${state.chatRequests}`);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/hang') {
      state.hangRequests += 1;
      return; // 不回包：请求可被观测、响应永不出现 ⇒ 引擎走 DOM 兜底（J9）/ 运行中可被取消（J8）
    }
    if (url.pathname === '/session') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(sessionPageHtml(url.searchParams));
      return;
    }
    const body = pages[url.pathname] ?? '<!doctype html><html><body>unknown</body></html>';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, state, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** 关闭 fixture 服务器：先掐掉未收口的连接（/api/hang 悬挂请求会让裸 close 永不回调），再 close */
export async function closeFixtureServer(server) {
  try {
    server.closeAllConnections?.();
  } catch {
    /* 忽略 */
  }
  await new Promise((resolve) => server.close(() => resolve()));
}
