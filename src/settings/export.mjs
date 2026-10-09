// 接入片段导出落盘（b2；出口与路径权威 = docs/design/modules/settings-app.md §3）。
// 导出目录 = <userData>/export/；两文件固定名；每次导出按实际端口重新生成、覆盖刷新同一文件（不新增副本）。
// 复用 writeJsonAtomic（同目录临时文件 + rename 替换）——不写宿主目录、不弹系统保存对话框。

import path from 'node:path';
import { writeJsonAtomic } from '../shared/outbox.mjs';
import { buildFragments } from './fragments.mjs';

export const EXPORT_FILE_NAMES = { mcpJson: '.mcp.json', mcpServers: 'mcp-servers.json' };

/** 导出目录（userData 下固定目录；界面显示实际路径 + 「打开导出目录」） */
export function exportDirFor(userDataDir) {
  return path.join(userDataDir, 'export');
}

/**
 * 导出两形态片段（覆盖刷新同一文件）。
 * @param {{dir: string, host?: string, port: number, log?: object}} args
 * @returns {Promise<{dir: string, files: string[], url: string}>}
 */
export async function exportFragments({ dir, host = '127.0.0.1', port, log }) {
  const frag = buildFragments({ host, port });
  const mcpJsonFile = path.join(dir, EXPORT_FILE_NAMES.mcpJson);
  const mcpServersFile = path.join(dir, EXPORT_FILE_NAMES.mcpServers);
  await writeJsonAtomic(mcpJsonFile, frag.mcpJson);
  await writeJsonAtomic(mcpServersFile, frag.mcpServers);
  log?.info(`接入片段已导出：${mcpJsonFile}、${mcpServersFile}（url=${frag.url}）`);
  return { dir, files: [mcpJsonFile, mcpServersFile], url: frag.url };
}
