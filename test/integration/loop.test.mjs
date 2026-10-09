/**
 * `npm run verify:loop` —— 真机端到端：派单 → 取答复 → 取件 → outbox 判据
 *（AC-R3-1 / AC-R3-2：≤180s 内 done、manifest 终态、answer.md 非空、files/ ≥1、delivery.transport = "sse"；
 * AC-R8-1：manifest.toggles 的 payload 与 configured 一致；AC-R8-2 应用侧随动证据）
 *
 * 真机前提：`.browser-profile/` 内有 DeepSeek 登录态（探针期建立；**只读复用，不删不重置**）；
 * 本命令自控应用启停（隔离 userData 落 .thincoder/tmp/verify-loop），跑完优雅退出。
 * 失败口径：平台侧波动（未登录 / 风控 / 网络）⇒ 原样给出读数并失败——不造假绿。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TMP = path.join(REPO, '.thincoder', 'tmp', 'verify-loop');
const PROFILE = path.join(REPO, '.browser-profile'); // 既有登录态（只读复用）
const require = createRequire(path.join(REPO, 'package.json'));
const electronPath = require('electron');

/** AC-R8-1 示例组：thinking=true / search=false（两键均需真实切换，载荷核对才有分辨力） */
const WANT_TOGGLES = { thinking: true, search: false };
const TASK_PROMPT =
  '请用一个 python 代码块输出一个最小文件：代码块第一行是注释 # file: verify_loop.py，第二行是 print("verify-loop-ok")。' +
  '代码块之外只回复两个字：完成。不要解释。';

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

