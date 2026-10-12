/**
 * b7 单元测试 · 名册与健康面（④⑥）—— 由入口 `b7-custom-workers.units.mjs` 聚合执行。
 * 判据 = 批次档 b7 §2「验收对照」1 的 ④（附件能力门 requireUpload + 引擎载荷）与 ⑥（健康清除语义 + setDriver 触发点）。
 * 设计权威：docs/design/modules/scheduler.md §4（选人算法）· §6（冷却）· §10（引擎载荷与附件能力门）；
 *           docs/design/modules/mcp-server.md §3.2（拒绝 message 词形）；docs/design/modules/settings-app.md §2。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workforce, toEngineWorker } from '../../src/main/scheduler/workforce.mjs';
import { registerAdapter } from '../../src/engine/adapters/registry.mjs';
import { createSettingsService } from '../../src/settings/service.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 夹具路径（仅作字符串用；本件不落盘） */
const TMP = path.join(HERE, '..', '..', '.thincoder', 'tmp', 'units-b7-custom-workers');
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/** 名册条目（默认启用、开关默认关） */
function w(id, name, platform, extra = {}) {
  return { id, name, platform, enabled: true, toggles: { thinking: false, search: false }, ...extra };
}

// 归一化判定 `upload === true`：显式注册一个 upload:false 的平台，与「未注册」两侧一起验
registerAdapter({ id: 'b7-no-upload', capabilities: { upload: false } });

// ---------------------------------------------------------------------------
// ④ 附件能力门（requireUpload）与引擎载荷
// ---------------------------------------------------------------------------

test('④ requireUpload：显式指定无送件能力者 ⇒ 同步拒绝 E_WORKER_UNAVAILABLE（不置冷却、不建任务）', () => {
  const wf = new Workforce({
    config: { current: { workers: [w('w-1', '无送件位', 'b7-no-upload'), w('w-2', '未注册平台', 'b7-unregistered'), w('w-3', 'DeepSeek', 'deepseek')] } },
    log: quietLog,
  });
  for (const [id, name, platform] of [
    ['w-1', '无送件位', 'b7-no-upload'],
    ['w-2', '未注册平台', 'b7-unregistered'],
  ]) {
    let err;
    try {
      wf.pick(id, { requireUpload: true });
    } catch (e) {
      err = e;
    }
    assert.ok(err, `${name}（${platform}）应同步拒绝`);
    assert.equal(err.code, 'E_WORKER_UNAVAILABLE');
    assert.match(err.message, /不支持送件（附件）/);
    assert.ok(err.message.includes(name), err.message);
    assert.ok(err.message.includes(`平台 ${platform}`), err.message);
    assert.match(err.message, /请去掉附件后重派/);
  }
  assert.equal(wf.health.size, 0, '派单期拒绝不置冷却（无冷却陷阱）');
  assert.equal(wf.pick('w-3', { requireUpload: true }).worker.id, 'w-3', 'upload:true 平台正常通过');
  assert.equal(wf.pick('w-1', {}).worker.id, 'w-1', '不带附件不受能力门限制');
});

test('④ requireUpload：优先级路径跳过 no-upload 候选；全部跳过 ⇒ E_NO_WORKER 且跳过原因含 no-upload', () => {
  const wf = new Workforce({
    config: { current: { workers: [w('w-1', '无送件位', 'b7-no-upload'), w('w-2', 'DeepSeek', 'deepseek')] } },
    log: quietLog,
  });
  const p = wf.pick(undefined, { requireUpload: true });
  assert.equal(p.worker.id, 'w-2', '跳过无送件能力的优先级候选');
  assert.equal(p.mode, 'priority');
  const only = new Workforce({ config: { current: { workers: [w('w-1', '无送件位', 'b7-no-upload')] } }, log: quietLog });
  let err;
  try {
    only.pick(undefined, { requireUpload: true });
  } catch (e) {
    err = e;
  }
  assert.equal(err?.code, 'E_NO_WORKER');
  assert.match(err.message, /no-upload/);
  assert.equal(only.pick(undefined, {}).worker.id, 'w-1', '不带附件照旧选中');
});

test('④ requireUpload：降级候选 nextAvailable 同口径过滤', () => {
  const wf = new Workforce({
    config: { current: { workers: [w('w-1', '无送件位', 'b7-no-upload'), w('w-2', 'DeepSeek', 'deepseek')] } },
    log: quietLog,
  });
  assert.equal(wf.nextAvailable(new Set()).id, 'w-1');
  assert.equal(wf.nextAvailable(new Set(), { requireUpload: true }).id, 'w-2');
  assert.equal(wf.nextAvailable(new Set(['w-1', 'w-2']), { requireUpload: true }), null);
});

