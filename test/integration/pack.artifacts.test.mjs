/**
 * `verify:pack` 段 A：打包产物清单（P1 的自动版；批次档 b4 §2·P1 / 段 A）。
 *
 * 断言：
 *   · `release/免费外包-<version>-setup.exe`：存在 · ≥120MB（体积辅助判）· MZ 头（可执行）
 *   · `release/win-unpacked/` 齐：`免费外包.exe` · `resources/app.asar` ·
 *     `resources/app.asar.unpacked/node_modules/{playwright,playwright-core}`
 *   · 随包 Chromium：以仓内 playwright 的 `chromium.executablePath()` 解析（不硬编码目录名——
 *     playwright 1.64 实况 = `chromium-<rev>/chrome-win64/chrome.exe`；旧文字里的 `chrome-win` 是过时字符串）
 *   · `resources/guide/{agent-onboarding,agent-brief}.md` 存在非空；`ms-playwright` 无 `.links` 残留
 *   · asar 根白名单：恰为 `node_modules / package.json / src`（本仓 `probe/` `test/` `docs/` 等 0 进包；
 *     依赖包内自带目录不受此判）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  APP_EXE,
  ASAR,
  GUIDE_DIR,
  MS_PLAYWRIGHT,
  PKG_VERSION,
  RELEASE,
  REPO,
  RESOURCES,
  SETUP_EXE,
} from './pack.driver.mjs';

const require = createRequire(path.join(REPO, 'package.json'));
const MiB = (n) => `${(n / 1048576).toFixed(1)} MiB`;

test('段 A：打包产物清单（P1 自动版）', { timeout: 120000 }, async () => {
  // —— 安装包 ——
  assert.ok(fs.existsSync(SETUP_EXE), `缺安装包 ${SETUP_EXE}（先跑 npm run dist 产出 release/）`);
  const setupBytes = fs.statSync(SETUP_EXE).size;
  assert.ok(setupBytes >= 120 * 1024 * 1024, `体积辅助判不通过：${MiB(setupBytes)} < 120MB（随包浏览器可能遗漏）`);
  const fd = fs.openSync(SETUP_EXE, 'r');
  const head = Buffer.alloc(2);
  fs.readSync(fd, head, 0, 2, 0);
  fs.closeSync(fd);
  assert.equal(head.toString('ascii'), 'MZ', '安装包应为 PE 可执行（MZ 头）');

  // —— 解包目录清单（文件 / 目录分开断言：目录 size 恒为 0）——
  const needFiles = [
    [APP_EXE, '免费外包.exe'],
    [ASAR, 'resources/app.asar'],
    [path.join(GUIDE_DIR, 'agent-onboarding.md'), 'guide/agent-onboarding.md'],
    [path.join(GUIDE_DIR, 'agent-brief.md'), 'guide/agent-brief.md'],
  ];
  for (const [p, label] of needFiles) {
    assert.ok(fs.existsSync(p), `缺 ${label}：${p}`);
    assert.ok(fs.statSync(p).size > 0, `${label} 为空文件：${p}`);
  }
  const needDirs = [
    [path.join(RESOURCES, 'app.asar.unpacked', 'node_modules', 'playwright'), 'asar.unpacked/playwright'],
    [path.join(RESOURCES, 'app.asar.unpacked', 'node_modules', 'playwright-core'), 'asar.unpacked/playwright-core'],
  ];
  for (const [p, label] of needDirs) {
    assert.ok(fs.existsSync(p), `缺 ${label}：${p}`);
    assert.ok(fs.statSync(p).isDirectory() && fs.readdirSync(p).length > 0, `${label} 应为非空目录：${p}`);
  }

  // —— 随包 Chromium：以 playwright 自身解析为准（env 须先于 import 设置，沿用 fetch-browsers 口径）——
  const saved = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = MS_PLAYWRIGHT;
  let chromeExe;
  try {
    const { chromium } = await import('playwright');
    chromeExe = chromium.executablePath();
  } finally {
    if (saved === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = saved;
  }
  assert.ok(chromeExe, 'chromium.executablePath() 未解析出可执行路径');
  assert.ok(
    path.resolve(chromeExe).toLowerCase().startsWith(path.resolve(MS_PLAYWRIGHT).toLowerCase()),
    `随包浏览器不在 resources/ms-playwright 下：${chromeExe}`,
  );
  assert.ok(fs.existsSync(chromeExe), `随包浏览器可执行文件不存在：${chromeExe}`);
  assert.ok(!fs.existsSync(path.join(MS_PLAYWRIGHT, '.links')), 'ms-playwright 不应含 .links 残留');

  // —— asar 根白名单（本仓目录 probe/test/docs 等 0 进包）——
  const asarList = require('@electron/asar').listPackage(ASAR);
  assert.ok(Array.isArray(asarList) && asarList.length > 1000, `asar 清单异常：${asarList?.length}`);
  const entries = asarList.map((s) => String(s).replace(/\\+/g, '/').replace(/^\//, ''));
  const tops = [...new Set(entries.map((e) => e.split('/')[0]))].sort();
  assert.deepEqual(tops, ['node_modules', 'package.json', 'src'], `asar 根白名单不符：${JSON.stringify(tops)}`);
  for (const key of ['src/engine/host.mjs', 'src/main/index.mjs', 'src/settings/index.html']) {
    assert.ok(entries.includes(key), `asar 内缺关键文件：${key}`);
  }

  console.log(
    `[verify:pack·段 A 读数] setup=${MiB(setupBytes)}（含 MZ 头）· ${path.basename(APP_EXE)}=${MiB(fs.statSync(APP_EXE).size)} ` +
      `· app.asar=${MiB(fs.statSync(ASAR).size)} · asar 条目=${entries.length} 根=${tops.join('/')} ` +
      `· 随包浏览器=${path.relative(RELEASE, chromeExe)} · guide=[agent-onboarding.md, agent-brief.md] · .links=无`,
  );
});