const children = [];
/** 起应用：剥掉 ELECTRON_RUN_AS_NODE（否则 electron 以纯 Node 模式启动）；profile 指到探针登录态目录 */
function startApp(userData, extraArgs = [], env = {}) {
  const merged = { ...process.env, FO_USER_DATA: userData, ...env };
  delete merged.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath, ['.', ...extraArgs], {
    cwd: REPO,
    env: merged,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.push(child);
  return child;
}

async function quitApp(child, userData) {
  const exited = waitFor(() => (child.exitCode !== null ? true : null), 30000, 250);
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

let rpcId = 1;
async function mcpPost(port, body, sessionId /* , timeoutMs */) {
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
    /* 调用方按 status 断言 */
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
  return { isError: r.json?.result?.isError === true, data, raw: r.text.slice(0, 400) };
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

test('verify:loop —— 真机全链：派单 ⇒ 取答复（sse）⇒ 取件 ⇒ outbox 判据（≤180s）', { timeout: 360000 }, async () => {
  assert.ok(fs.existsSync(PROFILE), `缺登录态目录 ${PROFILE}（需先人工登录一次 DeepSeek）`);

  const userData = path.join(TMP, 'app');
  fs.rmSync(userData, { recursive: true, force: true });
  const outboxDir = path.join(userData, 'outbox');
  const port = await freePort();
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    `${JSON.stringify(
      {
        version: 1,
        mcp: { port, host: '127.0.0.1', token: '' },
        browser: { mode: 'edge', channel: 'msedge', headless: false },
        outboxDir,
        workers: [
          { id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: WANT_TOGGLES },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const app = startApp(userData, [], { FREE_OUTSOURCE_PROFILE_DIR: PROFILE });
  try {
    const rt = await waitFor(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
      } catch {
        return null;
      }
    }, 90000);
    assert.ok(rt, '应用未在预算内写出 runtime.json');
    assert.equal(rt.port, port);

    const init = await mcpPost(port, {
      jsonrpc: '2.0',
      id: rpcId++,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify-loop', version: '1.0.0' } },
    });
    assert.equal(init.status, 200);
    const sessionId = init.headers.get('mcp-session-id');
    assert.ok(sessionId);
    await mcpPost(port, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);

    // —— 派单（异步）——
    const t0 = Date.now();
    const dispatched = await mcpCall(port, sessionId, 'dispatch_task', { task: TASK_PROMPT, waitSeconds: 0 });
    assert.ok(!dispatched.isError, `派单被拒绝：${dispatched.raw}`);
    assert.equal(dispatched.data?.ok, true);
    const taskId = dispatched.data?.task?.taskId;
    assert.ok(taskId, '派单应立即返回任务号');
    const taskDir = path.join(outboxDir, taskId);

    // —— 轮询到终态（总预算 180s）——
    let last = dispatched.data.task;
    const phases = [];
    const deadline = t0 + 180000;
    while (!['done', 'failed', 'canceled', 'needs_human'].includes(last.state) && Date.now() < deadline) {
      const r = await mcpCall(port, sessionId, 'get_task', { taskId, waitSeconds: 5 });
      assert.ok(!r.isError, `get_task 失败：${r.raw}`);
      last = r.data.task;
      if (last.phase && phases[phases.length - 1] !== last.phase) phases.push(last.phase);
    }
    const elapsed = Date.now() - t0;

    assert.equal(last.state, 'done', `任务未在预算内 done：state=${last.state} error=${JSON.stringify(last.error)} phases=${phases.join('>')}`);
    // 时长判据（AC-R3-1「≤180s 内 done」）以**任务自身 timings** 为准：
    // 墙钟 elapsed 含长轮询（waitSeconds=5）的检测滞后，不能作为任务时长判据（见 #4 评审发现）
    const taskMs = Date.parse(last.timings?.finishedAt ?? '') - Date.parse(last.timings?.createdAt ?? '');
    assert.ok(
      Number.isFinite(taskMs) && taskMs <= 180000,
      `任务时长 ${(taskMs / 1000).toFixed(1)}s 超 180s 预算（timings=${JSON.stringify(last.timings)}）`,
    );
    assert.ok(elapsed <= 180000 + 60000, `墙钟耗时 ${(elapsed / 1000).toFixed(1)}s 异常（含启动与轮询检测滞后）`);

    // —— outbox 判据（AC-R3-1 / AC-R3-2 / AC-R8-1）——
    // 注：manifest 由主进程落盘（任务终结后异步 flush）——MCP 已报 done 时文件可能尚差一拍；
    //     这里做有界等待（≤15s）并记录落盘滞后；判据自身不放松：文件最终必须 state=done。
    const manifestFile = path.join(taskDir, 'manifest.json');
    let manifest = null;
    const manifestDeadline = Date.now() + 15000;
    while (Date.now() < manifestDeadline) {
      try {
        const raw = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        if (raw?.state === 'done') {
          manifest = raw;
          break;
        }
      } catch {
        /* 先于文件出现 / 半写窗口：重试 */
      }
      await sleep(250);
    }
    const manifestLagMs = Date.now() - t0 - elapsed;
    assert.ok(manifest, `manifest.json 未在 15s 内落终态（内存态=${last.state}）`);
    assert.equal(manifest.state, 'done');
    assert.equal(manifest.taskId, taskId);
    assert.equal(manifest.delivery?.transport, 'sse', '取答复通道应为流通道（AC-R3-2）');
    assert.equal(manifest.delivery?.textPath, 'answer.md');
    const answer = fs.readFileSync(path.join(taskDir, 'answer.md'), 'utf8');
    assert.ok(answer.trim().length > 0, 'answer.md 不得为空');
    const fileNames = fs.readdirSync(path.join(taskDir, 'files'));
    assert.ok(fileNames.length >= 1, 'files/ 应至少 1 个文件（下载捕获 / 代码块提取；AC-R3-1）');
    // 文件清单契约（不锁平台侧命名：平台可能把代码块渲染为「文件/画布」⇒ 落盘名由下载建议名给出）
    const deliveryFiles = manifest.delivery?.files ?? [];
    assert.equal(deliveryFiles.length, fileNames.length, 'manifest 文件清单应与 files/ 实况一致');
    for (const f of deliveryFiles) {
      assert.ok(f.name && f.relPath && f.bytes > 0 && /^[0-9a-f]{64}$/.test(f.sha256 ?? ''), `文件条目形状不完整：${JSON.stringify(f)}`);
      assert.equal(path.dirname(path.join(taskDir, f.relPath)), path.join(taskDir, 'files'), `${f.name} 应落在 files/ 内`);
      assert.ok(fs.existsSync(path.join(taskDir, f.relPath)), `${f.relPath} 应实际存在`);
      assert.ok(['download', 'code_block'].includes(f.source), `取件层来源：${f.source}`);
    }

    // 开关载荷核对（AC-R8-1）：payload 与 configured 一致
    assert.deepEqual(manifest.toggles?.configured, WANT_TOGGLES);
    assert.ok(manifest.toggles?.payload, `未捕获请求载荷（toggles=${JSON.stringify(manifest.toggles)}）`);
    assert.equal(manifest.toggles.payload.thinking_enabled, true, '载荷 thinking_enabled 应为 true');
    assert.equal(manifest.toggles.payload.search_enabled, false, '载荷 search_enabled 应为 false');
    assert.equal(manifest.toggles.ok, true, 'configured 与 payload 应一致');

    // —— fetch_result：文本与文件清单可取回 ——
    const fetched = await mcpCall(port, sessionId, 'fetch_result', { taskId });
    assert.equal(fetched.data?.ok, true);
    assert.equal(fetched.data?.outboxDir, taskDir, 'outboxDir = 该单实际交付目录');
    assert.ok((fetched.data?.text ?? '').trim().length > 0);
    assert.ok(Array.isArray(fetched.data?.files) && fetched.data.files.length >= 1);
    assert.equal(fetched.data.files.length, fileNames.length, 'fetch_result 文件清单应与 files/ 实况一致');

    console.log(
      `[verify:loop 读数] taskId=${taskId} 任务时长=${(taskMs / 1000).toFixed(1)}s（timings）墙钟=${(elapsed / 1000).toFixed(1)}s ` +
        `phases=${phases.join('>')} manifest落盘滞后≈${manifestLagMs}ms transport=${manifest.delivery.transport} ` +
        `files=[${deliveryFiles.map((f) => `${f.name}(${f.source},${f.bytes}B)`).join(',')}] ` +
        `toggles=${JSON.stringify(manifest.toggles)}`,
    );

    const clean = await quitApp(app, userData);
    assert.ok(clean, '应用应能优雅退出');
  } finally {
    try {
      app.kill();
    } catch {
      /* 忽略 */
    }
  }
});
