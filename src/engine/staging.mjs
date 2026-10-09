/**
 * 下载暂存区台账（`docs/design/modules/browser-engine.md` §4）：
 * 落盘就绪判定、按「建议名」归位（CDP 行为失效时的兜底）、任务归属收口。
 * 纪律：空闲期下载留在暂存区、不误入任务；落不下来的记日志、不中断任务（下载只是取件三层之一）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { moveFileSafe, stagedName } from './browser-config.mjs';
import { sleep } from './util.mjs';

/** 本任务的下载事件（`since` 之后） */
export function downloadsSince(session, since) {
  return session.downloads.filter((d) => d.at >= since);
}

/** 暂存区现有文件（供记账 / 日志） */
export function stagedFiles(session) {
  try {
    return fs.readdirSync(session.stagingDir).map((name) => path.join(session.stagingDir, name));
  } catch {
    return [];
  }
}

function findByPrefix(session, rec) {
  try {
    const stem = rec.name.replace(/\.[^.]*$/, '');
    const hit = fs
      .readdirSync(session.stagingDir)
      .filter((n) => !n.endsWith('.crdownload'))
      .map((n) => path.join(session.stagingDir, n))
      .filter((p) => path.basename(p).startsWith(stem) && fs.statSync(p).size > 0)
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    return hit ?? null;
  } catch {
    return null;
  }
}

/** 落盘就绪判定（存在、非 .crdownload、尺寸稳定）⇒ 返回文件路径；否则 null */
export async function stagedFileReady(session, rec) {
  if (rec.path && fs.existsSync(rec.path)) return rec.path;
  const exact = path.join(session.stagingDir, stagedName(rec.name));
  const candidate = fs.existsSync(exact) ? exact : findByPrefix(session, rec);
  if (!candidate) return null;
  if (fs.existsSync(`${candidate}.crdownload`)) return null;
  const size1 = fs.statSync(candidate).size;
  await sleep(250);
  if (!fs.existsSync(candidate)) return null;
  return fs.statSync(candidate).size === size1 ? candidate : null;
}

/**
 * 下载归位（兜底）：CDP 自动落盘会把文件以「建议名」写入暂存区；若该行为未生效
 * （如 CDP 会话被断开），下载会被存成 GUID 名——把实际落点搬到暂存区的建议名下，保证归属一致。
 */
export async function collectDownloadFallback(session, rec, download, log = () => {}) {
  try {
    const real = await download.path();
    if (!real || !fs.existsSync(real)) return;
    const target = path.join(session.stagingDir, stagedName(rec.name));
    if (path.resolve(real) === path.resolve(target)) return;
    if (fs.existsSync(target)) return; // CDP 直落已在位
    moveFileSafe(real, target);
    rec.path = target;
    log(`下载归位（兜底）：${path.basename(real)} → ${target}`);
  } catch {
    /* download.path() 在下载被取消 / 出错时会抛——忽略，settle 超时后记日志 */
  }
}

/**
 * 等本任务触发的下载落盘。
 * @param {object} session 会话记录（含 `stagingDir` / `downloads`）
 * @param {{since:number, timeoutMs?:number, isAlive?:()=>boolean, log?:Function}} options
 */
export async function settleTaskDownloads(session, { since, timeoutMs = 30000, isAlive = () => true, log = () => {} } = {}) {
  const settled = [];
  const pending = new Set(downloadsSince(session, since));
  const deadline = Date.now() + timeoutMs;
  while (pending.size && Date.now() < deadline) {
    if (!isAlive()) {
      // 浏览器上下文已关（平台点下载后可能发生）：再等也不会落盘，早退不拖任务
      log('浏览器上下文已关闭，停止等待下载落盘');
      break;
    }
    for (const rec of [...pending]) {
      const file = await stagedFileReady(session, rec);
      if (file) {
        rec.path = file;
        settled.push(rec);
        pending.delete(rec);
      }
    }
    if (pending.size) await sleep(400);
  }
  for (const rec of pending) log(`下载未落盘（忽略，不中断任务）：${rec.name}`);
  return settled;
}
