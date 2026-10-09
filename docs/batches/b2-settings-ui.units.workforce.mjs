/**
 * b2 单元测试 · 存储与名册面（config 写失败回滚 / markChecked 写回 / recheckQueued 排队处置 / outbox-fallback 事件）
 * 设计权威：docs/design/overview.md「配置存储」；settings-app.md §7（失败回滚）；
 * 批次档 b2 §2 评审修复 ⑧（markChecked 记录形状与词表映射）与 ⑥（删除外包工后的排队任务处置）。
 * 由入口 `b2-settings-ui.units.mjs` 聚合执行。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore } from '../../src/main/config.mjs';
import { Workforce } from '../../src/main/scheduler/workforce.mjs';
import { Scheduler } from '../../src/main/scheduler/scheduler.mjs';
import { baseConfig as base, freshDir, quietLog, worker } from './b2-settings-ui.units.fixtures.mjs';

// ---------------------------------------------------------------------------
// config：写失败回滚内存（b1 缺口回归——b2·T8 的底层支撑）
// ---------------------------------------------------------------------------

test('config：写失败 ⇒ 抛错且内存配置不变（内存与磁盘不漂移）', async () => {
  const dir = freshDir('config-rollback');
  const blocker = path.join(dir, 'blocked');
  fs.writeFileSync(blocker, 'not a dir', 'utf8'); // 父路径是文件 ⇒ 目录创建 / 写入必失败
  const file = path.join(blocker, 'config.json');
  const store = new ConfigStore({ file, config: base() });
  const before = structuredClone(store.current);
  const next = structuredClone(base());
  next.workers.push(worker('w-3', '新增'));

  await assert.rejects(() => store.save(next), /ENOTDIR|EEXIST|EPERM|EISDIR|not a directory|文件已存在/);
  assert.deepEqual(store.current, before, '写失败 ⇒ 内存配置回滚（内存与磁盘不漂移）');
  assert.equal(store.current.workers.length, 2);
});

test('config：写成功 ⇒ 内存配置更新 + 文件落盘 + .bak 保留上一版', async () => {
  const dir = freshDir('config-ok');
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore({ file, config: base() });
  await store.writeFile(); // 首版（.bak 缺省）
  const next = structuredClone(store.current);
  next.outboxDir = path.join(dir, 'outbox');
  await store.save(next);
  assert.equal(store.current.outboxDir, path.join(dir, 'outbox'));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).outboxDir, path.join(dir, 'outbox'));
  assert.ok(fs.existsSync(`${file}.bak`), '.bak 保留上一版');
});

// ---------------------------------------------------------------------------
// workforce.markChecked：写回形状 / 冷却语义 / 词表映射（评审修复 ⑧）
// ---------------------------------------------------------------------------

function makeWorkforce(workers = [worker('w-1', 'DeepSeek')]) {
  return new Workforce({ config: { current: { workers } }, log: quietLog });
}

test('markChecked：ready 记检查时间且不置冷却（记录形状 {status,detail,at,until}）', () => {
  const wf = makeWorkforce();
  const before = Date.now();
  const view = wf.markChecked('w-1', { status: 'ready' });
  const rec = wf.health.get('w-1');
  assert.deepEqual(Object.keys(rec).sort(), ['at', 'detail', 'status', 'until']);
  assert.equal(rec.status, 'ready');
  assert.equal(rec.until, null);
  assert.ok(Date.parse(rec.at) >= before - 1000);
  assert.equal(view.at, rec.at);
  const listed = wf.list()[0];
  assert.equal(listed.status, 'ready');
  assert.equal(listed.lastCheckedAt, rec.at, 'ready 也记录最近检查时间');
  assert.equal(wf.unavailableCode('w-1'), null);
});

test('markChecked：login_required 不置冷却（缓存态）且派单侧判不可用', () => {
  const wf = makeWorkforce();
  wf.markChecked('w-1', { status: 'login_required', detail: '需要登录' });
  const rec = wf.health.get('w-1');
  assert.equal(rec.status, 'login_required');
  assert.equal(rec.until, null, '登录态不置冷却（冷却到期假性回 ready 不适用）');
  assert.equal(wf.list()[0].status, 'login_required');
  assert.equal(wf.list()[0].detail, '需要登录');
  assert.equal(wf.unavailableCode('w-1'), 'E_LOGIN_REQUIRED');
});

test('markChecked：captcha ⇒ 对外 unavailable（词表映射 + 既有冷却）', () => {
  const wf = makeWorkforce();
  wf.markChecked('w-1', { status: 'captcha' });
  const rec = wf.health.get('w-1');
  assert.equal(rec.status, 'captcha_cooling');
  assert.ok(rec.until > Date.now(), 'captcha 沿用既有冷却');
  const listed = wf.list()[0];
  assert.equal(listed.status, 'unavailable');
  assert.equal(listed.detail, '冷却中：验证码 / 风控');
  assert.equal(wf.unavailableCode('w-1'), 'E_WORKER_UNAVAILABLE');
});

test('markChecked：unavailable 沿用冷却；未知状态按 unavailable 兜底；整体替换不叠加', () => {
  const wf = makeWorkforce();
  wf.markChecked('w-1', { status: 'unavailable', detail: '页面打不开' });
  assert.equal(wf.health.get('w-1').status, 'unavailable');
  assert.ok(wf.health.get('w-1').until > Date.now());
  assert.equal(wf.list()[0].detail, '页面打不开');

  wf.markChecked('w-1', { status: 'something_else' });
  assert.equal(wf.health.get('w-1').status, 'unavailable', '未知状态 ⇒ 按 unavailable 兜底');
  assert.equal(wf.list()[0].status, 'unavailable');
  assert.ok(wf.health.get('w-1').until > Date.now());

  wf.setCooldown('w-1', 'E_CAPTCHA_OR_RISK', '旧冷却');
  assert.equal(wf.health.get('w-1').status, 'captcha_cooling');
  wf.markChecked('w-1', { status: 'ready' });
  assert.equal(wf.health.get('w-1').status, 'ready', '成功检查整体替换既有记录');
  assert.equal(wf.health.get('w-1').until, null);
});

test('markChecked：不在名册的 id 不写回（防孤儿记录——「删除 ⇒ 重加」不继承被删条目状态）', () => {
  const wf = makeWorkforce();
  const view = wf.markChecked('w-999', { status: 'ready' });
  assert.equal(view, null);
  assert.equal(wf.health.size, 0, '未知 id 不落库');
});

// ---------------------------------------------------------------------------
// recheckQueued：删除外包工后排队任务的处置（批次档 b2 §2 评审修复 ⑥ 验收补条）
// ---------------------------------------------------------------------------

/** 造一个最小 Scheduler（引擎未就绪即可——本组只测 recheckQueued 的判定） */
function makeScheduler(workers) {
  const config = {
    current: { outboxDir: path.join(freshDir('recheck'), 'outbox'), workers, scheduler: { globalConcurrency: 2, perWorkerConcurrency: 1 } },
  };
  const engine = { on() {}, isAlive: () => false, isReady: () => false, call: async () => ({}) };
  return new Scheduler({ config, engine, log: quietLog, notify: () => {} });
}

