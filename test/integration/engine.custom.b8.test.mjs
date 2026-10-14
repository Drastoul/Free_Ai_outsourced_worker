/**
 * `npm run verify:engine`（自定义外包工面，b8 / R12）—— 写入轴 / Slate 重建 / 写入错误码映射 / 普查三段 / 候选链新族 / 遮挡处置
 *（机制权威：`docs/design/modules/adapters.md` §6.4 / §6.5 / §6.6；判据与读数口径：`docs/batches/b8-custom-worker-hardening.md` §2「验收对照」）
 *
 * 注入缝隙 = 无：worker 载荷携 `url` / `driver`，经注册表 `adapterFor(worker)` 走**真实** custom 适配器
 * （页面机械 / 本单锚定 / 普查 / 遮挡处置全为生产实现）；fixture 页由 `engine-helpers.startFixtureServer` 提供
 * （custom 侧页面在 `test/integration/custom-fixtures.mjs`）。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { closeFixtureServer, freshRoot, makeBrowser, startFixtureServer, tempBase } from './engine-helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TMP = tempBase('verify-engine-custom-b8');
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const { TaskRunner } = await load('src/engine/task-runner.mjs');
const { adapterFor } = await load('src/engine/adapters/registry.mjs');

const browsers = [];
after(async () => {
  for (const b of browsers) await b.closeAll().catch(() => {});
});

/** worker 载荷（url / driver 由主进程透传的口径：引擎不读配置） */
const workerOf = (base, { id = 'w-custom-b8', name = '自定义站点', driver = {}, page = '/custom' } = {}) => ({
  id,
  name,
  platform: 'custom',
  url: `${base}${page}`,
  driver,
});

function harness(browser, logs) {
  return new TaskRunner({
    browser,
    log: (scope, m) => logs.push(`[${scope}] ${m}`),
    emit: () => {},
  });
}

async function runCustomTask({ root, runner, taskId, worker, prompt = '自定义任务：请回复', timeouts }) {
  const outboxDir = path.join(root, `out-${taskId}`);
  fs.mkdirSync(outboxDir, { recursive: true });
  const result = await runner.run({ taskId, worker, prompt, files: [], outboxDir, toggles: {}, ...(timeouts ? { timeouts } : {}) });
  return { result, outboxDir };
}

