/**
 * `npm run verify:engine`（会话复用面）—— J1–J5 / J8 / J9 集成读数
 *（机制权威：`docs/design/modules/browser-engine.md` §9；判据与读数口径：`docs/batches/b5-session-reuse.md` §2「验收对照」2）
 *
 * 读数主判 = fixture 计数对象（`state.openSessions`，打开新会话次数）；引擎日志行（`复用会话（` / `新会话（原因=`）为佐证。
 * 注入缝隙（批次档 §2 T4）：fixture 适配器 = `defineAdapter({ ...deepseek, id:'fixture', url:<本地会话页> })` 经
 * `registerAdapter` 注册；`openSession` 换计数桩；`stream.match/parse` 指向本地答复路由；
 * `TaskRunner` 直构（`sessionPolicy` 走生产缺省 = `new SessionPolicy()`）。
 *
 * fixture 会话页（`engine-helpers.startFixtureServer` 的 `/session`）：可见 textarea（placeholder 与 DeepSeek
 * 同款 ⇒ 真实 `checkLogin` 判 ready）；Enter ⇒ 追加「本单回合-N」块 + 按 `behaviors` 逐单取通道
 *（`stream`=本地答复 / `hang`=永不回包 ⇒ DOM 兜底或可取消 / `drop`=不发请求 ⇒ E_SEND_FAILED）。
 * DOM 兜底走真实实现（`deepseek-dom.collectDomAnswer`），故 J9 能验证「复用 × 本单锚定」。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { closeFixtureServer, freshRoot, makeBrowser, startFixtureServer, tempBase } from './engine-helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TMP = tempBase('verify-engine-session');
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const { TaskRunner } = await load('src/engine/task-runner.mjs');
const { registerAdapter } = await load('src/engine/adapters/registry.mjs');
const { defineAdapter } = await load('src/engine/adapters/base.mjs');
const { default: deepseek } = await load('src/engine/adapters/deepseek.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browsers = [];
after(async () => {
  for (const b of browsers) await b.closeAll().catch(() => {});
});

/** 装配一只 fixture 适配器（`sandbox` 进程内 id 唯一；测试串行 ⇒ 逐例覆盖注册即可） */
function registerFixtureAdapter({ base, state, behaviors = '' }) {
  const adapter = defineAdapter({
    ...deepseek,
    id: 'fixture',
    platformName: 'Fixture',
    url: `${base}/session${behaviors ? `?behaviors=${behaviors}` : ''}`,
    capabilities: {
      ...deepseek.capabilities,
      upload: false,
      downloadCapture: false,
      toggles: false,
      requestPayloadCapture: false,
    },
    async openSession(page) {
      state.openSessions += 1;
      await page.evaluate(() => window.__foReset && window.__foReset()).catch(() => {});
      return { via: 'stub' };
    },
    stream: {
      match: (url) => url.startsWith(`${base}/api/`),
      parse: (body) => ({ text: String(body).trim(), thinking: '', finished: true }),
    },
  });
  registerAdapter(adapter);
  return adapter;
}

/** 一次引擎任务（run 参数样板收敛；每单独立 outboxDir 便于逐单判 answer.md） */
function runTask({ root, runner, taskId, session, timeouts }) {
  const outboxDir = path.join(root, `out-${taskId}`);
  fs.mkdirSync(outboxDir, { recursive: true });
  return runner.run({
    taskId,
    worker: { id: 'w-fx', name: 'Fixture', platform: 'fixture' },
    prompt: '会话复用 fixture 任务',
    files: [],
    outboxDir,
    toggles: {},
    ...(session ? { session } : {}),
    ...(timeouts ? { timeouts } : {}),
  });
}

function harness() {
  const logs = [];
  return { logs, runnerOf: (browser) => new TaskRunner({ browser, log: (scope, m) => logs.push(`[${scope}] ${m}`), emit: () => {} }) };
}

async function waitForLog(logs, re, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (re.test(logs.join('\n'))) return true;
    await sleep(100);
  }
  return false;
}

const answerOf = (root, taskId) => fs.readFileSync(path.join(root, `out-${taskId}`, 'answer.md'), 'utf8');

// ---------------------------------------------------------------------------

