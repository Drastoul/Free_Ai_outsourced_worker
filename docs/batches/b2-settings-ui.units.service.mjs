/**
 * b2 单元测试 · 设置服务编排面（fake config / scheduler / engine）—— 配置落盘与快照
 * 覆盖：patch 落盘与广播 · 写失败回滚 · 快照形状（含 workers[].toggles 双读）· 导出与打开落点 ·
 *       目录校验 · 孤儿健康记录清理 · 回落转发。
 * 「打开并检查」编排见同目录 `b2-settings-ui.units.check.mjs`。
 * 设计权威：docs/design/modules/settings-app.md §7；冻结接口 = 批次档 b2 §2。
 * 由入口 `b2-settings-ui.units.mjs` 聚合执行。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createSettingsService } from '../../src/settings/service.mjs';
import { PATCH_OPS } from '../../src/settings/patches.mjs';
import { makeService, quietLog } from './b2-settings-ui.units.fixtures.mjs';

// ---------------------------------------------------------------------------
// patch：落盘 + 广播 + 队列复核；失败路径
// ---------------------------------------------------------------------------

test('service.patch：成功 ⇒ 保存 + 队列复核 + 广播；非法 ⇒ 不保存不广播', async () => {
  const { service, calls, broadcasts } = makeService();
  const okRes = await service.patch({ op: 'worker.setEnabled', id: 'w-1', enabled: false });
  assert.deepEqual(okRes, { ok: true });
  assert.equal(calls.saveCount, 1);
  assert.equal(calls.saved.workers[0].enabled, false);
  assert.equal(calls.pumps, 1, '配置变更后触发队列复核');
  assert.equal(broadcasts.length, 1, '成功 ⇒ 广播一次全量快照');
  assert.equal(broadcasts[0].version, '9.9.9');

  const bad = await service.patch({ op: 'worker.rename', id: 'w-1', name: '二号机' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /已存在/);
  assert.equal(calls.saveCount, 1, '非法 ⇒ 不落盘');
  assert.equal(broadcasts.length, 1, '非法 ⇒ 不广播');
});

test('service.patch：写失败 ⇒ {ok:false}（改动已回滚）+ 不广播', async () => {
  const { service, calls, broadcasts } = makeService({ saveError: new Error('EPERM: 文件被占用') });
  const res = await service.patch({ op: 'worker.setEnabled', id: 'w-1', enabled: false });
  assert.equal(res.ok, false);
  assert.match(res.error, /保存失败/);
  assert.equal(broadcasts.length, 0);
  assert.equal(calls.pumps, 0);
});

// ---------------------------------------------------------------------------
// getSnapshot：形状（含 workers[].toggles 读面——T7 缺陷回归）
// ---------------------------------------------------------------------------

test('service.getSnapshot：字段形状 + workers[].toggles == 配置值（快照读面回归）', async () => {
  const { service, userDataDir } = makeService();
  const snap = await service.getSnapshot();
  assert.equal(snap.version, '9.9.9');
  assert.equal(snap.service.state, 'running');
  assert.equal(snap.service.url, 'http://127.0.0.1:17873/mcp');
  assert.equal(snap.service.sseUrl, 'http://127.0.0.1:17873/sse');
  assert.equal(snap.service.expectedPort, 17873);
  assert.equal(snap.service.drift, false);
  assert.deepEqual(JSON.parse(snap.fragments.mcpJson).mcpServers['free-outsource'].url, 'http://127.0.0.1:17873/mcp');
  assert.deepEqual(JSON.parse(snap.fragments.mcpServers).mcp.servers[0].name, 'free-outsource');
  assert.equal(snap.workers.length, 1);
  assert.equal(snap.workers[0].id, 'w-2');
  assert.deepEqual(snap.workers[0].toggles, { thinking: true, search: false }, '快照条目必须带 toggles 且 == 配置值（非兜底默认 {false,false} ⇒ 与回退实现可分辨）');
  assert.equal(snap.outbox.actual, path.join(userDataDir, 'outbox'));
  assert.equal(snap.outbox.fallback, false);
  assert.equal(snap.outbox.note, null);
  assert.equal(snap.exportDir, path.join(userDataDir, 'export'));
  assert.equal(snap.logsDir, path.join(userDataDir, 'logs'));
  assert.equal(snap.guide.available, true);
  assert.deepEqual(snap.ops, PATCH_OPS);
});

test('service.getSnapshot：服务未启动 ⇒ 停止态 + 原因 / 建议（无 runtime.json 口径）', async () => {
  const { config, userDataDir } = makeService();
  const stopped = createSettingsService({
    config,
    scheduler: {
      listWorkers: () => [],
      workforce: { byId: () => null, markChecked() {} },
      runner: { isWorkerBusy: () => false },
      pump() {},
    },
    engine: { call: async () => ({}) },
    log: quietLog,
    userDataDir,
    version: '9.9.9',
    getServiceInfo: () => ({ ok: false, url: null, port: null, reason: '端口 17873–17993 均被占用' }),
    broadcast: () => true,
  });
  const snap = await stopped.getSnapshot();
  assert.equal(snap.service.state, 'stopped');
  assert.equal(snap.service.url, null);
  assert.equal(snap.service.sseUrl, null);
  assert.match(snap.service.reason, /端口/);
  assert.match(snap.service.suggestion, /释放占用端口/);
});

// ---------------------------------------------------------------------------
// 导出 / 打开落点 / 目录校验 / 卫生
// ---------------------------------------------------------------------------

test('service.exportFragmentFiles / resolveOpenPath：落点与错误路径', async () => {
  const { service, userDataDir } = makeService();
  const exp = await service.exportFragmentFiles();
  assert.equal(exp.ok, true);
  assert.equal(exp.dir, path.join(userDataDir, 'export'));
  assert.deepEqual(fs.readdirSync(exp.dir).sort(), ['.mcp.json', 'mcp-servers.json']);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(exp.dir, '.mcp.json'), 'utf8')).mcpServers['free-outsource'].url,
    'http://127.0.0.1:17873/mcp',
  );

  const outbox = await service.resolveOpenPath('outbox');
  assert.equal(outbox.ok, true);
  const exportPath = await service.resolveOpenPath('export');
  assert.equal(exportPath.path, path.join(userDataDir, 'export'));
  const logs = await service.resolveOpenPath('logs');
  assert.equal(logs.path, path.join(userDataDir, 'logs'));
  const guide = await service.resolveOpenPath('guide');
  assert.equal(guide.ok, true);
  assert.ok(guide.path.endsWith(path.join('docs', 'guide', 'agent-onboarding.md')));
  const unknown = await service.resolveOpenPath('nope');
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /未知路径类型/);
});

test('service.validateOutboxDir：可用 / 不可用 / 空白', async () => {
  const { service, userDataDir } = makeService();
  const good = await service.validateOutboxDir(path.join(userDataDir, 'new-outbox'));
  assert.equal(good.ok, true);
  const blockedParent = path.join(userDataDir, 'blocker');
  await fsp.writeFile(blockedParent, 'file', 'utf8');
  const bad = await service.validateOutboxDir(path.join(blockedParent, 'sub'));
  assert.equal(bad.ok, false);
  assert.match(bad.error, /不可用/);
  const blank = await service.validateOutboxDir('   ');
  assert.equal(blank.ok, false);
});

test('service.patch：删除后清理孤儿健康记录（防 id 复用继承被删条目状态）', async () => {
  const { service, calls, health } = makeService();
  health.set('w-9', { status: 'login_required', detail: null, at: new Date().toISOString(), until: null });
  health.set('w-1', { status: 'ready', detail: null, at: new Date().toISOString(), until: null });
  const res = await service.patch({ op: 'worker.remove', id: 'w-2' });
  assert.equal(res.ok, true);
  assert.deepEqual(calls.cleared, ['w-9'], '孤儿记录被清；名册内记录保留');
  assert.equal(health.has('w-1'), true);
  assert.equal(health.has('w-9'), false);
});

test('service.notifyOutboxFallback：转发 ⇒ 广播一次（含交付目录字段）', async () => {
  const { service, broadcasts } = makeService();
  await service.notifyOutboxFallback({ dir: 'C:\\fallback', reason: '配置目录不可用', configured: 'D:\\x' });
  assert.equal(broadcasts.length, 1);
  assert.ok(broadcasts[0].outbox && 'actual' in broadcasts[0].outbox);
});