/** 空白归一（与生产读回 / 普查同口径：折叠空白，含全角空白） */
const fold = (v) =>
  String(v ?? '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();

const readAnswer = (outboxDir) => fs.readFileSync(path.join(outboxDir, 'answer.md'), 'utf8').trim();

// ---------------------------------------------------------------------------
// AC-R12-1：写入轴（多行一次发送 / Slate 类站点重建）
// ---------------------------------------------------------------------------

test('AC-R12-1 多行任务：恰好一次发送 ∧ 提交体逐字含全文（含 \\n 与空行）∧ 交付 = 本单回复', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-b8-multiline', TMP);
  const { server, state, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs);
  const prompt = '第一行\n\n第二行';
  try {
    const { result, outboxDir } = await runCustomTask({ root, runner, taskId: 'b8-multi-1', worker: workerOf(base), prompt });
    assert.equal(result.error, null, `多行任务应成功：${JSON.stringify(result.error)}`);
    assert.equal(state.customSends.enter, 1, '多行任务必须恰好一次发送（不得被拆两次、不得误发送）');
    assert.equal(state.customSends.button, 0, 'driver 空 ⇒ 走 Enter，不得发生按钮发送');
    assert.equal(state.customSentBodies.at(-1)?.body, prompt, '提交体应逐字含全文（含 \\n 与空行）');
    assert.equal(readAnswer(outboxDir), '自定义回复-1', '交付 = 本单回复');
    assert.match(logs.join('\n'), /自定义写入：尝试=1\/3 聚焦=focus 行数=3 读回=通过/, '成功日志词形（§6.5 冻结）');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('AC-R12-1 Slate 类站点：首次聚焦重建节点后仍写入成功（输入区文本 = 任务文本）', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-b8-slate', TMP);
  const { server, state, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs);
  const prompt = 'Slate 第一行\n第二行';
  try {
    const { result, outboxDir } = await runCustomTask({
      root,
      runner,
      taskId: 'b8-slate-1',
      worker: workerOf(base, { page: '/custom-slate' }),
      prompt,
      timeouts: { streamFirstByteMs: 20000 },
    });
    assert.equal(result.error, null, `Slate 类站点应成功：${JSON.stringify(result.error)}`);
    assert.equal(state.customSentBodies.at(-1)?.query?.replaced, '1', 'fixture 应确实发生「首次聚焦后重建节点」（判据的可信前提）');
    assert.equal(state.customSentBodies.at(-1)?.body && fold(state.customSentBodies.at(-1).body), fold(prompt), '输入区文本（= 提交体）应等于任务文本');
    assert.equal(state.customSends.enter, 1, '恰好一次发送');
    assert.match(logs.join('\n'), /自定义写入：尝试=1\/3 聚焦=(focus|click) 行数=2 读回=通过/, '写入应一次到位（成功日志词形，§6.5 冻结）');
    assert.equal(readAnswer(outboxDir), '自定义回复-1', '交付 = 本单回复');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

// ---------------------------------------------------------------------------
// AC-R12-3：写入类失败的错误码映射（重试耗尽 ⇒ E_SEND_FAILED + 普查）
// ---------------------------------------------------------------------------

test('AC-R12-3 写入类失败：重试耗尽 ⇒ E_SEND_FAILED ∧ message 含尝试数与普查（不回落 E_INTERNAL）', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-b8-reject', TMP);
  const { server, state, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs);
  try {
    const { result } = await runCustomTask({ root, runner, taskId: 'b8-reject-1', worker: workerOf(base, { page: '/custom-reject-write' }) });
    assert.equal(result.error?.code, 'E_SEND_FAILED', `应判写入失败：${JSON.stringify(result.error)}`);
    assert.notEqual(result.error?.code, 'E_INTERNAL');
    assert.match(result.error.message, /sending：写入失败/, 'message 应含阶段与环节词形');
    assert.match(result.error.message, /尝试=3\/3/, 'message 应含尝试数');
    assert.match(result.error.message, /环节=读回/, 'message 应含最后环节');
    assert.match(result.error.message, /采集诊断/, 'message 应并入普查诊断');
    assert.match(result.error.message, /族计数/, '普查应含族计数字段');
    assert.equal(state.customSends.enter, 0, '写入未落地不得进入发送');
    assert.match(logs.join('\n'), /自定义写入失败：尝试=3\/3 环节=读回/, '失败日志词形（§6.5 冻结）');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

// ---------------------------------------------------------------------------
// AC-R12-2：取答复候选链 v2（普查三段 / 新族命中）
// ---------------------------------------------------------------------------

test('AC-R12-2/F12.3 普查：E_NO_RESPONSE 回执含三段（族计数 / 可见文本 / 类名 Top）∧ 链外类名可见 ∧ 单行 ≤900 字', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-b8-census', TMP);
  const { server, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs);
  try {
    const { result } = await runCustomTask({
      root,
      runner,
      taskId: 'b8-census-1',
      worker: workerOf(base, { page: '/custom-census' }),
      timeouts: { streamFirstByteMs: 2500, taskTimeoutMs: 30000 },
    });
    assert.equal(result.error?.code, 'E_NO_RESPONSE', `应判无回复：${JSON.stringify(result.error)}`);
    const msg = result.error.message;
    assert.match(msg, /族计数/, '普查应含族计数字段');
    assert.match(msg, /可见文本/, '普查应含可见文本字段');
    assert.match(msg, /类名 Top/, '普查应含类名 Top 字段');
    assert.match(msg, /\[role=listitem\|log\]=1/, '族计数应列出 role=log 家族（fixture 的 feed）');
    assert.match(msg, /普查可见回复文本/, '可见文本应含页面上的回复文本');
    assert.match(msg, /qa-census-7f3/, '类名 Top 应含链外类名（主包AI 据此定新选择器）');
    const diag = msg.split('+ 采集诊断：')[1] ?? '';
    assert.ok(diag.length > 0, '诊断串应存在');
    assert.ok(diag.length <= 900, `诊断整串应 ≤900 字（实际 ${diag.length}）`);
    assert.ok(!diag.includes('\n'), '诊断串必须单行（无换行）');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('AC-R12-2 候选链 v2：新族（第 6 项 [class*="bubble"]）无 replySelector 也 done ∧ answer.md = 回复文本', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-b8-newfamily', TMP);
  const { server, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs);
  try {
    const worker = workerOf(base, { page: '/custom-newfamily' });
    const { result, outboxDir } = await runCustomTask({ root, runner, taskId: 'b8-newfamily-1', worker, timeouts: { streamFirstByteMs: 20000 } });
    assert.equal(result.error, null, `新族站点应成功（候选链第 6 项命中）：${JSON.stringify(result.error)}`);
    assert.equal(result.delivery?.transport, 'dom');
    assert.equal(readAnswer(outboxDir), '新族回复文本', '交付 = 候选链新族命中的回复文本');
    // 链位钉死（判据括号所称「链第 6 项命中」）：同页取诊断串的「命中」段 ⇒ 唯一命中 = 第 6 项
    const diag = await adapterFor(worker).dom.diagnose(await browser.sessionPage(worker.id));
    assert.equal(/候选链 11 项命中 ([^；）]*)/.exec(diag)?.[1], '[class*="bubble" i]×1', `链位应钉死在第 6 项（实际诊断：${diag}）`);
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

// ---------------------------------------------------------------------------
// AC-R12-7：遮挡处置（轴 1b）
// ---------------------------------------------------------------------------

test('AC-R12-7 遮挡处置：整屏遮挡层（仅 Escape 可消除）⇒ 处置后写入成功 ∧ 日志词形可判', { timeout: 240000 }, async () => {
  const root = freshRoot('custom-b8-overlay', TMP);
  const { server, state, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  const runner = harness(browser, logs);
  try {
    const { result, outboxDir } = await runCustomTask({
      root,
      runner,
      taskId: 'b8-overlay-1',
      worker: workerOf(base, { page: '/custom-overlay' }),
      timeouts: { streamFirstByteMs: 20000 },
    });
    assert.equal(result.error, null, `遮挡层应被处置后照常写入：${JSON.stringify(result.error)}`);
    const text = logs.join('\n');
    assert.match(text, /自定义遮挡处置：动作=Escape 轮次=1\/3/, '应记录处置动作词形');
    assert.match(text, /自定义遮挡：消除/, '应记录遮挡消除词形');
    assert.equal(state.customSends.enter, 1, '遮挡处置后应恰好一次发送');
    assert.equal(readAnswer(outboxDir), '遮挡处置后的回复', '交付 = 本单回复');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});