test('④ toEngineWorker：内置 = {id,name,platform}；custom 增 url / driver（引擎载荷单一来源）', () => {
  assert.deepEqual(toEngineWorker({ id: 'w-1', name: 'DeepSeek', platform: 'deepseek', url: 'https://ignored' }), {
    id: 'w-1',
    name: 'DeepSeek',
    platform: 'deepseek',
  });
  assert.deepEqual(
    toEngineWorker({ id: 'w-2', name: '站点A', platform: 'custom', url: 'https://x', driver: { inputSelector: '.a' } }),
    { id: 'w-2', name: '站点A', platform: 'custom', url: 'https://x', driver: { inputSelector: '.a' } },
  );
});

// ---------------------------------------------------------------------------
// ⑥ 健康清除：判据底座（workforce）与触发点（service.patch worker.setDriver）
// ---------------------------------------------------------------------------

test('⑥ workforce.clearHealth：置冷却后清除 ⇒ 立即回 ready；clearAllHealth 行为不变', () => {
  const wf = new Workforce({ config: { current: { workers: [w('w-1', 'DeepSeek', 'deepseek')] } }, log: quietLog });
  wf.setCooldown('w-1', 'E_SELECTOR_MISSING', 'opening：输入区未找到');
  assert.equal(wf.statusOf('w-1').status, 'unavailable');
  assert.equal(wf.unavailableCode('w-1'), 'E_WORKER_UNAVAILABLE');
  wf.clearHealth('w-1');
  assert.equal(wf.statusOf('w-1').status, 'ready', '清除 ⇒ 即时 ready（不必等 10 分钟冷却）');
  assert.equal(wf.unavailableCode('w-1'), null);
  wf.clearHealth('w-1'); // 幂等（无记录 ⇒ no-op 不报错）
  wf.setCooldown('w-1', 'E_LOGIN_REQUIRED', null);
  assert.deepEqual(wf.clearAllHealth(), ['DeepSeek'], 'clearAllHealth 行为不变');
  assert.equal(wf.health.size, 0);
});

/** 最小设置服务夹具（fake config / scheduler / engine；只覆盖 patch 落盘与健康清除路径） */
function makeService() {
  const calls = { cleared: [] };
  const config = {
    file: path.join(TMP, 'config.json'),
    current: {
      outboxDir: path.join(TMP, 'outbox'),
      workers: [
        {
          id: 'w-1',
          platform: 'custom',
          name: '站点A',
          enabled: true,
          url: 'https://x',
          driver: { inputSelector: '', sendButtonSelector: '', replySelector: '' },
          toggles: { thinking: false, search: false },
        },
      ],
    },
    save: async (next) => {
      config.current = next;
      return [];
    },
  };
  const health = new Map();
  const workforce = {
    health,
    byId: (id) => config.current.workers.find((x) => x.id === id) || null,
    clearHealth: (id) => {
      calls.cleared.push(id);
      health.delete(id);
    },
    markChecked() {},
  };
  const scheduler = { listWorkers: () => [], workforce, runner: { isWorkerBusy: () => false }, pump() {} };
  const service = createSettingsService({
    config,
    scheduler,
    engine: { call: async () => ({}) },
    log: quietLog,
    userDataDir: TMP,
    version: '0.0.1',
  });
  return { service, calls, health };
}

test('⑥ service.patch：worker.setDriver 落盘后清该条目健康记录（触发器）；其它 patch 不动健康记录', async () => {
  const { service, calls, health } = makeService();
  health.set('w-1', { status: 'unavailable', detail: 'opening：输入区未找到', at: new Date().toISOString(), until: Date.now() + 600000 });
  const r = await service.patch({ op: 'worker.setDriver', id: 'w-1', driver: { inputSelector: '.in' } });
  assert.equal(r.ok, true);
  assert.deepEqual(calls.cleared, ['w-1'], 'setDriver 落盘 ⇒ clearHealth(id)');
  assert.equal(health.has('w-1'), false, '改完即可重派（不撞 10 分钟冷却）');
  health.set('w-1', { status: 'unavailable', detail: null, at: new Date().toISOString(), until: Date.now() + 600000 });
  const r2 = await service.patch({ op: 'worker.rename', id: 'w-1', name: '改名' });
  assert.equal(r2.ok, true);
  assert.deepEqual(calls.cleared, ['w-1'], '非 setDriver 变更不触碰该条目健康记录');
  assert.equal(health.has('w-1'), true);
});
