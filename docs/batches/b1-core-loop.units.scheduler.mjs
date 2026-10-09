/**
 * b1 单元测试 · 调度面（选人 / 状态机 / 终态分界；scheduler.md §3 / §4 / §6 / §9）
 * 由入口 `b1-core-loop.units.mjs` 聚合执行（`node --test docs/batches/b1-core-loop.units.mjs`）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const { Workforce } = await load('src/main/scheduler/workforce.mjs');
const { Task, TERMINAL_STATES, PHASES, PREWARM_PHASES, ATTACH_PHASES, isTerminalState } = await load(
  'src/main/scheduler/task.mjs',
);
const { decideOutcome, interpretEngineResult, normalizeDelivery, RETRYABLE, DEGRADABLE } = await load(
  'src/main/scheduler/policy.mjs',
);

const TMP = path.join(REPO, '.thincoder', 'tmp', `units-sched-${process.pid}`);
function freshTmp(name) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
process.on('exit', () => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const noopLog = { info() {}, warn() {}, error() {}, debug() {} };

/** 造一个最小的外包工条目（配置 schema 形状） */
function worker(id, name, extra = {}) {
  return { id, platform: 'deepseek', name, enabled: true, toggles: { thinking: false, search: false }, ...extra };
}

/** 造 Workforce（config.current.workers = 传入数组；isBusy 可注入） */
function makeWorkforce(workers, { isBusy } = {}) {
  return new Workforce({ config: { current: { workers } }, log: noopLog, isBusy });
}

const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => {
    assert.equal(e?.code, code, `期望错误码 ${code}，实际 ${e?.code}（${e?.message}）`);
    return true;
  });

// ---------------------------------------------------------------------------
// 选人（scheduler §4 / §6）
// ---------------------------------------------------------------------------

test('选人：优先级路径取第一个健康者（数组顺序即优先级）', () => {
  const wf = makeWorkforce([worker('w-1', 'A'), worker('w-2', 'B')]);
  const picked = wf.pick(undefined);
  assert.equal(picked.mode, 'priority');
  assert.equal(picked.worker.id, 'w-1');
  assert.match(picked.reason, /优先级第 1/);
});

test('选人：忙 ≠ 不可用（首选正忙仍选它，任务排队）', () => {
  const wf = makeWorkforce([worker('w-1', 'A'), worker('w-2', 'B')], { isBusy: (id) => id === 'w-1' });
  const picked = wf.pick(undefined);
  assert.equal(picked.worker.id, 'w-1', '忙不换人（K6）');
  // busy 只影响对外词表
  assert.equal(wf.list()[0].status, 'busy');
});

test('选人：不可用 ⇒ 降级到下一优先级；全部不可用 ⇒ 拒绝 E_NO_WORKER（不建任务）', () => {
  const wf = makeWorkforce([worker('w-1', 'A'), worker('w-2', 'B')]);
  wf.setCooldown('w-1', 'E_LOGIN_REQUIRED', '未登录');
  const picked = wf.pick(undefined);
  assert.equal(picked.worker.id, 'w-2');
  assert.match(picked.reason, /优先级第 2/);

  wf.setCooldown('w-2', 'E_CAPTCHA_OR_RISK', '风控');
  throwsCode(() => wf.pick(undefined), 'E_NO_WORKER');
});

test('选人：停用条目在优先级路径被跳过，指定被停用 ⇒ E_WORKER_DISABLED', () => {
  const wf = makeWorkforce([worker('w-1', 'A', { enabled: false }), worker('w-2', 'B')]);
  assert.equal(wf.pick(undefined).worker.id, 'w-2');
  throwsCode(() => wf.pick('A'), 'E_WORKER_DISABLED');
});

