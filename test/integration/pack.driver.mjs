/**
 * `verify:pack` 读数工具（b4 切分 3，段 A–D 共用）：产物路径 / 打包态启动环境 / 进程映像枚举。
 *
 * 通用读数工具沿用 b2 已收口的 `settings.driver.mjs`（只读引用，不重写——避免另起一套）：
 *   freePort / waitFor / sleep / readAppLog / readRuntime / writeConfig / healthz / makeMcpClient。
 * 本件新增（b4 打包面专用）：
 *   · 产物路径常量（唯一来源 = electron-builder.yml 的 directories.output / productName / artifactName）
 *   · `packAppEnv`：剥 ELECTRON_RUN_AS_NODE / NODE_OPTIONS + FO_USER_DATA 隔离
 *   · `systemOnlyPath`：P3 读数环境（PATH 只留系统目录、不含 Node 安装目录——段 B / C 的启动环境）
 *   · `psProcesses`：进程映像枚举（PowerShell `Get-CimInstance Win32_Process` 读 ExecutablePath /
 *     CommandLine——段 C 硬断言与段 B 引擎核对的指定通道，批次档 b4 §2·P2）
 *
 * 环境口径（b1/b2 沿用）：起应用必剥 ELECTRON_RUN_AS_NODE；测试不碰真实 %APPDATA% 与真实 outbox；
 * 临时件落 `.thincoder/tmp/verify-pack/`；中文断言一律 UTF-8 感知（node 读串 / PowerShell 端点显式
 * UTF-8），不用 findstr。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  freePort,
  healthz,
  makeMcpClient,
  readAppLog,
  readRuntime,
  sleep,
  waitFor,
  writeConfig,
} from './settings.driver.mjs';

export { freePort, healthz, makeMcpClient, readAppLog, readRuntime, sleep, waitFor, writeConfig };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..');
export const TMP = path.join(REPO, '.thincoder', 'tmp', 'verify-pack');

// 产物落点（唯一来源 = electron-builder.yml 的 directories.output / productName / artifactName）
export const RELEASE = path.join(REPO, 'release');
export const UNPACKED = path.join(RELEASE, 'win-unpacked');
export const APP_EXE = path.join(UNPACKED, '免费外包.exe');
export const RESOURCES = path.join(UNPACKED, 'resources');
export const ASAR = path.join(RESOURCES, 'app.asar');
export const MS_PLAYWRIGHT = path.join(RESOURCES, 'ms-playwright');
export const GUIDE_DIR = path.join(RESOURCES, 'guide');
export const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
export const SETUP_EXE = path.join(RELEASE, `免费外包-${PKG_VERSION}-setup.exe`);

/** 隔离 userData（`.thincoder/tmp/verify-pack/<name>`）：上轮实例句柄释放有滞后 ⇒ 带重试；清不掉则明示失败 */
export function freshUserData(name) {
  const dir = path.join(TMP, name);
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    throw new Error(`清理临时 userData 失败（可能仍有上轮实例持有该目录）：${dir}；${e?.message || e}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 打包态应用环境：剥 ELECTRON_RUN_AS_NODE（引擎子进程本身以它为机制）+ NODE_OPTIONS；FO_USER_DATA 隔离 */
export function packAppEnv(userData, extra = {}) {
  const env = { ...process.env, FO_USER_DATA: userData, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  return env;
}

/**
 * P3 读数环境：PATH 只留系统目录（`%SystemRoot%` 下、路径段无 node 字样、目录存在）。
 * @returns {{path: string, kept: string[], dropped: string[]}} kept/dropped 供读数打印（可核验）
 */
export function systemOnlyPath(env = process.env) {
  const winRoot = String(env.SystemRoot || env.windir || 'C:\\Windows').toLowerCase();
  const parts = String(env.PATH || '')
    .split(';')
    .map((s) => s.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  const kept = [];
  const dropped = [];
  for (const p of parts) {
    const low = path.resolve(p).toLowerCase();
    if (low.startsWith(winRoot) && !/node/i.test(low) && fs.existsSync(p)) kept.push(p);
    else dropped.push(p);
  }
  return { path: kept.join(';'), kept, dropped };
}

/** 起打包态应用（stdout/stderr 收集到 child.out / child.err；cwd = 安装目录 = 打包态引擎 cwd 口径） */
export function spawnPackagedApp({ userData, args = [], envExtra = {} }) {
  const child = spawn(APP_EXE, args, {
    cwd: UNPACKED,
    env: packAppEnv(userData, envExtra),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.out = '';
  child.err = '';
  child.stdout.on('data', (d) => (child.out += d));
  child.stderr.on('data', (d) => (child.err += d));
  child.on('error', () => {}); // spawn 失败不得成为无人处理的 'error' 事件
  return child;
}

/** 优雅退出：二实例 `--quit`（同一 FO_USER_DATA ⇒ 同一单实例锁）⇒ 等首实例退出；返回 { ok, code, signal } */
export async function quitApp(child, userData, envExtra = {}) {
  const exited = waitFor(() => (child.exitCode !== null ? true : null), 45000, 250);
  const quitter = spawnPackagedApp({ userData, args: ['--quit'], envExtra });
  const qExited = new Promise((r) => quitter.on('exit', r));
  const ok = await exited;
  await Promise.race([qExited, sleep(15000)]);
  return { ok: ok === true, code: child.exitCode, signal: child.signalCode };
}

/** 结束进程树（win32：taskkill /T /F；shell 包装会留孤儿，故按树杀） */
export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill();
    }
  } catch {
    /* 尽力清理 */
  }
}

/** 杀单个进程（清理随包浏览器等子进程用；pid 来自 psProcesses 读数） */
export function killPid(pid) {
  try {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } catch {
    /* 尽力清理 */
  }
}

/**
 * 进程映像枚举：Win32_Process 中 ExecutablePath 命中 `*<whereLike>*` 的进程。
 * PowerShell 端点显式 UTF-8；失败 ⇒ { ok:false, error }（调用方按未命中继续轮询并打印 error，不静默）。
 * @returns {Promise<{ok: boolean, procs: Array<{pid: number, exe: string, cmd: string}>, error?: string}>}
 */
export function psProcesses(whereLike) {
  const script =
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ' +
    `@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like ${JSON.stringify(`*${whereLike}*`)} } ` +
    '| Select-Object ProcessId, ExecutablePath, CommandLine) | ConvertTo-Json -Compress -Depth 3';
  return new Promise((resolve) => {
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    let out = '';
    ps.stdout.on('data', (d) => (out += d));
    ps.stderr.on('data', () => {});
    ps.on('error', () => resolve({ ok: false, procs: [], error: 'powershell 不可用' }));
    ps.on('close', (code) => {
      if (code !== 0) return resolve({ ok: false, procs: [], error: `powershell exit ${code}` });
      let data;
      try {
        const j = JSON.parse(String(out).trim() || '[]');
        data = Array.isArray(j) ? j : [j];
      } catch {
        return resolve({ ok: false, procs: [], error: `进程清单 JSON 解析失败：${String(out).slice(0, 160)}` });
      }
      resolve({
        ok: true,
        procs: data.map((p) => ({ pid: p.ProcessId, exe: p.ExecutablePath || '', cmd: p.CommandLine || '' })),
      });
    });
  });
}
