/**
 * 产物落盘（`docs/design/modules/outbox.md` 口径）：命名净化、重名序号、原子写、
 * 取件层①② 的落盘、送件留证（`inbox/`）与落盘前越界校验。
 * 本模块只管「怎么落」；什么时候取（phase 编排）在 `src/engine/task-runner.mjs`。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EngineError } from './adapters/base.mjs';
import { remainingMs } from './util.mjs';

/** 单文件上限默认值（`docs/design/overview.md`「配置存储」limits.maxFileBytes） */
export const DEFAULT_MAX_FILE_BYTES = 52428800;

/** 命名净化（`docs/design/modules/outbox.md` §5，防路径穿越） */
export function sanitizeName(raw) {
  const basename = String(raw ?? '').split(/[\\/]/).pop() ?? '';
  let name = basename.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_');
  name = name.trim().replace(/[\s.]+$/, '');
  if (!name || name === '.' || name === '..') name = 'unnamed';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) name = `_${name}`;
  if (name.length > 120) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot) : '';
    if (ext.length >= 120) name = name.slice(0, 120);
    else name = (dot > 0 ? name.slice(0, dot) : name).slice(0, 120 - ext.length) + ext;
  }
  return name || 'unnamed';
}

/** 同目录重名 ⇒ 追加 `-2`、`-3`…（保留扩展名） */
export function uniqueName(dir, rawName) {
  const name = sanitizeName(rawName);
  if (!fs.existsSync(path.join(dir, name))) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}

/** 落盘前校验：目标绝对路径必须在任务目录内（越界 ⇒ E_OUTBOX_WRITE） */
export function assertInsideDir(dir, target) {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new EngineError('E_OUTBOX_WRITE', `产物路径越出任务目录：${target}`);
  }
  return target;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** 同目录临时文件 + rename（交付原子性口径） */
export function writeTextFile(file, text) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    if (e?.code !== 'EXDEV') throw e;
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

/** 取件层①：把本任务归属的下载（下载暂存区）移入 `<outboxDir>/files/`（净化命名 + 上限 + 重名序号） */
export function importDownloads({ outboxDir, records = [], maxFileBytes = DEFAULT_MAX_FILE_BYTES, log = () => {} }) {
  const filesDir = path.join(outboxDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });
  const files = [];
  const skipped = [];
  for (const rec of records) {
    try {
      const stat = fs.statSync(rec.path);
      if (stat.size > maxFileBytes) {
        skipped.push({ name: rec.name, size: stat.size, reason: `超过 maxFileBytes=${maxFileBytes}` });
        continue;
      }
      const name = uniqueName(filesDir, rec.name);
      const dest = assertInsideDir(outboxDir, path.join(filesDir, name));
      moveFile(rec.path, dest);
      files.push({ name, relPath: `files/${name}`, bytes: stat.size, sha256: sha256File(dest), source: 'download' });
      log('落盘', `取件①下载 → files/${name}（${stat.size}B）`);
    } catch (e) {
      log('落盘', `下载移入 files/ 失败（忽略，不中断任务）：${rec.path} :: ${String(e?.message ?? e).slice(0, 140)}`);
    }
  }
  return { files, skipped };
}

/** 取件层②：代码块提取落盘 */
export function writeExtractedFile(outboxDir, spec, { maxFileBytes = DEFAULT_MAX_FILE_BYTES, log = () => {} } = {}) {
  const filesDir = path.join(outboxDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });
  const bytes = Buffer.byteLength(spec.content, 'utf8');
  if (bytes > maxFileBytes) {
    return { skipped: { name: spec.name, size: bytes, reason: `超过 maxFileBytes=${maxFileBytes}` } };
  }
  const name = uniqueName(filesDir, spec.name);
  const dest = assertInsideDir(outboxDir, path.join(filesDir, name));
  writeTextFile(dest, spec.content);
  log('落盘', `取件②代码块 → files/${name}（${bytes}B）`);
  return { file: { name, relPath: `files/${name}`, bytes, sha256: sha256File(dest), source: 'code_block' } };
}