test('选人：指定 = 硬绑定（命中名 / id；未登记 ⇒ E_WORKER_UNKNOWN；不健康 ⇒ 报错不换人）', () => {
  const wf = makeWorkforce([worker('w-1', 'A'), worker('w-2', 'B')]);
  assert.equal(wf.pick('A').mode, 'explicit');
  assert.equal(wf.pick(' w-2 ').worker.id, 'w-2', '按条目 id 命中（trim）');
  throwsCode(() => wf.pick('不存在'), 'E_WORKER_UNKNOWN');
  try {
    wf.pick('不存在');
    assert.fail('应抛 E_WORKER_UNKNOWN');
  } catch (e) {
    assert.match(e.message, /A|B/, 'hint 应附可用名单');
  }

  wf.setCooldown('w-1', 'E_LOGIN_REQUIRED', '未登录');
  throwsCode(() => wf.pick('A'), 'E_LOGIN_REQUIRED');
  wf.setCooldown('w-1', 'E_SELECTOR_MISSING', '选择器失效');
  throwsCode(() => wf.pick('A'), 'E_WORKER_UNAVAILABLE');
  assert.equal(wf.list()[1].status, 'ready', '另一外包工不受影响（硬绑定不降级）');
});

test('选人：冷却映射（captcha_cooling ⇒ unavailable + detail；登录态一维保留）', () => {
  const wf = makeWorkforce([worker('w-1', 'A')]);
  wf.setCooldown('w-1', 'E_CAPTCHA_OR_RISK', '出现验证码');
  const view = wf.list()[0];
  assert.equal(view.status, 'unavailable');
  assert.match(view.detail, /冷却中：验证码 \/ 风控/);
  assert.equal(wf.unavailableCode('w-1'), 'E_WORKER_UNAVAILABLE');
});

test('人工处理路径：clearAllHealth 清全部冷却 ⇒ 回 ready 可立即派单；无冷却 ⇒ 空且不报错', () => {
  const wf = makeWorkforce([worker('w-1', 'A'), worker('w-2', 'B')]);
  assert.deepEqual(wf.clearAllHealth(), [], '无冷却 ⇒ 空数组，不报错');
  wf.setCooldown('w-1', 'E_LOGIN_REQUIRED', '未登录');
  wf.setCooldown('w-2', 'E_CAPTCHA_OR_RISK', '风控');
  throwsCode(() => wf.pick(undefined), 'E_NO_WORKER');
  const restored = wf.clearAllHealth();
  assert.deepEqual(restored.sort(), ['A', 'B'], '返回被恢复的外包工名（粒度 = 全部）');
  assert.deepEqual(wf.list().map((w) => w.status), ['ready', 'ready'], '清除后对外词表回 ready');
  assert.equal(wf.pick(undefined).worker.id, 'w-1', '清除后可立即派单（不再 E_NO_WORKER）');
  assert.deepEqual(wf.clearAllHealth(), [], '幂等：再清一次 ⇒ 空');
});


test('降级候选：nextAvailable 跳过已尝试 / 停用 / 不健康', () => {
  const wf = makeWorkforce([worker('w-1', 'A'), worker('w-2', 'B', { enabled: false }), worker('w-3', 'C')]);
  assert.equal(wf.nextAvailable(new Set()).id, 'w-1');
  assert.equal(wf.nextAvailable(new Set(['w-1'])).id, 'w-3');
  assert.equal(wf.nextAvailable(new Set(['w-1', 'w-3'])), null, '降级耗尽 ⇒ null（上层落 needs_human）');
  wf.setCooldown('w-3', 'E_SELECTOR_MISSING', 'x');
  assert.equal(wf.nextAvailable(new Set(['w-1'])), null);
});

// ---------------------------------------------------------------------------
// 状态机与终态分界（scheduler §3 / §6 / §9）
// ---------------------------------------------------------------------------

