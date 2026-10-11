#!/usr/bin/env node
// 构建期脚本（b4·T2）：把本仓 playwright 版本对应的 Chromium 下载到仓库内 `.playwright-browsers/`。
// 该目录是打包随包浏览器的源：electron-builder 的 extraResources 把它放进 <资源目录>/ms-playwright/，
// 打包态运行时由主进程以 PLAYWRIGHT_BROWSERS_PATH 指向它（见 docs/design/overview.md §9）。
//
// 关键口径（批次档 b4 §2·T2-①）：
//   · 下载源：外部显式给出即以其为准（空串 = 直连官方 CDN）；未给出 ⇒ 默认镜像候选（下方 DEFAULT_DOWNLOAD_HOST）。
//     playwright 对 chromium 的取值优先级（1.64 实测）：PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST >
//     PLAYWRIGHT_DOWNLOAD_HOST > 内置 CDN 列表——取值与读数按同一优先级计算，避免「打印的源 ≠ 实际用的源」。
//   · 幂等：目标目录已有对应版本 ⇒ playwright 自身跳过下载（只校验），可重复执行。
//   · 失败读数：退出非零，并打印实际下载源与目标目录（不静默）。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browsersDir = path.join(repoRoot, '.playwright-browsers');
const DEFAULT_DOWNLOAD_HOST = 'https://cdn.npmmirror.com/binaries/playwright';

// 外部显式给出 PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST（per-browser，优先级最高）/ PLAYWRIGHT_DOWNLOAD_HOST
// （通用；含空串 ⇒ 直连官方 CDN）⇒ 以其为准；两者都未给出 ⇒ 默认镜像候选。
const perBrowserHost = process.env.PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST;
const genericHost = process.env.PLAYWRIGHT_DOWNLOAD_HOST;
const downloadHost = perBrowserHost || (genericHost === undefined ? DEFAULT_DOWNLOAD_HOST : genericHost);
const hostNote = perBrowserHost
  ? `${perBrowserHost}（PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST 外部显式给出）`
  : genericHost === undefined
    ? `${DEFAULT_DOWNLOAD_HOST}（默认镜像候选）`
    : genericHost === ''
      ? '（空值 ⇒ Playwright 官方 CDN）'
      : `${genericHost}（PLAYWRIGHT_DOWNLOAD_HOST 外部显式给出）`;

// playwright 随本仓依赖树解析（cli.js 不在包 exports 表内，经 package.json 定位包根）
let playwrightRoot;
try {
  playwrightRoot = path.dirname(createRequire(import.meta.url).resolve('playwright/package.json'));
} catch (e) {
  console.error(`[fetch:browsers] 找不到 playwright（请先 npm install）：${e?.message || e}`);
  process.exit(1);
}
const cli = path.join(playwrightRoot, 'cli.js');
const pwVersion = JSON.parse(fs.readFileSync(path.join(playwrightRoot, 'package.json'), 'utf8')).version;

console.log(`[fetch:browsers] playwright ${pwVersion}`);
console.log(`[fetch:browsers] 目标目录：${browsersDir}`);
console.log(`[fetch:browsers] 下载源：${hostNote}`);

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir, PLAYWRIGHT_DOWNLOAD_HOST: downloadHost };
const r = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  windowsHide: true,
});

if (r.error) {
  console.error(`[fetch:browsers] 启动 playwright 失败：${r.error.message}`);
  console.error(`[fetch:browsers] 实际下载源：${hostNote}；目标目录：${browsersDir}`);
  process.exit(1);
}
if (r.status !== 0) {
  const how = r.signal ? `信号 ${r.signal}` : `退出码 ${r.status}`;
  console.error(`[fetch:browsers] 下载失败（${how}）：实际下载源 ${hostNote}；目标目录 ${browsersDir}`);
  process.exit(r.status ?? 1);
}

// 成功读数：以 playwright 自身解析的可执行路径为准（playwright 1.64 = Chrome for Testing 布局
// chromium-<rev>/chrome-win64/chrome.exe；旧版布局为 chrome-win/——不硬编码目录名，随仓内版本自适应）
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersDir;
let chromeExe = null;
try {
  const { chromium } = await import('playwright');
  chromeExe = chromium.executablePath();
} catch (e) {
  console.error(`[fetch:browsers] 解析浏览器可执行路径失败：${e?.message || e}`);
  process.exit(1);
}
if (!chromeExe || !fs.existsSync(chromeExe)) {
  console.error(`[fetch:browsers] playwright 退出码 0，但可执行文件不存在：${chromeExe}（目标目录 ${browsersDir}）`);
  process.exit(1);
}
console.log(`[fetch:browsers] 完成：${chromeExe}`);