/** 排队中的任务（worker 引用 = 派单时固定） */
function queuedTask(w, mode = 'priority') {
  return {
    taskId: 't-1',
    worker: { id: w.id, name: w.name, platform: w.platform },
    selection: { mode, reason: '优先级第 1；健康' },
  };
}

test('recheckQueued：外包工被删 ⇒ 降级到下一可用（degrade；code=E_WORKER_UNAVAILABLE）', () => {
  const remaining = worker('w-2', '备用机');
  const sched = makeScheduler([remaining]);
  try {
    const r = sched.recheckQueued(queuedTask({ id: 'w-1', name: '已被删的', platform: 'deepseek' }));
    assert.equal(r.action, 'degrade');
    assert.equal(r.worker.id, 'w-2');
    assert.equal(r.code, 'E_WORKER_UNAVAILABLE');
    assert.match(r.reason, /降级/);
  } finally {
    sched.stop();
  }
});

test('recheckQueued：被删且无下一可用（降级耗尽）⇒ needs_human 终态', () => {
  const disabled = worker('w-2', '停用机', { enabled: false });
  const sched = makeScheduler([disabled]);
  try {
    const r = sched.recheckQueued(queuedTask({ id: 'w-1', name: '已被删的', platform: 'deepseek' }));
    assert.equal(r.action, 'terminal');
    assert.equal(r.state, 'needs_human');
    assert.equal(r.error.code, 'E_WORKER_UNAVAILABLE');
    assert.match(r.error.message, /无下一可用外包工/);
  } finally {
    sched.stop();
  }
});

