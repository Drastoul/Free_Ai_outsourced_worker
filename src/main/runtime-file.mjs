// runtime.json 的写入与删除（b4 从 src/main/index.mjs 纯搬迁——index.mjs 越 300 行档的外提，行为不变）。
// 设计权威：docs/design/overview.md §2.3（字段与生命周期：启动写、退出尽力删）。
// 说明：当前文件路径由调用方（index.mjs）持有；删除后由调用方清空（保证退出兜底不重复删）。
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from '../shared/outbox.mjs';

/** 写 <userData>/runtime.json（原子写；字段与设计 §2.3 同源）；返回文件路径 */
export async function writeRuntimeFile({ userData, host, port, version, startedAt, log }) {
  const file = path.join(userData, 'runtime.json');
  await writeJsonAtomic(file, {
    pid: process.pid,
    host,
    port,
    url: `http://${host}:${port}/mcp`,
    version,
    startedAt,
  });
  log.info(`runtime.json 已写：${file}（port=${port}）`);
  return file;
}

/** 删除 runtime.json（尽力；失败记日志不抛——退出路径不得因清理失败而卡住） */
export function removeRuntimeFile(file, log) {
  if (!file) return;
  try {
    fs.rmSync(file, { force: true });
    log.info(`runtime.json 已删除：${file}`);
  } catch (e) {
    log.warn(`runtime.json 删除失败：${e?.message || e}`);
  }
}
