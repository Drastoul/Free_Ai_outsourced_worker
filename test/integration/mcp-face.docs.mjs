/**
 * `verify:mcp` 的文档断言模块（R7 / R9 文档侧）——由 `mcp-face.test.mjs` 在同一命令内调用。
 *
 * 断言对象（设计权威：`docs/design/modules/mcp-server.md` §7「验收判据」文档断言；`docs/design/overview.md` §7 / §13）：
 *   ① `docs/guide/agent-onboarding.md`：四节（接入步骤 / 配置片段 / 工具清单 / 调用示例）
 *      + R9 两节（「换机后首次接入」「端点 / 端口变化后如何更新宿主配置」）+「本工具端点配置」节
 *      +「自定义外包工」节（b7/R11；正文由主包AI 落笔，本节只断言节存在）；
 *   ④ `docs/guide/agent-brief.md`：五要素自述（我是谁 / 我提供什么 / 怎么调用 / 出错怎么办 / 何时需要人来操作）；
 *   两份文档内嵌 JSON 片段可解析 + 字段形状（`.mcp.json` = mcpServers 对象形 + url；`config.json` = mcp.servers 数组形）；
 *   工具清单与 `tools/list` 对照（AC-R7-1 / AC-R7-3）；① 的 runtime.json 字段与实测键一致（AC-R9-4 文档侧）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const norm = (s) => String(s).replace(/\s+/g, '');

function loadDoc(rel) {
  const file = path.join(REPO, rel);
  assert.ok(fs.existsSync(file), `文档缺失：${rel}`);
  const md = fs.readFileSync(file, 'utf8');
  assert.ok(md.trim().length > 500, `${rel} 内容过短，疑似空壳`);
  return md;
}

/** 全部二级标题（`## `） */
function h2Titles(md) {
  return [...md.matchAll(/^##[ \t]+(.+)$/gm)].map((m) => norm(m[1].trim()));
}

function hasSection(md, phrase) {
  const want = norm(phrase);
  return h2Titles(md).some((t) => t.includes(want));
}

/** 某节正文（标题含 phrase ⇒ 到下一个二级标题为止） */
function sectionBody(md, phrase) {
  const want = norm(phrase);
  const headings = [...md.matchAll(/^##[ \t]+(.+)$/gm)];
  const idx = headings.findIndex((m) => norm(m[1]).includes(want));
  assert.notEqual(idx, -1, `找不到小节：${phrase}`);
  const start = headings[idx].index + headings[idx][0].length;
  const end = headings[idx + 1] ? headings[idx + 1].index : md.length;
  return md.slice(start, end);
}

/** 提取全部 ```json 围栏块 */
function jsonBlocks(md) {
  return [...md.matchAll(/```json[ \t]*\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/** 工具清单表首列（`| \`tool_name\` | ...`） */
function toolTableNames(sectionMd) {
  return [...sectionMd.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)].map((m) => m[1]);
}

/**
 * 执行全部文档断言。
 * @param {{tools: Array<{name:string}>, runtimeJson: object}} live 活体读数（tools/list 与 runtime.json）
 */
export function assertGuideDocs({ tools, runtimeJson }) {
  const onboarding = loadDoc('docs/guide/agent-onboarding.md');
  const brief = loadDoc('docs/guide/agent-brief.md');

  // ① 四节 + R9 两节 + 本工具端点配置节
  for (const s of [
    '接入步骤',
    '配置片段',
    '工具清单',
    '调用示例',
    '换机后首次接入',
    '端点 / 端口变化后如何更新宿主配置',
    '本工具端点配置',
    '自定义外包工', // b7/R11：第十节（正文由主包AI 落笔；本节断言 = 节结构存在——设计档 mcp-server.md §7）
  ]) {
    assert.ok(hasSection(onboarding, s), `agent-onboarding.md 缺小节：${s}`);
  }
  // ④ 五要素自述
  for (const s of ['我是谁', '我提供什么', '怎么调用', '出错怎么办', '何时需要人来操作']) {
    assert.ok(hasSection(brief, s), `agent-brief.md 缺小节：${s}`);
  }

  // 内嵌 JSON 片段可解析（两份文档，全部围栏块）
  for (const [name, md] of [
    ['agent-onboarding.md', onboarding],
    ['agent-brief.md', brief],
  ]) {
    const blocks = jsonBlocks(md);
    assert.ok(blocks.length >= 1, `${name} 应含至少一个 JSON 围栏片段`);
    blocks.forEach((b, i) => {
      assert.doesNotThrow(() => JSON.parse(b), `${name} 第 ${i + 1} 个 JSON 片段不可解析`);
    });
  }

  // 字段形状：.mcp.json = mcpServers 对象形 + url；宿主 config.json = mcp.servers 数组形
  const blocks = jsonBlocks(onboarding).map((b) => JSON.parse(b));
  const objForm = blocks.find((b) => b.mcpServers && typeof b.mcpServers === 'object');
  assert.ok(objForm, '缺 `.mcp.json` 形态样例（mcpServers 对象形）');
  const objEntry = objForm.mcpServers['free-outsource'];
  assert.ok(objEntry && typeof objEntry.url === 'string', 'mcpServers 条目应含 url 字段');
  assert.match(objEntry.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  const arrForm = blocks.find((b) => b.mcp?.servers && Array.isArray(b.mcp.servers));
  assert.ok(arrForm, '缺宿主 config.json 形态样例（mcp.servers 数组形）');
  assert.ok(arrForm.mcp.servers.some((s) => s && typeof s.url === 'string'), 'mcp.servers 条目应含 url 字段');
  assert.match(arrForm.mcp.servers[0].url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  // 样例口径：默认端口 17873，且标注「以应用显示为准」（实际端口可能顺延）
  for (const b of [objForm, arrForm]) {
    const url = b.mcpServers ? b.mcpServers['free-outsource'].url : b.mcp.servers[0].url;
    assert.match(url, /:17873\/mcp$/, '静态样例应使用默认端口 17873');
  }
  assert.ok(onboarding.includes('以应用显示为准'), '① 应标注「以应用显示为准」（样例 ≠ 实际端口）');

  // 工具清单与 tools/list 对照（①、④ 各出现一次）
  const liveNames = tools.map((t) => t.name);
  const docToolLists = [
    ['agent-onboarding.md', toolTableNames(sectionBody(onboarding, '工具清单'))],
    ['agent-brief.md', toolTableNames(sectionBody(brief, '工具清单'))],
  ];
  for (const [name, names] of docToolLists) {
    assert.deepEqual([...names].sort(), [...liveNames].sort(), `${name} 工具清单与 tools/list 不一致（数量/名单）`);
    assert.equal(names.length, 6, `${name} 工具清单应恰 6 项`);
  }

  // R9 / AC-R9-4：runtime.json 字段名与实测键一致（字段清单 = 六键）
  const liveKeys = Object.keys(runtimeJson).sort();
  assert.deepEqual(liveKeys, ['host', 'pid', 'port', 'startedAt', 'url', 'version'], 'runtime.json 实测键 = 文档记载的六键');
  for (const key of liveKeys) {
    assert.match(onboarding, new RegExp('`' + key + '`'), `① 应写明 runtime.json 字段 \`${key}\``);
  }
  assert.ok(onboarding.includes('runtime.json'), '① 应写明到哪里看实际值（runtime.json）');
  assert.ok(onboarding.includes('mcp.port'), '①「本工具端点配置」节应写明 mcp.port 键');
}
