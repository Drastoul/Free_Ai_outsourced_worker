/**
 * `npm run verify:engine`（自定义外包工面，b7 / R11）—— R11-a..d 读数
 *（机制权威：`docs/design/modules/adapters.md` §6；判据与读数口径：`docs/batches/b7-custom-workers.md` §2「验收对照」2）
 *
 * 注入缝隙 = 无：worker 载荷携 `url` / `driver`，经注册表 `adapterFor(worker)` 走**真实** custom 适配器
 * （页面机械 / 本单锚定 / 诊断串全为生产实现）；fixture 页由 `engine-helpers.startFixtureServer` 提供。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { closeFixtureServer, freshRoot, makeBrowser, startFixtureServer, tempBase } from './engine-helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TMP = tempBase('verify-engine-custom');
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const { TaskRunner } = await load('src/engine/task-runner.mjs');
const { adapterFor, getAdapter } = await load('src/engine/adapters/registry.mjs');

const browsers = [];
after(async () => {
  for (const b of browsers) await b.closeAll().catch(() => {});
});

/** worker 载荷（url / driver 由主进程透传的口径：引擎不读配置） */
const workerOf = (base, { id = 'w-custom', name = '自定义站点', driver = {}, page = '/custom' } = {}) => ({
  id,
  name,
  platform: 'custom',
  url: `${base}${page}`,
  driver,
});

function harness(browser, logs, phases) {
  return new TaskRunner({
    browser,
    log: (scope, m) => logs.push(`[${scope}] ${m}`),
    emit: (ev) => {
      if (ev.event === 'task-progress') phases.push(ev.phase);
    },
  });
}

async function runCustomTask({ root, runner, taskId, worker, prompt = '自定义任务：请回复', timeouts }) {
  const outboxDir = path.join(root, `out-${taskId}`);
  fs.mkdirSync(outboxDir, { recursive: true });
  const result = await runner.run({ taskId, worker, prompt, files: [], outboxDir, toggles: {}, ...(timeouts ? { timeouts } : {}) });
  return { result, outboxDir };
}

// ---------------------------------------------------------------------------

test('adapterFor：内置原样返回 / custom 派生带 url 与 driver / 基座实例不被污染（b7 §6.1）', () => {
  const ds = getAdapter('deepseek');
  assert.equal(adapterFor({ platform: 'deepseek', id: 'w' }), ds, '内置平台应原样返回（引用相等）');
  const derived = adapterFor({ platform: 'custom', id: 'w-c', url: 'http://127.0.0.1:1/chat', driver: { replySelector: '.x' } });
  assert.equal(derived.url, 'http://127.0.0.1:1/chat', '派生实例应带该工人的 url');
  assert.equal(derived.driver.replySelector, '.x', '派生实例应带该工人的 driver');
  assert.equal(derived.capabilities.streamCapture, false, 'custom 能力位（无流）');
  assert.equal(getAdapter('custom').url, 'about:blank', '基座实例的 url 不被派生污染');
  assert.equal(getAdapter('custom').driver.replySelector, '', '基座实例的 driver 不被派生污染');
  assert.equal(adapterFor({ platform: '不存在', id: 'w' }), null, '未注册平台 ⇒ null');
});

