/**
 * b2 单元测试 · 接入片段面（fragments 两形态 + export 落盘与覆盖刷新）
 * 设计权威：docs/design/overview.md §2.3（两形态样例）；settings-app.md §3（导出出口）。
 * 由入口 `b2-settings-ui.units.mjs` 聚合执行。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildFragments, stringifyFragment } from '../../src/settings/fragments.mjs';
import { exportFragments } from '../../src/settings/export.mjs';
import { freshDir } from './b2-settings-ui.units.fixtures.mjs';

// ---------------------------------------------------------------------------
// fragments：两形态与设计档 §2.3 样例逐字一致 + 端口参数化
// ---------------------------------------------------------------------------

test('fragments：两形态与 docs/design/overview.md §2.3 样例逐字一致（键序 + 值）', () => {
  // 样例（逐字取自设计档 §2.3 两段 JSON）
  const docMcpJson = JSON.parse('{ "mcpServers": { "free-outsource": { "url": "http://127.0.0.1:17873/mcp" } } }');
  const docMcpServers = JSON.parse('{ "mcp": { "servers": [ { "name": "free-outsource", "url": "http://127.0.0.1:17873/mcp" } ] } }');

  const frag = buildFragments({ port: 17873 });
  assert.deepEqual(frag.mcpJson, docMcpJson);
  assert.deepEqual(frag.mcpServers, docMcpServers);
  assert.equal(JSON.stringify(frag.mcpJson), JSON.stringify(docMcpJson), '键序逐字一致（mcpServers → server 名 → url）');
  assert.equal(
    JSON.stringify(frag.mcpServers),
    JSON.stringify(docMcpServers),
    '键序逐字一致（mcp → servers → [{name, url}]）',
  );
  assert.equal(frag.url, 'http://127.0.0.1:17873/mcp');
});

test('fragments：端口参数化（两形态随实际端口）+ 文本化可解析 + 非法端口拒绝', () => {
  const frag = buildFragments({ port: 17901 });
  assert.equal(frag.url, 'http://127.0.0.1:17901/mcp');
  assert.equal(frag.mcpJson.mcpServers['free-outsource'].url, 'http://127.0.0.1:17901/mcp');
  assert.equal(frag.mcpServers.mcp.servers[0].url, 'http://127.0.0.1:17901/mcp');
  assert.equal(frag.mcpServers.mcp.servers[0].name, 'free-outsource');
  const text = stringifyFragment(frag.mcpServers);
  assert.deepEqual(JSON.parse(text), frag.mcpServers);
  assert.ok(text.endsWith('\n'));
  assert.throws(() => buildFragments({ port: 0 }));
  assert.throws(() => buildFragments({ port: 65536 }));
  assert.throws(() => buildFragments({ port: '17873' }));
  assert.throws(() => buildFragments({}));
});

// ---------------------------------------------------------------------------
// export：写两个文件 + 覆盖刷新（不新增副本）
// ---------------------------------------------------------------------------

test('export：两文件落盘、可解析、覆盖刷新不新增副本（端口随动）', async () => {
  const dir = freshDir('export');
  const r1 = await exportFragments({ dir, port: 18001 });
  assert.equal(r1.files.length, 2);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['.mcp.json', 'mcp-servers.json']);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers['free-outsource'].url,
    'http://127.0.0.1:18001/mcp',
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'mcp-servers.json'), 'utf8')).mcp.servers[0].url,
    'http://127.0.0.1:18001/mcp',
  );

  const r2 = await exportFragments({ dir, port: 18002 });
  assert.deepEqual(r2.files, r1.files, '同一文件（覆盖刷新）');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['.mcp.json', 'mcp-servers.json'], '不新增副本');
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers['free-outsource'].url,
    'http://127.0.0.1:18002/mcp',
    '覆盖后为新端口',
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'mcp-servers.json'), 'utf8')).mcp.servers[0].url,
    'http://127.0.0.1:18002/mcp',
  );
});
