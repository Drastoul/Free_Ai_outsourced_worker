/**
 * 自定义外包工（custom）侧集成 fixture 页与提交体观测点（`engine.custom.test.mjs` / `engine.custom.b8.test.mjs` 用；
 * 由 `engine-helpers.startFixtureServer` 并入 pages 表与路由——`handleCustomFixtureRequest` 处理 `/custom-sent`，
 * 逐单把纯文本 body 记入 `state.customSentBodies`（多行一次发送的机器判据靠它））。
 *
 * 页面（b7 面）：`/custom`（textarea + Enter / 按钮两种发送 + 预置旧回合）· `/custom-noinput`（无输入区）·
 * `/custom-noreply`（提交后追加**链外**类名 `qa-block-7f3` 的容器）· `/custom-stuck`（Enter 无反应）。
 * 页面（b8 面）：`/custom-slate`（contenteditable：首次聚焦后把节点替换为新节点、只认按键输入）· `/custom-reject-write`
 * （写入必失败：输入被拦，读回恒为空）· `/custom-census`（回复容器类名在链外 + 可见文本，供普查三段判据）·
 * `/custom-newfamily`（回复容器 `agent-chat__bubble--ai` + 正文 `hyc-content-md` ⇒ 候选链第 6 项命中）·
 * `/custom-overlay`（整屏遮挡层 `qa-mask-7f3`：链外类名、无关闭钮、仅 Escape 可消除）。
 * 类名唯一性（I⑦，三处不重名）：`qa-block-7f3`（noreply）· `qa-census-7f3`（census）· `qa-mask-7f3`（overlay）。
 */

/**
 * b7 主 fixture：预置一条「上一单」回合（模拟会话复用残留）+ Enter / 按钮两种发送；发送 ⇒ 清空输入区 + 追加用户气泡（回声）
 * + 延迟追加本单回复。回合容器 = `.message`（含 `data-message-author-role`），命中回复候选链第一项。
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

/** 无回复页（b7 R11-b / R11-c）：Enter ⇒ 清空 + 追加**链外**容器 `qa-block-7f3`（候选链 11 项均不命中；replySelector 可救） */
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
        el.className = 'qa-block-7f3';
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

/**
 * b8 Slate 类站点：`contenteditable` 编辑器 —— **首次聚焦后把节点替换为新节点**（原句柄脱离 DOM），
 * 除按键输入外不认任何写入手段（写入全程只发键盘事件 ⇒ 可通过）。Enter ⇒ 提交（body = 编辑器 `innerText`）。
 */
const CUSTOM_SLATE_HTML = `<!doctype html><html><body>
  <div id="chat"></div>
  <div id="box" contenteditable="true" style="min-height:40px;width:100%;border:1px solid #999"></div>
  <script>
    const chat = document.getElementById('chat');
    let box = document.getElementById('box');
    let replaced = false;
    let sends = 0;
    window.__foSlateReplaced = () => replaced;
    function appendTurn(role, text) {
      const el = document.createElement('div');
      el.className = 'message ' + role;
      el.setAttribute('data-message-author-role', role);
      el.textContent = text;
      chat.appendChild(el);
    }
    function submit() {
      const text = box.innerText;
      if (!text.trim()) return;
      sends += 1;
      box.innerText = '';
      appendTurn('assistant', '自定义回复-' + sends);
      fetch('/custom-sent?via=enter&n=' + sends + '&replaced=' + (replaced ? '1' : '0'), { method: 'POST', body: text }).catch(() => {});
    }
    box.addEventListener('focus', () => {
      if (replaced) return;
      replaced = true;
      const fresh = box.cloneNode(false);
      box.replaceWith(fresh);
      box = fresh;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      submit();
    });
  </script>
</body></html>`;

/**
 * b8 写入必失败页：readonly + `beforeinput` / `keydown` 阻止 —— 输入区文本恒为空 ⇒ 读回校验不过 ⇒ 重试耗尽
 * ⇒ `E_SEND_FAILED`（集成判据：错误码 + message 含尝试数与普查）。
 */
