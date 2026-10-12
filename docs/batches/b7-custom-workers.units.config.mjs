/**
 * b7 单元测试 · 配置 schema 与补丁面（①②）—— 由入口 `b7-custom-workers.units.mjs` 聚合执行。
 * 判据 = 批次档 b7 §2「验收对照」1 的 ①（schema 归一化与隔离）/ ②（worker.add(custom) 与 worker.setDriver）。
 * 设计权威：docs/design/modules/settings-app.md §2（自定义外包工）；docs/design/overview.md「配置存储」§4（url / driver 字段）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../../src/main/config-schema.mjs';
import { applyPatch, PATCH_OPS, PLATFORM_CHOICES } from '../../src/settings/patches.mjs';

/** 配置样板（一个内置平台条目；与 patches 形状同源） */
function baseConfig() {
  return {
    workers: [
      { id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } },
    ],
  };
}

// ---------------------------------------------------------------------------
// ① config-schema：归一化与隔离
// ---------------------------------------------------------------------------

test('① schema：custom 条目 url / driver 归一化（driver 三键补齐、未给键空串）', () => {
  const r = normalizeConfig({
    workers: [
      { id: 'w-1', platform: 'custom', name: '站点A', url: 'https://example.com/chat', driver: { inputSelector: '.in', replySelector: '.reply' } },
      { id: 'w-2', platform: 'custom', name: '站点B', url: 'http://example.com/x' },
    ],
  });
  assert.deepEqual(r.issues, [], `合法输入不应产生 issue：${r.issues.join('｜')}`);
  assert.deepEqual(r.config.workers[0], {
    id: 'w-1',
    platform: 'custom',
    name: '站点A',
    enabled: true,
    url: 'https://example.com/chat',
    driver: { inputSelector: '.in', sendButtonSelector: '', replySelector: '.reply' },
    toggles: { thinking: false, search: false },
  });
  assert.deepEqual(r.config.workers[1].driver, { inputSelector: '', sendButtonSelector: '', replySelector: '' }, '缺 driver ⇒ 三键空串（通用启发式）');
  assert.equal(r.config.workers[1].url, 'http://example.com/x');
});

test('① schema：custom 缺 url / 相对路径 / 非 http(s) ⇒ 隔离该条并逐条记 issue', () => {
  const r = normalizeConfig({
    workers: [
      { id: 'w-1', platform: 'custom', name: '缺URL' },
      { id: 'w-2', platform: 'custom', name: '相对路径', url: '/chat' },
      { id: 'w-3', platform: 'custom', name: '非http', url: 'ftp://example.com' },
      { id: 'w-4', platform: 'custom', name: '保留', url: 'https://ok.example/x' },
    ],
  });
  assert.deepEqual(r.config.workers.map((x) => x.id), ['w-4'], '仅 url 合法的 custom 条目存活');
  assert.equal(r.issues.filter((x) => x.includes('自定义平台缺 url / 非法')).length, 3, `隔离 issue 逐条记：${r.issues.join('｜')}`);
});

test('① schema：内置平台条目带 url / driver ⇒ 记 issue 并丢弃该键（形状逐字不变）', () => {
  const r = normalizeConfig({
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', url: 'https://x', driver: { inputSelector: '.a' } }],
  });
  assert.deepEqual(
    r.config.workers[0],
    { id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } },
    '内置条目形状 = 五键，不含 url / driver',
  );
  assert.equal(r.issues.filter((x) => x.includes('仅自定义平台可用')).length, 2, `丢弃逐键记 issue：${r.issues.join('｜')}`);
});

test('① schema：driver 非对象 / 未知键 / 非字符串值 ⇒ 记 issue 并回退空串（不静默丢）', () => {
  const notObject = normalizeConfig({ workers: [{ platform: 'custom', name: 'X', url: 'https://x', driver: 'nope' }] });
  assert.deepEqual(notObject.config.workers[0].driver, { inputSelector: '', sendButtonSelector: '', replySelector: '' });
  assert.ok(notObject.issues.some((x) => x.includes('driver 非法')), notObject.issues.join('｜'));
  const badKeys = normalizeConfig({ workers: [{ platform: 'custom', name: 'X', url: 'https://x', driver: { nope: 1, inputSelector: 2 } }] });
  assert.deepEqual(badKeys.config.workers[0].driver, { inputSelector: '', sendButtonSelector: '', replySelector: '' });
  assert.ok(badKeys.issues.some((x) => x.includes('.nope 不在驱动三键之内')), badKeys.issues.join('｜'));
  assert.ok(badKeys.issues.some((x) => x.includes('.inputSelector 非法')), badKeys.issues.join('｜'));
});

// ---------------------------------------------------------------------------
// ② 补丁面：worker.add(custom) / worker.setDriver
// ---------------------------------------------------------------------------

