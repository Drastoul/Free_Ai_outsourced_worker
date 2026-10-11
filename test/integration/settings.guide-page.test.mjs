/**
 * `verify:settings` 场景组 · 接入指引 / 一键导出 / 关于页（h 两段 · i · j）
 *
 * h① 服务已启动：显示地址 == `runtime.json.url`、两形态复制 == 实际地址（AC-R7-2 界面侧 / AC-R9-1 / AC-R9-2）
 *   + T1（b6）app.log 读数：「加载完成，补推一次全量快照」（`did-finish-load` 补推）；
 * h①·顺延段 期望端口被占 ⇒ 显示实际端口 + 「宿主配置需更新」提示（批次档 §2 评审修复 ⑦）；
 * h② 服务未启动（占满期望端口 +1..+120 ⇒ 无 runtime.json）：「未启动 + 原因 / 建议」、复制/导出禁用、日志同示；
 * i 一键导出两文件、端口 = 实际端口、重复导出覆盖刷新不新增副本（R9·F9.6）；
 * j 关于页版本 == package.json + 剪贴板 == 日志目录（T12）。
 *
 * 驱动 = `settings.session.mjs`；读数工具 = `settings.driver.mjs`。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PKG_VERSION,
  blockPort,
  freePort,
  freshUserData,
  readAppLog,
  readRuntime,
  waitFor,
  writeConfig,
} from './settings.driver.mjs';
import { killAll, startSettingsApp } from './settings.session.mjs';

after(killAll);

test('h①+i+j：实际地址显示 / 两形态复制 / 一键导出覆盖刷新 / 关于页（AC-R7-2 · R9·F9.6 · T12）', { timeout: 300000 }, async () => {
  const userData = freshUserData('guide');
  const port = await freePort();
  writeConfig(userData, {
    port,
    outboxDir: path.join(userData, 'outbox'),
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  });
  const session = await startSettingsApp({ userData });
  try {
    const rt = await waitFor(() => readRuntime(userData), 90000, 250);
    assert.ok(rt, '应用未在预算内写 runtime.json');
    assert.equal(rt.port, port);

    // ---- h①：接入指引显示 + 两形态复制 == 实际地址 ----
    await session.click('[data-page="guide"]');
    // 窗口首次快照可能早于 MCP 就绪（显示「未启动」），服务就绪后经变更广播刷新 ⇒ 有界等待「运行中」
    const running = await session.waitDom(`document.querySelector('[data-field="service-status"]').textContent === '运行中' ? 'y' : null`, 20000);
    assert.equal(running, 'y', '接入指引应在服务就绪后显示「运行中」');
    // T1（b6）：页面加载完成 ⇒ 补推一次全量快照（启动期竞态兜底）—— app.log 有界等待读数
    const pushed = await waitFor(() => (readAppLog(userData).includes('加载完成，补推一次全量快照') ? true : null), 15000, 300);
    assert.ok(pushed, 'app.log 应含「加载完成，补推一次全量快照」（did-finish-load 补推）');
    console.log('[verify:settings·h①·T1 读数] app.log 命中「设置窗口：加载完成，补推一次全量快照（启动期竞态兜底）」');
    const guide = await session.evalJson(`({
      status: document.querySelector('[data-field="service-status"]').textContent,
      url: document.querySelector('[data-field="mcp-url"]').textContent,
      sse: document.querySelector('[data-field="sse-url"]').textContent,
      version: document.querySelector('[data-field="version"]').textContent,
      exportDir: document.querySelector('[data-field="export-dir"]').textContent,
      noteHidden: document.querySelector('[data-field="service-note"]').hidden,
      copyJsonDisabled: document.querySelector('[data-action="copy-mcp-json"]').disabled,
    })`);
    assert.equal(guide.status, '运行中');
    assert.equal(guide.url, rt.url, '显示地址 == runtime.json.url（端口 = 实际端口）');
    assert.equal(guide.url, `http://127.0.0.1:${port}/mcp`);
    assert.equal(guide.sse, `http://127.0.0.1:${port}/sse`, '备选 SSE 地址按实际端口生成');
    assert.equal(guide.version, PKG_VERSION, '版本号 == package.json（AC-R9-4 界面对照面）');
    assert.equal(guide.exportDir, path.join(userData, 'export'), '导出目录显示为实际路径');
    assert.equal(guide.noteHidden, true, '端口无顺延 ⇒ 无提示（宿主配置无需更新）');
    assert.equal(guide.copyJsonDisabled, false, '服务运行中 ⇒ 复制可用');

    await session.click('[data-action="copy-mcp-json"]');
    const clipJson = await waitFor(async () => {
      const text = (await session.clipboard()).trim();
      try {
        const j = JSON.parse(text);
        return j?.mcpServers?.['free-outsource']?.url === rt.url ? j : null;
      } catch {
        return null;
      }
    }, 8000, 300);
    assert.ok(clipJson, '复制 .mcp.json 片段：剪贴板应可解析且 url == 实际地址');
    await session.click('[data-action="copy-mcp-servers"]');
    const clipServers = await waitFor(async () => {
      try {
        const j = JSON.parse((await session.clipboard()).trim());
        return j?.mcp?.servers?.[0]?.url === rt.url ? j : null;
      } catch {
        return null;
      }
    }, 8000, 300);
    assert.ok(clipServers, '复制 mcp.servers 片段：mcp.servers[0].url == 实际地址');
    assert.equal(clipServers.mcp.servers[0].name, 'free-outsource');
    console.log(`[verify:settings·h① 读数] status=${guide.status} url=${guide.url}（== runtime.json.url=${rt.url}） sse=${guide.sse} · 剪贴板两形态 url=${clipJson.mcpServers['free-outsource'].url} / ${clipServers.mcp.servers[0].url} · export-dir=${guide.exportDir}`);

    // ---- i：一键导出两文件 + 覆盖刷新（R9·F9.6）----
    const expDir = path.join(userData, 'export');
    await session.click('[data-action="export"]');
    const files1 = await waitFor(() => {
      try {
        const names = fs.readdirSync(expDir).sort();
        return names.length === 2 ? names : null;
      } catch {
        return null;
      }
    }, 10000, 300);
    assert.deepEqual(files1, ['.mcp.json', 'mcp-servers.json'], '导出两文件（固定名）');
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(expDir, '.mcp.json'), 'utf8')).mcpServers['free-outsource'].url,
      rt.url,
      '导出 .mcp.json 端口 = 实际端口',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(expDir, 'mcp-servers.json'), 'utf8')).mcp.servers[0].url,
      rt.url,
      '导出 mcp-servers.json 端口 = 实际端口',
    );
    // 篡改后重复导出 ⇒ 覆盖刷新同一文件（不新增副本）
    fs.writeFileSync(path.join(expDir, '.mcp.json'), '{"tampered":true}\n', 'utf8');
    await session.click('[data-action="export"]');
    const restored = await waitFor(() => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(expDir, '.mcp.json'), 'utf8'));
        return j?.mcpServers ? j : null;
      } catch {
        return null;
      }
    }, 10000, 300);
    assert.ok(restored, '重复导出应覆盖刷新同一文件（篡改内容被重写）');
    assert.deepEqual(fs.readdirSync(expDir).sort(), ['.mcp.json', 'mcp-servers.json'], '重复导出不新增副本');
    console.log(`[verify:settings·i 读数] 导出=[.mcp.json, mcp-servers.json] 端口=${rt.port} · 篡改 .mcp.json 后重复导出=被覆盖刷新且仍 2 文件`);

    // ---- j：关于页（T12）----
    await session.click('[data-page="about"]');
    const about = await session.evalJson(`({
      version: document.querySelector('[data-field="about-version"]').textContent,
      logs: document.querySelector('[data-field="logs-dir"]').textContent,
    })`);
    assert.equal(about.version, PKG_VERSION, '关于页版本 == package.json 的 version');
    const logsDir = path.join(userData, 'logs');
    assert.equal(about.logs, logsDir, '日志目录显示为实际路径');
    await session.click('[data-action="copy-logs-path"]');
    const clipLogs = await waitFor(async () => {
      const t = (await session.clipboard()).trim();
      return t === logsDir ? t : null;
    }, 8000, 300);
    assert.equal(clipLogs, logsDir, '复制日志路径：剪贴板 == 日志目录');
    console.log(`[verify:settings·j 读数] version=${about.version}（== package.json ${PKG_VERSION}） · logs-dir=${about.logs} · 剪贴板==日志目录`);

    assert.ok(await session.quit(), '应用应能优雅退出');
  } finally {
    session.kill();
  }
});

test('h①·顺延段：期望端口被占 ⇒ 显示实际端口 + 「宿主配置需更新」提示', { timeout: 300000 }, async () => {
  const userData = freshUserData('guide-drift');
  const expected = await freePort();
  const holder = await blockPort(expected); // 占住期望端口 ⇒ 应用顺延到 +1
  writeConfig(userData, {
    port: expected,
    outboxDir: path.join(userData, 'outbox'),
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  });
  const session = await startSettingsApp({ userData });
  try {
    const rt = await waitFor(() => readRuntime(userData), 90000, 250);
    assert.ok(rt, '顺延后仍应写 runtime.json');
    assert.notEqual(rt.port, expected, '期望端口被占 ⇒ 实际端口应顺延');
    await session.click('[data-page="guide"]');
    const running = await session.waitDom(`document.querySelector('[data-field="service-status"]').textContent === '运行中' ? 'y' : null`, 20000);
    assert.equal(running, 'y', '顺延后接入指引应显示「运行中」');
    const guide = await session.evalJson(`({
      url: document.querySelector('[data-field="mcp-url"]').textContent,
      sse: document.querySelector('[data-field="sse-url"]').textContent,
      note: document.querySelector('[data-field="service-note"]').hidden ? null : document.querySelector('[data-field="service-note"]').textContent,
    })`);
    assert.equal(guide.url, rt.url, '显示地址 == runtime.json.url（随实际端口）');
    assert.equal(guide.url, `http://127.0.0.1:${rt.port}/mcp`);
    assert.equal(guide.sse, `http://127.0.0.1:${rt.port}/sse`);
    assert.ok(guide.note && guide.note.includes('端口顺延'), `顺延应可见：${guide.note}`);
    assert.ok(guide.note.includes('宿主配置需更新'), `应提示宿主配置需更新：${guide.note}`);
    console.log(`[verify:settings·h①顺延段 读数] 期望=${expected} 实际=${rt.port} · mcp-url=${guide.url}（== runtime.json.url） · note=${guide.note}`);

    assert.ok(await session.quit(), '应用应能优雅退出');
  } finally {
    session.kill();
    await new Promise((r) => holder.close(r));
  }
});

// h② 需要大量端口占位，故单独成例（夹具 = 期望端口 +1..+120 全占）
test('h②：端口区间全占 ⇒ 「未启动 + 原因 / 建议」+ 复制导出禁用 + 日志同示（无 runtime.json）', { timeout: 300000 }, async () => {
  const userData = freshUserData('guide-stopped');
  const base = await freePort();
  const last = Math.min(base + 120, 65535); // 与 server.mjs 的顺延口径同源（+120 封顶 65535）
  const holders = [];
  for (let p = base; p <= last; p++) holders.push(await blockPort(p));
  writeConfig(userData, {
    port: base,
    outboxDir: path.join(userData, 'outbox'),
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  });
  const session = await startSettingsApp({ userData });
  try {
    // 无 runtime.json（MCP 未启动）；以日志行为「已尝试且失败」的正面读数
    const logged = await waitFor(() => {
      const log = readAppLog(userData);
      return log.includes('MCP 服务未启动') && log.includes(String(base)) ? log : null;
    }, 90000, 300);
    assert.ok(logged, '日志应明示 MCP 未启动与原因（同示口径）');
    assert.equal(readRuntime(userData), null, '未启动 ⇒ 不应写 runtime.json');

    await session.click('[data-page="guide"]');
    // 首帧快照可能早于 MCP 失败结论（原因写作「详见日志」）⇒ 有界等待具体原因落到位
    const noteArrived = await session.waitDom(
      `document.querySelector('[data-field="service-note"]').textContent.includes('均被占用') ? 'y' : null`,
      20000,
    );
    assert.equal(noteArrived, 'y', '接入指引应在 MCP 结论就绪后同步具体原因');
    const guide = await session.evalJson(`({
      status: document.querySelector('[data-field="service-status"]').textContent,
      url: document.querySelector('[data-field="mcp-url"]').textContent,
      note: document.querySelector('[data-field="service-note"]').hidden ? null : document.querySelector('[data-field="service-note"]').textContent,
      disabled: ['copy-mcp-json', 'copy-mcp-servers', 'export'].map(a => document.querySelector('[data-action="' + a + '"]').disabled),
    })`);
    assert.equal(guide.status, '未启动', '服务状态应为「未启动」');
    assert.equal(guide.url, '—', '无实际地址时显示占位符');
    assert.ok(guide.note && guide.note.startsWith('未启动：'), `应显示「未启动 + 原因 / 建议」：${guide.note}`);
    assert.ok(guide.note.includes('均被占用'), '原因应明示端口区间均被占用');
    assert.ok(guide.note.includes('释放占用端口') && guide.note.includes('改写 mcp.port'), '建议口径 = 释放端口或改写 mcp.port');
    assert.deepEqual(guide.disabled, [true, true, true], '未启动 ⇒ 复制 / 导出入口禁用（无实际端口可依循）');
    console.log(`[verify:settings·h② 读数] 占端口区间=${base}–${last} · status=${guide.status} · note=${guide.note} · 复制/导出禁用=${JSON.stringify(guide.disabled)} · runtime.json=${readRuntime(userData) === null ? '无' : '有（异常）'}`);

    assert.ok(await session.quit(), '应用应能优雅退出');
  } finally {
    session.kill();
    for (const h of holders) await new Promise((r) => h.close(r));
  }
});
