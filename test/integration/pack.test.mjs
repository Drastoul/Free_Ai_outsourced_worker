/**
 * `npm run verify:pack` —— b4 打包与换机验收入口（段 A–D；自控应用启停；隔离 userData）
 *
 * 环境口径（b1/b2 沿用）：起应用一律剥 ELECTRON_RUN_AS_NODE；`FO_USER_DATA` 隔离到
 * `.thincoder/tmp/verify-pack/`（不碰真实 %APPDATA%；各用例交付目录均指向隔离目录，不碰真实 outbox）；
 * 优雅退出走二实例 `--quit`；中文断言一律 UTF-8 感知；进程映像读数经 PowerShell
 * `Get-CimInstance Win32_Process`（显式 UTF-8）。
 *
 * 断言 ↔ 用例文件对照（批次档 b4 §2「验收命令与人工场景」）：
 *   · 段 A 产物清单（= P1 自动版）—— `pack.artifacts.test.mjs`
 *   · 段 B 打包态启动（含 P3 无系统 Node 读数）—— `pack.boot.test.mjs`
 *   · 段 C 随包 Chromium（进程映像硬断言 + 日志辅证）—— `pack.chromium.test.mjs`
 *   · 段 D 首启引导（空 userData ⇒ 设置窗口落「接入指引」）—— `pack.firstrun.test.mjs`
 * 驱动 = `pack.session.mjs`（打包态起应用 + CDP 取设置窗口）；读数工具 = `pack.driver.mjs`。
 * 人工场景（M1–M5）不在本命令内：见 `docs/batches/b4-package-ship.checklist.md`。
 *
 * 前提：`release/` 产物在盘（切分 1 交付；本命令不构建）。段 C 依赖平台可达——平台侧波动
 * （未登录 / 风控 / 网络）会照实体现在终态与错误码上，不造假绿。
 */
import './pack.artifacts.test.mjs';
import './pack.boot.test.mjs';
import './pack.chromium.test.mjs';
import './pack.firstrun.test.mjs';
