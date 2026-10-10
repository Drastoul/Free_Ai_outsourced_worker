# 2026-10-10 · b4 打包与换机
> 六段 append-only，一段一作者：§1 讨论（主 agent）· §2 批次任务与设计（eng-designer）· §3 设计评审（评审子代理）· §4 用户批准（主 agent）· §5 实施记录（eng-coder）· §6 验证与收口（父代理）。
> 编制：主 agent · 2026-10-10 · 来源 = 用户 2026-10-09「按顺序完成其他流程」+ 需求 R6（打包 .exe 分发）与 R9·AC-R9-3（换机自适配）+ 设计档 overview 打包与换机章节 + 外包产出的打包配置草案（outbox/20261009-202608-7e7d）。
> 台账 = #6（免费外包 · 归批）。前情 = docs/batches/b2-settings-ui.md §6（已收口 2026-10-10）。
## §1 讨论（主 agent）
**状态行**：进行中（任务书就绪；设计评审批次 1 = changes-required（1🔴·6🟡·5🔵）；裁定后 10 条要改（修复轮已派）、2 条主包AI 已修（文档地图登记 · §1 收成实况））


### §1 讨论与来源（主包AI）

- **来源**：用户 2026-10-09「按顺序完成其他流程」；需求 **R6**（打包为 Windows `.exe` 可分发）+ **R9·AC-R9-3**（换机自适配）；设计档 `docs/design/overview.md` 打包与换机章节（决策 C / **K8**「Chromium 随包为主、Edge 可切」）。
- **本批位置**：b1（核心闭环）· b2（设置界面）均已收口；b4 是「让别人也能装上用」的一批（打包 + 随包运行时 + **无 Node 机器**首启自适配）。b3（Kimi）与本批并列、互不依赖。
- **父侧裁定（2026-10-10，回应设计代理三问）**：
  1. **三处最小接线：准**——① 引擎子进程 env 注入（`PLAYWRIGHT_BROWSERS_PATH`）· ② guide 打开路径按打包态解析（**注入式**，保持 service 的纯 Node 面）· ③ 引擎子进程 cwd/hostScript 打包态改真目录（Electron 限制：cwd 不可为 asar 内路径）。三处均**增量式**（dev/测试行为不变）；**我原派单「不动 `src/**` 运行时行为」写窄了，以设计档为准**。
  2. **出厂默认 `browser.channel` 改空：准，但序约束**——必须与**随包运行时同批**落地（否则 `mode=chromium` 无可用运行时）；**已存在的 `config.json` 不受影响**（本机那份显式存 `msedge`，继续走系统 Edge，不动现有登录态 / profile）；dev/测试仍显式 `edge`。
  3. **F6.3 首启引导：准最小形态**——首启（`config.json` 首次创建）⇒ **自动打开设置窗口并落在「接入指引」页**；须进 §2 条目表并给机器可跑判据。
- **父侧同步的设计档 2 处**（§2 点名口径；**主包AI 直改·小改·可回退**）：`docs/design/overview.md` §4 样例 `"channel": "msedge"` ⇒ `""`；`docs/design/modules/settings-app.md` §1 补「首次启动引导」一句。
- **起点与已核问题**：外包产出 `D:\免费外包\outbox\20261009-202608-7e7d\files\`（父侧核出两处：`extraResources.from` 指向不存在的 `guide/`、草案 `package.json` 带 `# file:` 头；设计代理另多找出 3 处并按设计档处置：输出目录 `dist`⇒`release`、脚本名对齐 AC-R6-1、去掉无用的 `postinstall`）。本机已实测：NSIS 链冒烟通过（成品约 106MB）、中文路径可用、`electron` 必入 `devDependencies`、Electron 二进制走镜像。
- **门禁**：§2 已就绪；**实施需用户批准（§4）**——未获批准前不动 `src/**`、`package.json`、打包配置。

## §2 批次任务与设计（eng-designer）
**状态行**：设计完成（T1–T6 · 文件计划（9 项 src + 配置 / 脚本）· 3 份切分 · 验收 P1–P5 / M1–M5 · 边界；父侧三条裁定已落位（设计档同步 2 条已落地）；评审轮 1 的 10 条定点修复已落（见「评审轮 1 定点修复」）；上抛 1 项（Edge 界面控件，待用户裁定）；待主包AI 核验、用户批准）
<§2 模板占位：本批条目（覆盖） / 设计档落点 / 机制设计 / 受影响文件与测试面 / 验收对照 / 关键决策 / 上抛项>

### 本批（b4）范围与覆盖

本批 = **打包与随包运行时**：把 b1/b2 已交付的应用打成 Windows NSIS 安装包，让目标机（无 Node、无额外浏览器）装机即用；换机场景（AC-R6-2 / AC-R6-3 / AC-R9-3）的判据与执行件齐备。设计起点 = 外包产出的打包配置草案（`outbox/20261009-202608-7e7d/files/`：`electron-builder.yml` · `packaging-checklist.md` · `package.json`），与设计档 / 实测有出入处逐项处置（见「草案处置口径」）。

覆盖需求条目（三条链同源：需求档 R 条目 ↔ 设计档验收回指 ↔ 本段）：

- **R6**（`docs/requirements/overview.md:175-193`）：F6.1 打包 `.exe`（→ AC-R6-1）· F6.2 目标机无需 Node / 额外浏览器（→ AC-R6-3 的机制侧）· F6.3 首次启动引导（→ AC-R9-3「首次启动即可接入」侧）。
- **R9·F9.4**（`:248`）「目标机无 Node、无额外浏览器也可运行」机制验证；**AC-R9-3**（`:258`，与 AC-R6-2 同批执行）。
- R9 其余项（F9.1 端口顺延 / F9.2 发布面 / F9.3 期望端口 / F9.5 指南两节 / F9.6 一键导出）**均为 b1/b2 已落地**——本批只做指针引用与换机执行，不重做。

**不在本批**：b3 Kimi 适配器；自动更新与代码签名（R6 边界；未签名属已知项）；便携版（决策 E：暂不做）；MCP 工具面扩展（六件套封闭）；b1/b2 已定契约与业务行为；宿主私有配置改写；登录态迁移。

### 已落地能力指针（不重写、不改）

