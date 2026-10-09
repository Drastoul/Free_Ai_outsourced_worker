/**
 * b2 单元测试 · 「打开并检查」编排面（fake engine：四态映射 / 拒绝路径 / 调用预算）
 * 设计权威：docs/design/modules/scheduler.md §10（worker.check 与调用预算）；settings-app.md §2（T6）。
 * 由入口 `b2-settings-ui.units.mjs` 聚合执行。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeService } from './b2-settings-ui.units.fixtures.mjs';

// ---------------------------------------------------------------------------
// checkWorker：结果映射 / 调用预算
// ---------------------------------------------------------------------------

test('service.checkWorker：四态成功路径写回 + 广播；调用预算 = 显式 openingMs', async () => {
  for (const [status, detail] of [
    ['ready', null],
    ['login_required', '需要登录'],
    ['captcha', null],
    ['unavailable', '页面打不开'],
  ]) {
    const { service, calls, broadcasts } = makeService({ engineResult: { status, ...(detail ? { detail } : {}) } });
    const res = await service.checkWorker('w-1');
    assert.equal(res.ok, true, `status=${status}`);
    assert.equal(res.status, status);
    assert.equal(calls.markChecked.status, status);
    assert.equal(calls.markChecked.id, 'w-1');
    assert.equal(broadcasts.length, 1);
    const call = calls.engineCalls[0];
    assert.equal(call.method, 'worker.check');
    assert.deepEqual(call.params, { worker: { id: 'w-1', name: 'DeepSeek', platform: 'deepseek' } });
    assert.equal(call.opts.timeoutMs, 20000, '调用预算 = limits.timeouts.openingMs（夹具取非默认值 20000 ⇒ 与写死默认可分辨）');
  }
});

test('service.checkWorker：引擎错误 / 超时 / 未知状态 / busy / 未知 id 均 {ok:false} 且不写回', async () => {
  const withError = makeService({ engineResult: { error: { code: 'E_SELECTOR_MISSING', message: '页面结构变化' } } });
  const r1 = await withError.service.checkWorker('w-1');
  assert.equal(r1.ok, false);
  assert.match(r1.error, /页面结构变化/);
  assert.equal(withError.calls.markChecked, null);

  const timeout = Object.assign(new Error('引擎响应超时（worker.check > 60000ms）'), { code: 'E_TIMEOUT' });
  const withTimeout = makeService({ engineError: timeout });
  const r2 = await withTimeout.service.checkWorker('w-1');
  assert.equal(r2.ok, false);
  assert.match(r2.error, /超时/);
  assert.equal(withTimeout.calls.markChecked, null);

  const withUnknown = makeService({ engineResult: { status: 'wat' } });
  const r3 = await withUnknown.service.checkWorker('w-1');
  assert.equal(r3.ok, false);
  assert.match(r3.error, /未知检查状态/);

  const busyOne = makeService({ busy: true });
  const r4 = await busyOne.service.checkWorker('w-1');
  assert.equal(r4.ok, false);
  assert.match(r4.error, /正在执行任务/);
  assert.equal(busyOne.calls.engineCalls.length, 0, 'busy ⇒ 不打扰执行中的任务');

  const { service, calls } = makeService();
  const r5 = await service.checkWorker('w-404');
  assert.equal(r5.ok, false);
  assert.match(r5.error, /不存在/);
  assert.equal(calls.engineCalls.length, 0);
});

test('service.checkWorker：检查期间被删除 ⇒ 结果丢弃、不写回、不明示成功', async () => {
  const { service, calls, config } = makeService({
    engineResult: { status: 'ready' },
    engineHook: () => {
      config.current = { ...config.current, workers: [] };
    },
  });
  const res = await service.checkWorker('w-1');
  assert.equal(res.ok, false);
  assert.match(res.error, /已被删除/);
  assert.equal(calls.markChecked, null);
});
