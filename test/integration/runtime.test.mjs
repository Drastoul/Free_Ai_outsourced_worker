/**
 * `npm run verify:runtime` —— 端点与端口（AC-R9-1 / AC-R9-2 b1 侧；自控应用启停）
 *
 * 场景 1（AC-R9-1）：占住期望端口 17873 ⇒ `runtime.json.port ≠ 17873`（顺延区间内）、
 *   日志含同一实际端口、按该端口探活成功、`runtime.json` 字段与 pid 判活。
 * 场景 2（AC-R9-2 b1 侧）：把期望端口写入配置（文件手改通道）→ 重启 ⇒ 以新端口服务、`runtime.json` 随动。
 *
 * 隔离：userData 用 FO_USER_DATA 指向 `.thincoder/tmp/verify-runtime/`（不碰真实 %APPDATA% 与仓库外目录）。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TMP = path.join(REPO, '.thincoder', 'tmp', 'verify-runtime');
const require = createRequire(path.join(REPO, 'package.json'));
const electronPath = require('electron');

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

const children = [];
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

/** 起应用：必须剥掉 ELECTRON_RUN_AS_NODE（否则 electron 以纯 Node 模式启动，应用起不来） */
function appEnv(userData, extra = {}) {
  const env = { ...process.env, FO_USER_DATA: userData, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
function startApp(userData, extraArgs = []) {
  const child = spawn(electronPath, ['.', ...extraArgs], {
    cwd: REPO,
    env: appEnv(userData),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.push(child);
  return child;
}

/** 优雅退出：第二实例带 --quit（首实例收到即退出）→ 等进程退出 */
async function quitApp(child, userData, { timeoutMs = 25000 } = {}) {
  const exited = waitFor(() => (child.exitCode !== null ? true : null), timeoutMs, 250);
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

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getJson(url, timeoutMs = 5000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return { status: res.status, json: await res.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

function writeConfig(userData, port) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    `${JSON.stringify(
      {
        version: 1,
        mcp: { port, host: '127.0.0.1', token: '' },
        browser: { mode: 'edge', channel: 'msedge', headless: false },
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

async function readAppLog(userData) {
  try {
    return await fsp.readFile(path.join(userData, 'logs', 'app.log'), 'utf8');
  } catch {
    return '';
  }
}

/** 起一个占位 HTTP 服务（占端口用） */
function blockPort(port) {
  const server = http.createServer((_req, res) => res.end('busy'));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function freshUserData(name) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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

test('场景 1：占住 17873 ⇒ 顺延 + runtime.json / 日志 / 探活三处一致（AC-R9-1）', { timeout: 180000 }, async () => {
  const userData = freshUserData('s1-busy');
  writeConfig(userData, 17873);

  const blocker = await blockPort(17873).catch(() => null); // 已被别的程序占用也满足场景前提（下面按实况分支）
  const app = startApp(userData);
  try {
    const rt = await waitFor(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
      } catch {
        return null;
      }
    }, 90000);
    assert.ok(rt, '被占后仍应启动并写 runtime.json（超时未见）');

    assert.notEqual(rt.port, 17873, '期望端口被占 ⇒ 必须顺延（不许静默占用失败）');
    assert.ok(rt.port >= 17874 && rt.port <= 17993, `顺延应落在 +120 区间内（17874–17993），实际 ${rt.port}`);
    assert.equal(rt.host, '127.0.0.1');
    assert.equal(rt.url, `http://127.0.0.1:${rt.port}/mcp`, 'url 必须与实际端口一致');
    assert.deepEqual(
      Object.keys(rt).sort(),
      ['host', 'pid', 'port', 'startedAt', 'url', 'version'],
      'runtime.json 字段清单（设计权威：docs/design/overview.md「端口策略与告知宿主」）',
    );
    assert.ok(pidAlive(rt.pid), `runtime.json.pid=${rt.pid} 应存活（判活依据）`);
    assert.ok(!Number.isNaN(Date.parse(rt.startedAt)), 'startedAt 应为 ISO 8601');

    const health = await getJson(`http://127.0.0.1:${rt.port}/healthz`);
    assert.equal(health.status, 200, '按实际端口探活应成功');
    assert.equal(health.json?.port, rt.port, '/healthz.port 与 runtime.json.port 一致');
    assert.equal(health.json?.ok, true);

    const log = (await readAppLog(userData)).replace(/\u001b\[[0-9;]*m/g, '');
    assert.match(log, new RegExp(`127\\.0\\.0\\.1:${rt.port}/mcp`), '日志应明示实际端口');
    assert.match(log, /顺延/, '日志应明示顺延发生');

    // 期望端口仍在占位服务手里（确认顺延原因成立）；若 17873 本就被别人占用，则跳过该响应性检查
    if (blocker) {
      const blockerHealth = await getJson('http://127.0.0.1:17873/healthz').catch(() => null);
      assert.ok(blockerHealth, '占位服务应仍在 17873 上');
    }

    const clean = await quitApp(app, userData);
    assert.ok(clean, '应用应能优雅退出');
    const gone = await waitFor(() => (fs.existsSync(path.join(userData, 'runtime.json')) ? null : true), 20000, 250);
    assert.ok(gone, '优雅退出后 runtime.json 应被删除（退出时尽力删除）');
  } finally {
    try {
      app.kill();
    } catch {
      /* 忽略 */
    }
    if (blocker) await new Promise((r) => blocker.close(r));
  }
});

test('场景 2：配置期望端口 → 重启 ⇒ 以新端口服务、runtime.json 随动（AC-R9-2 b1 侧）', { timeout: 240000 }, async () => {
  const userData = freshUserData('s2-config-port');

  // 第一次：期望端口 P1（动态取空闲端口，避免与环境耦合）
  const p1 = await freePort();
  writeConfig(userData, p1);
  const app1 = startApp(userData);
  try {
    const rt1 = await waitFor(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
      } catch {
        return null;
      }
    }, 90000);
    assert.ok(rt1, '第一次启动应写 runtime.json');
    assert.equal(rt1.port, p1, '配置的期望端口可用时须按之启动（不漂移）');
    assert.equal(rt1.url, `http://127.0.0.1:${p1}/mcp`);
    const h1 = await getJson(`http://127.0.0.1:${p1}/healthz`);
    assert.equal(h1.status, 200);
    assert.equal(h1.json?.port, p1);
    assert.ok(await quitApp(app1, userData), '第一次启动应能优雅退出');
  } finally {
    try {
      app1.kill();
    } catch {
      /* 忽略 */
    }
  }

  // 文件手改期望端口（设计 §2.3 的写入通道：用户或主包AI 手改 config.json 的 mcp.port）→ 重启
  const p2 = await freePort();
  assert.notEqual(p2, p1, '两次期望端口应不同（判据才可分辨）');
  writeConfig(userData, p2);
  const app2 = startApp(userData);
  try {
    const rt2 = await waitFor(() => {
      try {
        const rt = JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
        return rt.port === p2 ? rt : null; // 覆写后端口随动
      } catch {
        return null;
      }
    }, 90000);
    assert.ok(rt2, `重启后 runtime.json.port 应随动为 ${p2}（实际未随动）`);
    assert.notEqual(rt2.port, p1, '不得仍用旧端口');
    const h2 = await getJson(`http://127.0.0.1:${p2}/healthz`);
    assert.equal(h2.status, 200, `新端口 ${p2} 应可探活`);
    assert.equal(h2.json?.port, p2);
    const log = await readAppLog(userData);
    assert.match(log, new RegExp(`127\\.0\\.0\\.1:${p2}/mcp`), '日志应明示新端口');
    assert.ok(await quitApp(app2, userData), '第二次启动应能优雅退出');
  } finally {
    try {
      app2.kill();
    } catch {
      /* 忽略 */
    }
  }
});