| 能力（R9 既有项） | 权威落点 |
|---|---|
| 端口顺延（+120）/ 期望端口文件手改 / `runtime.json` 字段与生命周期 | 设计 `docs/design/overview.md` §2.3；实现 `src/main/index.mjs:183-205` |
| 交付目录实际路径解析与回落 | 设计 `docs/design/modules/outbox.md`；实现 `src/shared/outbox.mjs` |
| 指南两节（「换机后首次接入」「端点 / 端口变化后如何更新宿主配置」） | `docs/guide/agent-onboarding.md` §六 / §七；设计 overview §7 |
| 设置界面「接入指引」页（实际地址 / 两形态复制 / 一键导出 / 打开随包文档） | 设计 `docs/design/modules/settings-app.md` §3；实现 `src/settings/service.mjs` |
| 引擎子进程以 `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 启动（终端机无需 Node 的机制） | 设计 overview §2.1；实现 `src/main/engine-client.mjs:56-67` |
| 浏览器 profile 与登录态（`<userData>/profiles/<workerId>/`；换机不迁移、每平台首登一次） | 设计 `docs/design/modules/browser-engine.md` §2 / §5 |

### 设计档落点与三处裁定（2026-10-10 父侧）

- `docs/design/overview.md` §9（打包：electron-builder → NSIS x64、输出 `release/`；Chromium 随包 = `extraResources` + 运行时 `PLAYWRIGHT_BROWSERS_PATH`；构建期镜像；未签名已知项）· §7（①④ 随包进安装目录 `guide/`）· §2.1 · §12 · §13。
- `docs/design/modules/browser-engine.md` §3（出厂 `mode=chromium` 随包、可切 `edge`）。
- `docs/design/modules/settings-app.md` §3（「打开随包文档」：b4 随包后 = 安装目录 `guide/`；现实现指向仓库 `docs/guide/`——`src/settings/service.mjs:22`）。
- 需求档：R6（F6.1–F6.3 + 边界）· R9·F9.4 · AC-R6-1..3 · AC-R9-3。
- **父侧三条裁定（均「准」，本段按此落地；派单原句「不动 `src/**` 运行时行为」为过窄表述，以设计档为准）**：
  1. **三处最小打包接线准许**：引擎子进程 env 注入 / guide 打开路径按打包态解析（注入式，service 保持纯 Node 面）/ 引擎 `cwd`·`hostScript` 打包态改真目录——均为增量式，dev 与测试路径行为不变（两态判据见「打包态 / 开发态两态对照」）。
  2. **出厂 `browser.channel` 默认改空准许，序约束**：默认值改动与随包运行时**同批**落地（禁止只改默认不改运行时）；**已存在 config.json 不受影响**（`src/main/config-schema.mjs:106-112` 只对缺失键填默认，显式存值不动——本机那份显式 `channel:'msedge'` 继续走系统 Edge）；dev/测试仍显式 `edge`。设计档 §4 样例同步口径由本段点名（见「裁定落位与设计档同步」）。
  3. **F6.3 首启引导按最小形态准许**：首启（`config.json` 首次创建）⇒ 自动打开设置窗口并落在「接入指引」页；进条目表（T5），判据含机器可跑项。

### 条目表（T1–T6）

每条 = 目标 / 功能点 / 边界（明确不做什么）/ 验收判据 / 依赖。判据的机器实现 = 「验收命令」表（P1–P5）；人工场景 = M1–M5。

**T1 打包配置与 NSIS 构建**（F6.1；AC-R6-1）
- 目标：一条命令产出可分发的 Windows 安装包。
- 功能点：新增 `electron-builder.yml`（asar + `asarUnpack` playwright / playwright-core；`files` 白名单；`extraResources`；`win.icon`；NSIS：非一键 / per-user（`perMachine=false`、`allowElevation=false`）/ 可改安装目录 / 桌面与开始菜单快捷方式 / `deleteAppDataOnUninstall=false` / `runAfterFinish`）；**输出 = `release/`**（设计 §9；草案的 `dist` 为偏差，改 `release/`）；`package.json`：scripts `dist`（AC-R6-1 命令名；草案的 `build` 改名）/ `dist:dir` / `verify:pack` / `fetch:browsers`，devDependencies += `electron-builder@^26.15.3`，补 `author` / `license`。
- 边界：不做签名 / 自动更新 / 便携版 / 多语言安装器；构建产物不入库。
- 验收：P1（`npm run dist` exit 0 ∧ `release/免费外包-<version>-setup.exe` ∧ 文件清单）。依赖：构建机可访问 npm / Electron 二进制镜像（`.npmrc` 双镜像已配，第 0 步实测可信）；切分 1。

**T2 随包浏览器运行时**（F6.2；AC-R6-3 机制侧；K8）
- 目标：目标机不装任何浏览器也能跑——Chromium 随包，运行时指向随包目录。
- 功能点：① `scripts/fetch-browsers.mjs` 构建期把 Playwright Chromium 下载到仓库内 `.playwright-browsers/`（`PLAYWRIGHT_BROWSERS_PATH` 指定、与仓内 playwright 版本同源、幂等）；**下载源 = `PLAYWRIGHT_DOWNLOAD_HOST`**（由脚本在调 `playwright install chromium` 时注入——`.npmrc` 只覆盖 npm / Electron 面，管不到浏览器二进制；默认候选 `https://cdn.npmmirror.com/binaries/playwright`，**第 0 步实测确认**，外部显式给出该 env ⇒ 以其为准；**失败读数** = 退出非零 + 打印实际下载源与目标目录，不静默）；② `extraResources` 把该目录打进 `<resources>/ms-playwright/`；③ 打包态由 `src/main/packaging.mjs` 计算 `PLAYWRIGHT_BROWSERS_PATH=<resources>/ms-playwright`，经 `engine-client` 新增 `extraEnv` 选项并入引擎子进程 spawn env（开发态不注入）；④ 出厂默认改随包：`DEFAULT_CONFIG.browser.channel` `'msedge'` → `''`（`mode=chromium` ⇒ 无 channel ⇒ 随包；**切系统 Edge 的入口 = 配置文件手改 `browser.mode:'edge'` + 重启生效**——与 `mcp.port` 手改通道同列（建议文案 `src/settings/service.mjs:25`）；设置界面本批无该控件，差异见「未决与上抛」——设计 browser-engine §3 / K8；裁定 ②）。
- 边界：不做首启下载（被否方案）；不另订浏览器 revision（同仓同版）；随包口径 = `install chromium`（不夹带无关浏览器）；默认值改动禁止先于运行时接线单独落地（序约束）。
- 验收：P2 段 C（打包态 `mode=chromium` 派单 ⇒ 浏览器启动；**日志 `channel=随包 chromium`**——读数 = 应用日志行，`channel` 空串 ⇒ `resolveBrowserOptions` 返 `undefined` ⇒ 该行按 `?? '随包 chromium'` 打印（`src/engine/browser-config.mjs:51` / `src/engine/browser.mjs:92`））∧ **进程映像读数**（评审 #6 定案 ①-a）：段 C 期间从测试侧枚举进程映像路径，命中 `release/win-unpacked/resources/ms-playwright/` 下的浏览器进程 = 过、超时 = 失败（硬断言；通道见 P2 段 C）∧ 换机 M1（AC-R6-3；「非 Edge」核对见 M1-④）。依赖：T1（extraResources）；切分 2。

**T3 随包文档与「打开随包文档」打包态解析**（设计 §7；settings-app §3）
- 目标：装机后设置界面能打开随包接入文档（①④ 随包；R9·F9.5 的随包面）。
- 功能点：① `extraResources` `from: docs/guide → to: guide`（**校正草案 `from: "guide"`——仓库无此目录**；`extraResources` 与 `files` 白名单互不相干，不需构建期拷贝步骤）；② `src/settings/service.mjs` guide 路径注入化（经 `wiring` 传入；打包态 = `<resources>/guide/agent-onboarding.md`；开发态不变；service 保持纯 Node 面、不 import electron）。
- 边界：`docs/**` 不进 asar；`guide/` 只含 ①④ 两份用户文档（**打包自检清单不随包**——落 `docs/batches/`，见 T6）。
- 验收：P2 段 A（`resources/guide/{agent-onboarding,agent-brief}.md` 存在）∧ 段 B/D（快照 `guide.available=true`）∧ 人工 M4（真开、落点为安装目录）。依赖：T1；切分 2。

**T4 打包态进程接线（引擎子进程）**（设计 §2.1；支撑 AC-R6-2 的机制）
- 目标：打包后应用照常起引擎——应用自身即 Node 运行时，终端机无需 Node。
- 功能点：新增 `src/main/packaging.mjs`（纯函数，`isPackaged` 两态）：`hostScript`（打包态 = `app.getAppPath()/src/engine/host.mjs`（asar 内）；开发态 = 仓库路径）· `engineCwd`（打包态 = 安装目录 `dirname(process.execPath)`；**asar 档根不可作 cwd**——Electron 明文限制）· `engineEnv`（T2 的环境变量）。**入参口径（评审 #5）**：`isPackaged` / `resourcesPath` / `execPath` / `appPath` 为**注入值**（由 `index.mjs`（Electron 侧）取值传入），模块自身**不 import electron** ⇒ P5 纯 Node 跑法成立（同 `src/settings/wiring.mjs:4`「service.mjs 为纯 Node 面（可脱 Electron 单测）」法）。`index.mjs` / `engine-client.mjs` 接线（`hostScript` / `cwd` / `extraEnv`）。
- 边界：不改 JSON-RPC 协议 / 四方法 / 超时 / 重试（b2 已定）；不改引擎业务行为；asar 直跑风险与备选见「切片风险」。
- 验收：P2 段 B（打包态启动 ⇒ 日志「引擎就绪」∧ `/healthz` ok ∧ `runtime.json` 字段齐 ⇒ `--quit` 干净退出并删 `runtime.json`）。依赖：切分 2。

**T5 首启引导（F6.3；裁定 ③ 最小形态）**
- 目标：新机器首次启动被引导完成接入（能看到 MCP 地址并复制）。
- 功能点：首启判定 = 启动时 `config.json` 不存在（`loadConfig` 暴露首建标记——`src/main/config.mjs:77-104`）；判定真 ⇒ 服务就绪后自动打开设置窗口并**默认定位「接入指引」页**（复用 b2 单例窗口与页签）；日志记一行「首次运行：打开设置窗口」。
  - **初始页接缝（评审 #1 补齐；最小面）**：`src/settings/window.mjs:90` 的 `open()` 增可选参 `initialPage` ⇒ 新建窗口时 `loadFile(PAGE_PATH, {query: {page: initialPage}})`（Electron 公开面 `LoadFileOptions.query`——`node_modules/electron/electron.d.ts:22456-22469`；已存在窗口 ⇒ 照旧显示 / 聚焦，不追溯换页）；`src/settings/renderer.js:195` 的 `boot` 读 `location.search` 的 `page`、按 `PAGES`（`src/settings/renderer.js:10`）校验后 `setPage`（缺省 / 非法 ⇒ `workers`）；`wiring` 的 `openSettings(initialPage)` 透传，`index.mjs` 首启调用处带 `'guide'`。**不用 executeJavaScript 点页签**；无参数时与 b2 行为一致。
- 边界：只首启一次（config.json 落地后不再自动开）；不做强制向导 / 遮罩；登录引导沿用 b2 既有交互（「打开并检查」⇒ 引导文案 + 浏览器窗口留人工）——不新增自动动作。
- 验收：机器 —— P2 段 D：空 userData ⇒ ① 设置窗口存在 ∧ ② **当前激活页 =「接入指引」**（`[data-page="guide"].is-active` + 面板可见；读数 = b2 既有 CDP 读设置窗口 DOM 接缝）∧ ③ `[data-field=mcp-url]` == 实际地址；**两态判据 = 首启 ⇒ 激活页 `guide`（经 T5 接缝）；开发态无 `?page=` ⇒ `workers` 不变（既有交互守门 = P4）**。人工 —— M3（一步：首启窗口打开且接入指引可见）。依赖：b2 设置窗口；切分 2（含接缝文件 `src/settings/window.mjs` / `src/settings/renderer.js`）。

**T6 换机验证执行件与随批自检清单**（AC-R6-2 / AC-R6-3 / AC-R9-3）
- 目标：换机验收可逐条执行；本机替代判据齐备。
- 功能点：`docs/batches/b4-package-ship.checklist.md`——外包草案 `packaging-checklist.md` 转正（构建环境坑 / 安装与启动 / 端点与探活 / `runtime.json` / 引擎子进程 / 首启引导 / 卸载残留；含失败读数记录栏）；M1 换机脚本（步骤 + 逐条判据）。
- 边界：清单随批归档、不随包；不新增测试框架。
- 验收：M1（AC-R6-2 / AC-R6-3 / AC-R9-3 的「换机操作可证伪」判据）；本机替代判据 = P3。依赖：T1–T5。

### 文件计划（新增与修改；行数为估算，实施后按实际回调）

新增：

| 文件 | 预计 | 职责 |
|---|---|---|
| `electron-builder.yml` | ~60 行 | 打包配置权威：**`productName: 免费外包`**（产品名唯一来源——`win-unpacked` 可执行名与由 `productName` 派生的产物名；第 0 步构建实测确认，不符则显式补对应字段并回调 P1）· NSIS **`artifactName: "${productName}-${version}-setup.${ext}"`**（P1 文件名断言的唯一来源，不依赖未验证的默认派生）· asar / asarUnpack、files 白名单、extraResources（`docs/guide` → `guide`；`.playwright-browsers` → `ms-playwright`）、win / NSIS 选项；输出 `release/` |
| `src/main/packaging.mjs` | ~45 行 | 打包态路径与运行期环境单一计算点（`hostScript` / `engineCwd` / `engineEnv` / `guidePath`；纯函数可单测；**入参注入、不 import electron**——见 T4） |
| `scripts/fetch-browsers.mjs` | ~40 行 | 构建期下载随包 Chromium 至 `.playwright-browsers/`（幂等；失败退出非零） |
| `build/icon.ico` | 二进制 | 安装器 / 应用图标（256×256；无设计稿 ⇒ 简化图形，人工确认外观；生成脚本不入库） |
| `test/integration/pack.test.mjs`（+拆件） | ~260 行 | `npm run verify:pack`：段 A 产物断言 / 段 B 打包态启动 / 段 C 随包 Chromium / 段 D 首启（超 300 行 ⇒ 按段拆分） |
| `docs/batches/b4-package-ship.units.mjs` | ~80 行 | 随批单元（`node --test` 直跑）：packaging 两态路径 / `extraEnv` 合成 / 首建标记 / 新默认值 |
| `docs/batches/b4-package-ship.checklist.md` | ~90 行 | 随批装机自检清单（草案转正；见 T6） |

修改（现况行数 → 改动；预期增量）：

| 文件 | 改动 | 预算 |
|---|---|---|
| `package.json`（24） | scripts += `dist` / `dist:dir` / `fetch:browsers` / `verify:pack`；devDependencies += `electron-builder`；补 `author` / `license`；**不带入草案的 `postinstall`**（无原生模块，避免每次 install 触发多余动作） | 24 → ~37 |
| `src/main/index.mjs`（296） | 接线：`packaging.mjs` 计算值接入（`hostScript` / `cwd` / `extraEnv`）、`guidePath` 注入、首启开窗、日志行 | ≤ +7 ⇒ 触及 300 档；**拆分计划**：若 >300，把 `writeRuntimeFile` / `removeRuntimeFile`（`:215-227` / `:277-286`）纯搬迁至 `src/main/runtime-file.mjs`（无行为变化） |
| `src/main/engine-client.mjs`（291） | 新增 `extraEnv` 选项并入 spawn env；协议 / 超时 / 重试 / 四方法不动 | ≤ +6（291 ⇒ ≤297；**越档处置**：若超 300 ⇒ 按 `index.mjs` 同法外提纯函数段至新模块、无行为变化，拆分点实施时定并回调） |
| `src/settings/service.mjs`（293） | guide 路径注入化（缺省 = 现状；打包态由 wiring 传入） | ≤ +6（293 ⇒ ≤299；**越档处置**：若超 300 ⇒ 按 `index.mjs` 同法外提、无行为变化，拆分点实施时定并回调） |
| `src/settings/wiring.mjs`（78） | 透传 `guidePath`；`openSettings(initialPage)` 透传初始页（T5） | ≤ +5 |
| `src/settings/window.mjs`（170） | 初始页接缝（T5）：`open(initialPage?)` + 新建窗口时 `loadFile(PAGE_PATH, {query})`；已存在窗口 ⇒ 照旧显示 / 聚焦（不追溯换页） | 170 → ~178（≤ +8；**拆分判断**：无越档风险） |
| `src/settings/renderer.js`（220） | 初始页接缝（T5）：`boot` 读 `location.search` 的 `page`、按 `PAGES` 校验后 `setPage`（缺省 / 非法 ⇒ `workers`） | 220 → ~222（≤ +2；**拆分判断**：无越档风险） |
| `src/main/config-schema.mjs`（205） | `DEFAULT_CONFIG.browser.channel`：`'msedge'` → `''`（T2；序约束见裁定 ②） | ±1 |
| `src/main/config.mjs`（104） | `loadConfig` 暴露首建标记（`store.firstRun`） | ≤ +3 |
| `.gitignore`（19） | += `.playwright-browsers/` | +1 |

### 打包态 / 开发态两态对照（本批接线的判据面；裁定 ① 的两态判据）

| 项 | 开发态（保持不变） | 打包态（本批新增） |
|---|---|---|
| 引擎 `hostScript` | 仓库 `src/engine/host.mjs` | `app.getAppPath()/src/engine/host.mjs`（asar 内；不通则备选 `app.asar.unpacked` 路径） |
| 引擎子进程 `cwd` | 仓库根 | 安装目录 `dirname(process.execPath)` |
| `PLAYWRIGHT_BROWSERS_PATH` | 不注入 | `<resources>/ms-playwright` |
| guide 打开路径 | 仓库 `docs/guide/agent-onboarding.md` | `<resources>/guide/agent-onboarding.md` |
| 出厂 browser 默认 | 不影响：dev/测试显式 `edge`（各夹具已写死） | 新配置 `mode=chromium` / `channel=''` ⇒ 随包 Chromium；既有 config.json 显式存值不动；**切 Edge = 配置文件手改 `mode:'edge'` + 重启生效**（入口见 T2-④；界面无该控件——见「未决与上抛」） |
| 首启开窗 / 初始页 | 同逻辑（空 userData 即首启 ⇒ `open('guide')`）；**无 `?page=` 参数 ⇒ 默认 `workers`（b2 交互不变）** | 同左（首启激活页 = `guide`，经 T5 接缝） |

判据面：开发态回归 = P4；打包态 = P2 段 A–D；两态一次对照 = P5 单元（packaging 纯函数）。

### 冻结面（切分之间的对接面基线；跨切分改动须双方同步）

- 资源布局：`<resources>/ms-playwright/`（随包浏览器根）· `<resources>/guide/`（①④）· `resources/app.asar`（+ `app.asar.unpacked`，playwright 外置）。
- 环境变量：`PLAYWRIGHT_BROWSERS_PATH`（仅打包态注入引擎子进程）。
- 出厂默认：`browser.mode='chromium'` · `channel=''`（随包）；切 Edge = `mode:'edge'`。
- 产物与去向：`release/免费外包-<version>-setup.exe` · `release/win-unpacked/免费外包.exe`。
- npm scripts：`fetch:browsers` / `dist` / `dist:dir` / `verify:pack`。
- 设置窗口初始页接缝（T5；切分 2 交付、切分 3 依赖）：`openSettings(initialPage?)` ⇒ 新建窗口 URL 带 `?page=<name>`（`name ∈ PAGES` = `workers` / `guide` / `outbox` / `about`）；渲染层缺省 / 非法值 ⇒ `workers`（b2 行为不变）。
- 测试接缝（沿用 b1/b2）：`FO_USER_DATA` 隔离、`--quit` 优雅退出、CDP 读 DOM（`--remote-debugging-port=0`）；不碰真实 `%APPDATA%` 与真实 outbox。

### 实施切分（3 份；文件域互不重叠）

| 切分 | 文件域 | 交付判据 |
|---|---|---|
| 1 · 打包链与随包资源 | `electron-builder.yml` · `package.json` · `scripts/fetch-browsers.mjs` · `build/icon.ico` · `.gitignore` | 第 0 步自证（**先于其余**）：`npm run fetch:browsers` 落 `.playwright-browsers/`；`npm run dist` exit 0；P1 清单抽查；**引擎 asar 直跑自证**——起打包态应用断言「引擎就绪」（不通 ⇒ 先走「切片风险」备选再继续）。 |
| 2 · 打包态运行期接线 | `src/main/packaging.mjs` · `src/main/index.mjs` · `src/main/engine-client.mjs` · `src/main/config.mjs` · `src/main/config-schema.mjs` · `src/settings/{service,wiring}.mjs` · **`src/settings/window.mjs` · `src/settings/renderer.js`（初始页接缝，T5）** | 单元（「两态对照」表逐行）；开发态回归（b1/b2 命令不破）；空 userData 起开发态应用 ⇒ 首启开窗（页 = 接入指引）一次性直验；**无 `?page=` 打开（托盘 / 二实例 / `FO_OPEN_SETTINGS`）⇒ 仍 `workers`（既有交互不变）**。 |
| 3 · 测试与验收面 | `test/integration/pack.test.mjs`（+拆件）· `docs/batches/b4-package-ship.units.mjs` · `docs/batches/b4-package-ship.checklist.md` | `npm run verify:pack` 段 A–D 全绿（依赖 1 的产物与 2 的接线）+ 单元全绿 + 清单转正落档。 |

- 并行与依赖：1、2 可立即并行（接口 = 「冻结面」）；3 的用例可先行起草，跑绿依赖 1 + 2。
- 顺序硬约束：① 1 的「引擎 asar 直跑自证」先跑（不通先定备选）；② 默认值改动（切分 2）与随包运行时（切分 1 + 切分 2 注入）**同批**进验收——P2 段 C 同验两者（裁定 ② 序约束）。
- 收口回归（父侧）：b1/b2 全部命令 + `verify:pack` + M1–M5。

### 切片风险与备选（决策程序）

| 风险 | 证据 / 现状 | 备选（触发即执行，无需再上抛） |
|---|---|---|
| `ELECTRON_RUN_AS_NODE` 下执行 asar 内引擎脚本 | Electron 源码 `lib/node/init.ts`：run-as-node 启动时 `wrapFsWithAsar` 已初始化 ⇒ 预期可读；仍以切分 1 第 0 步实测为准 | 实测不通 ⇒ `asarUnpack` 覆盖 `src/engine/**`，`packaging.mjs` 的 `hostScript` 打包态改解析 `app.asar.unpacked` 路径（单点改动） |
| 引擎 `cwd` 曾指向仓库根 | asar 档根不可作 cwd（Electron 明文限制） | 已按 `engineCwd = 安装目录` 设计（T4），无备选需求 |
| 中文路径 / npm 与 Electron 镜像（已实测）；**浏览器二进制镜像（待实测）** | 中文路径与 `.npmrc` 三项镜像（registry / electron / electron-builder-binaries）已冒烟实测；**`PLAYWRIGHT_DOWNLOAD_HOST`（浏览器二进制下载源）未实测**（`.npmrc` 无该项；取值随 `fetch:browsers.mjs` 注入，见 T2-①） | 第 0 步实测：`npm run fetch:browsers` 落 `.playwright-browsers/` 即通；不通 ⇒ 换镜像域或直连官方 CDN（该 env 置空），读数记 `b4-package-ship.checklist.md`「构建环境坑」 |

### 验收命令与人工场景

**命令（P1–P5；读数口径）**

| 命令 | 断言（读数） |
|---|---|
| P1 构建：`npm run dist` | exit 0；产物 `release/免费外包-<version>-setup.exe`（= `${productName}-${version}-setup.${ext}`，可执行，文件名含版本号——AC-R6-1；**产物名 / 程序名唯一来源 = `electron-builder.yml` 的 `artifactName` / `productName`**，见文件计划）；`release/win-unpacked/` 下齐：`免费外包.exe` · `resources/app.asar` · `resources/app.asar.unpacked/node_modules/{playwright,playwright-core}/` · `resources/ms-playwright/chromium-*/chrome-win/chrome.exe` · `resources/guide/{agent-onboarding.md,agent-brief.md}`；包内不含 `probe/**` · `test/**` · `docs/**`（抽查：`npx @electron/asar list`——`@electron/asar` 随 electron-builder 依赖在场）；**体积辅助判**：预期 150–250MB 级（b1 已记 ~200MB 级预期——`docs/batches/b1-core-loop.md:212`），机器断言 ≥ 120MB；**读数口径**：§1 记的「成品约 106MB」为**未含随包浏览器**的首次冒烟读数（`docs/batches/b4-package-ship.md:18`），随包后应显著高于 120MB（主判 = 上列文件清单；体积作「随包浏览器是否遗漏」的辅助排查） |
| P2 打包态自检：`npm run verify:pack` | 段 A 产物断言（= P1 清单的自动版）· 段 B 打包态启动（隔离 userData；剥 `ELECTRON_RUN_AS_NODE`；`release/win-unpacked/免费外包.exe` ⇒ `/healthz` ok ∧ 日志「引擎就绪」∧ `runtime.json` 字段齐 ⇒ `--quit` exit 0 ∧ `runtime.json` 已删）· 段 C 随包 Chromium（配置 `mode=chromium` ⇒ 派单一条 ⇒ 浏览器启动、日志「启动浏览器 … channel=随包 chromium」⇒ **进程映像读数（硬断言）**：运行期间测试侧枚举进程映像路径（PowerShell `Get-CimInstance Win32_Process` 读 `ExecutablePath`，轮询至超时），命中 `release/win-unpacked/resources/ms-playwright/` 下的浏览器进程 = 过、超时 = 失败 ⇒ 未登录 ⇒ 终态 `needs_human`/`E_LOGIN_REQUIRED`（风控则 `E_CAPTCHA_OR_RISK`，同属预期））· 段 D 首启（空 userData ⇒ 窗口存在 ∧ 激活页 =「接入指引」∧ `[data-field=mcp-url]` == 实际地址 ∧ 日志「首次运行」行；读数 = b2 既有 CDP 读 DOM 接缝；接缝实现见 T5） |
| P3 无 Node 环境替代判据（在 P2 内执行） | 段 B/C 的启动环境 = 剥 `ELECTRON_RUN_AS_NODE` + `PATH` 只留系统目录（不含 Node 安装目录）⇒ 仍全过 = 「引擎 / 浏览器不依赖系统 Node」的机制读数；**与真换机的差距**（本机 Edge 仍在、系统差异）如实记——AC-R6-2 / AC-R6-3 / AC-R9-3 以 M1 为准 |
| P4 回归 | b1/b2 命令全绿（`verify:mcp` / `verify:engine` / `verify:loop` / `verify:runtime` / `verify:settings` + `b1-core-loop.units.mjs` / `b2-settings-ui.units.mjs`）：六件套 / `/healthz` 载荷 / 错误码表 / 配置 schema 既有键 / manifest / `runtime.json` 字段不变；`channel` 默认值改动只影响缺失键补齐（测试夹具均显式写 browser 段，不受影响）；首启开窗对既有测试的影响核对一遍（各夹具启动前均写 config） |
| P5 单元：`node --test docs/batches/b4-package-ship.units.mjs` | packaging 两态路径 / `extraEnv` 合成 / 首建标记 / 新默认值（`channel=''`）；**跑法前提** = packaging 纯 Node 件（入参注入、不 import electron——见 T4） |

**人工场景（M1–M5；操作 → 判据）**

| # | 场景 | 操作 | 期望（判据） |
|---|---|---|---|
| M1 | **换机全流程**（AC-R6-2 · AC-R6-3 · AC-R9-3） | 另一台**未装 Node、未额外装浏览器**的 Windows PC：拷入安装包 → 安装 → 首启 → 用界面片段 / 导出文件接入宿主 → 派单取件一次 → 卸载 | ① 安装可改目录、无 UAC；桌面 + 开始菜单快捷方式；② 首启设置窗口自动打开（页 = 接入指引）、实际地址可见（`runtime.json` 就位）；③ 宿主探活通过、派单取件一次（outbox 出现 `state=done` 任务；平台首次人工登录一次）；④ 任务管理器核对浏览器进程路径 = 安装目录 `resources\ms-playwright\...`（非 Edge）——AC-R6-3 的机制读数；⑤ 卸载：安装目录清空、快捷方式移除、`%APPDATA%\free-outsource\` 保留 |
| M2 | 打包外观与交互 | 安装器 / 应用 / 快捷方式 / 首启窗口逐项目视 | 中文正确、图标正常；SmartScreen 提示（未签名，**已知项、不判失败**——R6 边界）以实际出现为准记录 |
| M3 | 首启引导（F6.3；人工一步） | 空 userData 首启 | 窗口自动打开 ∧ 当前页 =「接入指引」∧ 实际地址与复制可见 ∧ 登录引导路径可用（「打开并检查」⇒ 窗口留人工） |
| M4 | 随包文档 | 设置界面点「打开随包文档」 | 打开安装目录 `guide/agent-onboarding.md`（非仓库路径） |
| M5 | 卸载残留 | 控制面板卸载后逐项核对 | 见 `docs/batches/b4-package-ship.checklist.md` §6（与 M1-⑤ 同源） |

**M1 不可执行时的口径**：无第二台机器 ⇒ 以 P2/P3 本机读数 + M2/M3/M4 本机执行 + checklist 全项留档；AC-R6-2 / AC-R6-3 / AC-R9-3 的「换机操作」判据**挂账为未闭环人工项**（收口时记读数与差距），不以本机替代判据冒充通过。

### 边界与禁止范围

- **本批只加：打包配置 + 构建期脚本 + 打包态运行期接线**（文件计划列举的 **9 项 src 文件（含 1 新增）** + `package.json` 脚本 / 依赖 + `.gitignore`；逐项两态判据见「打包态 / 开发态两态对照」）；**不改 b1/b2 已定契约**：MCP 六件套 / 端点 / 错误码表 / `runtime.json` 字段 / 配置 schema 既有键语义 / manifest / 引擎 JSON-RPC 四方法。
- 不改 MCP 工具面；不改设置界面既有交互（首启开窗与**初始页接缝** = 新增一条产品路径：`open(initialPage)` 经 `loadFile` 的 `query` 传 `?page=`、渲染层启动时读取校验；页签 / 面板 / 交互不动，无参数时行为同 b2——不扩 IPC 面、不用 executeJavaScript）。
- `docs/**` 不进 asar；安装包不含 `probe/**` · `test/**` · 批次档 / 随批清单；随包文档仅 ①④。
- 不做：代码签名 / 自动更新 / 便携版 / b3 Kimi / 登录态迁移 / 宿主配置改写 / 首启下载浏览器。
- 构建产物不入库（`release/` · `dist/` · `.playwright-browsers/`）；临时产物一律 `.thincoder/tmp/`；测试不碰真实 `%APPDATA%` 与真实 outbox。
- 环境口径（沿用）：起应用必剥 `ELECTRON_RUN_AS_NODE`（引擎子进程本身以它为机制）；中文路径命令行加引号；中文断言 UTF-8 感知。

### 裁定落位与设计档同步（2026-10-10；两条同步均已落地）

- **裁定 ①（三处最小接线 · 准）**：落于 T2 / T3 / T4 与「文件计划」「两态对照」；dev 与测试路径行为不变（P4 守门）。
- **裁定 ②（`browser.channel` 默认改空 · 准，序约束）**：落于 T2-④；序约束 = 默认值改动与随包运行时同批进验收（P2 段 C 同验）；既有 config.json 不受影响（显式存值不动）。**设计档同步（已落地，2026-10-10 主 agent）**：`docs/design/overview.md:176` 配置样例已为 `"browser": { "mode": "chromium", "channel": "", "headless": false }`（语义：`chromium` = 随包 / `edge` = 系统 Edge；`channel` 显式存值时按存值）。
- **裁定 ③（F6.3 最小形态 · 准）**：落于 T5（含机器判据；初始页接缝 = T5 功能点第二项）。**设计档同步（已落地，2026-10-10 主 agent）**：`docs/design/modules/settings-app.md:10`（§1）已含「**首次启动引导（F6.3）**」条（首启 ⇒ 自动打开设置窗口并落在接入指引页）。
- **观察项（非本批任务）**：本批次档 §1 现为模板占位（状态「进行中（…）」）——本段以档头「来源」行 + 派单已知事实 + 需求 / 设计档为据起草；请父侧知悉（不影响本段执行）。

### 草案处置口径（`outbox/20261009-202608-7e7d/files/`，起点非定稿）

1. `electron-builder.yml`：`extraResources.from: "guide"` ⇒ `"docs/guide"`（**改路径、不加构建期拷贝步骤**——`extraResources` 与 `files` 白名单互不相干，`docs/guide` 可直接作源）；`directories.output: dist` ⇒ `release`（设计 §9 / AC-R6-1 权威）；`win.icon: build/icon.ico` 保留（图标随批新建）；NSIS 选项照采（`perMachine=false` / `allowElevation=false` / 可改目录 / 快捷方式 / `deleteAppDataOnUninstall=false` / `runAfterFinish`）；首行 `# file:` 注释剥离。
2. `package.json`：`# file:` 头**剥离**（草案非纯 JSON，落地以仓库现文件为基手改）；scripts `build` / `build:dir` ⇒ `dist` / `dist:dir`（AC-R6-1 命令名）；`postinstall` **不带入**（无原生模块）；`author` / `license` 保留。
3. `packaging-checklist.md` ⇒ `docs/batches/b4-package-ship.checklist.md`（**随批不随包**；「构建环境坑」节保留；补首启引导 / 失败读数记录栏）。

### 三链自检

本段条目（T1–T6）↔ 需求档 R6·F6.1–F6.3 / R9·F9.4 / AC-R6-1..3 / AC-R9-3 ↔ 设计档 overview §9 / §7 / §2.1 + browser-engine §3 + settings-app §3——三条链同源；两处设计缺口 / 不一致（F6.3 与 channel 默认）已按父侧裁定落位（两条设计档同步均已于 2026-10-10 落地）；「设置中可切 Edge」的界面控件差异已上抛（见「未决与上抛」），无未处置语义新增。

### 评审轮 1 定点修复（2026-10-10；eng-designer）

针对 `## §3 设计评审 · 轮次 1` 的 10 条裁定逐号落地（#10 / #11 由主 agent 已修，不在本清单）；改动均在上文对应段落**就地**完成，历史不留在正规面。

- **#1（🔴 首启落页缺接缝）**：补「初始页接缝（最小面）」——`src/settings/window.mjs:90` 的 `open(initialPage?)` ⇒ 新建窗口 `loadFile(PAGE_PATH, {query: {page}})`（Electron 公开面 `LoadFileOptions.query`，`node_modules/electron/electron.d.ts:22456-22469`）+ `src/settings/renderer.js:195` 的 `boot` 读 `location.search` 按 `PAGES`（`:10`）校验（缺省 / 非法 ⇒ `workers`）+ `wiring` 的 `openSettings(initialPage)` 透传 + `index.mjs` 首启调用处带 `'guide'`。落点：T5 功能点 / T5 验收 / 文件计划（+2 行：`src/settings/window.mjs` 170→~178、`src/settings/renderer.js` 220→~222，均无越档风险）/ 两态对照「首启开窗 / 初始页」/ 切分 2 文件域 / 冻结面（新增对接面条目）/ 边界。**未用 executeJavaScript 点页签类脆路径**；无 `?page=` 时与 b2 行为一致（P4 守门）。
- **#2（🟡 切 Edge 入口）**：T2-④ 与两态对照点名「配置文件手改 `browser.mode:'edge'` + 重启生效」（与 `mcp.port` 手改通道同列）；界面控件差异见下「未决与上抛」（**设计档措辞本轮不动**，等用户裁定）。
- **#3（🟡 浏览器镜像口径）**：T2-① 补 `PLAYWRIGHT_DOWNLOAD_HOST` 取值口径（默认候选 + 第 0 步实测确认 + 外部 env 优先）与失败读数（退出非零 + 打印实际下载源 / 目标目录）；「切片风险」表该行由「已实测」改为「中文路径 / npm 与 Electron 镜像（已实测）；浏览器二进制镜像（待实测）」并给备选与读数去向。
- **#4（🟡 `productName` 未钉）**：`electron-builder.yml` 职责显式列出 `productName: 免费外包` + NSIS `artifactName: "${productName}-${version}-setup.${ext}"`；P1 注明产物名 / 程序名唯一来源（`win-unpacked` 可执行名第 0 步构建实测确认，不符则显式补对应字段并回调 P1）。
- **#5（🟡 `packaging.mjs` 入参口径）**：T4 写明 `isPackaged` / `resourcesPath` / `execPath` / `appPath` 为**注入值**、模块自身不 import electron（同 `src/settings/wiring.mjs:4` 纯 Node 面法）；文件计划行与 P5 行同步点明「跑法前提」。
- **#6（🟡 段 C 读数通道）**：**选 ①-a = 测试侧进程映像枚举**（硬断言：`Get-CimInstance Win32_Process` 读 `ExecutablePath`，命中 `release/win-unpacked/resources/ms-playwright/` 下浏览器进程 = 过、超时 = 失败）；辅证 = 日志 `channel=随包 chromium`（读数已核：`channel` 空串 ⇒ `resolveBrowserOptions` 返 `undefined`（`src/engine/browser-config.mjs:51`）⇒ 日志按 `?? '随包 chromium'` 打印（`src/engine/browser.mjs:92`））；「非 Edge」换机口径归 M1-④。不选 ①-b（日志补可执行路径字段）的理由：须改 `src/engine/browser.mjs`（超出本批最小文件面），且进程实况比自述字段更直接。
- **#7（🟡 已落地项仍当待办）**：两条「设计档同步」改为已落地实况陈述（`docs/design/overview.md:176` / `docs/design/modules/settings-app.md:10`）；§2 状态行与「裁定落位与设计档同步」节题同步。
- **#8（🔵 尺寸标注）**：`src/main/config-schema.mjs` 现况 204 → **205**；`service.mjs` / `engine-client.mjs` 两行补越档处置口径（超 300 ⇒ 按 `index.mjs` 同法外提、无行为变化，拆分点实施时定）。
- **#9（🔵 引用漂移）**：`:247` → `:248`（R9·F9.4）、`:257` → `:258`（AC-R9-3）。
- **#12（🔵 体积口径）**：P1 注明 106MB = 未含随包浏览器的首次冒烟读数（`docs/batches/b4-package-ship.md:18`），随包后应显著高于 120MB。

**本轮附带的一致性修正**（非评审号，一并声明）：①「边界与禁止范围」src 文件计数 7 → **9**（新增 `window.mjs` / `renderer.js`，与文件计划同改）；②`wiring.mjs` 行补 `openSettings(initialPage)` 透传（≤ +4 → ≤ +5）；③冻结面新增「设置窗口初始页接缝」条目（切分 2 交付 / 切分 3 依赖的对接面）。

#### 未决与上抛

- **「设置中可切 Edge」的界面控件 —— 本批不交付，待用户裁定**：需求档 `docs/requirements/overview.md:21`（决策 C）/ `:182`（F6.2）与设计档 `docs/design/overview.md:250` 写「设置中可切『用系统 Edge』」，但设置界面无该控件（`src/settings/**` 无 browser 设置项）；实际可用通道 = 配置手改 `browser.mode='edge'` + 重启（`docs/guide/agent-onboarding.md:98` 已写）。本批 T2 按「配置文件手改 + 重启生效」点名口径交付；**界面控件不在本批交付**，设计档 §9 措辞暂不动——此属**需求措辞与实现口径的差异，由主 agent 向用户呈报裁定**（不单方降低需求）。
- 若用户裁定补界面控件：属新语义（新增界面控件 + `browser.mode` 的 patch 操作 + 对应两态判据），需另立条目走设计评审，不在本轮修订内。

## §3 设计评审（评审子代理）

### 轮次 1（评审子代理）

**评审对象**：b4 打包与换机 · §2 任务书（T1–T6 / 文件计划 7 新增 + 8 修改 / 3 份切分 / P1–P5 + M1–M5 / 边界）+ §1 父侧三条裁定（对象状态：待评审；触发：用户 2026-10-10 08:26「发起」）。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | 文件计划 / 清晰度 | 🔴 | T5 要求首启自动打开设置窗口并默认落在「接入指引」页，P2 段 D 把它做成机器判据（b4-package-ship.md:91「② **当前激活页 =「接入指引」**（`[data-page="guide"].is-active` + 面板可见）」），但现状无可选初始页的接缝：`src/settings/window.mjs:90`「function open() {」只做单例创建/聚焦（返回面 :158-168 无参）；`src/settings/renderer.js:201`「setPage('workers');」硬编码启动页；`src/settings/renderer.js:212`「window.FOUI = {」暴露面不含 setPage，渲染层不读 URL/hash（grep `location\.|hash` 无命中）。b4 文件计划只列 `src/settings/service.mjs`（:120）与 `src/settings/wiring.mjs`（:121），切分 2 文件域同样只到「`src/settings/{service,wiring}.mjs`」（:153），边界写「不改设置界面既有交互（首启开窗 = 新增一条产品路径，窗口与页签复用）」（:195）——按此文件域无法交付 P2 段 D。 | 把「可选初始页」接缝补进文件计划与切分 2 的文件域（`src/settings/window.mjs` / `src/settings/renderer.js`，必要时 `preload.cjs`），给出各自现况行数、预期增量与 300 档拆分判断，并补该接缝的两态判据；或在 T5/P2 段 D 改判为弱判据（窗口存在 + 接入指引页可一键到达）并说明理由。 |
| 2 | 需求覆盖 | 🟡 | 决策 C 与 F6.2 的「可切系统 Edge」入口在本批无落点：需求档 requirements/overview.md:21、:182 与设计档 design/overview.md:250「设置中可切「用系统 Edge」」都指向设置界面，但设置界面无该控件（grep `edge\|chromium\|browser\.` 于 `src/settings` 只命中外包工浏览器窗口相关行：`src/settings/index.html:91`、`src/settings/preload.cjs:25`、`src/settings/renderer-workers.js:157`）；实际通道是配置手改（随包指南 docs/guide/agent-onboarding.md:98「（也可在配置 `browser.mode = "edge"` 切用系统 Edge）」）。b4 把出厂默认切成随包 Chromium 却只写「切系统 Edge = `mode:'edge'`」（:71、:143），未点名入口与生效口径。 | 在 T2 / 「两态对照」点明切 Edge 的入口与生效口径（配置文件手改 + 重启生效，与 `mcp.port` 手改通道同列），并同步 design/overview.md:250 的「设置中可切」措辞为该口径（或另立需求条目承接界面控件）。 |
| 3 | 可行性 / 依赖 | 🟡 | 设计档把「Playwright 浏览器二进制镜像域名」的实测确认派给 b4（design/overview.md:252「Electron 二进制与 Playwright 浏览器二进制走镜像变量（`ELECTRON_MIRROR` / `PLAYWRIGHT_DOWNLOAD_HOST`），具体域名 b4 批实测确认。」），b4 §2 未承接：T2-① 与 `scripts/fetch-browsers.mjs`（:107「构建期下载随包 Chromium 至 `.playwright-browsers/`（幂等；失败退出非零）」）只提 `PLAYWRIGHT_BROWSERS_PATH`；`.npmrc` 实有 3 项（registry / `electron_mirror` / `electron_builder_binaries_mirror`，无 Playwright 浏览器源）；「切片风险」表却把「中文路径 / 镜像拉取」记为「已实测（第 0 步：NSIS 冒烟通过、中文路径可构建、`.npmrc` 双镜像）」（:166），与 §1 实测清单（:18，无浏览器二进制下载）不同口径。 | 在 T2/`fetch-browsers.mjs` 职责补镜像口径（`PLAYWRIGHT_DOWNLOAD_HOST` 取值与失败读数），并把 :166 的风险行改写为「浏览器二进制镜像待第 0 步实测」。 |
| 4 | 清晰度 | 🟡 | P1/M2 断言产物名与程序名为中文（:174「产物 `release/免费外包-<version>-setup.exe`（= `${productName}-${version}-setup.${ext}`」、`release/win-unpacked/` 下的 `免费外包.exe`），但配置项清单未钉住该名字来源：`electron-builder.yml` 职责只写「打包配置权威：asar / asarUnpack、files 白名单、extraResources」（:105），`package.json` 改动只写「scripts += …；devDependencies += `electron-builder`；补 `author` / `license`」（:117），而 `package.json:2` 的 `name` 为 `free-outsource`。产物名/exe 名由 `productName` 派生的默认规则**未验证**（仓库未安装 electron-builder，无法读其默认）。 | 在 `electron-builder.yml`（或 `package.json`）职责里显式列出 `productName`（必要时 `artifactName`），使 P1 的文件名断言与 `win-unpacked` 可执行名有唯一来源。 |
| 5 | 清晰度 / 可行性 | 🟡 | P5 以纯 Node 跑 `node --test docs/batches/b4-package-ship.units.mjs`（:178）验 `packaging` 两态，而 `src/main/packaging.mjs` 职责含需要 Electron 侧取值的 `hostScript`（`app.getAppPath()`）/`engineEnv`（`resourcesPath`）（:83、:106）；设计只说「纯函数，`isPackaged` 两态」而未给入参口径——若该模块直接 `import { app } from 'electron'`，纯 Node 进程无法加载，与 P5 的跑法冲突。项目已有同类先例（`src/settings/wiring.mjs:4`「service.mjs 为纯 Node 面（可脱 Electron 单测）」）。 | 在 T4/文件计划写明 `packaging.mjs` 的入参（`isPackaged` / `resourcesPath` / `execPath` / `appPath` 为注入值、模块自身不 import electron），使「纯函数可单测」与 P5 的跑法一致。 |
| 6 | 验收判据 | 🟡 | P2 段 C 的机制读数「进程映像路径含 `ms-playwright`（尽力而为断言、失败须报）」（:175）未定义读数通道：`grep ms-playwright\|executablePath\|chrome\.exe` 于 `src/**` 无命中；引擎唯一启动日志行只打 mode/channel/profile（`src/engine/browser.mjs:92`「启动浏览器 worker=${workerId} mode=${opts.mode} channel=${opts.channel ?? '随包 chromium'} profile=${profileDir}`），`engine.health` 只回 channel（`src/engine/host.mjs:60`「channel: browser.browserOptions.channel ?? null」）。「尽力而为」的断言既不能判失败也不能判通过。 | 为该断言指定确定读数通道（按进程映像路径枚举本次启动的浏览器进程，或给「启动浏览器」日志补可执行路径字段——后者须同时进入文件计划与两态判据）；或明确改为以日志 channel + P3 环境读数为准、把「非 Edge」核对留给 M1-④。 |
| 7 | 文档状态（R1/R7a） | 🟡 | §2 仍把两条「设计档同步项」当作待办（:22 状态行「（设计档同步项 2 条待主 agent 同步）」、:204「**设计档同步项（主 agent 同步，可回退）**…⇒ 应改为」），但两项在盘上已落地：`docs/design/overview.md:176` 已是「`"browser": { "mode": "chromium", "channel": "", "headless": false },`」；`docs/design/modules/settings-app.md:10` 已有「**首次启动引导（F6.3）**」条。失效的待办句留在正规面会让读者重开死项。 | 把这两条改为已落地的实况陈述（或删除），并同步 §2 状态行措辞；历史留在记录面。 |
| 8 | 受影响文件尺寸标注 | 🔵 | 抽查：标注与实况一致（±1 内）——`package.json` 24 ✓ · `src/main/index.mjs` 296 ✓（`writeRuntimeFile` :215-227 / `removeRuntimeFile` :277-286 引用准确）· `src/main/engine-client.mjs` 291 ✓（:56-67 spawn env 引用准确）· `src/settings/service.mjs` 293 ✓（:22 GUIDE_PATH 引用准确）· `src/settings/wiring.mjs` 78 ✓ · `src/main/config.mjs` 104 ✓（:77-104 loadConfig 引用准确）· `.gitignore` 19 ✓ · `src/main/config-schema.mjs` 标注 204、实为 205。越档处置齐备（index.mjs 296+7>300 ⇒ 给出 `runtime-file.mjs` 搬迁计划，:118）。余量：`src/settings/service.mjs`（293）标 `≤ +6` ⇒ 299，距 300 档仅 1 行且无越档处置；`src/main/engine-client.mjs`（291）标 `≤ +6` ⇒ 297。 | 给 `service.mjs`（必要时 `engine-client.mjs`）补越档处置口径（或明确「超预算即按 index.mjs 同法外提」），并把 `config-schema.mjs` 的现况行数改为 205。 |
| 9 | 引用纪律 | 🔵 | 覆盖链两处行号各差 1：:32「**R9·F9.4**（`:247`）」实为 :248（:247 是 F9.3），「**AC-R9-3**（`:257`」实为 :258（:257 是 AC-R9-2）。同段其它引用核对无误（`docs/requirements/overview.md:175-193` · `docs/batches/b1-core-loop.md:212` 的 ~200MB 预期）。 | 修正这两处行号，或按文档地图的引用约定改为节名引用。 |
| 10 | 文档归属（地图） | 🔵 | 评审上下文声明未找到文档地图，但仓库存在 `docs/README.md`（:4「新建文档必须先在本表登记再落文件」）。按该规则，本批新落的 `docs/batches/b4-package-ship.checklist.md`（:111）与批次档 b4 自身都不在索引表内（§1 只列到 b1/b2，:21-22）；随批单元件 `docs/batches/b4-package-ship.units.mjs` 有先例（`b1-core-loop.units.mjs`），不越规。 | 在 `docs/README.md` §1 登记 b4 批次档与随批清单，或在地图里明确「批次档 / 随批清单一律不入索引」的口径。 |
| 11 | 文档卫生 | 🔵 | §1 仍是「**状态行**：🔄 进行中（…）」（:6）并留着 `<§1 模板占位：本批条目 / 关键判据 / 授权口径>`，而 §1 实际已有内容（:13-16 三条父侧裁定齐备，与评审声明一致）；§2 自己也记为观察项（:206）。 | 把 §1 状态行与占位行收成实况，或明确 §1 的收口时点。 |
| 12 | 读数口径（数字漂移） | 🔵 | 同一档内两处体积读数并列而无口径说明：§1 记「本机已实测…（成品约 106MB）」（:18），P1 写「预期 150–250MB 级…机器断言 ≥ 120MB」（:174）。两者可自洽（106MB 那次未含随包浏览器），但读者会读成矛盾。 | 在 P1 的体积辅助判注明「106MB 为未含随包浏览器的首次冒烟读数，随包后应显著高于 120MB」。 |

**计数**：🔴 1 · 🟡 6 · 🔵 5（共 12 条）。

VERDICT: changes-required

## §4 用户批准（主 agent）
## §5 实施记录（eng-coder）
## §6 验证与收口（父代理）
