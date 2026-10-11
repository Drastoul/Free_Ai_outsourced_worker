/**
 * b6 单元测试（随批归档；`node --test docs/batches/b6-small-items-and-repack.units.mjs` 直跑）。
 *
 * 覆盖（合同与判据权威：`docs/batches/b6-small-items-and-repack.md` §2「验收对照」8；机制权威：`docs/design/modules/adapters.md` §2/§3.4/§3.8）：
 *   · T4：基线打标失败日志（两平台 fake page；仍返回 0、不抛）+ `decide` 省略 `now` 的缺省（TTL 判定）；
 *   · T6：能力位归一化（6 组）/ `buildTogglesReport` 受支持子键口径（4 组）/ `applyTogglesWithLog` 子键过滤（2 组）；
 *   · T3：`buildPlatforms` 子键映射与缺信息 / 未知平台回退（2 组）；
 *   · T7：`session.set` 合法 / 部分 / 非法 / 多余字段 / 纯函数性 + `buildSessionSnapshot` 三键投影。
 * T3 / T7 组依赖设置面新件（切分 B）——按冻结接口写：B 落盘前这几例失败属预期（B 落盘后复跑）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CAPABILITIES, defineAdapter } from '../../src/engine/adapters/base.mjs';
import { markAssistantBaseline as deepseekBaseline } from '../../src/engine/adapters/deepseek-dom.mjs';
import { markAssistantBaseline as kimiBaseline } from '../../src/engine/adapters/kimi-dom.mjs';
import { default as deepseek } from '../../src/engine/adapters/deepseek.mjs';
import { default as kimi } from '../../src/engine/adapters/kimi.mjs';
import { applyTogglesWithLog, buildTogglesReport } from '../../src/engine/answer.mjs';
import { SessionPolicy } from '../../src/engine/session-policy.mjs';

const PAGE = { name: 'page-a' };
const loadSettings = (rel) => import(`../../src/settings/${rel}`);

/** 最小合法适配器骨架（归一化 / 子键过滤等单元用；能力位按缺省补齐） */
const SPEC = {
  id: 'unit',
  platformName: 'Unit',
  url: 'https://unit.invalid/',
  checkLogin: async () => 'ready',
  openSession: async () => ({ via: 'stub' }),
  send: async () => ({}),
  stream: { match: () => false, parse: () => ({ text: '', thinking: '', finished: true }) },
  dom: { collect: async () => '' },
  extract: { filesFromText: () => [] },
};
const adapterWith = (capabilities, extra = {}) =>
  defineAdapter({ ...SPEC, ...(capabilities ? { capabilities } : {}), ...extra });
const togglesOf = (capabilities) => adapterWith(capabilities).capabilities.toggles;

// ---------------------------------------------------------------------------
// T4（#28①②③）
// ---------------------------------------------------------------------------

test('T4① 基线打标失败：两平台各记一行日志、仍返回 0、不抛（fake page 的 evaluate 拒绝）', async () => {
  const failingPage = { evaluate: () => Promise.reject(new Error('页面已关闭')) };
  for (const [platform, fn] of [['deepseek', deepseekBaseline], ['kimi', kimiBaseline]]) {
    const logs = [];
    const ret = await fn(failingPage, { log: (m) => logs.push(m) });
    assert.equal(ret, 0, `${platform}：失败仍应返回 0（不抛）`);
    assert.equal(logs.length, 1, `${platform}：应记恰好一行日志`);
    assert.match(logs[0], /^助手回合基线打标失败：/, `${platform}：日志词形`);
    assert.ok(logs[0].length <= '助手回合基线打标失败：'.length + 120, `${platform}：消息应截断 120 字`);
  }
});

test('T4① 基线打标成功：返回打标数、不记日志', async () => {
  const logs = [];
  const okPage = { evaluate: async () => 3 };
  for (const [platform, fn] of [['deepseek', deepseekBaseline], ['kimi', kimiBaseline]]) {
    assert.equal(await fn(okPage, { log: (m) => logs.push(m) }), 3, `${platform}：成功应返回打标数`);
  }
  assert.equal(logs.length, 0, '成功路径不记日志');
});

test('T4② decide 缺省 now = Date.now()：TTL 到期判 ttl、未到期判 reuse、idleMs 有限', () => {
  const expired = new SessionPolicy();
  const at = Date.now() - 700_000;
  expired.markNewSession('w-1', { reason: 'absent', page: PAGE, at });
  expired.recordOutcome('w-1', { outcome: 'done', at });
  const dTtl = expired.decide({ workerId: 'w-1', page: PAGE }); // 省略 now ⇒ 取缺省
  assert.equal(dTtl.reason, 'ttl', '空闲 700s > 默认 ttl 600s ⇒ 换新');
  assert.ok(Number.isFinite(dTtl.idleMs), 'idleMs 应为有限数（now 缺省生效）');

  const fresh = new SessionPolicy();
  fresh.markNewSession('w-1', { reason: 'absent', page: PAGE, at: Date.now() - 1000 });
  fresh.recordOutcome('w-1', { outcome: 'done', at: Date.now() - 1000 });
  const dReuse = fresh.decide({ workerId: 'w-1', page: PAGE });
  assert.equal(dReuse.reason, 'reuse', '空闲 1s < 默认 ttl ⇒ 复用');
  assert.ok(Number.isFinite(dReuse.idleMs));
});

