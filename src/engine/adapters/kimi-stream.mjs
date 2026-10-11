/**
 * Kimi 答复流（分帧 JSON 行流）解析 —— 纯函数，可单测（无 IO、无浏览器依赖）。
 *
 * 协议与判据（本批读数）：`docs/batches/b3-kimi-adapter.md` §2「机制设计·收答复（主通道）」+ §5「切分 A 读数」；
 * fixture 对照：`probe/out13/chat-resp.txt`（19160 字节全量样本；正文首行「Kimi 探针测试成功。」=`probe/out13/run.log:6`）。
 *
 * 帧形（样本实测）：
 *   · SET 帧    `{"op":"set", "mask":"block.text",  "block":{"text": {"content":"K"}, …}}`（内容嵌在值内）
 *               `{"op":"set", "mask":"block.think", "block":{"think":{"content":"用户"}, …}}`
 *               ⇒ **首帧快照必须计入正文 / 思考区**（丢弃 ⇒ 正文丢首字、思考丢首段——同类先例 `adapters.md:121`）；
 *   · append 帧 `{"op":"append", "mask":"block.text.content" | "block.think.content", "block":{…}}`（增量续写）；
 *   · 结束标记 ① `{"eventOffset":N, "done":{}}` 帧（**最高优先**）；
 *   · 结束标记 ② 否则按**助手消息**归并：`{"op":"set", "mask":"message.status", "message":{"id","status":"MESSAGE_STATUS_COMPLETED"}}`
 *               —— 状态与冻结 marker 等值比较；system / user 消息的完成态不计（样本 eventOffset=3/4）；助手 id 由
 *               `role=assistant` 的 `mask:"message"` 帧归并（其完成帧只带 id 不带 role）；两集合于扫描末尾归并
 *               —— **裁决不依赖两帧的到达先后**；
 *   · 其余帧（`chat` / `chat.lastRequest` / `chat.name` / `message`(system|user) / `block.multiStage` / `block.stage` / heartbeat）
 *               不落正文，记入 `skipped`。
 * 结束标记缺失 ⇒ `finished=false`（可能被截断）——消费方 `src/engine/answer.mjs:86` 据此抛 `E_STREAM_PARSE`（同 DeepSeek 口径）。
 *
 * 解析策略（D1）：**帧内 JSON 对象扫描，不依赖长度前缀**——引擎拿到的响应体已经过 UTF-8 解码，
 * 样本里 1 字节标志 + 4 字节大端长度前缀已现损耗（可见替换字符与 `\u0000`）⇒ 依赖前缀 = 脆。
 */
export const SET_TEXT_MASK = 'block.text';
export const SET_THINK_MASK = 'block.think';
export const APPEND_TEXT_MASK = 'block.text.content';
export const APPEND_THINK_MASK = 'block.think.content';
/** 助手消息完成态（冻结 marker 原文；等值比较，不用后缀匹配） */
export const MSG_STATUS_COMPLETED = 'MESSAGE_STATUS_COMPLETED';

/** 答复流 URL 命中判定：精确到 `/kimi.gateway.chat.v1.ChatService/Chat` 结尾（剥离查询串；不误命中 `ListKimiPlus` / `ListMessages` 等） */
export function matchStreamUrl(url) {
  return typeof url === 'string' && /\/kimi\.gateway\.chat\.v1\.ChatService\/Chat(\?|$)/.test(url);
}

/** 内容读取：SET 帧与 append 帧的内容都在 `block.<text|think>.content` */
function contentOf(obj, key) {
  const v = obj?.block?.[key]?.content;
  return typeof v === 'string' ? v : '';
}

/**
 * 从 `{"` 起点找配对的 `}`（字符串感知；`{` 在 JSON 字符串内不计）——找不到（截断）⇒ -1。
 */
export function findObjectEnd(text, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 帧内 JSON 对象扫描：从每个 `{"` 起点尝试配对 + `JSON.parse` 校验（失败 ⇒ 只前进 2 字符继续扫）。
 * 前缀损耗字节不会伪造出成对可解析对象（前缀 = 1 字节标志 + 4 字节长度，长度字节自身不构成 `{"`）。
 */
export function scanJsonObjects(text) {
  const objs = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('{"', i);
    if (start < 0) break;
    const end = findObjectEnd(text, start);
    if (end < 0) break; // 尾部截断 ⇒ 之后不可能再有完整对象
    try {
      objs.push(JSON.parse(text.slice(start, end + 1)));
      i = end + 1;
    } catch {
      i = start + 2; // 损坏字节造成的伪起点 ⇒ 跳过继续
    }
  }
  return objs;
}

function pushSkipped(out, desc) {
  if (out.skipped.length < 20) out.skipped.push(desc);
}

/**
 * 解析答复流正文。
 * @returns {{text:string, thinking:string, finished:boolean, events:number, skipped:Array<object>}}
 *   `text` / `thinking` = 正文 / 思考区（SET 快照 + append 增量，按序拼接）；`events` = 解析出的帧对象数。
 */
export function parseChatStream(raw) {
  const out = { text: '', thinking: '', finished: false, events: 0, skipped: [] };
  const assistantIds = new Set();
  const completedIds = new Set();
  let doneSeen = false;

  for (const obj of scanJsonObjects(String(raw ?? ''))) {
    out.events++;
    const op = typeof obj.op === 'string' ? obj.op : null;
    const mask = typeof obj.mask === 'string' ? obj.mask : null;

    // 结束标记①：done 帧（最高优先；裁决挪到扫描结束后，与帧序无关）
    if (obj.done && typeof obj.done === 'object') {
      doneSeen = true;
      pushSkipped(out, { done: true });
      continue;
    }

    // 助手消息 id 归并（完成判定②的归属）：message 帧按 role；think / text 内容块按 block.messageId 兜底
    if (op === 'set' && mask === 'message') {
      const m = obj.message;
      if (m && m.role === 'assistant' && typeof m.id === 'string' && m.id) assistantIds.add(m.id);
    }
    if (
      obj.block &&
      typeof obj.block.messageId === 'string' &&
      obj.block.messageId &&
      (mask === SET_THINK_MASK || mask === SET_TEXT_MASK || mask === APPEND_THINK_MASK || mask === APPEND_TEXT_MASK)
    ) {
      assistantIds.add(obj.block.messageId);
    }

    // 正文 / 思考区（SET 快照与 append 增量都计入）
    if (mask === SET_TEXT_MASK || mask === APPEND_TEXT_MASK) {
      out.text += contentOf(obj, 'text');
      continue;
    }
    if (mask === SET_THINK_MASK || mask === APPEND_THINK_MASK) {
      out.thinking += contentOf(obj, 'think');
      continue;
    }

    // 结束标记②：仅助手消息的完成帧（system / user 不计；状态用冻结 marker 等值比较）
    if (mask === 'message.status') {
      const m = obj.message;
      if (m && typeof m.id === 'string' && m.status === MSG_STATUS_COMPLETED) completedIds.add(m.id);
    }

    pushSkipped(out, op || mask ? { op, mask } : obj.heartbeat ? { heartbeat: true } : { keys: Object.keys(obj).slice(0, 3) });
  }

  // 完成裁决：done 帧最高优先；否则 = 完成帧 id 与助手消息 id 的交集（两集合归并 ⇒ 不依赖两帧的到达顺序）
  out.finished = doneSeen || [...completedIds].some((id) => assistantIds.has(id));

  return out;
}
