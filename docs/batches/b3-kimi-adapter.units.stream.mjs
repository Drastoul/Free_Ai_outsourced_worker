/**
 * b3 随批单元 · 流解析（`src/engine/adapters/kimi-stream.mjs`；由入口 `b3-kimi-adapter.units.mjs` 聚合执行）
 *
 * 设计权威：`docs/design/modules/adapters.md` §2 适配器接口 + 本批机制设计「收答复（主通道）」——
 *   两类帧形（SET 快照计内容 / append 增量）· finished 两级判定（done 帧优先；仅助手消息按 role 归并）；
 *   返回形冻结 `{text,thinking,finished,events,skipped}`（消费方 `src/engine/answer.mjs:85-92`：
 *   `finished=false` ⇒ 抛 `E_STREAM_PARSE`）。
 * 基线：`chat-resp.txt`（K6 全量样本逐字节副本）↔ `answer-stream.expected.md`
 *   （**独立推导**，不得由被测解析器生成——推导路径与读数见期望文件头）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, readRaw, readExpected } from './b3-kimi-adapter.units.fixtures.mjs';

const { parseChatStream } = await load('src/engine/adapters/kimi-stream.mjs');
const kimi = (await load('src/engine/adapters/kimi.mjs')).default;

// ---------------------------------------------------------------------------
// 全量样本（K6 fixture）
// ---------------------------------------------------------------------------

test('全量样本：正文 / 思考区与期望基线逐字一致（SET 快照首字「K」与首段「用户」计入）', () => {
  const expected = readExpected();
  const parsed = parseChatStream(readRaw());

  assert.equal(parsed.text, expected.text, '正文必须与 answer-stream.expected.md 逐字一致');
  assert.equal(parsed.text.length, 59, '正文长度 = 59（独立推导读数）');
  assert.equal(parsed.thinking, expected.thinking, '思考区必须与期望基线逐字一致');
  assert.equal(parsed.thinking.length, 174, '思考区长度 = 174（独立推导读数）');
  assert.equal(parsed.text.startsWith('K'), true, 'SET 快照首字不得丢（eventOffset 106 的 SET 帧）');
  assert.equal(parsed.thinking.startsWith('用户'), true, '思考区 SET 快照首段不得丢（eventOffset 8 的 SET 帧）');
});

test('全量样本：完成判定与帧计数；返回形 = 冻结键集', () => {
  const parsed = parseChatStream(readRaw());

  assert.equal(parsed.finished, true, '样本含 done 帧与助手完成帧 ⇒ finished=true');
  assert.equal(parsed.events, 134, '事件数 = 帧对象总数（133 个带 eventOffset 帧 + 1 个裸 heartbeat）');
  assert.equal(parsed.skipped.length, 15, '非内容帧 = 134 − 119 内容帧（24 正文帧 + 95 思考帧）');
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ['events', 'finished', 'skipped', 'text', 'thinking'],
    '返回形冻结（不得增删字段）',
  );
  assert.equal(kimi.stream.parse, parseChatStream, 'stream.parse 装配冻结（适配器 = 解析器实现）');
});

test('全量样本：正文与思考不混区（思考不含代码围栏 / 正文不含思考文本）', () => {
  const parsed = parseChatStream(readRaw());

  assert.equal(parsed.thinking.includes('```'), false, '思考区不得混入正文代码围栏');
  assert.equal(parsed.text.includes('用户要求'), false, '正文不得混入思考区文本');
});

// ---------------------------------------------------------------------------
// 帧形专项（SET 快照 / 截断 / 完成归属）
// ---------------------------------------------------------------------------

test('SET-only 快照：append 帧 mask 改名 ⇒ text="K" / thinking="用户"（首帧快照计数的直接证据）', () => {
  const raw = readRaw();
  const onlySets = raw.replace(/"mask":"block\.(text|think)\.content"/g, '"mask":"block.$1.other"');
  assert.notEqual(onlySets, raw, 'append 帧改名必须命中样本（fixture 变化时本用例应红）');

  const parsed = parseChatStream(onlySets);
  assert.equal(parsed.text, 'K', '仅 SET 帧 ⇒ 正文 = 快照首字');
  assert.equal(parsed.thinking, '用户', '仅 SET 帧 ⇒ 思考 = 快照首段');
});

test('截断样本（去 done 帧与助手完成帧）⇒ finished=false；正文不受影响', () => {
  const raw = readRaw();
  const cutIdx = raw.lastIndexOf('{"op":"set", "mask":"message.status"');
  assert.ok(cutIdx > 0, '样本应含助手 message.status 完成帧（fixture 变化时本用例应红）');

  const parsed = parseChatStream(raw.slice(0, cutIdx));
  assert.equal(parsed.finished, false, '无 done 帧且无助手完成帧 ⇒ 不得计完成（消费方据此抛 E_STREAM_PARSE）');
  assert.equal(parsed.text, readExpected().text, '截断只去掉结束帧，正文不受影响');
});

test('完成判定两路独立：仅 done 帧 / 仅助手完成帧 ⇒ finished 均 true', () => {
  const raw = readRaw();
  const DONE = '{"eventOffset":131, "done":{}}';
  assert.ok(raw.includes(DONE), '样本应含 done 帧（fixture 变化时本用例应红）');
  const cutIdx = raw.lastIndexOf('{"op":"set", "mask":"message.status"');
  const truncated = raw.slice(0, cutIdx);

  assert.equal(parseChatStream(truncated + DONE).finished, true, 'done 帧路径独立成立');
  const noDone = raw.replace(DONE, '');
  assert.ok(noDone.length < raw.length, 'done 帧应被移除');
  assert.equal(parseChatStream(noDone).finished, true, '助手 message.status 完成帧路径独立成立');
});

test('完成归属加固：帧序无关 / marker 等值比较 / system-user 完成帧不计', () => {
  const completed = (id, status) =>
    `{"op":"set", "mask":"message.status", "message":{"id":"${id}", "status":"${status}"}}`;

  // 完成帧先于助手 role 帧 ⇒ 两集合于扫描末尾归并 ⇒ 仍判完成
  const statusFirst = completed('m1', 'MESSAGE_STATUS_COMPLETED')
    + '{"op":"set", "mask":"message", "message":{"id":"m1", "role":"assistant"}}';
  assert.equal(parseChatStream(statusFirst).finished, true, '裁决不得依赖两帧到达先后');

  // 近似 marker（NOT_COMPLETED）⇒ 等值比较，不得计完成
  const nearMiss = completed('m1', 'MESSAGE_STATUS_NOT_COMPLETED')
    + '{"op":"set", "mask":"message", "message":{"id":"m1", "role":"assistant"}}';
  assert.equal(parseChatStream(nearMiss).finished, false, '近似 marker 不得计完成（等值比较）');

  // system / user 消息的完成帧不计
  const userDone = completed('u1', 'MESSAGE_STATUS_COMPLETED')
    + '{"op":"set", "mask":"message", "message":{"id":"u1", "role":"user"}}';
  assert.equal(parseChatStream(userDone).finished, false, '仅助手消息参与完成归并');
});
