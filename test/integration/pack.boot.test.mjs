/**
 * `verify:pack` 段 B：打包态启动（P2 段 B + P3 本机替代判据；批次档 b4 §2）。
 *
 * 读数口径：
 *   · 起 `release/win-unpacked/免费外包.exe`（隔离 userData；剥 ELECTRON_RUN_AS_NODE；
 *     PATH 只留系统目录 = P3「引擎不依赖系统 Node」的机制读数）
 *   · `/healthz` ok + 版本 + 端口 + 外包工概览；日志「引擎就绪」；runtime.json 字段齐
 *   · 引擎子进程 = 打包 exe 自身（映像路径 == 免费外包.exe 且命令含 asar 内 host.mjs，非 node.exe）
 *   · `--quit` ⇒ exit 0 ∧ runtime.json 已删
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_EXE,
  PKG_VERSION,
  freePort,
  freshUserData,
  healthz,
  killTree,
  psProcesses,
  quitApp,
  readAppLog,
  readRuntime,
  spawnPackagedApp,
  systemOnlyPath,
  waitFor,
  writeConfig,
} from './pack.driver.mjs';
import { killAll } from './pack.session.mjs';

after(killAll);

test('段 B：打包态启动（隔离 userData · 无系统 Node PATH）', { timeout: 300000 }, async () => {
  const userData = freshUserData('boot');
  const port = await freePort();
  writeConfig(userData, {
    port,
    outboxDir: path.join(userData, 'outbox'),
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  });

  // P3：PATH 只留系统目录（Node 安装目录必被剔除）
  const p3 = systemOnlyPath();
  assert.ok(p3.kept.length > 0, `系统目录 PATH 为空，读数无意义：${JSON.stringify(p3)}`);
  assert.ok(!p3.kept.some((p) => /node/i.test(p)), `PATH 仍含 Node 字样目录：${JSON.stringify(p3.kept)}`);

  const child = spawnPackagedApp({ userData, envExtra: { PATH: p3.path } });
  try {
    // runtime.json（MCP 就位）
    const rt = await waitFor(() => readRuntime(userData), 90000, 250);
    assert.ok(rt, `应用未在预算内写 runtime.json（退出=${child.exitCode !== null}；stderr=${String(child.err).slice(0, 400)}）`);
    assert.equal(rt.host, '127.0.0.1');
    assert.equal(rt.port, port);
    assert.equal(rt.url, `http://127.0.0.1:${port}/mcp`);
    assert.equal(rt.version, PKG_VERSION);
    assert.ok(Number.isInteger(rt.pid) && rt.pid > 0, `pid 非法：${rt.pid}`);
    assert.ok(!Number.isNaN(Date.parse(rt.startedAt)), `startedAt 非 ISO 时间：${rt.startedAt}`);

    // /healthz
    const hz = await waitFor(() => healthz(port), 60000, 500);
    assert.ok(hz && hz.ok === true, `/healthz 非 ok：${JSON.stringify(hz)}`);
    assert.equal(hz.version, PKG_VERSION);
    assert.equal(hz.port, port);
    assert.ok(
      Array.isArray(hz.workers) && hz.workers.some((w) => w?.name === 'DeepSeek' && w?.status === 'ready'),
      `外包工概览异常（应含 DeepSeek/ready）：${JSON.stringify(hz.workers)}`,
    );

    // 日志：引擎就绪 + 引擎子进程 = asar 内 host.mjs
    const log = await waitFor(() => {
      const t = readAppLog(userData);
      return t.includes('引擎就绪') ? t : null;
    }, 60000, 300);
    assert.ok(log, '日志未出现「引擎就绪」');
    assert.ok(log.includes('app.asar') && log.includes('host.mjs'), '日志应显示引擎子进程入口在 asar 内（T4 打包态 hostScript）');

    // 引擎子进程 = 打包 exe 自身（非系统 Node）——进程映像核对
    const eng = await waitFor(
      async () => {
        const r = await psProcesses('win-unpacked');
        if (!r.ok) return null;
        const hit = r.procs.find((p) => p.cmd.includes('host.mjs') && p.exe.toLowerCase() === APP_EXE.toLowerCase());
        return hit ? { hit, total: r.procs.length } : null;
      },
      30000,
      1000,
    );
    assert.ok(eng, `未发现以打包 exe 运行的引擎子进程（${path.basename(APP_EXE)} + asar host.mjs）`);

    // --quit ⇒ exit 0 ∧ runtime.json 已删
    const r = await quitApp(child, userData, { PATH: p3.path });
    assert.equal(r.code, 0, `--quit 退出码应为 0：${JSON.stringify(r)}`);
    const gone = await waitFor(() => (!fs.existsSync(path.join(userData, 'runtime.json')) ? true : null), 15000, 200);
    assert.ok(gone, '退出后 runtime.json 应已删除');

    console.log(
      `[verify:pack·段 B 读数] port=${rt.port} version=${rt.version} pid=${rt.pid} · /healthz ok=${hz.ok} workers=${JSON.stringify(hz.workers)} ` +
        `· 引擎子进程 pid=${eng.hit.pid} exe=${eng.hit.exe}（==${path.basename(APP_EXE)}）· PATH 系统目录 ${p3.kept.length} 项（剔除 ${p3.dropped.length} 项，含 Node 目录）· --quit exit 0 · runtime.json 已删`,
    );
  } finally {
    killTree(child);
  }
});
