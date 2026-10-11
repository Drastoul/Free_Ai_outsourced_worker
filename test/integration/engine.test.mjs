/**
 * `npm run verify:engine` —— 浏览器引擎 + 下载捕获 + 开关应用失败场景（AC-R3-3 / AC-R8-3 引擎侧）
 *（设计权威：docs/design/modules/browser-engine.md §4 / §8；docs/design/modules/adapters.md §5）
 *
 * 覆盖（不依赖平台登录；本地 fixture 页）：
 *   ① 本地 blob 页 ⇒ 下载事件触发 → CDP 自动落盘到暂存区 → 归属移入 `files/` + 命名净化/重名；
 *   ② 同一 profileDir 可连续两次 launch（复用成功）；
 *   ③ 开关应用失败：fixture 页无 `div.ds-toggle-button` ⇒ 判 `E_SELECTOR_MISSING` 且**未执行发送**（AC-R8-3）。
 *
 * 会话复用场景（J1–J5 / J8 / J9）在 `engine.session.test.mjs`（同命令第二个文件）；
 * 公共辅助件（临时根 / 浏览器装配 / fixture 服务器）抽在 `engine-helpers.mjs`。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DOWNLOAD_BODY, closeFixtureServer, freshRoot, makeBrowser, startFixtureServer } from './engine-helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const { importDownloads, sanitizeName } = await load('src/engine/artifacts.mjs');
const { TaskRunner } = await load('src/engine/task-runner.mjs');
const { registerAdapter } = await load('src/engine/adapters/registry.mjs');
const { defineAdapter } = await load('src/engine/adapters/base.mjs');
const { default: deepseek } = await load('src/engine/adapters/deepseek.mjs');

const browsers = [];
after(async () => {
  for (const b of browsers) await b.closeAll().catch(() => {});
});

// ---------------------------------------------------------------------------

test('下载捕获：本地 blob 页 ⇒ 下载事件 → CDP 落盘暂存区 → 归属移入 files/ + 命名净化（AC-R3-3）', { timeout: 180000 }, async () => {
  const root = freshRoot('download');
  const { server, base } = await startFixtureServer();
  const logs = [];
  const browser = makeBrowser(path.join(root, 'userdata'), logs);
  browsers.push(browser);
  try {
    const page = await browser.sessionPage('w-engine');
    await page.goto(`${base}/dl-normal`);

    const since = Date.now();
    await page.click('#dl');
    const events = browser.downloadsSince('w-engine', since);
    assert.equal(events.length, 1, '本地 blob 下载应触发下载事件');
    assert.equal(events[0].name, 'verify-dl.txt', '下载事件应带建议名');

    const settled = await browser.settleDownloads('w-engine', { since, timeoutMs: 20000 });
    assert.equal(settled.length, 1, 'CDP 自动落盘应在预算内收口');
    const stagedPath = settled[0].path;
    assert.ok(fs.existsSync(stagedPath), `落盘文件应存在：${stagedPath}`);
    assert.equal(
      path.dirname(stagedPath),
      path.join(root, 'userdata', 'downloads-staging', 'w-engine'),
      'CDP 自动落盘落点 = 下载暂存区（每外包工一份）',
    );
    assert.equal(fs.readFileSync(stagedPath, 'utf8'), DOWNLOAD_BODY);

    // 归属移入：暂存区 → <outboxDir>/files/（净化命名 + sha256）
    const outbox = path.join(root, 'outbox');
    const imported = importDownloads({ outboxDir: outbox, records: settled, log: () => {} });
    assert.equal(imported.files.length, 1);
    const file = imported.files[0];
    assert.equal(file.relPath, 'files/verify-dl.txt');
    assert.equal(file.source, 'download');
    assert.equal(file.bytes, Buffer.byteLength(DOWNLOAD_BODY));
    assert.equal(
      file.sha256,
      crypto.createHash('sha256').update(DOWNLOAD_BODY).digest('hex'),
      'sha256 应与落盘内容一致',
    );
    assert.equal(fs.readFileSync(path.join(outbox, file.relPath), 'utf8'), DOWNLOAD_BODY);
    assert.equal(fs.existsSync(stagedPath), false, '归属移入后暂存区源文件应已移走');

    // 穿越名下载（平台给出带路径成分的建议名）：落点仍必须在 files/ 内、名为单段
    const since2 = Date.now();
    await page.goto(`${base}/dl-hostile`);
    await page.click('#dl');
    const settled2 = await browser.settleDownloads('w-engine', { since: since2, timeoutMs: 20000 });
    assert.equal(settled2.length, 1);
    const hostileName = settled2[0].name;
    assert.ok(!hostileName.includes('/') && !hostileName.includes('\\'), `下载名不得含路径分隔符：${hostileName}`);
    const imported2 = importDownloads({ outboxDir: outbox, records: settled2, log: () => {} });
    assert.equal(imported2.files.length, 1);
    assert.equal(imported2.files[0].name, path.basename(imported2.files[0].name), '落盘名必须是单段');
    assert.ok(fs.existsSync(path.join(outbox, imported2.files[0].relPath)));

    // 命名净化边界重放（平台建议名可能绕过浏览器净化）：净化 + 重名序号
    const stagingDir = path.join(root, 'userdata', 'downloads-staging', 'w-engine');
    const raw = path.join(stagingDir, 'raw-staged.bin');
    fs.writeFileSync(raw, '重放');
    const replayed = importDownloads({ outboxDir: outbox, records: [{ name: '..\\..\\a:b?c.py', path: raw }], log: () => {} });
    assert.equal(replayed.files[0].name, 'a_b_c.py', '穿越 + 非法字符建议名应被净化');
    assert.equal(path.dirname(path.join(outbox, replayed.files[0].relPath)), path.join(outbox, 'files'));
    const raw2 = path.join(stagingDir, 'raw-staged-2.bin');
    fs.writeFileSync(raw2, '重放2');
    const dup = importDownloads({ outboxDir: outbox, records: [{ name: 'a_b_c.py', path: raw2 }], log: () => {} });
    assert.equal(dup.files[0].name, 'a_b_c-2.py', '同目录重名 ⇒ 追加序号（保留扩展名）');
    assert.equal(sanitizeName('a_b_c-2.py'), 'a_b_c-2.py');

    // 浏览器全程存活（下载只是取件三层之一，不得因下载中断）
    const status = browser.status()[0];
    assert.equal(status.connected, true, '下载后浏览器应仍在运行');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});

test('浏览器复用：同一 profileDir 连续两次 launch 成功（登录态目录保留）', { timeout: 180000 }, async () => {
  const root = freshRoot('reuse');
  const { server, base } = await startFixtureServer();
  const userDataDir = path.join(root, 'userdata');
  try {
    const b1 = makeBrowser(userDataDir, []);
    browsers.push(b1);
    const page1 = await b1.sessionPage('w-reuse');
    await page1.goto(`${base}/dl-normal`);
    const profileDir = b1.paths('w-reuse').profileDir;
    assert.ok(fs.existsSync(profileDir), 'profileDir 应被创建（持久化配置目录）');
    await b1.close('w-reuse');
    assert.equal(b1.status().length, 0, '关闭后会话表应为空');

    // 第二次 launch：同一 userDataDir ⇒ 同一 profileDir（复用成功）
    const b2 = makeBrowser(userDataDir, []);
    browsers.push(b2);
    assert.equal(b2.paths('w-reuse').profileDir, profileDir);
    const page2 = await b2.sessionPage('w-reuse');
    await page2.goto(`${base}/dl-normal`);
    assert.equal(await page2.evaluate(() => document.querySelector('#dl')?.getAttribute('download')), 'verify-dl.txt');
    assert.equal(b2.status()[0].connected, true);
    await b2.closeAll();
  } finally {
    await closeFixtureServer(server);
  }
});

test('开关应用失败：fixture 页无 div.ds-toggle-button ⇒ E_SELECTOR_MISSING 且未执行发送（AC-R8-3 引擎侧）', { timeout: 240000 }, async () => {
  const root = freshRoot('toggle-fail');
  const { server, state, base } = await startFixtureServer();
  const userDataDir = path.join(root, 'userdata');
  const outboxDir = path.join(root, 'outbox');
  fs.mkdirSync(outboxDir, { recursive: true });
  const logs = [];

  // fixture 适配器：接口实现复用 DeepSeek（开关应用 = 真实实现），仅把 url 指向本地无开关页
  const fixtureAdapter = defineAdapter({
    ...deepseek,
    id: 'fixture',
    platformName: 'Fixture',
    url: `${base}/no-toggle`,
  });
  registerAdapter(fixtureAdapter);

  const browser = makeBrowser(userDataDir, logs);
  browsers.push(browser);
  const runner = new TaskRunner({ browser, log: (scope, m) => logs.push(`[${scope}] ${m}`), emit: () => {} });
  try {
    const result = await runner.run({
      taskId: 'engine-toggle-fail-1',
      worker: { id: 'w-fx', name: 'Fixture', platform: 'fixture' },
      prompt: '开关失败场景：本任务不应被发送',
      files: [],
      outboxDir,
      toggles: { thinking: true, search: false },
    });

    assert.equal(result.canceled, false);
    assert.ok(result.error, `应回报业务失败（result.error），实际：${JSON.stringify(result)}`);
    assert.equal(result.error.code, 'E_SELECTOR_MISSING', `错误码应为 E_SELECTOR_MISSING：${JSON.stringify(result.error)}`);
    assert.match(result.error.message, /开关元素缺失|ds-toggle-button/, '消息应指认开关元素缺失');
    assert.ok(result.error.screenshot, '开关应用失败应留失败截图（失败留证）');
    assert.ok(fs.existsSync(path.join(outboxDir, result.error.screenshot)));

    // 未执行发送：fixture 页的发送观测点（Enter ⇒ form POST /sent）零命中；输入框为空
    assert.equal(state.sent, 0, '开关失败不得执行发送');
    assert.deepEqual(state.sentBodies, []);
    const page = browser.sessions.get('w-fx')?.page ?? null;
    if (page) {
      const value = await page.evaluate(() => document.querySelector('textarea')?.value ?? '').catch(() => '');
      assert.equal(value, '', '任务文本不得落入输入框（未进入发送步）');
    }
    assert.equal(fs.existsSync(path.join(outboxDir, 'answer.md')), false, '失败任务不产出 answer.md');

    const logText = logs.join('\n');
    assert.match(logText, /开关应用失败|开关元素缺失/, '日志应记录开关应用失败（AC-R8-2 日志侧）');
  } finally {
    await browser.closeAll().catch(() => {});
    await closeFixtureServer(server);
  }
});
