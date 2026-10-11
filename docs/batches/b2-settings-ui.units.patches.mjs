/**
 * b2 单元测试 · 配置变更纯函数面（patches：七操作合法与非法）
 * 设计权威：docs/design/modules/settings-app.md §2 / §5 / §7；冻结接口 = 批次档 b2 §2。
 * 由入口 `b2-settings-ui.units.mjs` 聚合执行。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, PATCH_OPS, PLATFORM_CHOICES } from '../../src/settings/patches.mjs';
import { baseConfig as base } from './b2-settings-ui.units.fixtures.mjs';

// ---------------------------------------------------------------------------
// 七操作：清单 / 合法 / 非法（拒绝且不改传入配置）
// ---------------------------------------------------------------------------

test('patches：操作清单 = 冻结的七项；平台清单 = deepseek 可 / kimi 可（b3 落地）', () => {
  assert.deepEqual(PATCH_OPS, [
    'worker.add',
    'worker.remove',
    'worker.rename',
    'worker.move',
    'worker.setEnabled',
    'worker.setToggles',
    'outbox.set',
  ]);
  assert.deepEqual(
    PLATFORM_CHOICES.map((p) => `${p.id}:${p.available ? '可' : '待支持'}`),
    ['deepseek:可', 'kimi:可'],
  );
});

test('worker.add：合法（默认名唯一化 / enabled=true / toggles 默认关 / 纯函数）', async () => {
  const cfg = base();
  const snapshot = structuredClone(cfg);
  const r1 = await applyPatch(cfg, { op: 'worker.add', platform: 'deepseek' });
  assert.equal(r1.ok, true);
  assert.equal(r1.config.workers.length, 3);
  assert.deepEqual(r1.config.workers[2], {
    id: 'w-3',
    platform: 'deepseek',
    name: 'DeepSeek 2', // 平台名被占 ⇒ 唯一化
    enabled: true,
    toggles: { thinking: false, search: false },
  });
  assert.deepEqual(cfg, snapshot, '纯函数：不改传入配置');
  const r2 = await applyPatch(r1.config, { op: 'worker.add', platform: 'deepseek' });
  assert.equal(r2.config.workers[3].name, 'DeepSeek 3');
  assert.equal(r2.config.workers[3].id, 'w-4');
});

test('worker.add：非法（未知平台 / 待支持平台 / 多余字段）', async () => {
  const cfg = base();
  const a = await applyPatch(cfg, { op: 'worker.add', platform: 'gpt' });
  assert.equal(a.ok, false);
  assert.match(a.error, /未知平台/);
  // 「不可用平台被拒」改由夹具临时注入承载（b3 已把 kimi 行转为 available:true；本批不动 src 行为）
  PLATFORM_CHOICES.push({ id: 'gpt-x', label: 'GPT-X', available: false, note: '待支持' });
  let b;
  try {
    b = await applyPatch(cfg, { op: 'worker.add', platform: 'gpt-x' });
  } finally {
    PLATFORM_CHOICES.pop();
  }
  assert.equal(b.ok, false);
  assert.match(b.error, /待支持/);
  const c = await applyPatch(cfg, { op: 'worker.add', platform: 'deepseek', name: 'X' });
  assert.equal(c.ok, false);
  assert.match(c.error, /多余字段/);
});

test('worker.remove：合法 / 非法（未知 id / 缺 id）', async () => {
  const cfg = base();
  const okRes = await applyPatch(cfg, { op: 'worker.remove', id: 'w-1' });
  assert.equal(okRes.ok, true);
  assert.deepEqual(okRes.config.workers.map((w) => w.id), ['w-2']);
  const bad = await applyPatch(cfg, { op: 'worker.remove', id: 'w-9' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /不存在/);
  const noId = await applyPatch(cfg, { op: 'worker.remove' });
  assert.equal(noId.ok, false);
});

test('worker.rename：合法（trim）/ 非法（空白 / 重名 / 未知 id）', async () => {
  const cfg = base();
  const okRes = await applyPatch(cfg, { op: 'worker.rename', id: 'w-1', name: '  主助手  ' });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.config.workers[0].name, '主助手');
  const blank = await applyPatch(cfg, { op: 'worker.rename', id: 'w-1', name: '   ' });
  assert.equal(blank.ok, false);
  assert.match(blank.error, /不能为空/);
  const dup = await applyPatch(cfg, { op: 'worker.rename', id: 'w-1', name: '二号机' });
  assert.equal(dup.ok, false);
  assert.match(dup.error, /已存在/);
  const self = await applyPatch(cfg, { op: 'worker.rename', id: 'w-1', name: 'DeepSeek' });
  assert.equal(self.ok, true, '改回自身名不算重名');
  const miss = await applyPatch(cfg, { op: 'worker.rename', id: 'w-7', name: 'X' });
  assert.equal(miss.ok, false);
});

test('worker.move：合法（上移 / 下移）/ 非法（越界 / dir / 未知 id）', async () => {
  const cfg = base();
  const up = await applyPatch(cfg, { op: 'worker.move', id: 'w-2', dir: 'up' });
  assert.equal(up.ok, true);
  assert.deepEqual(up.config.workers.map((w) => w.id), ['w-2', 'w-1']);
  const down = await applyPatch(cfg, { op: 'worker.move', id: 'w-1', dir: 'down' });
  assert.equal(down.ok, true);
  assert.deepEqual(down.config.workers.map((w) => w.id), ['w-2', 'w-1']);
  const top = await applyPatch(cfg, { op: 'worker.move', id: 'w-1', dir: 'up' });
  assert.equal(top.ok, false);
  assert.match(top.error, /首位/);
  const bottom = await applyPatch(cfg, { op: 'worker.move', id: 'w-2', dir: 'down' });
  assert.equal(bottom.ok, false);
  assert.match(bottom.error, /末位/);
  const badDir = await applyPatch(cfg, { op: 'worker.move', id: 'w-1', dir: 'left' });
  assert.equal(badDir.ok, false);
  assert.match(badDir.error, /dir 非法/);
});

test('worker.setEnabled / worker.setToggles：合法与非法（类型 / 键 / 空对象）', async () => {
  const cfg = base();
  const off = await applyPatch(cfg, { op: 'worker.setEnabled', id: 'w-1', enabled: false });
  assert.equal(off.ok, true);
  assert.equal(off.config.workers[0].enabled, false);
  const badEnabled = await applyPatch(cfg, { op: 'worker.setEnabled', id: 'w-1', enabled: 'yes' });
  assert.equal(badEnabled.ok, false);
  assert.match(badEnabled.error, /enabled 非法/);

  const partial = await applyPatch(cfg, { op: 'worker.setToggles', id: 'w-2', toggles: { search: true } });
  assert.equal(partial.ok, true);
  assert.deepEqual(partial.config.workers[1].toggles, { thinking: true, search: true }, '未给出的键保持原值（部分更新）');
  const badKey = await applyPatch(cfg, { op: 'worker.setToggles', id: 'w-1', toggles: { nope: true } });
  assert.equal(badKey.ok, false);
  const badType = await applyPatch(cfg, { op: 'worker.setToggles', id: 'w-1', toggles: { thinking: 1 } });
  assert.equal(badType.ok, false);
  const empty = await applyPatch(cfg, { op: 'worker.setToggles', id: 'w-1', toggles: {} });
  assert.equal(empty.ok, false);
});

test('outbox.set：合法（trim）/ 非法（不可用拒绝且不落配置 / 空白 / 多余字段 / 缺检查器）', async () => {
  const cfg = base();
  const okRes = await applyPatch(cfg, { op: 'outbox.set', dir: '  D:\\新交付  ' }, { checkDir: async () => true });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.config.outboxDir, 'D:\\新交付');
  const bad = await applyPatch(cfg, { op: 'outbox.set', dir: 'D:\\不可写' }, { checkDir: async () => false });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /目录不可用/);
  const blank = await applyPatch(cfg, { op: 'outbox.set', dir: '   ' }, { checkDir: async () => true });
  assert.equal(blank.ok, false);
  const extra = await applyPatch(cfg, { op: 'outbox.set', dir: 'D:\\x', force: true }, { checkDir: async () => true });
  assert.equal(extra.ok, false);
  assert.match(extra.error, /多余字段/);
  const noChecker = await applyPatch(cfg, { op: 'outbox.set', dir: 'D:\\x' });
  assert.equal(noChecker.ok, false);
  assert.match(noChecker.error, /检查器/);
});

test('applyPatch：未知操作 / 非对象操作 / 配置形状异常（一律拒绝）', async () => {
  const cfg = base();
  const unknown = await applyPatch(cfg, { op: 'worker.explode' });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /未知操作/);
  const notObject = await applyPatch(cfg, 'worker.add');
  assert.equal(notObject.ok, false);
  const badCfg = await applyPatch({ workers: 'nope' }, { op: 'worker.add', platform: 'deepseek' });
  assert.equal(badCfg.ok, false);
});