test('状态机：终态集合与过程态、阶段链与阶段分组', () => {
  assert.deepEqual([...TERMINAL_STATES].sort(), ['canceled', 'done', 'failed', 'needs_human']);
  assert.equal(isTerminalState('queued'), false);
  assert.equal(isTerminalState('running'), false);
  assert.equal(isTerminalState('needs_human'), true);
  assert.deepEqual(PHASES, ['opening', 'uploading', 'sending', 'streaming', 'extracting', 'finalizing']);
  assert.deepEqual([...PREWARM_PHASES].sort(), ['opening', 'sending', 'uploading'], '降级只发生在预热阶段');
  assert.deepEqual([...ATTACH_PHASES].sort(), ['opening', 'uploading'], '补件窗口 = 尚未发送');
});

test('任务模型：queued → running → 终态；done / canceled 的 error 恒为 null', () => {
  const t = new Task({
    taskId: '20261009-120000-abcd',
    taskDir: freshTmp('task-dir'),
    request: { task: '任务原文', files: ['D:\\a.txt'] },
    worker: { id: 'w-1', name: 'A', platform: 'deepseek' },
    selection: { mode: 'priority', reason: '优先级第 1；健康' },
  });
  assert.equal(t.state, 'queued');
  assert.equal(t.isTerminal(), false);

  t.markRunning();
  assert.equal(t.state, 'running');
  assert.ok(t.timings.startedAt);

  t.recordAttempt('w-1', 'E_TIMEOUT');
  t.recordAttempt('w-1', 'done');
  assert.deepEqual(t.attempts.map((a) => a.result), ['E_TIMEOUT', 'done']);

  t.settle('done', null);
  assert.equal(t.isTerminal(), true);
  assert.equal(t.error, null);
  assert.equal(t.phase, null);
  assert.ok(t.timings.finishedAt);

  const m = t.toManifest();
  assert.equal(m.state, 'done');
  assert.equal(m.worker.name, 'A');
  assert.equal(m.selection.mode, 'priority');
  assert.deepEqual(m.request.files, ['D:\\a.txt']);
  assert.equal(m.error, null);
  assert.equal('interrupted' in m, false, 'interrupted 缺省不出现（独立标记字段）');

  // TaskView 形状（契约 §3）
  const view = t.toView();
  assert.deepEqual(Object.keys(view).sort(), [
    'attempts',
    'delivery',
    'error',
    'phase',
    'selection',
    'state',
    'taskId',
    'timings',
    'worker',
  ]);
});

test('任务模型：needs_human / failed 携带 error（code/message/hint/needsHuman）；interrupted 为独立标记', () => {
  const t = new Task({
    taskId: '20261009-120001-abcd',
    taskDir: freshTmp('task-dir-2'),
    request: { task: 'x', files: [] },
    worker: { id: 'w-1', name: 'A', platform: 'deepseek' },
    selection: { mode: 'explicit', reason: '指定「A」；健康' },
  });
  t.settle('needs_human', {
    code: 'E_SELECTOR_MISSING',
    message: '开关元素缺失',
    hint: '该外包工暂不可用；需适配器适配（附截图）',
    needsHuman: true,
  });
  const view = t.toView();
  assert.equal(view.error.code, 'E_SELECTOR_MISSING');
  assert.equal(view.error.needsHuman, true);

  t.interrupted = { at: '2026-10-09T00:00:00.000Z', previousState: 'running' };
  assert.equal(t.toManifest().interrupted.previousState, 'running');
  assert.equal(t.toManifest().state, 'needs_human', 'interrupted 不进 state 枚举');
});

