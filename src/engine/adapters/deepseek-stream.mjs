/**
 * DeepSeek 答复流（SSE）解析 —— 纯函数，可单测（无 IO、无浏览器依赖）。
 *
 * 协议权威：`docs/design/modules/adapters.md`「收答复主通道：流协议」。
 * Fixture 对照：`docs/batches/b1-core-loop.fixtures/raw-sse.txt` →
 * `docs/batches/b1-core-loop.fixtures/answer-sse.expected.md`（逐字一致；108 字符 = 首帧快照「完成」2 + 后续 APPEND 106；无尾换行）。
 *
 * 纪律（探针教训）：正文只在「内容路径」上累积；status / 元数据帧不得混入正文。
 * 基线更正：`probe/out3/answer-sse.md`（106 字）是探针 3 解析器 bug 的产物（首帧快照被丢），不得作为验收判据。
 */
export const CONTENT_PATH_SUFFIX = '/content';
export const THINKING_PATH_SUFFIX = 'thinking_content';

/** 答复流 URL 命中判定：`POST https://chat.deepseek.com/api/v0/chat/completion` */
export function matchStreamUrl(url) {
  return typeof url === 'string' && /\/api\/v0\/chat\/completion(\?|$)/.test(url);
}

function isThinkingPath(p) {
  return typeof p === 'string' && p.endsWith(THINKING_PATH_SUFFIX);
}

/** 内容路径 = 以 `/content` 结尾且不是 thinking 路径（`…/thinking_content` 不满足 `/content` 结尾） */
function isContentPath(p) {
  if (typeof p !== 'string' || isThinkingPath(p)) return false;
  return p.endsWith(CONTENT_PATH_SUFFIX);
}

/**
 * 解析 SSE 流正文。
 * 帧形态（design §3.3）：
 *   A 首信息帧 `{"v":{"response":{…,"fragments":[{"type":"RESPONSE"|"THINK","content":"…"}]}}}`；
 *   B 带路径帧 `{"p":"…","o":"APPEND|SET|BATCH","v":…}`；
 *   C 续写帧 `{"v":"…"}`（无 p）——只追加到「当前路径」且仅当它是内容路径。
 * 结束标记：`{"p":"response/status","o":"SET","v":"FINISHED"}` 或 BATCH 帧内 `quasi_status:"FINISHED"`。
 *
 * 帧 A 处理：`type=RESPONSE` 的 content 累积入正文、`type=THINK` 累积入思考区，并把「当前路径」置为
 * 该 fragment 的 content 路径。**首帧 content 是快照，必须累积**；后续 APPEND 从其后续写、不重复
 *（fixture 实证：`docs/batches/b1-core-loop.fixtures/raw-sse.txt:7` 首帧 `content="完成"`，`:9` 起才 APPEND 续写）。
 *
 * @returns {{text:string, thinking:string, finished:boolean, events:number, skipped:Array<object>}}
 */
export function parseSSE(raw) {
  const out = { text: '', thinking: '', finished: false, events: 0, skipped: [] };
  let lastPath = null;

  for (const rawLine of String(raw ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue; // `event:` 行只作事件分类，不参与内容
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let obj;
    try {
      obj = JSON.parse(payload);
    } catch {
      continue; // JSON 解析失败 ⇒ 跳过
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    out.events++;

    if (typeof obj.p === 'string') {
      // 帧形态 B
      if (isThinkingPath(obj.p)) {
        lastPath = obj.p;
        if (typeof obj.v === 'string') out.thinking += obj.v;
      } else if (isContentPath(obj.p)) {
        lastPath = obj.p;
        if (typeof obj.v === 'string') out.text += obj.v;
      } else {
        // 非内容路径（status / 元数据）：只更新当前路径指针，不追加
        lastPath = obj.p;
        if (obj.p === 'response/status' && obj.v === 'FINISHED') out.finished = true;
        if (Array.isArray(obj.v)) {
          for (const item of obj.v) {
            if (item && item.p === 'quasi_status' && item.v === 'FINISHED') out.finished = true;
          }
        }
        if (out.skipped.length < 20) {
          out.skipped.push({ path: obj.p, v: typeof obj.v === 'string' ? obj.v : typeof obj.v });
        }
      }
      continue;
    }

    const fragments = obj?.v?.response?.fragments;
    if (Array.isArray(fragments)) {
      // 帧形态 A：首帧快照累积（RESPONSE → 正文 / THINK → 思考区），并置当前路径
      for (const f of fragments) {
        if (!f || typeof f !== 'object') continue;
        const content = typeof f.content === 'string' ? f.content : '';
        if (f.type === 'RESPONSE') {
          out.text += content;
          lastPath = 'response/fragments/-1/content';
        } else if (f.type === 'THINK') {
          out.thinking += content;
          lastPath = 'response/fragments/-1/thinking_content';
        }
      }
      continue;
    }

    // 帧形态 C：续写帧（无 p）
    if (typeof obj.v === 'string') {
      if (isThinkingPath(lastPath)) out.thinking += obj.v;
      else if (isContentPath(lastPath)) out.text += obj.v;
    }
  }

  return out;
}
