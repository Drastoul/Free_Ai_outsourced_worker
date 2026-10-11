/**
 * b5 单元测试（随批归档；`node --test docs/batches/b5-session-reuse.units.mjs` 直跑）
 *
 * 覆盖（合同与判据权威：`docs/batches/b5-session-reuse.md` §2「验收对照」1；机制权威：`docs/design/modules/browser-engine.md` §9）：
 *   · 决策表八分支（disabled / absent / replaced / error / canceled / ttl / count / reuse）+ 判定优先级（首个命中为准）；
 *   · TTL 边界（注入 now：恰等 ⇒ 复用、+1ms ⇒ 换新——J2 主判据）；
 *   · 写回语义（done 计数 / error·canceled 落标记 / lastTaskEndedAt 更新 / 无单元不记账）；
 *   · normalizeConfig 的 session 块（默认值 · 非法项回退 + issue · reuse:false 其余保留）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, normalizeConfig } from '../../src/main/config-schema.mjs';
import { DEFAULT_SESSION_CONFIG, SessionPolicy } from '../../src/engine/session-policy.mjs';

const PAGE_A = { name: 'page-a' };
const PAGE_B = { name: 'page-b' };
const T0 = 1_700_000_000_000;

/** 造一个「已按 done 记了 taskCount 单」的策略实例（单元起点 = T0、页面 = PAGE_A） */
function policyAfterDone({ taskCount = 1, at = T0, page = PAGE_A } = {}) {
  const logs = [];
  const policy = new SessionPolicy({ log: (m) => logs.push(m) });
  policy.markNewSession('w-1', { reason: 'absent', page, at });
  for (let i = 0; i < taskCount; i++) policy.recordOutcome('w-1', { outcome: 'done', at: at + i });
  return { policy, logs };
}

test('默认值两处一致：DEFAULT_SESSION_CONFIG = 配置 schema 的 session 默认值', () => {
  assert.deepEqual({ ...DEFAULT_SESSION_CONFIG }, { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 });
  assert.deepEqual(DEFAULT_CONFIG.session, { ...DEFAULT_SESSION_CONFIG }, '引擎侧与 config-schema 两处默认值须一致');
  assert.ok(Object.isFrozen(DEFAULT_SESSION_CONFIG));
});

test('决策表：absent —— 无单元 ⇒ 新会话（taskCount=0、idleMs=null）', () => {
  const policy = new SessionPolicy();
  assert.deepEqual(policy.decide({ workerId: 'w-1', now: T0, page: PAGE_A }), {
    reuse: false,
    reason: 'absent',
    taskCount: 0,
    idleMs: null,
  });
});

test('决策表：reuse —— 单元在、上单 done、未过 TTL / 未触上限 ⇒ 复用', () => {
  const { policy } = policyAfterDone({ taskCount: 2, at: T0 });
  const d = policy.decide({ workerId: 'w-1', now: T0 + 1001, page: PAGE_A });
  assert.deepEqual(d, { reuse: true, reason: 'reuse', taskCount: 2, idleMs: 1000 });
});

test('决策表：disabled —— reuse:false ⇒ 新会话（优先于 replaced / ttl / count）', () => {
  const { policy } = policyAfterDone({ taskCount: 5, at: T0 });
  const d = policy.decide({ workerId: 'w-1', now: T0 + 10 * 3600_000, page: PAGE_B, config: { reuse: false, ttlMs: 1, maxTasksPerSession: 1 } });
  assert.equal(d.reason, 'disabled');
  assert.equal(d.reuse, false);
});

test('决策表：replaced —— pageRef 与当前页不一致（上下文重启）⇒ 新会话', () => {
  const { policy } = policyAfterDone({ taskCount: 3, at: T0 });
  const d = policy.decide({ workerId: 'w-1', now: T0 + 1, page: PAGE_B });
  assert.equal(d.reason, 'replaced');
  assert.equal(d.taskCount, 3);
});

test('决策表：error —— 上单 error ⇒ 换新（优先于 canceled / ttl / count）', () => {
  const { policy } = policyAfterDone({ taskCount: 5, at: T0 });
  policy.recordOutcome('w-1', { outcome: 'error', at: T0 + 10 });
  const d = policy.decide({ workerId: 'w-1', now: T0 + 10 + 10 * 3600_000, page: PAGE_A, config: { ttlMs: 1, maxTasksPerSession: 1 } });
  assert.equal(d.reason, 'error');
});

test('决策表：canceled —— 上单取消 ⇒ 换新（保守；优先于 ttl / count）', () => {
  const { policy } = policyAfterDone({ taskCount: 5, at: T0 });
  policy.recordOutcome('w-1', { outcome: 'canceled', at: T0 + 10 });
  const d = policy.decide({ workerId: 'w-1', now: T0 + 10 + 10 * 3600_000, page: PAGE_A, config: { ttlMs: 1, maxTasksPerSession: 1 } });
  assert.equal(d.reason, 'canceled');
});

test('决策表：ttl 边界（J2 主判据；注入 now）—— 恰等 ⇒ 复用、+1ms ⇒ 换新', () => {
  const { policy } = policyAfterDone({ taskCount: 1, at: T0 });
  const config = { ttlMs: 1000 };
  assert.equal(policy.decide({ workerId: 'w-1', now: T0 + 1000, page: PAGE_A, config }).reason, 'reuse', '恰等边界 ⇒ 复用');
  assert.equal(policy.decide({ workerId: 'w-1', now: T0 + 1001, page: PAGE_A, config }).reason, 'ttl', '越过 1ms ⇒ 换新');
});

