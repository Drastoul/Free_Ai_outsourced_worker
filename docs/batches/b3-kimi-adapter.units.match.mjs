/**
 * b3 随批单元 · 答复流命中判定（`kimi.stream.match`；K6 读数：精确到 `/kimi.gateway.chat.v1.ChatService/Chat` 结尾）
 *
 * 反例 = 探针实际观测到的同源接口（`probe/out8/run.log:145-146` · `probe/out10/run.log:4-6` · `probe/out16/result.json`）：
 * 宽松正则会误命中（本批 K6 既有读数）；判定 = 剥离查询串后精确到结尾。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './b3-kimi-adapter.units.fixtures.mjs';

const kimi = (await load('src/engine/adapters/kimi.mjs')).default;

test('命中判定：正例（含查询串）命中；探针实际观测的 5 个同源接口不误命中', () => {
  const positives = [
    'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat',
    'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat?x=1',
  ];
  const negatives = [
    'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.KimiPlusService/ListKimiPlus',
    'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages',
    'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatStatusService/MarkChatAsRead',
    'https://www.kimi.com/apiv2/kimi.gateway.message.v1.MessageCenterService/GetReadStates',
    'https://www.kimi.com/apiv2-files/file/upload',
  ];

  for (const url of positives) assert.equal(kimi.stream.match(url), true, `应命中：${url}`);
  for (const url of negatives) assert.equal(kimi.stream.match(url), false, `不得命中：${url}`);
});

test('命中判定边界：同前缀更长路径不命中；非字符串输入 ⇒ false', () => {
  assert.equal(kimi.stream.match('https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chatty'), false);
  assert.equal(kimi.stream.match('https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat/extra'), false);
  assert.equal(kimi.stream.match(null), false);
  assert.equal(kimi.stream.match(undefined), false);
});
