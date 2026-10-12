/**
 * 引擎集成测试共享辅助件（`verify:engine` 两个测试文件共用；从 `engine.test.mjs` 抽件）：
 *   · `freshRoot` / `writeBrowserConfig` / `makeBrowser` —— 临时目录与浏览器装配（一律临时 profileDir，绝不用探针 profile）；
 *   · `startFixtureServer` / `closeFixtureServer` —— 本地 fixture 页服务器（下载页 / 无开关页 / 会话复用页 + 答复路由）。
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

/**
 * 自定义外包工 fixture 站（`engine.custom.test.mjs` 用；`docs/batches/b7-custom-workers.md` §2「验收对照」2）：
 * 预置一条「上一单」回合（模拟会话复用残留）+ Enter / 按钮两种发送；发送 ⇒ 清空输入区 + 追加用户气泡（回声）+ 延迟追加本单回复。
 * 回合容器 = `.message`（含 `data-message-author-role`），命中回复候选链第一项。
 */
function customPageHtml() {
  return `<!doctype html><html><body>
    <div id="chat"></div>
    <div id="composer">
      <textarea id="ta" placeholder="输入消息"></textarea>
      <button id="send-btn">发送</button>
    </div>
    <script>
      const chat = document.getElementById('chat');
      const ta = document.getElementById('ta');
      window.__foCustomSends = 0;
      function appendTurn(role, text) {
        const el = document.createElement('div');
        el.className = 'message ' + role;
        el.setAttribute('data-message-author-role', role);
        el.textContent = text;
        chat.appendChild(el);
      }
      function submit(via) {
        if (!ta.value.trim()) return;
        const text = ta.value;
        window.__foCustomSends += 1;
        const n = window.__foCustomSends;
        ta.value = '';
        appendTurn('user', text);
        fetch('/custom-sent?via=' + via + '&n=' + n, { method: 'POST', body: text }).catch(() => {});
        setTimeout(() => appendTurn('assistant', '自定义回复-' + n), 400);
      }
      appendTurn('assistant', '上一单回复（不应交付）');
      ta.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        submit('enter');
      });
      document.getElementById('send-btn').addEventListener('click', () => submit('button'));
    </script>
  </body></html>`;
}

/** 无输入区页（b7 R11-b）：打开后输入区候选链全未命中 ⇒ opening 判 `E_SELECTOR_MISSING` */
const CUSTOM_NO_INPUT_HTML = `<!doctype html><html><body><h1>示例站点</h1><p>页面暂无输入区。</p></body></html>`;

/** 无回复页（b7 R11-b / R11-c）：Enter ⇒ 清空 + 追加**非候选链**容器 `.bubble-item`（replySelector 可救） */
const CUSTOM_NO_REPLY_HTML = `<!doctype html><html><body>
  <div id="feed"></div>
  <textarea id="ta" placeholder="输入消息"></textarea>
  <script>
    const ta = document.getElementById('ta');
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      const text = ta.value;
      ta.value = '';
      fetch('/custom-sent?via=enter', { method: 'POST', body: text }).catch(() => {});
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'bubble-item';
        el.textContent = '非候选容器的回复';
        document.getElementById('feed').appendChild(el);
      }, 300);
    });
  </script>
</body></html>`;

/** 发送无反应页（b7 R11-d）：Enter 无任何处理（不清空、无新元素） ⇒ 6s 发送未确认 */
const CUSTOM_STUCK_HTML = `<!doctype html><html><body>
  <div id="chat"></div>
  <textarea id="ta" placeholder="输入消息"></textarea>
</body></html>`;

/** fixture 页服务器：blob 下载页（正常名 / 穿越名）+ 无开关页（Enter 会真的提交，用作「是否发送」的观测点）+ 会话复用页与答复路由 */
export function startFixtureServer() {
  const state = { sent: 0, sentBodies: [], chatRequests: 0, hangRequests: 0, openSessions: 0, customSends: { enter: 0, button: 0 } };
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
    '/custom': customPageHtml(),
    '/custom-noinput': CUSTOM_NO_INPUT_HTML,
    '/custom-noreply': CUSTOM_NO_REPLY_HTML,
    '/custom-stuck': CUSTOM_STUCK_HTML,
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
    if (req.method === 'POST' && url.pathname === '/custom-sent') {
      const via = url.searchParams.get('via') ?? 'unknown';
      state.customSends[via] = (state.customSends[via] ?? 0) + 1;
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('sent');
      return;
    }
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