test('决策表：count —— taskCount 达上限 ⇒ 换新（默认 5；可配）', () => {
  const { policy } = policyAfterDone({ taskCount: 5, at: T0 });
  assert.equal(policy.decide({ workerId: 'w-1', now: T0 + 100, page: PAGE_A }).reason, 'count', '默认上限 5');
  const { policy: p2 } = policyAfterDone({ taskCount: 2, at: T0 });
  assert.equal(p2.decide({ workerId: 'w-1', now: T0 + 100, page: PAGE_A, config: { maxTasksPerSession: 2 } }).reason, 'count');
  const { policy: p3 } = policyAfterDone({ taskCount: 1, at: T0 });
  assert.equal(p3.decide({ workerId: 'w-1', now: T0 + 100, page: PAGE_A, config: { maxTasksPerSession: 2 } }).reason, 'reuse');
});

test('decide：缺省 / 部分 config 回落设计默认值；按 workerId 隔离', () => {
  const { policy } = policyAfterDone({ at: T0 });
  assert.equal(policy.decide({ workerId: 'w-1', now: T0 + 1, page: PAGE_A }).reason, 'reuse', '缺 config ⇒ 默认 ttl=600000');
  assert.equal(policy.decide({ workerId: 'w-1', now: T0 + 61_000, page: PAGE_A, config: { ttlMs: 60_000 } }).reason, 'ttl', '部分 config 只覆盖所给键');
  assert.equal(policy.decide({ workerId: 'w-2', now: T0 + 1, page: PAGE_A }).reason, 'absent', '单元按 workerId 隔离');
});

test('写回语义：done 计数、error·canceled 落标记不计数、lastTaskEndedAt 更新', () => {
  const logs = [];
  const policy = new SessionPolicy({ log: (m) => logs.push(m) });
  policy.recordOutcome('w-1', { outcome: 'done', at: T0 });
  assert.equal(policy.units.size, 0, '无单元 ⇒ 不记账（守卫）');

  policy.markNewSession('w-1', { reason: 'absent', page: PAGE_A, at: T0 });
  assert.match(logs.at(-1), /^新会话（原因=absent）$/);
  const unit = policy.units.get('w-1');
  assert.deepEqual(unit, { pageRef: PAGE_A, sessionStartedAt: T0, taskCount: 0, lastTaskEndedAt: null, lastOutcome: null });

  policy.recordOutcome('w-1', { outcome: 'done', at: T0 + 10 });
  assert.equal(unit.taskCount, 1);
  assert.equal(unit.lastOutcome, 'done');
  assert.equal(unit.lastTaskEndedAt, T0 + 10);

  policy.recordOutcome('w-1', { outcome: 'error', at: T0 + 20 });
  assert.equal(unit.taskCount, 1, 'error 不计数');
  assert.equal(unit.lastOutcome, 'error');

  policy.recordOutcome('w-1', { outcome: 'canceled', at: T0 + 30 });
  assert.equal(unit.taskCount, 1, 'canceled 不计数');
  assert.equal(unit.lastOutcome, 'canceled');
  assert.equal(unit.lastTaskEndedAt, T0 + 30);
});

test('markNewSession：刷新页面身份与起点、taskCount 归零（换新后从 0 起算）', () => {
  const { policy } = policyAfterDone({ taskCount: 3, at: T0 });
  policy.markNewSession('w-1', { reason: 'ttl', page: PAGE_B, at: T0 + 5000 });
  const unit = policy.units.get('w-1');
  assert.equal(unit.taskCount, 0);
  assert.equal(unit.sessionStartedAt, T0 + 5000);
  assert.equal(unit.pageRef, PAGE_B);
  assert.equal(policy.decide({ workerId: 'w-1', now: T0 + 5001, page: PAGE_B }).reason, 'reuse');
});

test('normalizeConfig：session 默认值 + 合法值保留（reuse:false 其余键不报错）', () => {
  const { config, issues } = normalizeConfig({});
  assert.deepEqual(config.session, { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 });
  assert.equal(issues.length, 0);
  const ok = normalizeConfig({ session: { reuse: false, ttlMs: 1000, maxTasksPerSession: 2 } });
  assert.deepEqual(ok.config.session, { reuse: false, ttlMs: 1000, maxTasksPerSession: 2 });
  assert.equal(ok.issues.length, 0, 'reuse:false 时其余键保留、不报错');
  const partial = normalizeConfig({ session: { ttlMs: 5000 } });
  assert.deepEqual(partial.config.session, { reuse: true, ttlMs: 5000, maxTasksPerSession: 5 });
});

test('normalizeConfig：session 非法项回退默认 + 记 issue（不静默丢）', () => {
  const notObject = normalizeConfig({ session: 'yes' });
  assert.deepEqual(notObject.config.session, { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 });
  assert.ok(notObject.issues.some((i) => i.includes('session 不是对象')), '整块回退应记 issue');

  const bad = normalizeConfig({ session: { reuse: 1, ttlMs: 0, maxTasksPerSession: 1001 } });
  assert.deepEqual(bad.config.session, { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 });
  for (const key of ['session.reuse', 'session.ttlMs', 'session.maxTasksPerSession']) {
    assert.ok(bad.issues.some((i) => i.includes(key)), `${key} 非法应记 issue`);
  }

  const bad2 = normalizeConfig({ session: { ttlMs: 'x', maxTasksPerSession: 2.5 } });
  assert.equal(bad2.config.session.ttlMs, 600000, '非数字 ⇒ 回退');
  assert.equal(bad2.config.session.maxTasksPerSession, 5, '非整数 ⇒ 回退（pickNumber integer）');
});
