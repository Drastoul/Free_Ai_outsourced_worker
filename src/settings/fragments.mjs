// 接入片段生成（b2；形状权威 = docs/design/overview.md §2.3「端口策略与告知宿主」的两形态样例）。
// 纯函数：入参 = 实际端口 ⇒ 两形态对象 / 文本。生成器即权威（文档样例只作对照，标注「以应用显示为准」）。
// 调用方：设置服务快照（一键复制）与导出落盘（一键导出）——同源，端口变化自动随动。

/** 宿主接入条目名（两形态同源；docs/design/overview.md §2.3 样例） */
export const SERVER_NAME = 'free-outsource';

/**
 * 生成两形态接入片段（对象形）。
 * @param {{host?: string, port: number}} args port = 实际监听端口（未启动时调用方按期望端口给样板）
 * @returns {{url: string, mcpJson: object, mcpServers: object}}
 *   url        = 实际 MCP 端点
 *   mcpJson    = 项目根 `.mcp.json` 全文（`mcpServers` 对象形）
 *   mcpServers = 宿主 `config.json` 的 `mcp.servers` 数组形片段（读取后并入宿主现有数组）
 */
export function buildFragments({ host = '127.0.0.1', port }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`端口非法（应为 1–65535 的整数）：${JSON.stringify(port)}`);
  }
  const url = `http://${host}:${port}/mcp`;
  return {
    url,
    mcpJson: { mcpServers: { [SERVER_NAME]: { url } } },
    mcpServers: { mcp: { servers: [{ name: SERVER_NAME, url }] } },
  };
}

/** 片段文本化（剪贴板与导出文件同源：同一对象 ⇒ 同一段文本） */
export function stringifyFragment(fragment) {
  return `${JSON.stringify(fragment, null, 2)}\n`;
}