test('② patches：九操作清单含 worker.setDriver；平台清单三项（custom = 自定义）', () => {
  assert.deepEqual(PATCH_OPS, [
    'worker.add',
    'worker.remove',
    'worker.rename',
    'worker.move',
    'worker.setEnabled',
    'worker.setToggles',
    'outbox.set',
    'session.set',
    'worker.setDriver',
  ]);
  assert.deepEqual(
    PLATFORM_CHOICES.map((p) => `${p.id}:${p.label}:${p.available ? '可' : '待支持'}`),
    ['deepseek:DeepSeek:可', 'kimi:Kimi:可', 'custom:自定义:可'],
    'label 只写「自定义」（「实验性」警示在提示文案 / 随包说明）',
  );
});

test('② worker.add(custom)：合法落盘形状（url trim + 三键空驱动 + toggles 默认关；纯函数）', async () => {
  const cfg = baseConfig();
  const snapshot = structuredClone(cfg);
  const r = await applyPatch(cfg, { op: 'worker.add', platform: 'custom', name: '某站点AI', url: '  https://example.com/chat  ' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.config.workers[1], {
    id: 'w-2',
    platform: 'custom',
    name: '某站点AI',
    enabled: true,
    url: 'https://example.com/chat',
    driver: { inputSelector: '', sendButtonSelector: '', replySelector: '' },
    toggles: { thinking: false, search: false },
  });
  assert.deepEqual(cfg, snapshot, '纯函数：不改传入配置');
});

test('② worker.add(custom)：非法输入一律不提交（空名 / 重名 / 坏 url / 多余字段 driver）', async () => {
  const cfg = baseConfig();
  const empty = await applyPatch(cfg, { op: 'worker.add', platform: 'custom', name: '   ', url: 'https://x' });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /名称不能为空/);
  const dup = await applyPatch(cfg, { op: 'worker.add', platform: 'custom', name: 'DeepSeek', url: 'https://x' });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /已存在/);
  for (const url of [undefined, '', 'notaurl', '/chat', 'ftp://x', 42]) {
    const bad = await applyPatch(cfg, { op: 'worker.add', platform: 'custom', name: 'X', url });
    assert.equal(bad.ok, false, `url=${JSON.stringify(url)} 应被拒`);
    assert.match(bad.error, /链接/);
  }
  const extra = await applyPatch(cfg, {
    op: 'worker.add',
    platform: 'custom',
    name: 'X',
    url: 'https://x',
    driver: { inputSelector: '.a' },
  });
  assert.equal(extra.ok, false, '新增时不给 driver（统一走 worker.setDriver）');
  assert.match(extra.error, /多余字段/);
  const builtinExtra = await applyPatch(cfg, { op: 'worker.add', platform: 'deepseek', name: 'X' });
  assert.equal(builtinExtra.ok, false, '内置平台分支形状不变：多余字段仍拒');
  assert.match(builtinExtra.error, /多余字段/);
  assert.equal(cfg.workers.length, 1, '任何失败都不改配置');
});

test('② worker.setDriver：部分更新 / 空串合法 / 未知键 / 非 custom / 未知 id / 超长 / 类型错 一律拒绝', async () => {
  const custom = {
    id: 'w-2',
    platform: 'custom',
    name: '站点A',
    enabled: true,
    url: 'https://x',
    driver: { inputSelector: '.old', sendButtonSelector: '', replySelector: '' },
    toggles: { thinking: false, search: false },
  };
  const cfg = { workers: [baseConfig().workers[0], custom] };
  const partial = await applyPatch(cfg, { op: 'worker.setDriver', id: 'w-2', driver: { replySelector: '.reply' } });
  assert.equal(partial.ok, true);
  assert.deepEqual(
    partial.config.workers[1].driver,
    { inputSelector: '.old', sendButtonSelector: '', replySelector: '.reply' },
    '未给出的键保持原值（部分更新）',
  );
  const blank = await applyPatch(partial.config, { op: 'worker.setDriver', id: 'w-2', driver: { inputSelector: '' } });
  assert.equal(blank.ok, true);
  assert.equal(blank.config.workers[1].driver.inputSelector, '', '空串合法（= 恢复通用启发式）');

  const cases = [
    [{ op: 'worker.setDriver', id: 'w-2', driver: { nope: '.a' } }, /不接受的键/],
    [{ op: 'worker.setDriver', id: 'w-2', driver: {} }, /为空/],
    [{ op: 'worker.setDriver', id: 'w-2', driver: { replySelector: 42 } }, /应为字符串/],
    [{ op: 'worker.setDriver', id: 'w-2', driver: { replySelector: 'x'.repeat(201) } }, /过长/],
    [{ op: 'worker.setDriver', id: 'w-2', driver: '.a' }, /应为对象/],
    [{ op: 'worker.setDriver', id: 'w-1', driver: { replySelector: '.r' } }, /不是自定义平台/],
    [{ op: 'worker.setDriver', id: 'w-9', driver: { replySelector: '.r' } }, /不存在/],
    [{ op: 'worker.setDriver', driver: { replySelector: '.r' } }, /缺少外包工 id/],
  ];
  for (const [op, re] of cases) {
    const bad = await applyPatch(cfg, op);
    assert.equal(bad.ok, false, `应拒绝：${JSON.stringify(op)}`);
    assert.match(bad.error, re);
  }
  assert.deepEqual(cfg.workers[1].driver, custom.driver, '拒绝不改配置');
});
