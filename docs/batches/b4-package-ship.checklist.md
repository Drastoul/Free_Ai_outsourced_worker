# b4 打包后自检清单（装机后逐条验证）

> 随批归档（不随包）。来源 = 外包草案 `packaging-checklist.md` 转正 + **本批实测订正**。
> 实测订正（2026-10-11）：① 产物在 `release/`（草案写 `dist/`）；② 安装包实测 **334.7 MiB**（350,929,208 B）；③ `ms-playwright` 实况布局 = `chromium-1248/chrome-win64/chrome.exe`（草案与早期条文写 `chrome-win`）。
> 分工：**机器可跑部分**已由 `npm run verify:pack`（段 A–D）+ 随批单元件 `b4-package-ship.units.mjs` 覆盖；本清单承载**换机人工步骤**（M1–M5）与失败读数记录。

## 0. 构建环境坑（本仓库已实测，必须遵守）

- [ ] `electron` 必须在 `devDependencies`（不能在 `dependencies`），否则 electron-builder 打包异常。
- [ ] 中文路径下构建可用，但命令行所有路径必须加引号。
- [ ] Electron 二进制走国内镜像：`.npmrc` 已含 `electron_mirror` / `electron_builder_binaries_mirror`（已冒烟实测）。
- [ ] **浏览器二进制**由 `npm run fetch:browsers` 注入 `PLAYWRIGHT_DOWNLOAD_HOST`（外部显式给该 env ⇒ 以其为准；失败读数 = 退出非零 + 打印实际下载源与目标目录）。
- [ ] 打包成品必须在**没有安装 Node 的机器**上验证（终端用户机器无 Node）。
- [ ] **已知会话级坑**：宿主进程持有旧 `release/win-unpacked/resources/app.asar` 句柄时，原地 `npm run dist` 会被 **EBUSY** 挡下 ⇒ 用 `--config.directories.output=.thincoder/tmp/release2` 重建后合成（验证法：`app.asar` 逐字节 sha256 比对 + 树级文件数比对）。

## 1. 安装与启动

- [ ] 双击 `release\免费外包-<version>-setup.exe`，**安装目录可改**（NSIS `allowToChangeInstallationDirectory`）。
- [ ] 安装过程**未请求管理员权限**（`perMachine=false` ⇒ 无 UAC 弹窗）。
- [ ] 桌面快捷方式「免费外包」已创建。
- [ ] 开始菜单「免费外包」快捷方式已创建。
- [ ] 启动后托盘区出现「免费外包」图标，托盘常驻不退出。

## 2. 首启引导（b4 新增）

- [ ] 首次启动（`config.json` 不存在）⇒ **自动打开设置窗口且落在「接入指引」页**（不是「外包工」页）。
- [ ] 日志含「首次运行：打开设置窗口」行。
- [ ] 关闭窗口后从托盘「打开设置」再开 ⇒ 落在**默认的「外包工」页**（无参数路径不得带初始页）。
- [ ] 再次启动（已有 `config.json`）⇒ **不再自动开窗**。

## 3. MCP 端点与探活

- [ ] 托盘菜单显示实际 MCP 地址（形如 `http://127.0.0.1:<port>/mcp`）。
- [ ] 浏览器访问 `http://127.0.0.1:<port>/healthz` 返回 ok / 版本 / 端口 / 外包工概览。
- [ ] 若 17873 被占用 ⇒ 端口自动顺延（上限 +120），界面/托盘提示「宿主配置需更新（以本页实际地址为准）」。
- [ ] 设置窗口「接入指引」页显示的地址 == `/healthz` 实际端口 == `runtime.json.url`。

## 4. runtime.json 位置与字段

- [ ] 文件存在：`%APPDATA%\free-outsource\runtime.json`（**打包后应用名不变**，仍是 `free-outsource`）。
- [ ] 字段齐全：`pid` / `host`(=127.0.0.1) / `port`(实际端口) / `url` / `version` / `startedAt`。
- [ ] `pid` 与任务管理器中的主进程 PID 一致。
- [ ] 正常退出（托盘「退出」）后 `runtime.json` 被删除（尽力删除）；若残留 ⇒ 按 `pid` 判活视为陈旧。

## 5. 引擎子进程与随包浏览器

- [ ] 主进程启动后，任务管理器可见引擎子进程（`ELECTRON_RUN_AS_NODE=1` 拉起）。
- [ ] 手动结束引擎子进程 ⇒ 主进程能自动重启引擎（崩溃隔离）。
- [ ] **随包浏览器**：配 `browser.mode=chromium`、`channel=""`（出厂默认）派单一单 ⇒ 启动的浏览器进程映像路径在**安装目录的** `resources\ms-playwright\` 下（机器侧硬断言见 `verify:pack` 段 C）；该机器**未安装** Node / Playwright / 额外浏览器。
- [ ] 切系统 Edge（可选）：把 `config.json` 的 `browser.mode` 改成 `"edge"` ⇒ 重启后走系统 Edge（**本批无界面控件**，属配置手改通道）。
- [ ] 派单一次 ⇒ outbox 目录出现 `<taskId>/`，`manifest.json` 状态流转到终态（`done` / `needs_human`）。

## 6. 首次登录引导

- [ ] 首次派单遇到未登录 ⇒ 任务状态 `needs_human`，浏览器窗口打开等待人工登录；托盘通知提示。
- [ ] 完成登录后重新派单成功，`manifest.state = done`。

## 7. 卸载残留

- [ ] 控制面板卸载「免费外包」成功，安装目录清空。
- [ ] 桌面 / 开始菜单快捷方式被移除。
- [ ] 用户数据保留（`deleteAppDataOnUninstall=false`）：`%APPDATA%\free-outsource\` 内 `config.json` / `logs/` / `profiles/` 仍在。
- [ ] 如需彻底清理：手动删除 `%APPDATA%\free-outsource\` 与仓库内 `.browser-profile`（开发机才有）。

## 8. 失败读数记录栏（执行时填写）

| 步骤 | 读数 / 报错原文 | 结论（通过 · 失败原因 · 阻塞） |
|---|---|---|
| 1 安装 | | |
| 2 首启 | | |
| 3 端点 | | |
| 4 runtime | | |
| 5 引擎 / 随包浏览器 | | |
| 6 首启派单 | | |
| 7 卸载 | | |