test('recheckQueued：指定任务（explicit）⇒ 不降级、直接终态（不可用 ⇒ needs_human；停用 ⇒ failed）', () => {
  const sched = makeScheduler([worker('w-2', '备用机')]);
  const sched2 = makeScheduler([worker('w-1', '甲', { enabled: false }), worker('w-2', '备用机')]);
  try {
    const deleted = sched.recheckQueued(queuedTask({ id: 'w-1', name: '已被删的', platform: 'deepseek' }, 'explicit'));
    assert.equal(deleted.action, 'terminal', '指定为硬绑定：不降级');
    assert.equal(deleted.state, 'needs_human');
    assert.equal(deleted.error.code, 'E_WORKER_UNAVAILABLE');

    const off = sched2.recheckQueued(queuedTask({ id: 'w-1', name: '甲', platform: 'deepseek' }, 'explicit'));
    assert.equal(off.action, 'terminal');
    assert.equal(off.error.code, 'E_WORKER_DISABLED');
    assert.equal(off.state, 'failed', 'E_WORKER_DISABLED 非「需人工」类 ⇒ failed');
  } finally {
    sched.stop();
    sched2.stop();
  }
});

test('recheckQueued：外包工仍可用 ⇒ 原样执行（keep，不动任务）', () => {
  const alive = worker('w-1', 'DeepSeek');
  const sched = makeScheduler([alive]);
  try {
    const task = queuedTask(alive);
    const r = sched.recheckQueued(task);
    assert.equal(r.action, 'keep');
    assert.equal(task.worker.id, 'w-1', '任务引用未被改写');
    assert.deepEqual(task.selection, { mode: 'priority', reason: '优先级第 1；健康' });
  } finally {
    sched.stop();
  }
});

// ---------------------------------------------------------------------------
// scheduler：outbox-fallback 事件（去重键；转发落点见 verify:settings 应用级用例）
// ---------------------------------------------------------------------------

test('scheduler.reportOutboxFallback：发 outbox-fallback 事件（同实际值去重；变化再发）', () => {
  const cfg = { current: { outboxDir: 'D:\\x', workers: [], scheduler: { globalConcurrency: 2, perWorkerConcurrency: 1 } } };
  const engine = { on() {}, isAlive: () => false, isReady: () => false, call: async () => ({}) };
  const events = [];
  const sched = new Scheduler({ config: cfg, engine, log: quietLog, notify: () => {} });
  sched.on('outbox-fallback', (o) => events.push(o));
  sched.reportOutboxFallback({ dir: 'C:\\fb', reason: 'r1', configured: 'D:\\x' });
  sched.reportOutboxFallback({ dir: 'C:\\fb', reason: 'r1', configured: 'D:\\x' });
  assert.equal(events.length, 1, '同一实际值 + 原因只发一次（与托盘通知同去重键）');
  sched.reportOutboxFallback({ dir: 'C:\\fb2', reason: 'r2', configured: 'D:\\x' });
  assert.equal(events.length, 2, '实际值或原因变化 ⇒ 再发');
  assert.equal(events[1].dir, 'C:\\fb2');
  sched.stop();
});
