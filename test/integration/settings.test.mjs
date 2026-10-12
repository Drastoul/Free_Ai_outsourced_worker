/**
 * `npm run verify:settings` —— b2 设置界面验收入口（断言 a–l；自控应用启停；隔离 userData）
 *
 * 环境口径（b1 已固化，沿用）：起应用一律剥 `ELECTRON_RUN_AS_NODE`；`FO_USER_DATA` 隔离到
 * `.thincoder/tmp/verify-settings/`（不碰真实 %APPDATA%）；优雅退出走 `--quit`；断言 UTF-8 感知。
 * 驱动：`settings.session.mjs`（主路径 = Playwright `_electron`；不通自动落 CDP 退化路径；见其文件头实测读数）。
 *
 * 断言 ↔ 用例文件对照（§2「验收命令与人工场景」）：
 *   · a–g 窗口/四页签/新增/删除/调序/改名/开关双读/交付目录 —— `settings.workers-page.test.mjs`
 *   · h①② 实际地址与两形态复制 / 顺延提示 / 未启动态；i 一键导出；j 关于页 —— `settings.guide-page.test.mjs`
 *   · k 检查动作 ≤ openingMs 返回 —— `settings.check-action.test.mjs`
 *   · l 退出重启后改动保留 —— `settings.persistence.test.mjs`
 *   · 自定义外包工（b7/T2）—— `settings.custom.test.mjs`
 * 人工场景（M1–M9）不在本命令内：见批次档 b2 §2「人工场景」表（机器不可达项，如系统对话框 / 真机登录）。
 */
import './settings.workers-page.test.mjs';
import './settings.guide-page.test.mjs';
import './settings.check-action.test.mjs';
import './settings.persistence.test.mjs';
import './settings.custom.test.mjs';