// ---------------------------------------------------------------------------
// T6（#25）
// ---------------------------------------------------------------------------

test('T6 归一化：true / false / 缺省 / 对象 / 非法 ⇒ 子键对象（6 组 + 默认值）', () => {
  assert.deepEqual(togglesOf({ toggles: true }), { thinking: true, search: true }, '旧值 true ⇒ 两子键支持（兼容展开）');
  assert.deepEqual(togglesOf({ toggles: false }), { thinking: false, search: false }, 'false ⇒ 两不支持');
  assert.deepEqual(togglesOf(null), { thinking: false, search: false }, '缺省 ⇒ 两不支持');
  assert.deepEqual(togglesOf({ toggles: { search: true } }), { thinking: false, search: true }, '对象 ⇒ 逐键取真');
  assert.deepEqual(togglesOf({ toggles: 'yes' }), { thinking: false, search: false }, '非布尔非对象 ⇒ 两不支持');
  assert.deepEqual(togglesOf({ toggles: [] }), { thinking: false, search: false }, '数组按非法 ⇒ 两不支持');
  assert.deepEqual({ ...DEFAULT_CAPABILITIES.toggles }, { thinking: false, search: false }, '默认能力位 = 两子键不支持');
});

test('T6 buildTogglesReport：DeepSeek 形两键逐字（含 ok 判假）+ checked / unsupported', () => {
  const capture = { payload: { thinking_enabled: true, search_enabled: false } };
  const hit = buildTogglesReport(deepseek, { thinking: true, search: false }, capture);
  assert.deepEqual(hit, {
    configured: { thinking: true, search: false },
    payload: { thinking_enabled: true, search_enabled: false },
    ok: true,
    checked: ['thinking', 'search'],
    unsupported: [],
  });
  const miss = buildTogglesReport(deepseek, { thinking: true, search: true }, capture);
  assert.equal(miss.ok, false, '载荷与配置不一致 ⇒ ok=false');
});

test('T6 buildTogglesReport：Kimi 形 payload null ⇒ ok null ∧ checked=[search] ∧ unsupported=[thinking]', () => {
  const r = buildTogglesReport(kimi, { thinking: true, search: false }, { payload: null });
  assert.deepEqual(r, {
    configured: { thinking: true, search: false },
    payload: null,
    ok: null,
    checked: ['search'],
    unsupported: ['thinking'],
  });
});

test('T6 buildTogglesReport：部分支持 + 已捕获 ⇒ ok 只比受支持键（无控件子键不拖判）', () => {
  const adapter = adapterWith({ toggles: { thinking: false, search: true }, requestPayloadCapture: true });
  const capture = { payload: { thinking_enabled: false, search_enabled: true } };
  const r = buildTogglesReport(adapter, { thinking: true, search: true }, capture);
  assert.equal(r.ok, true, 'thinking 不受支持 ⇒ 不参与比对（payload.thinking_enabled=false 不拖判）');
  assert.deepEqual(r.checked, ['search']);
  assert.deepEqual(r.unsupported, ['thinking']);
});

test('T6 buildTogglesReport：无受支持子键 + 已捕获 ⇒ ok null（无核对范围，不伪装绿）', () => {
  const adapter = adapterWith({ toggles: { thinking: false, search: false }, requestPayloadCapture: true });
  const r = buildTogglesReport(adapter, { thinking: true, search: true }, { payload: { thinking_enabled: true, search_enabled: true } });
  assert.equal(r.ok, null, '无受支持子键 ⇒ 无核对范围，ok 不得为真');
  assert.deepEqual(r.checked, []);
  assert.deepEqual(r.unsupported, ['thinking', 'search']);
});

test('T6 applyTogglesWithLog：实收 = 受支持子键子集（未支持键不出现）+ 日志记目标 / 实际 / 复核', async () => {
  const calls = [];
  const adapter = adapterWith({ toggles: { thinking: false, search: true } }, {
    async applyToggles(page, toggles) {
      calls.push(toggles);
      return { ok: true, configured: { ...toggles }, page: { ...toggles } };
    },
  });
  const logs = [];
  await applyTogglesWithLog({ page: {}, adapter, toggles: { thinking: true, search: false }, stage: '应用', log: (_scope, m) => logs.push(m) });
  assert.deepEqual(calls, [{ search: false }], '未支持键（thinking）不得传给适配器');
  assert.match(logs.join('\n'), /开关应用 目标=\{search:false\} 实际=\{search:false\} 复核=一致/);
});

