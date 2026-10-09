/**
 * `npm run verify:mcp` —— MCP 契约面（AC-R1-2 / AC-R2-2 / AC-R4b-2）
 *（设计权威：docs/design/modules/mcp-server.md §3 / §5 / §7）
 *
 * 契约面：initialize；tools/list 恰好六件套且入参 schema 齐全、description 中文非空；
 *   /healthz 载荷含 ok/version/port/workers；错误路径：空 task ⇒ E_BAD_ARGS；未知 worker ⇒ E_WORKER_UNKNOWN；
 *   未知 taskId ⇒ E_TASK_UNKNOWN（三者均不建任务）。
 * 文档断言（R7 / R9 文档侧）：由同目录 `mcp-face.docs.mjs` 在同一命令内执行
 *   （① 四节 + R9 两节 +「本工具端点配置」节；④ 五要素；内嵌 JSON 可解析 + 字段形状；工具清单与 tools/list 对照）。
 * 按测试对象拆分（设计档 §3.3：任一文件超 300 行 ⇒ 按测试对象拆分）。
 *
 * 自控启停：本命令自行拉起隔离实例（FO_USER_DATA 指向 .thincoder/tmp/verify-mcp），跑完优雅退出。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { assertGuideDocs } from './mcp-face.docs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TMP = path.join(REPO, '.thincoder', 'tmp', 'verify-mcp');
const require = createRequire(path.join(REPO, 'package.json'));
const electronPath = require('electron');

/** 六件套契约名单（与 tools/list 对照；权威 = docs/design/modules/mcp-server.md §3） */
const TOOL_NAMES = ['list_workers', 'dispatch_task', 'get_task', 'fetch_result', 'cancel_task', 'attach_files'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 60000, stepMs = 250) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(stepMs);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function writeConfig(userData, port) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    `${JSON.stringify(
      {
        version: 1,
        mcp: { port, host: '127.0.0.1', token: '' },
        browser: { mode: 'edge', channel: 'msedge' },
        outboxDir: path.join(userData, 'outbox'),
        workers: [
          { id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

const children = [];
/** 起应用：必须剥掉 ELECTRON_RUN_AS_NODE（否则 electron 以纯 Node 模式启动，`import { Menu } from 'electron'` 直接失败） */
function appEnv(userData, extra = {}) {
  const env = { ...process.env, FO_USER_DATA: userData, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
function startApp(userData, extraArgs = [], env = {}) {
  const child = spawn(electronPath, ['.', ...extraArgs], {
    cwd: REPO,
    env: appEnv(userData, env),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.push(child);
  return child;
}

async function quitApp(child, userData) {
  const exited = waitFor(() => (child.exitCode !== null ? true : null), 25000, 250);
  try {
    startApp(userData, ['--quit']);
  } catch {
    /* 忽略 */
  }
  const ok = await exited;
  if (!ok) {
    child.kill();
    await waitFor(() => (child.exitCode !== null ? true : null), 8000, 250);
  }
  return ok === true;
}

after(() => {
  for (const c of children) {
    try {
      if (c.exitCode === null) c.kill();
    } catch {
      /* 忽略 */
    }
  }
});

// ---------------------------------------------------------------------------
// MCP 客户端（Streamable HTTP）
// ---------------------------------------------------------------------------

let rpcId = 1;
async function mcpPost(port, body, sessionId) {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应由调用方按 status 断言 */
  }
  return { status: res.status, headers: res.headers, json, text };
}

async function mcpCall(port, sessionId, name, args) {
  const r = await mcpPost(port, { jsonrpc: '2.0', id: rpcId++, method: 'tools/call', params: { name, arguments: args } }, sessionId);
  const payload = r.json?.result?.content?.[0]?.text;
  let data = null;
  try {
    data = payload ? JSON.parse(payload) : null;
  } catch {
    /* 保持 null */
  }
  return { isError: r.json?.result?.isError === true, data, raw: r.text.slice(0, 300) };
}

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------

test('verify:mcp —— 契约面 + 文档断言（自控隔离实例）', { timeout: 240000 }, async () => {
  const userData = path.join(TMP, 'app');
  fs.rmSync(userData, { recursive: true, force: true });
  const port = await freePort();
  writeConfig(userData, port);
  const outboxDir = path.join(userData, 'outbox');

  const app = startApp(userData);
  try {
    const rt = await waitFor(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
      } catch {
        return null;
      }
    }, 90000);
    assert.ok(rt, '应用未在预算内写出 runtime.json');
    assert.equal(rt.port, port, '期望端口应被采用（隔离实例）');
    const base = `http://127.0.0.1:${port}`;

    // —— /healthz 载荷 ——（设计 §2：ok / version / port / workers）
    const health = await (await fetch(`${base}/healthz`)).json();
    assert.equal(health.ok, true);
    assert.equal(typeof health.version, 'string');
    assert.equal(health.port, rt.port);
    assert.ok(Array.isArray(health.workers) && health.workers.length >= 1, 'workers 概览应含已登记外包工');
    for (const k of ['id', 'name', 'platform', 'enabled', 'status']) {
      assert.ok(k in health.workers[0], `workers[0] 缺字段 ${k}`);
    }
    assert.ok(['ready', 'login_required', 'busy', 'unavailable', 'disabled'].includes(health.workers[0].status));

    // —— initialize ——
    const init = await mcpPost(port, {
      jsonrpc: '2.0',
      id: rpcId++,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify-mcp', version: '1.0.0' } },
    });
    assert.equal(init.status, 200);
    assert.equal(init.json?.result?.serverInfo?.name, 'free-outsource');
    const sessionId = init.headers.get('mcp-session-id');
    assert.ok(sessionId, 'initialize 应下发 mcp-session-id');
    const caps = init.json?.result?.capabilities ?? {};
    assert.ok(caps.tools, '能力声明须含 tools');
    assert.ok(!caps.resources && !caps.prompts, '能力声明仅 tools（不做 resources / prompts）');
    await mcpPost(port, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);

    // —— tools/list：恰好六件套 ——
    const list = await mcpPost(port, { jsonrpc: '2.0', id: rpcId++, method: 'tools/list' }, sessionId);
    const tools = list.json?.result?.tools;
    assert.ok(Array.isArray(tools), `tools/list 失败：${list.text.slice(0, 200)}`);
    assert.equal(tools.length, 6, `tools/list 应恰好六件套，实际 ${tools.length}`);
    assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());

    for (const t of tools) {
      assert.equal(t.inputSchema?.type, 'object', `${t.name}.inputSchema 应为 object`);
      assert.ok(t.inputSchema?.properties && typeof t.inputSchema.properties === 'object', `${t.name}.inputSchema.properties 缺失`);
      if (t.inputSchema.required !== undefined) {
        assert.ok(Array.isArray(t.inputSchema.required), `${t.name}.inputSchema.required 应为数组`);
      }
      assert.equal(typeof t.description, 'string');
      assert.ok(t.description.trim().length > 0, `${t.name}.description 不得为空`);
      assert.ok(/[\u4e00-\u9fff]/.test(t.description), `${t.name}.description 应为中文（AC-R2-2）`);
      for (const [param, schema] of Object.entries(t.inputSchema?.properties ?? {})) {
        assert.ok(schema && typeof schema.type === 'string', `${t.name}.${param} 缺 schema.type`);
      }
    }
    // 各工具的必填项（契约 §3）
    const requiredOf = (name) => tools.find((t) => t.name === name)?.inputSchema?.required ?? [];
    assert.ok(requiredOf('dispatch_task').includes('task'));
    assert.ok(requiredOf('get_task').includes('taskId'));
    assert.ok(requiredOf('fetch_result').includes('taskId'));
    assert.ok(requiredOf('cancel_task').includes('taskId'));
    assert.ok(requiredOf('attach_files').includes('taskId') && requiredOf('attach_files').includes('files'));
    const dispatch = tools.find((t) => t.name === 'dispatch_task');
    for (const p of ['task', 'worker', 'files', 'waitSeconds']) {
      assert.ok(dispatch.inputSchema.properties[p], `dispatch_task 缺入参 ${p}`);
    }
    assert.equal(dispatch.inputSchema.properties.waitSeconds.maximum, 600, 'waitSeconds 上限 600');

    // —— 错误路径（三者均不建任务）——
    const badArgs = await mcpCall(port, sessionId, 'dispatch_task', { task: '' });
    assert.ok(badArgs.isError, '空 task 应返回 isError');
    assert.equal(badArgs.data?.code, 'E_BAD_ARGS');
    assert.ok(badArgs.data?.hint, '错误信封应含 hint（面向主包AI 的下一步建议）');

    const unknownWorker = await mcpCall(port, sessionId, 'dispatch_task', { task: '探活任务', worker: '不存在的名字' });
    assert.ok(unknownWorker.isError);
    assert.equal(unknownWorker.data?.code, 'E_WORKER_UNKNOWN');
    assert.match(unknownWorker.data?.message ?? '', /DeepSeek|w-1/, 'hint/消息应附可用名单');

    const unknownTask = await mcpCall(port, sessionId, 'get_task', { taskId: '20000101-000000-zzzz' });
    assert.ok(unknownTask.isError);
    assert.equal(unknownTask.data?.code, 'E_TASK_UNKNOWN');

    const unknownFetch = await mcpCall(port, sessionId, 'fetch_result', { taskId: '20000101-000000-zzzz' });
    assert.equal(unknownFetch.data?.code, 'E_TASK_UNKNOWN');

    const created = fs.existsSync(outboxDir) ? fs.readdirSync(outboxDir) : [];
    assert.deepEqual(created, [], '派单期拒绝与未知单查询不得创建任务目录（不建任务）');

    // —— 文档断言（R7 / R9 文档侧；同一命令内执行）——
    assertGuideDocs({ tools, runtimeJson: rt });

    const clean = await quitApp(app, userData);
    assert.ok(clean, '隔离实例应能优雅退出');
  } finally {
    try {
      app.kill();
    } catch {
      /* 忽略 */
    }
  }
});