test('R11-a 自定义派单 happy path：DOM 通道交付 + 本单锚定（不含预置旧回合）+ 相位序（AC-R11-2）', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-happy', TMP);
  const { server, state, base } = await startFixtureServer();
  const logs = [];
  const phases = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs, phases);
  try {
    const { result, outboxDir } = await runCustomTask({ root, runner, taskId: 'custom-a-1', worker: workerOf(base) });
    assert.equal(result.error, null, `应成功（通用启发式）：${JSON.stringify(result.error)}`);
    assert.equal(result.canceled, false);
    assert.equal(result.delivery?.transport, 'dom', '无流平台 ⇒ 交付走 DOM 通道（如实回报）');

    const answer = fs.readFileSync(path.join(outboxDir, 'answer.md'), 'utf8').trim();
    assert.equal(answer, '自定义回复-1', '交付 = 本单回复');
    assert.ok(!answer.includes('上一单回复'), '不得包含预置旧回合文本（本单回合锚定）');
    assert.ok(!answer.includes('自定义任务：请回复'), '用户气泡（回声）不得混入交付');

    const idx = (p) => phases.indexOf(p);
    assert.ok(idx('opening') >= 0 && idx('sending') > idx('opening') && idx('streaming') > idx('sending'), `相位序异常：${phases.join('→')}`);

    const text = logs.join('\n');
    assert.match(text, /方式=enter/, 'driver 空 ⇒ 通用启发式走 Enter');
    assert.match(text, /发送已确认（/, '发送确认应落 send()（6s 口径）');
    assert.equal(state.customSends.enter, 1, 'fixture 应观测到一次 Enter 发送');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('R11-b 驱动缺失：页面无输入区 ⇒ E_SELECTOR_MISSING + 定位信息（阶段 + 项名）+ 失败截图', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-noinput', TMP);
  const { server, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs, []);
  try {
    const { result, outboxDir } = await runCustomTask({
      root,
      runner,
      taskId: 'custom-b1',
      worker: workerOf(base, { page: '/custom-noinput' }),
      timeouts: { openingMs: 20000 },
    });
    assert.equal(result.error?.code, 'E_SELECTOR_MISSING', `应判输入区未找到：${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /opening/, 'message 应含阶段（opening）');
    assert.match(result.error.message, /输入区/, 'message 应含项名（输入区）');
    assert.match(result.error.message, /候选/, 'message 应含候选链');
    assert.ok(result.error.screenshot, '应留失败截图（失败留证）');
    assert.ok(fs.existsSync(path.join(outboxDir, result.error.screenshot)));
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('R11-b 无回复：回复区类名不在候选链 ⇒ E_NO_RESPONSE + 采集诊断（不静默挂起）', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-noreply', TMP);
  const { server, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs, []);
  try {
    const { result, outboxDir } = await runCustomTask({
      root,
      runner,
      taskId: 'custom-b2',
      worker: workerOf(base, { page: '/custom-noreply' }),
      // 短预算（answer.mjs 的 DOM 轮询间隔 2s）⇒ 失败落在第 3 次轮询（不空等到总超时）
      timeouts: { streamFirstByteMs: 2500, taskTimeoutMs: 30000 },
    });
    assert.equal(result.error?.code, 'E_NO_RESPONSE', `应判无回复：${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /发送后未观测到新回复/, 'message 应说明等待时长口径');
    assert.match(result.error.message, /采集诊断/, 'message 应含诊断串');
    assert.match(result.error.message, /候选=0/, '诊断串应含候选数');
    assert.match(result.error.message, /候选链 3 项均 0 命中/, '诊断串应含候选链命中读数');
    assert.ok(result.error.screenshot, 'E_NO_RESPONSE 应留失败截图');
    assert.ok(fs.existsSync(path.join(outboxDir, result.error.screenshot)));
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('R11-c 驱动参数生效：replySelector 指向正确容器 ⇒ 同一页面派单成功（F11.3 接口）', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-driver-reply', TMP);
  const { server, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs, []);
  try {
    const { result, outboxDir } = await runCustomTask({
      root,
      runner,
      taskId: 'custom-c1',
      worker: workerOf(base, { page: '/custom-noreply', driver: { replySelector: '.bubble-item' } }),
      timeouts: { streamFirstByteMs: 15000 },
    });
    assert.equal(result.error, null, `补上 replySelector 后应成功：${JSON.stringify(result.error)}`);
    assert.equal(result.delivery?.transport, 'dom');
    const answer = fs.readFileSync(path.join(outboxDir, 'answer.md'), 'utf8').trim();
    assert.equal(answer, '非候选容器的回复', '交付 = 驱动选择器命中的容器文本');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('R11-c 驱动参数生效：sendButtonSelector ⇒ 按钮发送路径（fixture 观测 via=button）', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-driver-button', TMP);
  const { server, state, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs, []);
  try {
    const { result } = await runCustomTask({
      root,
      runner,
      taskId: 'custom-c2',
      worker: workerOf(base, { driver: { sendButtonSelector: '#send-btn' } }),
    });
    assert.equal(result.error, null, `按钮发送应成功：${JSON.stringify(result.error)}`);
    assert.equal(state.customSends.button, 1, 'fixture 应从按钮路径收到发送');
    assert.equal(state.customSends.enter, 0, '按钮路径不应走 Enter');
    assert.match(logs.join('\n'), /方式=button/);
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('R11-d 发送未确认：Enter 无任何反应 ⇒ E_SEND_FAILED + 发送方式（6s 口径）', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-stuck', TMP);
  const { server, state, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs, []);
  try {
    const { result, outboxDir } = await runCustomTask({ root, runner, taskId: 'custom-d1', worker: workerOf(base, { page: '/custom-stuck' }) });
    assert.equal(result.error?.code, 'E_SEND_FAILED', `应判发送未确认：${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /sending/, 'message 应含阶段（sending）');
    assert.match(result.error.message, /发送方式=enter/, 'message 应含发送方式');
    assert.equal(state.sent, 0, '未确认的发送不得进入上传 / 后续观测');
    assert.equal(fs.existsSync(path.join(outboxDir, 'answer.md')), false, '失败任务不产出 answer.md');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});