test('T6 applyTogglesWithLog：全不支持 ⇒ 不调用 adapter.applyToggles（返回 null）', async () => {
  let called = 0;
  const adapter = adapterWith({ toggles: { thinking: false, search: false } }, {
    async applyToggles() {
      called += 1;
      return { ok: true };
    },
  });
  const ret = await applyTogglesWithLog({ page: {}, adapter, toggles: { thinking: true, search: true }, stage: '应用', log: () => {} });
  assert.equal(ret, null);
  assert.equal(called, 0, '全不支持 ⇒ 不触及页面');
});

// ---------------------------------------------------------------------------
// T3（#26 界面侧能力来源；设置面新件）
// ---------------------------------------------------------------------------

test('T3 buildPlatforms：两平台映射照能力位（deepseek {true,true} / kimi {false,true}）', async () => {
  const { buildPlatforms } = await loadSettings('platform-capabilities.mjs');
  const rows = buildPlatforms();
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(byId.deepseek.toggles, { thinking: true, search: true });
  assert.deepEqual(byId.kimi.toggles, { thinking: false, search: true });
  assert.equal(byId.deepseek.label, 'DeepSeek', '既有键（label / available）应保留');
  assert.equal(byId.kimi.available, true);
});

test('T3 buildPlatforms：缺信息 / 未知平台 ⇒ 两子键按不支持（注入 choices / 查找函数）', async () => {
  const { buildPlatforms } = await loadSettings('platform-capabilities.mjs');
  const lookup = (id) => (id === 'no-caps' ? { capabilities: {} } : null);
  const rows = buildPlatforms(
    [
      { id: 'ghost', label: 'Ghost', available: true },
      { id: 'no-caps', label: 'NoCaps', available: false },
    ],
    lookup,
  );
  assert.deepEqual(
    rows.map((r) => r.toggles),
    [
      { thinking: false, search: false },
      { thinking: false, search: false },
    ],
  );
});

// ---------------------------------------------------------------------------
// T7（#27 写路径与投影；设置面新件）
// ---------------------------------------------------------------------------

const sessionConfig = () => ({
  version: 1,
  outboxDir: 'C:/out',
  workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  session: { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 },
});

test('T7 session.set：合法 / 部分更新 / 纯函数性（不改进参）', async () => {
  const { applyPatch } = await loadSettings('patches.mjs');
  const config = sessionConfig();
  const r1 = await applyPatch(config, { op: 'session.set', ttlMs: 1000, maxTasksPerSession: 2 });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.deepEqual(r1.config.session, { reuse: true, ttlMs: 1000, maxTasksPerSession: 2 });
  assert.notEqual(r1.config, config, '应返回新配置对象');
  const r2 = await applyPatch(config, { op: 'session.set', reuse: false });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.deepEqual(r2.config.session, { reuse: false, ttlMs: 600000, maxTasksPerSession: 5 }, '部分更新：只盖所给键');
  assert.deepEqual(config.session, { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 }, '纯函数：入参配置不被改动');
});

test('T7 session.set：非法（空对象 / 越界 / 非整数 / 非布尔 / 多余字段）⇒ ok:false 且不落配置', async () => {
  const { applyPatch } = await loadSettings('patches.mjs');
  const config = sessionConfig();
  const cases = [
    [{ op: 'session.set' }, '空对象（至少一键）'],
    [{ op: 'session.set', ttlMs: 0 }, 'ttlMs 越界（区间 min=1）'],
    [{ op: 'session.set', maxTasksPerSession: 1001 }, 'maxTasksPerSession 越界（区间 max=1000）'],
    [{ op: 'session.set', maxTasksPerSession: 2.5 }, '非整数'],
    [{ op: 'session.set', reuse: 'yes' }, '非布尔'],
    [{ op: 'session.set', ttlMs: 1000, junk: 1 }, '多余字段'],
  ];
  for (const [op, why] of cases) {
    const r = await applyPatch(config, op);
    assert.equal(r.ok, false, `${why} ⇒ 应拒绝：${JSON.stringify(r)}`);
    assert.ok(typeof r.error === 'string' && r.error.length > 0, `${why} ⇒ 应给出错误说明`);
  }
  assert.deepEqual(config.session, { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 }, '拒绝路径不改配置');
});

test('T7 buildSessionSnapshot：三键投影（多余键丢弃）', async () => {
  const { buildSessionSnapshot } = await loadSettings('snapshot-session.mjs');
  assert.deepEqual(buildSessionSnapshot({ reuse: false, ttlMs: 1000, maxTasksPerSession: 2, junk: 'x' }), {
    reuse: false,
    ttlMs: 1000,
    maxTasksPerSession: 2,
  });
});
