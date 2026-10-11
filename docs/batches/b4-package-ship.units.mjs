/**
 * b4 单元测试入口（随批归档；`node --test docs/batches/b4-package-ship.units.mjs` 直跑）
 *
 * 覆盖（P5；设计权威 = 批次档 b4 §2「验收命令」P5 行 /「打包态 / 开发态两态对照」）：
 *   · packaging 两态路径（resolveRuntimePaths：hostScript / engineCwd / engineEnv / guidePath）
 *   · extraEnv 合成（EngineClient 真实子进程探针：附加环境变量并入 spawn env；FO_* 与
 *     ELECTRON_RUN_AS_NODE 契约不变；缺省 = 不注入）
 *   · 首建标记（loadConfig：空目录 ⇒ firstRun=true 并写入默认配置；已有 / 损坏 ⇒ false 且不覆盖用户文件）
 *   · 新默认值（DEFAULT_CONFIG.browser = chromium / channel 空串；显式存值保留）+ 随包浏览器语义
 *     （resolveBrowserOptions：chromium+空 channel ⇒ undefined = 随包；edge ⇒ msedge；显式 channel 保留）
 *
 * 跑法前提 = packaging 纯 Node 件（入参注入、不 import electron——见 b4 §2·T4）；本件只 import 纯 Node 模块。
 * 临时件落 `.thincoder/tmp/b4-units/`。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntimePaths } from '../../src/main/packaging.mjs';
import { loadConfig } from '../../src/main/config.mjs';
import { DEFAULT_CONFIG, normalizeConfig } from '../../src/main/config-schema.mjs';
import { resolveBrowserOptions } from '../../src/engine/browser-config.mjs';
import { EngineClient } from '../../src/main/engine-client.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TMP = path.join(REPO, '.thincoder', 'tmp', 'b4-units');
fs.mkdirSync(TMP, { recursive: true });

const quietLog = { info() {}, warn() {}, error() {}, debug() {} };

/** 探针宿主：把自己的 env 快照写到 FO_PROBE_OUT（验证 EngineClient 的 spawn env 合成） */
const PROBE = path.join(TMP, 'engine-env-probe.mjs');
fs.writeFileSync(
  PROBE,
  `import fs from 'node:fs';\nfs.writeFileSync(process.env.FO_PROBE_OUT, JSON.stringify(process.env));\n`,
  'utf8',
);

async function waitFile(file, timeoutMs = 15000, stepMs = 150) {
  const t0 = Date.now();
  for (;;) {
    if (fs.existsSync(file)) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

function makeEngine({ extraEnv, userDataName, out }) {
  const ud = path.join(TMP, userDataName);
  return new EngineClient({
    hostScript: PROBE,
    cwd: TMP,
    userDataDir: ud,
    configFile: path.join(ud, 'config.json'),
    version: '9.9.9',
    log: quietLog,
    ...(extraEnv ? { extraEnv } : {}),
  });
}

test('packaging 两态 · 开发态：hostScript / cwd / guidePath 指仓库；引擎不注入随包环境', () => {
  const rt = resolveRuntimePaths({
    isPackaged: false,
    resourcesPath: 'R:\\res',
    execPath: 'R:\\exe\\electron.exe',
    appPath: REPO,
  });
  assert.equal(rt.packaged, false);
  assert.equal(rt.hostScript, path.join(REPO, 'src', 'engine', 'host.mjs'));
  assert.equal(rt.engineCwd, REPO);
  assert.deepEqual(rt.engineEnv, {});
  assert.equal(rt.guidePath, path.join(REPO, 'docs', 'guide', 'agent-onboarding.md'));
});

test('packaging 两态 · 打包态：asar 内 hostScript / 安装目录 cwd / PLAYWRIGHT_BROWSERS_PATH / 随包 guide', () => {
  const resourcesPath = 'R:\\inst\\resources';
  const appPath = path.join(resourcesPath, 'app.asar');
  const rt = resolveRuntimePaths({
    isPackaged: true,
    resourcesPath,
    execPath: 'R:\\inst\\免费外包.exe',
    appPath,
  });
  assert.equal(rt.packaged, true);
  assert.equal(rt.hostScript, path.join(appPath, 'src', 'engine', 'host.mjs'));
  assert.equal(rt.engineCwd, path.dirname('R:\\inst\\免费外包.exe'));
  assert.deepEqual(rt.engineEnv, { PLAYWRIGHT_BROWSERS_PATH: path.join(resourcesPath, 'ms-playwright') });
  assert.equal(rt.guidePath, path.join(resourcesPath, 'guide', 'agent-onboarding.md'));
});

test('extraEnv 合成 · 打包态：附加环境变量并入引擎子进程 spawn env；FO_* / ELECTRON_RUN_AS_NODE 契约不变', async () => {
  const out = path.join(TMP, 'probe-pack.json');
  fs.rmSync(out, { force: true });
  const eng = makeEngine({
    out,
    userDataName: 'ud-pack',
    extraEnv: { PLAYWRIGHT_BROWSERS_PATH: 'R:\\fake\\ms-playwright', FO_PROBE_OUT: out },
  });
  eng.start();
  eng.stopping = true; // 探针即退：本条只测 env 合成，不触发崩溃自动重启路径
  try {
    assert.ok(await waitFile(out), `探针未写出子进程 env：${out}`);
    const env = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, 'R:\\fake\\ms-playwright', 'extraEnv 值应并入 spawn env');
    assert.equal(env.FO_PROBE_OUT, out);
    assert.equal(env.ELECTRON_RUN_AS_NODE, '1', '引擎子进程机制键不变');
    assert.equal(env.FO_USER_DATA, path.join(TMP, 'ud-pack'));
    assert.equal(env.FO_CONFIG_FILE, path.join(TMP, 'ud-pack', 'config.json'));
    assert.equal(env.FO_APP_VERSION, '9.9.9');
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path');
    assert.equal(env[pathKey], process.env.PATH, '基础环境原样透传（Windows 下键名实为 Path，大小写不敏感取键）');
  } finally {
    await eng.shutdown();
  }
});

test('extraEnv 缺省 · 开发态：不注入随包变量（保持父环境原值）', async () => {
  const out = path.join(TMP, 'probe-dev.json');
  fs.rmSync(out, { force: true });
  const parentValue = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.FO_PROBE_OUT = out; // 探针出参经父环境传递（本用例专用，用后清理）
  const eng = makeEngine({ userDataName: 'ud-dev' });
  try {
    eng.start();
    eng.stopping = true;
    assert.ok(await waitFile(out), `探针未写出子进程 env：${out}`);
    const env = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, parentValue, '开发态不注入（随父环境原值）');
    assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
  } finally {
    delete process.env.FO_PROBE_OUT;
    await eng.shutdown();
  }
});

