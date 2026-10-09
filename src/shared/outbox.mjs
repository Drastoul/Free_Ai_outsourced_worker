// 交付目录（outbox）：实际路径解析与回落、任务子目录、manifest 原子读写、命名净化、重启标记。
// 设计权威：docs/design/modules/outbox.md（主进程与引擎子进程共用本模块的纯函数与落盘规则）。

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomHex, newTaskId } from './ids.mjs';

/** 出厂交付目录（决策 G） */
export const DEFAULT_OUTBOX_DIR = 'D:\\免费外包\\outbox';

/** 回落交付目录（K10：非 D 盘机器回落用户目录） */
export const FALLBACK_OUTBOX_DIR = path.join(os.homedir(), '免费外包', 'outbox');

/** 每单子目录固定结构 */
export const TASK_SUBDIRS = ['files', 'inbox', 'screenshots'];

export const TERMINAL_STATES = new Set(['done', 'failed', 'canceled', 'needs_human']);

export function isTerminalState(state) {
  return TERMINAL_STATES.has(state);
}

// ---------------------------------------------------------------------------
// 实际路径解析与回落（outbox.md §2：解析时点 = 启动 / 目录配置改动时 / 每单建任务时）
// ---------------------------------------------------------------------------

async function probeDir(dir) {
  try {
    await fsp.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${randomHex(6)}`);
    await fsp.writeFile(probe, 'ok', 'utf8');
    await fsp.rm(probe, { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.code || e?.message || String(e) };
  }
}

/**
 * 解析交付目录实际路径：判定 = 存在或可创建 ∧ 可写；不可用 ⇒ 回落 `%USERPROFILE%\免费外包\outbox`。
 * @param {string} configuredDir 配置值（为空 / 非法 ⇒ 用出厂默认）
 * @returns {Promise<{dir: string|null, fallback: boolean, reason: string|null, configured: string}>}
 *          两者都不可用 ⇒ dir = null（调用方明示失败，不静默）
 */
export async function resolveOutboxDir(configuredDir, { log } = {}) {
  const configured =
    typeof configuredDir === 'string' && configuredDir.trim() ? configuredDir.trim() : DEFAULT_OUTBOX_DIR;
  const primary = await probeDir(configured);
  if (primary.ok) {
    return { dir: path.resolve(configured), fallback: false, reason: null, configured };
  }
  log?.warn(`交付目录不可用（${primary.error}）：${configured}；尝试回落目录`);
  const fb = await probeDir(FALLBACK_OUTBOX_DIR);
  if (fb.ok) {
    return {
      dir: path.resolve(FALLBACK_OUTBOX_DIR),
      fallback: true,
      reason: `配置目录不可用（${primary.error}）`,
      configured,
    };
  }
  return {
    dir: null,
    fallback: true,
    reason: `配置目录不可用（${primary.error}）；回落目录不可用（${fb.error}）`,
    configured,
  };
}

/**
 * 建任务目录：`<outboxDir>/<taskId>/` + 固定子目录；撞目录 ⇒ 重新生成随机段。
 * @returns {Promise<{taskId: string, taskDir: string}>}
 */
export async function createTaskDir(outboxDir) {
  for (let i = 0; i < 10; i++) {
    const taskId = newTaskId();
    const taskDir = path.join(outboxDir, taskId);
    try {
      await fsp.mkdir(taskDir, { recursive: false });
    } catch (e) {
      if (e?.code === 'EEXIST') continue;
      throw e;
    }
    for (const sub of TASK_SUBDIRS) {
      await fsp.mkdir(path.join(taskDir, sub), { recursive: true });
    }
    return { taskId, taskDir };
  }
  throw new Error('无法生成不冲突的任务目录（连续 10 次撞名）');
}

// ---------------------------------------------------------------------------
// manifest 原子读写（outbox.md §3：单一写者 = 主进程；同目录临时文件 + rename 替换）
// ---------------------------------------------------------------------------

export function manifestPath(taskDir) {
  return path.join(taskDir, 'manifest.json');
}

export function answerPath(taskDir) {
  return path.join(taskDir, 'answer.md');
}

/** 通用 JSON 原子写：同目录临时文件 + rename 替换 */
export async function writeJsonAtomic(file, obj) {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${randomHex(6)}.tmp`);
  await fsp.writeFile(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  try {
    await fsp.rename(tmp, file);
  } catch (e) {
    if (e?.code === 'EEXIST' || e?.code === 'EPERM') {
      await fsp.rm(file, { force: true });
      await fsp.rename(tmp, file);
    } else {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
  }
}

export async function writeManifest(taskDir, manifest) {
  await writeJsonAtomic(manifestPath(taskDir), manifest);
}

export async function readManifest(taskDir) {
  const raw = await fsp.readFile(manifestPath(taskDir), 'utf8');
  return JSON.parse(raw);
}

/** 读答复全文（取件层③落盘；不存在 ⇒ null） */
export async function readAnswerText(taskDir) {
  try {
    return await fsp.readFile(answerPath(taskDir), 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 重启扫描（scheduler.md §9：非终态 manifest ⇒ 写独立标记字段 interrupted，不自动重跑）
// ---------------------------------------------------------------------------

/**
 * 扫描 outbox 中的非终态 manifest，写入 `interrupted: {at, previousState}`（缺省不出现）。
 * @returns {Promise<Array<{taskId: string, previousState: string|null}>>}
 */
export async function markInterruptedManifests(outboxDir, { log, now = new Date() } = {}) {
  const marked = [];
  let entries;
  try {
    entries = await fsp.readdir(outboxDir, { withFileTypes: true });
  } catch (e) {
    log?.warn(`重启扫描：读取交付目录失败（${e?.code || e?.message}）：${outboxDir}`);
    return marked;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const taskDir = path.join(outboxDir, ent.name);
    try {
      const manifest = await readManifest(taskDir);
      if (!manifest || typeof manifest !== 'object') continue;
      if (isTerminalState(manifest.state)) continue;
      if (manifest.interrupted) continue;
      manifest.interrupted = { at: now.toISOString(), previousState: manifest.state ?? null };
      await writeManifest(taskDir, manifest);
      marked.push({ taskId: manifest.taskId || ent.name, previousState: manifest.state ?? null });
    } catch (e) {
      if (e?.code !== 'ENOENT') {
        log?.warn(`重启扫描：处理 ${ent.name} 失败（${e?.message || e}）`);
      }
    }
  }
  return marked;
}

// ---------------------------------------------------------------------------
// 命名净化与重名（outbox.md §5 / §6）
// ---------------------------------------------------------------------------

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * 产物名净化（防路径穿越；对全部产物名生效，含附件副本）：
 * 1. 只取 basename；2. 非法字符与控制字符 ⇒ `_`；3. 去首尾空白与结尾 `.`；
 * 4. `.` / `..` / 空串 ⇒ `unnamed`；5. Windows 保留名 ⇒ 前缀 `_`；6. 长度 ≤ 120（超长保留扩展名截断）。
 */
export function sanitizeFileName(raw) {
  let s = String(raw ?? '');
  s = s.split(/[\\/]/).pop() ?? ''; // 1. basename
  s = s.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_'); // 2. 非法字符 / 控制字符
  s = s.replace(/^\s+/, '').replace(/\s+$/, ''); // 3. 首尾空白
  s = s.replace(/\.+$/, ''); // 3. 结尾的 `.`
  if (!s || s === '.' || s === '..') s = 'unnamed'; // 4.
  const stem = s.includes('.') ? s.slice(0, s.indexOf('.')) : s;
  if (RESERVED.test(stem)) s = `_${s}`; // 5.
  if (s.length > 120) {
    // 6. 超长保留扩展名截断
    const ext = path.extname(s);
    const keep = Math.max(1, 120 - ext.length);
    s = `${s.slice(0, keep)}${ext}`;
  }
  return s;
}

/** 同目录重名 ⇒ 追加 `-2`、`-3`…（保留扩展名）；`taken` = 已占用名集合 */
export function uniqueFileName(name, taken) {
  if (!taken.has(name)) return name;
  const ext = path.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 2; i < 10000; i++) {
    const cand = `${stem}-${i}${ext}`;
    if (!taken.has(cand)) return cand;
  }
  return `${stem}-${Date.now()}${ext}`;
}

// ---------------------------------------------------------------------------
// 落盘边界（outbox.md §5：解析后的绝对路径必须位于该任务目录内）
// ---------------------------------------------------------------------------

export function isInsideDir(baseDir, targetPath) {
  const rel = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 断言 targetPath 在 baseDir 内；越界 ⇒ 抛错（调用方记日志与 manifest） */
export function assertInsideDir(baseDir, targetPath) {
  if (!isInsideDir(baseDir, targetPath)) {
    throw new Error(`路径越界：${targetPath} 不在 ${baseDir} 内`);
  }
  return path.resolve(targetPath);
}

/** 目录可写性探测（供 outbox 之外的单点校验复用；b2 设置界面提交前校验用） */
export async function dirHasWriteAccess(dir) {
  const r = await probeDir(dir);
  return r.ok;
}