test('终态分界（decideOutcome）：瞬时重试 → 重试耗尽 failed；不可用类 → 降级 / needs_human', () => {
  const cfg = { retryPerWorker: 2, maxFailoverWorkers: 3 };
  const base = { cfg, mode: 'priority', retriesOnWorker: 0, triedCount: 1, sawStreaming: false, nextWorker: null };

  // 瞬时：同外包工重试（退避 3s / 10s），耗尽 ⇒ failed
  assert.deepEqual(decideOutcome({ ...base, code: 'E_TIMEOUT' }), { action: 'retry', delayMs: 3000 });
  assert.deepEqual(decideOutcome({ ...base, code: 'E_NO_RESPONSE', retriesOnWorker: 1 }), { action: 'retry', delayMs: 10000 });
  assert.deepEqual(decideOutcome({ ...base, code: 'E_SEND_FAILED', retriesOnWorker: 2 }), { action: 'finish', state: 'failed' });
  assert.equal(RETRYABLE.has('E_TIMEOUT') && RETRYABLE.has('E_NO_RESPONSE') && RETRYABLE.has('E_SEND_FAILED'), true);

  // 不可用类：有下一候选 ⇒ 降级；无 ⇒ needs_human
  const next = worker('w-2', 'B');
  assert.deepEqual(decideOutcome({ ...base, code: 'E_SELECTOR_MISSING', nextWorker: next }), { action: 'failover', worker: next });
  assert.deepEqual(decideOutcome({ ...base, code: 'E_LOGIN_REQUIRED', nextWorker: null }), { action: 'finish', state: 'needs_human' });
  assert.equal(DEGRADABLE.has('E_CAPTCHA_OR_RISK') && DEGRADABLE.has('E_WORKER_UNAVAILABLE'), true);

  // b1 单外包工：E_SELECTOR_MISSING（含开关应用失败）⇒ 直接落 needs_human（AC-R8-3 调度侧）
  assert.deepEqual(decideOutcome({ ...base, code: 'E_SELECTOR_MISSING', nextWorker: null, triedCount: 1 }), {
    action: 'finish',
    state: 'needs_human',
  });

  // 硬绑定（explicit）不降级：终态按 needsHuman 列
  assert.deepEqual(decideOutcome({ ...base, mode: 'explicit', code: 'E_LOGIN_REQUIRED', nextWorker: next }), {
    action: 'finish',
    state: 'needs_human',
  });
  // 已进入 streaming / 降级耗尽 ⇒ 不换人
  assert.deepEqual(decideOutcome({ ...base, code: 'E_SELECTOR_MISSING', nextWorker: next, sawStreaming: true }), {
    action: 'finish',
    state: 'needs_human',
  });
  assert.deepEqual(decideOutcome({ ...base, code: 'E_SELECTOR_MISSING', nextWorker: next, triedCount: 3 }), {
    action: 'finish',
    state: 'needs_human',
  });

  // 其余按错误码表 needsHuman 列收终态
  assert.deepEqual(decideOutcome({ ...base, code: 'E_OUTBOX_WRITE' }), { action: 'finish', state: 'needs_human' });
  assert.deepEqual(decideOutcome({ ...base, code: 'E_BAD_FILE' }), { action: 'finish', state: 'failed' });
  assert.deepEqual(decideOutcome({ ...base, code: 'E_CANCELED' }), { action: 'finish', state: 'canceled' });
});

test('引擎结果解释：业务失败走 result.error；取消 / 成功分流；交付清单归一化', () => {
  const failed = interpretEngineResult({ error: { code: 'E_SELECTOR_MISSING', message: '开关元素缺失' } });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, 'E_SELECTOR_MISSING');

  const canceled = interpretEngineResult({ canceled: true, delivery: { partial: true } });
  assert.equal(canceled.canceled, true);

  const ok = interpretEngineResult({ canceled: false, error: null, delivery: { transport: 'sse', files: [1] } });
  assert.equal(ok.ok, true);
  assert.equal(ok.delivery.transport, 'sse');

  assert.equal(interpretEngineResult(null).error.code, 'E_INTERNAL', '无法识别的结果 ⇒ E_INTERNAL');

  const d = normalizeDelivery({ transport: 'sse', files: [{ name: 'a.py' }] });
  assert.equal(d.textPath, 'answer.md', 'textPath 缺省 answer.md');
  assert.equal(d.partial, false);
  assert.equal(normalizeDelivery(null), null);
});