test('J1 连续两单复用：第二单沿用会话（计数=1）+ 日志「复用会话（」（AC-R10-1）', { timeout: 120000 }, async () => {
  const root = freshRoot('j1', TMP);
  const { server, state, base } = await startFixtureServer();
  const { logs, runnerOf } = harness();
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  registerFixtureAdapter({ base, state });
  const runner = runnerOf(browser);
  try {
    const r1 = await runTask({ root, runner, taskId: 'fx-j1-1' });
    assert.equal(r1.error, null, `首单应完成：${JSON.stringify(r1.error)}`);
    const r2 = await runTask({ root, runner, taskId: 'fx-j1-2' });
    assert.equal(r2.error, null, `次单应完成：${JSON.stringify(r2.error)}`);

    assert.equal(r2.delivery?.transport, 'sse');
    assert.equal(state.openSessions, 1, '连续两单只应打开一次会话');
    const text = logs.join('\n');
    assert.match(text, /新会话（原因=absent）/, '首单应记「新会话（原因=absent）」');
    assert.match(text, /复用会话（taskCount=1 idleMs=\d+）/, '次单应记「复用会话（taskCount=1 …）」');
    assert.equal(answerOf(root, 'fx-j1-2').trim(), '应答-2', '次单交付 = 本次答复');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('J2 TTL 到期换新：空闲 > ttlMs ⇒ 计数=2 + 日志 ttl（兜底例；主判据=批内单元注入 now）', { timeout: 120000 }, async () => {
  const root = freshRoot('j2', TMP);
  const { server, state, base } = await startFixtureServer();
  const { logs, runnerOf } = harness();
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  registerFixtureAdapter({ base, state });
  const runner = runnerOf(browser);
  try {
    const session = { ttlMs: 1000 };
    const r1 = await runTask({ root, runner, taskId: 'fx-j2-1', session });
    assert.equal(r1.error, null, `首单应完成：${JSON.stringify(r1.error)}`);
    await sleep(1600); // 空闲 > ttlMs ⇒ 下一单判 ttl
    const r2 = await runTask({ root, runner, taskId: 'fx-j2-2', session });
    assert.equal(r2.error, null, `次单应完成：${JSON.stringify(r2.error)}`);
    assert.equal(state.openSessions, 2, 'TTL 到期应换新会话');
    assert.match(logs.join('\n'), /新会话（原因=ttl）/);
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('J3 出错即换新：首单 E_SEND_FAILED ⇒ 次单计数=2 + 日志 error（AC-R10-2）', { timeout: 120000 }, async () => {
  const root = freshRoot('j3', TMP);
  const { server, state, base } = await startFixtureServer();
  const { logs, runnerOf } = harness();
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  registerFixtureAdapter({ base, state, behaviors: 'drop' }); // 首单不发匹配请求 ⇒ 判发送未确认
  const runner = runnerOf(browser);
  try {
    const timeouts = { sendingMs: 2000 };
    const r1 = await runTask({ root, runner, taskId: 'fx-j3-1', timeouts });
    assert.equal(r1.canceled, false);
    assert.equal(r1.error?.code, 'E_SEND_FAILED', `首单应判发送未确认：${JSON.stringify(r1)}`);
    assert.match(r1.error.message, /发送未确认：\d+ms 内未观测到答复流请求/, 'T2：失败回执应为中性词形（不绑定平台协议名）');
    const r2 = await runTask({ root, runner, taskId: 'fx-j3-2', timeouts });
    assert.equal(r2.error, null, `次单应完成：${JSON.stringify(r2.error)}`);
    assert.equal(state.openSessions, 2, '出错后应换新会话');
    assert.match(logs.join('\n'), /新会话（原因=error）/);
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('J4 上限换新：maxTasksPerSession=2 三单 ⇒ 计数=2 + 日志 count（AC-R10-2）', { timeout: 180000 }, async () => {
  const root = freshRoot('j4', TMP);
  const { server, state, base } = await startFixtureServer();
  const { logs, runnerOf } = harness();
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  registerFixtureAdapter({ base, state });
  const runner = runnerOf(browser);
  try {
    const session = { maxTasksPerSession: 2 };
    const r1 = await runTask({ root, runner, taskId: 'fx-j4-1', session });
    const r2 = await runTask({ root, runner, taskId: 'fx-j4-2', session });
    const r3 = await runTask({ root, runner, taskId: 'fx-j4-3', session });
    for (const [i, r] of [r1, r2, r3].entries()) assert.equal(r.error, null, `第 ${i + 1} 单应完成`);
    assert.equal(state.openSessions, 2, '前两单同会话、第三单触顶换新');
    const text = logs.join('\n');
    assert.match(text, /复用会话（taskCount=1 idleMs=/, '第二单应复用（taskCount=1）');
    assert.match(text, /新会话（原因=count）/, '第三单应记「新会话（原因=count）」');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('J5 禁用回退：reuse:false 两单 ⇒ 计数=2 + 每单日志 disabled（AC-R10-3）', { timeout: 120000 }, async () => {
  const root = freshRoot('j5', TMP);
  const { server, state, base } = await startFixtureServer();
  const { logs, runnerOf } = harness();
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  registerFixtureAdapter({ base, state });
  const runner = runnerOf(browser);
  try {
    const session = { reuse: false };
    const r1 = await runTask({ root, runner, taskId: 'fx-j5-1', session });
    const r2 = await runTask({ root, runner, taskId: 'fx-j5-2', session });
    assert.equal(r1.error, null);
    assert.equal(r2.error, null);
    assert.equal(state.openSessions, 2, '禁用复用 ⇒ 每单新建会话');
    const hits = logs.join('\n').match(/新会话（原因=disabled）/g) ?? [];
    assert.equal(hits.length, 2, '两单均应记「新会话（原因=disabled）」');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('J8 取消即换新：运行中取消 ⇒ result.canceled=true ⇒ 次单计数=2 + 日志 canceled（AC-R10-5）', { timeout: 120000 }, async () => {
  const root = freshRoot('j8', TMP);
  const { server, state, base } = await startFixtureServer();
  const { logs, runnerOf } = harness();
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  registerFixtureAdapter({ base, state, behaviors: 'hang' }); // 首单永不回包 ⇒ 悬挂期取消
  const runner = runnerOf(browser);
  try {
    const timeouts = { streamFirstByteMs: 2500, taskTimeoutMs: 30000 };
    const p1 = runTask({ root, runner, taskId: 'fx-j8-1', timeouts });
    const sent = await waitForLog(logs, /已发送（观测到答复流请求）/, 30000);
    const canceled = runner.cancel({ taskId: 'fx-j8-1' });
    const r1 = await p1;
    assert.ok(sent, '首单应在预算内进入已发送（send 确认）');
    assert.equal(canceled.canceled, true, '运行中的任务应可取消');
    assert.equal(r1.canceled, true, '首单应回报 canceled');

    const r2 = await runTask({ root, runner, taskId: 'fx-j8-2', timeouts });
    assert.equal(r2.error, null, `次单应完成：${JSON.stringify(r2.error)}`);
    assert.equal(state.openSessions, 2, '取消后应换新会话');
    assert.match(logs.join('\n'), /新会话（原因=canceled）/);
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('J9 复用 × DOM 兜底：本单流未捕获 ⇒ 交付=本单回合、不含上一单文本（AC-R10-6）', { timeout: 180000 }, async () => {
  const root = freshRoot('j9', TMP);
  const { server, state, base } = await startFixtureServer();
  const { logs, runnerOf } = harness();
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  registerFixtureAdapter({ base, state, behaviors: 'stream,hang' }); // 二单：流通道 → 永不回包（DOM 兜底）
  const runner = runnerOf(browser);
  try {
    const r1 = await runTask({ root, runner, taskId: 'fx-j9-1' });
    assert.equal(r1.error, null, `首单应完成：${JSON.stringify(r1.error)}`);
    assert.equal(r1.delivery?.transport, 'sse');

    // 复用前提的实物证据：页面留存上一单回合
    const page = browser.sessions.get('w-fx')?.page ?? null;
    assert.ok(page, '会话页面应存在');
    const turns = await page.evaluate(() => [...document.querySelectorAll('[class*="ds-markdown"]')].map((b) => b.innerText));
    assert.deepEqual(turns, ['本单回合-1'], '页面应留存上一单回合');

    const r2 = await runTask({ root, runner, taskId: 'fx-j9-2', timeouts: { streamFirstByteMs: 2500 } });
    assert.equal(r2.error, null, `次单应完成（DOM 兜底）：${JSON.stringify(r2.error)}`);
    assert.equal(r2.delivery?.transport, 'dom', '本单流未捕获 ⇒ 交付走 DOM 兜底');
    const answer2 = answerOf(root, 'fx-j9-2').trim();
    assert.equal(answer2, '本单回合-2', 'DOM 兜底须锚定本单回合');
    assert.ok(!answer2.includes('本单回合-1'), '不得混入上一单文本');
    assert.equal(state.openSessions, 1, '第二单应复用（未新开会话）');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});