const CUSTOM_REJECT_WRITE_HTML = `<!doctype html><html><body>
  <div id="chat"></div>
  <textarea id="ta" placeholder="输入消息" readonly></textarea>
  <script>
    const ta = document.getElementById('ta');
    ta.addEventListener('beforeinput', (e) => e.preventDefault());
    ta.addEventListener('keydown', (e) => e.preventDefault());
  </script>
</body></html>`;

/** b8 普查页：回复容器类名在链外（`qa-census-7f3`）+ 可见文本 + `[role=log]` 家族 ⇒ E_NO_RESPONSE 时普查三段可判 */
const CUSTOM_CENSUS_HTML = `<!doctype html><html><body>
  <div id="feed" role="log"></div>
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
        el.className = 'qa-census-7f3';
        el.textContent = '普查可见回复文本';
        document.getElementById('feed').appendChild(el);
      }, 300);
    });
  </script>
</body></html>`;

/** b8 新族页：回复容器类名 = `agent-chat__bubble--ai` + 正文 `hyc-content-md`（链外于原 3 项；第 6 项命中） */
const CUSTOM_NEWFAMILY_HTML = `<!doctype html><html><body>
  <div id="chat"></div>
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
        const outer = document.createElement('div');
        outer.className = 'agent-chat__bubble--ai';
        const inner = document.createElement('div');
        inner.className = 'hyc-content-md';
        inner.textContent = '新族回复文本';
        outer.appendChild(inner);
        document.getElementById('chat').appendChild(outer);
      }, 300);
    });
  </script>
</body></html>`;

/** b8 遮挡页：整屏遮挡层 `qa-mask-7f3`（链外类名、无关闭钮）**仅 Escape 可消除**；消除后写入 ⇒ 提交 ⇒ 追加回复 */
const CUSTOM_OVERLAY_HTML = `<!doctype html><html><body>
  <div id="mask" class="qa-mask-7f3" style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99">
    <div id="card">任务模式全新升级</div>
  </div>
  <div id="chat"></div>
  <textarea id="ta" placeholder="输入消息"></textarea>
  <script>
    const mask = document.getElementById('mask');
    const ta = document.getElementById('ta');
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { mask.remove(); return; }
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      const text = ta.value;
      if (!text.trim()) return;
      ta.value = '';
      fetch('/custom-sent?via=enter', { method: 'POST', body: text }).catch(() => {});
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'message assistant';
        el.setAttribute('data-message-author-role', 'assistant');
        el.textContent = '遮挡处置后的回复';
        document.getElementById('chat').appendChild(el);
      }, 300);
    });
  </script>
</body></html>`;

/** custom 侧 fixture 页表（并入 `engine-helpers.startFixtureServer` 的 pages） */
export function customFixturePages() {
  return {
    '/custom': customPageHtml(),
    '/custom-noinput': CUSTOM_NO_INPUT_HTML,
    '/custom-noreply': CUSTOM_NO_REPLY_HTML,
    '/custom-stuck': CUSTOM_STUCK_HTML,
    '/custom-slate': CUSTOM_SLATE_HTML,
    '/custom-reject-write': CUSTOM_REJECT_WRITE_HTML,
    '/custom-census': CUSTOM_CENSUS_HTML,
    '/custom-newfamily': CUSTOM_NEWFAMILY_HTML,
    '/custom-overlay': CUSTOM_OVERLAY_HTML,
  };
}

/** custom 侧观测点初值（并入 fixture 服务器 state） */
export function customFixtureInit() {
  return { customSends: { enter: 0, button: 0 }, customSentBodies: [] };
}

/**
 * custom 侧路由：`POST /custom-sent?via=…` ⇒ 逐单计数（`state.customSends`）+ 记录提交体与查询参数
 * （`state.customSentBodies` = [{via, body, query}]；`query.replaced` 供 Slate 重建判据）。
 * @returns {Promise<boolean>} 是否已处理该请求
 */
export async function handleCustomFixtureRequest(req, res, url, state) {
  if (req.method !== 'POST' || url.pathname !== '/custom-sent') return false;
  const via = url.searchParams.get('via') ?? 'unknown';
  state.customSends[via] = (state.customSends[via] ?? 0) + 1;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  state.customSentBodies.push({ via, body: Buffer.concat(chunks).toString('utf8'), query: Object.fromEntries(url.searchParams) });
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('sent');
  return true;
}