/** 送件留证：附件原件拷贝进 `<outboxDir>/inbox/` */
export function copyAttachments(outboxDir, files, log = () => {}) {
  const inbox = path.join(outboxDir, 'inbox');
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) {
        log('送件', `附件不是普通文件，跳过留证：${file}`);
        continue;
      }
      fs.mkdirSync(inbox, { recursive: true });
      const name = uniqueName(inbox, path.basename(file));
      const dest = assertInsideDir(outboxDir, path.join(inbox, name));
      fs.copyFileSync(file, dest);
      log('送件', `附件留证 → inbox/${name}（${stat.size}B）`);
    } catch (e) {
      log('送件', `附件留证失败（不中断任务）：${file} :: ${String(e?.message ?? e).slice(0, 140)}`);
    }
  }
}

/**
 * extracting 阶段的取件与落盘编排（`docs/design/modules/adapters.md` §3.5 取件三层）：
 * ① 下载捕获（点击代码块「下载」→ CDP 自动落盘 → 归属移入 `files/`）
 * ② 代码块提取（`files/`）
 * ③ 全文落盘（`answer.md`）
 *
 * @param {object} o 依赖：页面 / 适配器 / 落点 / 答复 / 上限 / 阶段预算 / 下载收口回调 / 取消检查
 * @returns {Promise<{delivery:object, skippedFiles:Array<object>}>}
 *   `delivery` 形状见 `docs/design/modules/outbox.md`（transport / textPath / files / partial）；
 *   `skippedFiles` = 超 `maxFileBytes` 未落盘的记录（主进程写 `manifest.skippedFiles`，顶层字段）
 */
export async function writeDeliverables({
  page,
  adapter,
  outboxDir,
  answer,
  limits = { maxFileBytes: DEFAULT_MAX_FILE_BYTES },
  extractingMs = 60000,
  since = Date.now(),
  settleDownloads = async () => [],
  log = () => {},
  throwIfCanceled = () => {},
} = {}) {
  const deadline = Date.now() + extractingMs;
  const files = [];
  const skipped = [];
  let textPath = null;
  // 取消检查：把「此刻已落盘的部分产物」随取消错误带出（主进程据此保留真实清单，不误报空）
  const checkCancel = () => {
    try {
      throwIfCanceled();
    } catch (e) {
      if (e && typeof e === 'object') {
        e.data = {
          ...(e.data ?? {}),
          partialDelivery: { transport: answer.transport, textPath, files: [...files], skippedFiles: [...skipped], partial: true },
        };
      }
      throw e;
    }
  };
  checkCancel();

  if (adapter.capabilities.downloadCapture && adapter.downloads?.trigger) {
    try {
      const clicked = await adapter.downloads.trigger(page, { log: (m) => log('task', m) });
      if (clicked.found) {
        log('task', `代码块「下载」按钮命中 ${clicked.found} 个，点击 ${clicked.clicked} 个（CDP 自动落盘）`);
        const records = await settleDownloads({ since, timeoutMs: Math.max(3000, remainingMs(deadline)) });
        const imported = importDownloads({ outboxDir, records, maxFileBytes: limits.maxFileBytes, log });
        files.push(...imported.files);
        skipped.push(...imported.skipped);
      }
    } catch (e) {
      log('task', `下载捕获失败（不中断任务）：${String(e?.message ?? e).slice(0, 160)}`);
    }
  }
  checkCancel();

  if (adapter.capabilities.codeBlockExtract) {
    for (const spec of adapter.extract.filesFromText(answer.text)) {
      const written = writeExtractedFile(outboxDir, spec, { maxFileBytes: limits.maxFileBytes, log });
      if (written.file) files.push(written.file);
      if (written.skipped) skipped.push(written.skipped);
    }
  }

  if (answer.text) {
    writeTextFile(path.join(outboxDir, 'answer.md'), answer.text);
    textPath = 'answer.md';
    log('task', `取件③全文 → answer.md（${answer.text.length} 字符）`);
  }
  return { delivery: { transport: answer.transport, textPath, files, partial: false }, skippedFiles: skipped };
}
