/**
 * `verify:pack` 段 C：随包 Chromium（P2 段 C；裁定 ② 序约束的验收面——默认值与随包运行时同批）。
 *
 * 读数口径（批次档 b4 §2·T2 / P2 段 C）：
 *   · 配置 `browser.mode=chromium` + `channel=''`（随包）⇒ 派单一条
 *   · **硬断言**：运行期间从测试侧枚举进程映像（PowerShell `Get-CimInstance Win32_Process` 读
 *     ExecutablePath，轮询至超时）——命中 `release/win-unpacked/resources/ms-playwright/` 下的
 *     浏览器进程 = 过、超时 = 失败
 *   · 辅证：应用日志 `channel=随包 chromium`（引擎「启动浏览器」行）
 *   · 未登录 ⇒ 终态 `needs_human`/`E_LOGIN_REQUIRED`（风控则 `E_CAPTCHA_OR_RISK`，同属预期）——
 *     本机读数为隔离 profile 首次运行（未登录态），符合该预期；其他终态照实失败、不造假绿
 *
 * 环境：隔离 userData + 剥离 ELECTRON_RUN_AS_NODE + PATH 只留系统目录（P3）；
 * 不碰真实 outbox（交付目录 = 隔离 userData 内）；优雅退出 = 二实例 `--quit`。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MS_PLAYWRIGHT,
  freePort,
  freshUserData,
  killPid,
  killTree,
  makeMcpClient,
  psProcesses,
  quitApp,
  readAppLog,
  readRuntime,
  sleep,
  spawnPackagedApp,
  systemOnlyPath,
  waitFor,
  writeConfig,
} from './pack.driver.mjs';
import { killAll } from './pack.session.mjs';

after(killAll);

const TERMINAL = new Set(['done', 'failed', 'canceled', 'needs_human']);
const TASK_PROMPT = '只回复两个字：完成。';

test('段 C：随包 Chromium（派单 ⇒ 浏览器进程映像命中 resources/ms-playwright）', { timeout: 420000 }, async () => {
  const userData = freshUserData('chromium');
  const port = await freePort();
  writeConfig(userData, {
    port,
    outboxDir: path.join(userData, 'outbox'),
    browser: { mode: 'chromium', channel: '', headless: false },
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  });
  const p3 = systemOnlyPath();

  const child = spawnPackagedApp({ userData, envExtra: { PATH: p3.path } });
  try {
    const rt = await waitFor(() => readRuntime(userData), 90000, 250);
    assert.ok(rt, `应用未在预算内写 runtime.json（退出=${child.exitCode !== null}；stderr=${String(child.err).slice(0, 400)}）`);
    const engineReady = await waitFor(() => (readAppLog(userData).includes('引擎就绪') ? true : null), 60000, 300);
    assert.ok(engineReady, '引擎未在预算内就绪，无法派单');

    const mcp = await makeMcpClient(rt.port);
    const dispatched = await mcp.call('dispatch_task', { task: TASK_PROMPT, waitSeconds: 0 });
    assert.ok(dispatched.data?.ok === true, `派单被拒绝：${dispatched.raw}`);
    const taskId = dispatched.data?.task?.taskId;
    assert.ok(taskId, '派单应立即返回任务号');

    // 运行期间并行轮询：① 进程映像（硬断言通道，独立于任务状态机）② 任务状态
    let hit = null;
    let last = dispatched.data.task;
    const phases = [];
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline && !(hit && TERMINAL.has(last.state))) {
      if (!hit) {
        const r = await psProcesses('ms-playwright');
        if (r.ok) {
          const p = r.procs.find((x) => x.exe && x.exe.toLowerCase().startsWith(MS_PLAYWRIGHT.toLowerCase()));
          if (p) {
            hit = p;
            console.log(`[verify:pack·段 C 读数] 命中随包浏览器进程 pid=${p.pid} exe=${p.exe}`);
          }
        } else {
          console.log(`[verify:pack·段 C 读数] 进程枚举失败（按未命中继续轮询）：${r.error}`);
        }
      }
      if (!TERMINAL.has(last.state)) {
        const r = await mcp.call('get_task', { taskId, waitSeconds: 3 });
        if (!r.isError && r.data?.task) {
          last = r.data.task;
          if (last.phase && phases[phases.length - 1] !== last.phase) phases.push(last.phase);
        }
      } else if (!hit) {
        await sleep(700); // 终态后仅等进程命中（needs_human ⇒ 浏览器窗口留人工，进程仍在）
      }
    }

    const tail = `state=${last.state} error=${JSON.stringify(last.error)} phases=${phases.join('>')}`;
    assert.ok(hit, `未在预算内命中 resources/ms-playwright 下的浏览器进程（硬断言；${tail}）`);
    assert.equal(last.state, 'needs_human', `终态应为 needs_human（未登录 / 风控族）：${tail}`);
    const code = last.error?.code ?? null;
    assert.ok(['E_LOGIN_REQUIRED', 'E_CAPTCHA_OR_RISK'].includes(code), `终态错误码应为未登录 / 风控族：${tail}`);

    const log = await waitFor(() => {
      const t = readAppLog(userData);
      return t.includes('channel=随包 chromium') ? t : null;
    }, 20000, 300);
    assert.ok(log, '日志应含「channel=随包 chromium」辅证行（引擎「启动浏览器」行）');

    // —— 退出与清理：--quit exit 0 ∧ runtime.json 已删 ∧ 浏览器进程随引擎收口 ——
    const r = await quitApp(child, userData, { PATH: p3.path });
    assert.equal(r.code, 0, `--quit 退出码应为 0：${JSON.stringify(r)}`);
    const gone = await waitFor(() => (!fs.existsSync(path.join(userData, 'runtime.json')) ? true : null), 15000, 200);
    assert.ok(gone, '退出后 runtime.json 应已删除');
    const cleared = await waitFor(async () => {
      const rr = await psProcesses('ms-playwright');
      return rr.ok && rr.procs.length === 0 ? true : null;
    }, 20000, 1000);
    if (!cleared) {
      const rr = await psProcesses('ms-playwright');
      console.log(`[verify:pack·段 C 读数] 退出后仍见 ${rr.procs.length} 个随包浏览器进程，按其 pid 清理：${rr.procs.map((p) => p.pid).join(',')}`);
      for (const p of rr.procs) killPid(p.pid);
    }

    console.log(
      `[verify:pack·段 C 读数] taskId=${taskId} phases=${phases.join('>')} 终态=${last.state}(${code}) · ` +
        `进程映像命中 pid=${hit.pid} exe=${hit.exe} · 日志辅证 channel=随包 chromium · 退出干净=${cleared === true}`,
    );
  } finally {
    killTree(child);
  }
});