test('首建标记：空目录 ⇒ firstRun=true 且写默认配置；已有 / 损坏 ⇒ false（损坏文件不覆盖）', async () => {
  const dirA = path.join(TMP, 'first-run');
  fs.rmSync(dirA, { recursive: true, force: true });
  fs.mkdirSync(dirA, { recursive: true });
  const a1 = await loadConfig({ userDataDir: dirA, log: quietLog });
  assert.equal(a1.firstRun, true, '空目录应判首建');
  const written = JSON.parse(fs.readFileSync(path.join(dirA, 'config.json'), 'utf8'));
  assert.equal(written.browser.mode, 'chromium');
  assert.equal(written.browser.channel, '', '首建默认 = 随包 Chromium（channel 空串）');
  const a2 = await loadConfig({ userDataDir: dirA, log: quietLog });
  assert.equal(a2.firstRun, false, '已有配置 ⇒ 非首建');

  const dirB = path.join(TMP, 'broken');
  fs.rmSync(dirB, { recursive: true, force: true });
  fs.mkdirSync(dirB, { recursive: true });
  fs.writeFileSync(path.join(dirB, 'config.json'), '{ 不是 JSON', 'utf8');
  const b = await loadConfig({ userDataDir: dirB, log: quietLog });
  assert.equal(b.firstRun, false, '损坏配置 ⇒ 按非首建');
  assert.equal(fs.readFileSync(path.join(dirB, 'config.json'), 'utf8'), '{ 不是 JSON', '损坏文件不被覆盖');
});

test('新默认值：channel 空串（随包）· 显式存值保留 · 非法值回退记 issue', () => {
  assert.deepEqual(DEFAULT_CONFIG.browser, { mode: 'chromium', channel: '', headless: false });
  const edge = normalizeConfig({ browser: { mode: 'edge', channel: 'msedge' } }).config;
  assert.deepEqual(edge.browser, { mode: 'edge', channel: 'msedge', headless: false }, '显式存值保留');
  assert.equal(normalizeConfig({}).config.browser.channel, '', '缺失键 ⇒ 新默认');
  const bad = normalizeConfig({ browser: { channel: 42 } });
  assert.equal(bad.config.browser.channel, '', '非字符串 channel ⇒ 回退新默认');
  assert.ok(bad.issues.some((i) => i.includes('browser.channel')), '应记 issue（不静默）');
});

test('随包浏览器语义：chromium+空 channel ⇒ undefined（随包）；edge ⇒ msedge；显式 channel 保留', () => {
  assert.deepEqual(resolveBrowserOptions({ env: {}, configBrowser: null }), { mode: 'chromium', channel: undefined });
  assert.deepEqual(resolveBrowserOptions({ env: {}, configBrowser: { mode: 'chromium', channel: '' } }), {
    mode: 'chromium',
    channel: undefined,
  });
  assert.deepEqual(resolveBrowserOptions({ env: {}, configBrowser: { mode: 'edge', channel: '' } }), {
    mode: 'edge',
    channel: 'msedge',
  });
  assert.deepEqual(resolveBrowserOptions({ env: {}, configBrowser: { mode: 'chromium', channel: 'msedge' } }), {
    mode: 'chromium',
    channel: 'msedge',
  });
  assert.deepEqual(
    resolveBrowserOptions({ env: { FREE_OUTSOURCE_BROWSER_MODE: 'edge' }, configBrowser: { mode: 'chromium', channel: '' } }),
    { mode: 'edge', channel: 'msedge' },
  );
});
