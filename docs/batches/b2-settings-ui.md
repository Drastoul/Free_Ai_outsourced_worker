# 2026-10-09 · b2 设置界面
> 六段 append-only，一段一作者：§1 讨论（主 agent）· §2 批次任务与设计（eng-designer）· §3 设计评审（评审子代理）· §4 用户批准（主 agent）· §5 实施记录（eng-coder）· §6 验证与收口（父代理）。
> 编制：主 agent · 2026-10-09 · 来源 = 用户 2026-10-09「按顺序完成其他流程」+ 需求档 R4/R5（设置界面）+ 设计档 modules/settings-app.md（b1 已评审批准）。
> 台账 = #4/#5（免费外包 · 归批）。前情 = docs/batches/b1-core-loop.md §6（已收口 2026-10-09）。
## §1 讨论（主 agent）
**状态行**：已收口 2026-10-10（四切分 + 定点修全部落地并父侧核验（verify:settings 6/6 · b2 单元 35/35 · b1 回归五项全绿含真机 loop 1/1）；跨切分评审轮 1 changes-required → 修 → 轮 2 pass；本批修 3 处真缺陷；M1–M9 中 7 项需人工（M2/M4/M5 受平台风控阻塞））
<§1 模板占位：本批条目 / 关键判据 / 授权口径>
## §2 批次任务与设计（eng-designer）
**状态行**：设计完成（T1–T12 · 文件计划 · 实施切分 · 验收 · 边界（2026-10-09）；评审修复（2026-10-09）已落盘——11 条发现处置：9 改 + ⑪ 入实施前置 + ⑨ 非问题；4 条上抛均已裁定（闭合）；待主包AI 核验、用户批准）
<§2 模板占位：本批条目（覆盖） / 设计档落点 / 机制设计 / 受影响文件与测试面 / 验收对照 / 关键决策 / 上抛项>

### 本批（b2）范围与覆盖

覆盖需求条目（三条链同源：需求档 R 条目 ↔ 设计档验收回指 ↔ 本段）：**R5**（设置界面：新增 / 删除 / 调序 / 自定义名 / 登录状态与最近检查 / 即时落盘 / 交付目录 F5.7）· **R7②③**（应用内「接入指引」页与可复制片段：F7.2 / F7.3 的界面侧）· **R8 界面侧**（「深度思考 / 联网搜索」开关的呈现）· **R9 界面侧**（实际地址显示 / 两形态复制 / 一键导出 F9.6 / 登录引导呈现 F9.4 / AC-R9-4 的界面对照面）；关联复测 **R4** 的界面载体（自定义名 = 指定标识；调序 = 优先级）。

**不在本批**：R6（打包 .exe，b4）· R9 换机操作（AC-R9-3，b4）· Kimi 等平台适配器（b3；新增平台里灰显「待支持」）· MCP 工具面扩展（禁止——六件套封闭）· 托盘「我已处理（清除外包工冷却）」既有行为（b1 已交付，不改语义）。

**设计档落点**（b1 已评审批准；本批含两处设计增量，见「评审修复」小节）：

- `docs/design/modules/settings-app.md` —— 本批核心：四页面与交互、§7 配置同步、§8 验收判据。
- `docs/design/overview.md` §7（四载体分工：②③ 随 b2）· §2.3（实际端口；接入片段两形态形状）· §3.1（`src/settings/**`）· §4（配置存储：原子写 / schema / `.bak` / 优先级单一来源）· §8（设置界面架构级）。
- `docs/design/modules/outbox.md`（F5.7 实际路径解析与回落、落点唯一性）· `mcp-server.md`（六件套契约——界面不得扩工具面）· `scheduler.md` §6（冷却与「我已处理」载体）· `browser-engine.md` §5（登录态检查时机：缓存 + 手动「打开并检查」）。

### 条目表（T1–T12）

每条 = 模块目标 / 功能点 / 边界（明确不做什么）/ 验收判据 / 依赖。判据的机器实现 = 「验收命令」表；AC 编号 = 需求档验收条目。

**T1 设置窗口与托盘入口**（设计 §1；决策 D）
- 目标：用户从托盘打开一个独立的简洁设置窗口来管理本工具。
- 功能点：单窗口 `BrowserWindow`（本地 `index.html`；窗口从托盘进入）；四页签 = 外包工 / 接入指引 / 交付目录 / 关于；托盘菜单新增「打开设置」；再次打开 ⇒ 同一窗口（未销毁则聚焦，已销毁则重建——单窗口语义）。
- 边界：不做多窗口；不做开机自启 / 全局快捷键；窗口内不直接操作平台页面或浏览器。
- 验收：机器（verify:settings·a：窗口存在、四页签可见；关闭窗口后应用仍存活——`/healthz` 仍 200）。
- 依赖：T8 的 IPC 通道（前置接口）。

**T2 新增外包工**（F5.1）
- 目标：不手改配置文件即可登记一个外包工。
- 功能点：新增入口 → 选平台（DeepSeek 可选；Kimi 灰显「待支持」）→ 默认名 = 平台名（可改）→ 提交 ⇒ `workers` 追加（`enabled=true`、`toggles` 默认 `false/false`）→ 原子写 + 即时生效。
- 边界：不录账号密码；不预检登录态（登录引导归 T6）；平台清单 = 已注册适配器（b1 仅 deepseek）。
- 验收：AC-R5-1 —— 新增后 config.json 出现该条目 ∧ 经 MCP `list_workers` 与 `/healthz` 的 workers 双读可见（机器）。
- 依赖：T8。

**T3 删除外包工（二次确认）**（F5.2）
- 目标：移除不再使用的外包工，删除前有二次确认。
- 功能点：删除按钮 → 界面内确认框（提示「该外包工的浏览器配置目录保留」）→ 确认 ⇒ 从 `workers` 移除并落盘；取消 ⇒ 不动。
- 边界：不删除 `<userData>/profiles/<id>/`（设计 §2）；执行中的任务不受影响（任务内的 worker 引用已固定）。
- 验收：AC-R5-2 —— 确认框出现；确认后 config.json 与 `list_workers` / `/healthz` 均不再出现；取消后条目保留（机器）。
- 依赖：T8。

**T4 调整优先顺序**（F5.3）
- 目标：用上移 / 下移调整派单优先级。
- 功能点：上移 / 下移 ⇒ 直接改 `workers` 数组顺序（优先级单一来源 K12）；首 / 末项对应按钮禁用；落盘即生效。
- 边界：不做拖拽排序（按钮式）；不另存 priority 数字字段。
- 验收：AC-R5-3 —— config.json 顺序变化 ∧ `/healthz` workers 顺序随动（机器）；复测 AC-R4a-1：调序后不指定派单的选人随动（人工 M5，真机）。
- 依赖：T8。

**T5 自定义名与「指定调用」标识**（F5.4；R4b 的界面载体）
- 目标：外包工以用户起的名字被主包AI 指定调用。
- 功能点：行内改名（列表内唯一校验：空白 / 重复 ⇒ 拒绝并提示）；改名即改变指定调用用的名字；页面文案明示「主包AI 派单可指定外包工名；仅列表内已启用的外包工可被指定」。
- 边界：名字不做第二个用途；不允许同名（界面校验 + schema 隔离双保险）。
- 验收：AC-R5-4 —— 新名进 config.json 与 `list_workers`；`dispatch_task({worker:旧名})` ⇒ `E_WORKER_UNKNOWN` 且不建任务（机器）；新名真机派单 done（人工 M2）。复测 AC-R4b-1 / AC-R4b-2。
- 依赖：T8。

**T6 启用开关 + 状态显示 + 「打开并检查」（登录引导）**（F5.5；R9·F9.4 界面呈现）
- 目标：一眼看到每个外包工的可用状态；未登录时引导人工登录一次。
- 功能点：每行 = 状态徽标（ready / login_required / busy / unavailable / disabled + 最近检查时间）+ 启用开关（`enabled` 落盘、即时生效）；「打开并检查」⇒ 打开 / 复用该外包工浏览器窗口到平台页、判定登录态、写回状态与检查时间；未登录 ⇒ 即登录引导：窗口留给人工，并明示「登录态只存本机，换机后每个平台需重新登录一次」。
- 边界：不做自动轮询检查（缓存 + 手动检查）；检查不发送任何消息、不自动关闭窗口；该外包工执行中（busy）时按钮禁用（不干扰任务）；判定口径沿用 opening 阶段（未判定 / 超时 ⇒ `login_required`，保守交人工）。
- 验收：机器（verify:settings·k：动作 ≤ `limits.timeouts.openingMs` 内返回——状态徽标与最近检查时间更新，或界面明示错误；不悬挂、不静默）；人工（M1：未登录 ⇒ 窗口打开到 DeepSeek ⇒ 人工登录 ⇒ 再检查 ⇒ ready）。
- 依赖：T8；引擎侧检查通道（实施顺序切分 1；接口增量见「冻结接口」与上抛 1）。

**T7 外包工开关呈现（深度思考 / 联网搜索）**（R8 界面侧）
- 目标：开关随外包工登记时一并定好，派单自动应用。
- 功能点：每行两个开关（`toggles.thinking` / `toggles.search`，默认关），文案标注「派单时自动应用」；改动随其余设置即时落盘。
- 边界：不做每单临时覆盖（权威 = 外包工设置）；不造平台未提供的开关。
- 验收：AC-R8-2 界面侧 —— 改动落 config.json（机器）；改值后真机派单载荷随动（人工 M4；应用侧读数 = b1 `manifest.toggles`）。
- 依赖：T8。

**T8 配置即时落盘与失败回滚（横切）**（F5.6；设计 §7）
- 目标：界面上的每次改动即时落盘、即时生效；失败不静默。
- 功能点：渲染进程只经 IPC（**通道名以 `docs/design/modules/settings-app.md` §7 为准** = `fo:snapshot` / `fo:patch`；`window.fo` 八方法名见「冻结接口」）；主进程负责校验 → 原子写（临时文件 + rename）+ 上一版 `.bak` → 广播变更给窗口；写入失败（占用 / 权限）⇒ 界面弹错 + 回滚显示；单写者 = 主进程。
- 边界：不做文件监听（手改 config.json 下次启动生效——设计 §7）；渲染进程不直写文件；界面不提供 `mcp.port` / `mcp.host` 编辑（期望端口写入通道 = 文件手改——设计 §2.3 / §4）。
- 验收：AC-R5-5 —— 退出重启后改动保留（机器·l）；失败回滚 = 单元（写失败 ⇒ 保存抛错、不半写、内存配置不变、调用方得错误）× 人工（M8：config.json 置只读后改动 ⇒ 报错 + 回滚）。
- 依赖：b1 `ConfigStore`（`save` / `update` 已具备；写失败回滚为一行级加固）；无新依赖。

**T9 接入指引页（显示 / 复制 / 打开文档）**（R7②③；R9 界面）
- 目标：操作者一眼拿到当前实际地址并可复制，不用手抄。
- 功能点：显示服务状态（运行中 / 停止）、实际 MCP 地址 `http://127.0.0.1:<实际端口>/mcp`、备选 `/sse` 地址、版本号；一键复制两形态片段（按实际端口生成：`.mcp.json` 的 `mcpServers` 对象形 / `config.json` 的 `mcp.servers` 数组形）；复制走 Electron `clipboard`；页内明示接入顺序「先启动本工具 → 再在宿主里新增 MCP 服务器」；「打开随包文档」按钮（b4 随包后 = 安装目录 `guide/`；仓库开发期 = `docs/guide/agent-onboarding.md`）。
- 边界：不改写宿主私有配置；不联网（不加载任何远程资源）；不做在线文档站 / 多语言。
- 验收：AC-R7-2 界面侧（地址显示与一键复制可用）+ AC-R9-1 界面一致性 + AC-R9-2 界面片段来源 + AC-R9-4 界面片段 —— 机器（verify:settings·h：显示地址 == `runtime.json.url`；剪贴板 JSON 解析后 `mcpServers["free-outsource"].url` / `mcp.servers[0].url` == 实际地址（端口 = 实际端口）；片段按实际端口生成 ⇒ 端口变化自动随动）；人工（M7：字段与 ① 文档对照）。
- 依赖：T8（快照通道）；实际端口来源 = MCP 服务实况 / `runtime.json`（设计 §3）。

**T10 一键导出为文件**（R9·F9.6）
- 目标：两形态片段导出成文件，供用户或主包AI 读取后更新宿主配置。
- 功能点：导出目录 = `<userData>/export/`（界面显示实际路径 + 「打开导出目录」按钮）；导出 `.mcp.json`（项目根形态全文）与 `mcp-servers.json`（`mcp.servers` 数组形片段；读取后**并入**宿主配置）；每次导出按实际端口重新生成、覆盖刷新同一文件；界面文案明示「不要整文件覆盖宿主 config.json」。
- 边界：不写宿主目录；不弹系统保存对话框（出口与路径权威 = `settings-app.md` §3）；不改文件名。
- 验收：R9·F9.6 —— 机器（verify:settings·i：两文件存在、可 JSON 解析、端口 = 实际端口；重复导出覆盖刷新、不新增副本）；人工（M7 核对面）。
- 依赖：T8 / T9（生成器同源）。

**T11 交付目录页**（F5.7）
- 目标：用户明确知道产物落在哪里，并可修改与打开。
- 功能点：显示当前**实际**交付目录（配置值可用即配置值；不可用 ⇒ 显示回落路径 + 「已回落：<原因>」）；目录选择器；提交前校验（存在或可创建 ∧ 可写——复用 `dirHasWriteAccess`），失败 ⇒ 界面明确报错、**不落配置**；「打开目录」按钮（打开实际路径）；修改即时落盘、即时生效；运行期回落发生时本页同步显示实际落点。
- 边界：不静默接受不可写目录；不代删产物（outbox 是交付物，工具不主动删除、不自动清理）。
- 验收：AC-R5-6 界面侧两段 —— ① 选不可写 / 非法目录 ⇒ 报错 + 不落配置（机器·g）；② 运行期回落 ⇒ 界面 / 托盘 / 日志同步明示实际落点（人工 M3：先配可用目录、再令其不可用后派单）；改目录 ⇒ 新派单产物落新目录（人工 M3 尾）。
- 依赖：T8；`resolveOutboxDir` / `dirHasWriteAccess`（b1 已交付）。

**T12 关于页**
- 目标：版本与日志位置随手可查。
- 功能点：版本号；日志目录路径；「复制日志路径」按钮（Electron `clipboard`）。
- 边界：不做检查更新 / 外链；不导出日志内容。
- 验收：机器（verify:settings·j：版本 == package.json 的 version；剪贴板 == 日志目录）。
- 依赖：T8。

### 文件计划（改动与新增）

新增（`src/settings/**` 为本批新目录；行数为估算，实施后按实际回调）：

| 文件 | 职责 |
|---|---|
| `src/settings/preload.cjs` | contextBridge 暴露 `window.fo`（冻结接口见下）；不暴露 Node 能力（`contextIsolation` 开、`nodeIntegration` 关）；CJS 形态（沙箱预加载的稳妥形）。 |
| `src/settings/window.mjs` | 设置窗口控制器（主进程侧）：创建 / 显示 / 聚焦 / 关闭（应用常驻）；`webPreferences`（contextIsolation / preload）；IPC 注册与转发；配置变更广播。 |
| `src/settings/service.mjs` | 设置服务（主进程侧）：快照合成（服务状态 / 实际地址 / 实际交付目录 / 导出目录 / 日志目录 / 版本 / workers 视图）；patch 应用（校验 → 原子写 → 广播）；「打开并检查」编排（引擎 → 健康写回）；导出 / 打开路径 / 复制的落点。 |
| `src/settings/patches.mjs` | 配置变更纯函数 + 校验：`worker.add / remove / rename / move / setEnabled / setToggles / outbox.set`（重名 / 空白 / 平台白名单 / 移动边界 / 目录可用性以注入检查器判定）。 |
| `src/settings/fragments.mjs` | 两形态片段生成（纯函数，实际端口入参）：`.mcp.json` 对象形 / `mcp.servers` 数组形——形状与 `docs/design/overview.md` §2.3 一致。 |
| `src/settings/export.mjs` | 导出写入 `<userData>/export/`：`.mcp.json` + `mcp-servers.json`（复用 `writeJsonAtomic`；覆盖刷新）。 |
| `src/settings/index.html` · `src/settings/style.css` · `src/settings/renderer.js` | 四页签界面（无框架、本地资源、不联网；渲染脚本用经典 `<script>`——file:// 下最稳，不引打包器）。 |
| `src/engine/worker-check.mjs` | 引擎侧「打开并检查」：打开 / 复用该外包工浏览器会话（`BrowserHost.ensureSession` / `sessionPage`）→ 平台页（`opening.ensureOnPlatform`）→ 登录态判定（`opening.waitForLoginState`）；不发送消息、不关窗口；该外包工有在途任务时直接拒绝（不打扰执行中的任务）。 |
| `test/integration/settings.test.mjs` | `npm run verify:settings`（断言 a–l；超 300 行 ⇒ 按对象拆分）。 |
| `docs/batches/b2-settings-ui.units.mjs`（+拆件） | 随批单元（`node --test` 直跑；入口静态 import 聚合——沿用 b1 形态）。 |

修改：

| 文件（现况行数） | 改动 |
|---|---|
| `src/main/index.mjs`（254） | 接线：设置窗口控制器与服务实例化、托盘回调（打开设置 / outbox / 日志）、`FO_OPEN_SETTINGS` 接缝、`outbox-fallback` 事件转发到设置广播。 |
| `src/main/tray.mjs`（117） | 菜单新增「打开设置 / 打开 outbox / 打开日志」（回调经接线注入；未接线不显示死菜单项）。 |
| `src/main/config.mjs`（98） | `save` 失败回滚内存配置（写盘失败 ⇒ 内存与磁盘不漂移——T8 回滚语义的底层支撑）。 |
| `src/main/scheduler/workforce.mjs`（175） | `markChecked`：检查结果写回（ready 也记录检查时间；失败态沿用既有冷却语义与词表）。 |
| `src/main/scheduler/scheduler.mjs`（296） | `reportOutboxFallback` 增发 `outbox-fallback` 事件（+2 行；供设置页同步显示回落；内部增量，不改既有语义）。 |
| `src/engine/host.mjs`（166） | 路由新方法 `worker.check`（增量；四方法 `engine.health` / `task.run` / `task.cancel` / `engine.shutdown` 契约不变）。 |
| `package.json`（24） | scripts += `"verify:settings": "node --test test/integration/settings.test.mjs"`。 |

**冻结接口（切分之间的对接面基线；跨切分改动须双方同步）**

- `window.fo`（preload 暴露面）：`getSnapshot()` 只读快照 · `patch(op)` 返回 `{ok, error?}` · `checkWorker(id)` · `copyText(text)` · `exportFragments()` · `openPath(kind)`（kind ∈ `outbox | export | logs | guide`）· `pickOutboxDir()` · `onChanged(cb)`（变更广播订阅）。
- patch 操作清单（T2–T7 / T11 的唯一写入口）：`worker.add {platform}` · `worker.remove {id}` · `worker.rename {id, name}` · `worker.move {id, dir:up|down}` · `worker.setEnabled {id, enabled}` · `worker.setToggles {id, toggles}` · `outbox.set {dir}`。
- 引擎方法（增量）：`worker.check`，入参 `{worker:{id, name, platform}}`；成功 `result = {status, detail?}`（status ∈ `ready | login_required | captcha | unavailable`，与 opening 词表同源）；失败走既有 `result.error` 口径；四方法不动。
- DOM 契约（渲染实现与测试断言的共同面）：页签 `[data-page]` + 面板 `[data-page-panel]`（激活类 `.is-active`）；外包工行 `[data-worker-id]`（行内 `[data-field=name|enabled|status|checked]` · `[data-toggle=thinking|search]` · `[data-action=up|down|delete|check]` · 行状态 `[data-state]`）；动作按钮 `[data-action=add-worker|copy-mcp-json|copy-mcp-servers|copy-logs-path|export|open-outbox|open-export|open-guide|pick-outbox-dir|add-worker-cancel|confirm-yes|confirm-no]`；对话框与列表 `[data-add-dialog]` · `[data-platform-list]` · `[data-platform=<id>]`；确认框 `[data-confirm]`；显示节点 `[data-field=mcp-url|sse-url|version|outbox-actual|outbox-note|export-dir|logs-dir|confirm-text|notice|service-status|service-note|about-version|workers-empty]`；共享面 `window.FOUI.refresh`（无 DOM 钩子，测试驱动用——见切分③ 的实现与切分④ 的驱动件）。

### 实施顺序（并行切分；文件域互不重叠）

| 切分 | 文件域 | 交付判据 |
|---|---|---|
| 1 · 引擎检查通道 | `src/engine/host.mjs` · `src/engine/worker-check.mjs`（复用 `src/engine/opening.mjs`，不改其行为） | 自证（`.thincoder/tmp/**`：本地 fixture 页 / mock 适配器驱动 `worker.check` 各状态）；`npm run verify:engine` 回归不破。 |
| 2 · 设置主进程面与接线 | `src/settings/{preload.cjs,window,service,patches,fragments,export}` · `src/main/index.mjs` · `src/main/tray.mjs` · `src/main/config.mjs` · `src/main/scheduler/{workforce,scheduler}.mjs` | 单元（patches / fragments / export / markChecked / config 回滚）；`FO_OPEN_SETTINGS=1` 起应用见窗口；`list_workers` / `/healthz` 不回归。 |
| 3 · 渲染界面 | `src/settings/{index.html,style.css,renderer.js}` | 四页签可用（配合切分 2 接缝自查）；DOM 契约在位。 |
| 4 · 测试与验收面 | `test/integration/settings.test.mjs` · `docs/batches/b2-settings-ui.units.mjs`（按需拆件）· `package.json` | `npm run verify:settings` 全绿 + 单元全绿 + `node --check` 全改文件。 |

- 并行与依赖：1、2 可立即开工（接口 = 上「冻结接口」）；3 按冻结接口并行起草、联调依赖 2；4 的用例可先行起草，跑绿依赖 2 + 3（k 断言还依赖 1）。
- 顺序硬约束：2 的 `preload.cjs` / `window.mjs` 先落（解锁 3 的联调）。
- 收口回归（父侧）：b1 五条命令（`verify:mcp` / `verify:engine` / `verify:loop` / `verify:runtime` + 单元）+ 真机场景（人工清单）。

### 验收命令与人工场景

命令与读数口径：

| 命令 | 断言（读数） |
|---|---|
| `npm run verify:settings`（新增；集成；自控应用启停；Playwright `_electron` 驱动真实应用——依赖已具备：electron 44.7.0 / playwright 1.64） | a 窗口与四页签；b 新增 ⇒ config.json + `list_workers` / `/healthz`（AC-R5-1）；c 删除 + 确认框（AC-R5-2）；d 调序 ⇒ config 与 `/healthz` 顺序随动（AC-R5-3）；e 改名 + 旧名 `E_WORKER_UNKNOWN` 且不建任务（AC-R5-4）；f 开关 ⇒ config `toggles` 随动（AC-R8-2 界面侧）；g 交付目录两段：非法路径被拒且不落配置、合法路径落盘并显示实际路径（AC-R5-6 界面侧）；h 显示地址 == `runtime.json.url` + 两形态复制 == 实际地址（AC-R7-2 界面侧 / AC-R9-1 / AC-R9-2 界面片段来源）；i 导出两文件 + 覆盖刷新（R9·F9.6）；j 关于页版本 + 日志路径；k 检查动作 ≤ `openingMs` 返回、状态更新或界面明示错误（F5.5）；l 退出重启后改动保留（AC-R5-5）。 |
| `node --test docs/batches/b2-settings-ui.units.mjs` | 单元全绿：patches 校验（重名 / 空白 / 移动边界 / 平台白名单 / 非法目录拒绝）· fragments 两形态（JSON 可解析 + 字段形状 + 端口参数化）· export 写入与覆盖刷新 · markChecked 写回（ready 记时间 / 失败态映射）· config 写失败回滚 · 检查编排结果映射（fake engine：ready / login_required / captcha / unavailable / 引擎错误）。 |
| `node --check <全部改动文件>` | 全部 OK（实施自证；收口复核读一次）。 |
| 回归：b1 五条命令 | 契约面未被触碰：六件套恰六个、`/healthz` 载荷不变、错误码表不新增；父侧收口时跑。 |
| 称谓检索（AC-R2-1 复测口径；UTF-8 感知） | `docs/**` + `src/**`（含 `src/settings/**` 的界面文案常量）：调用方一律「主包AI」；唯一例外 = 术语表「宿主」（仅传输 / 进程语境）。 |

环境口径（b1 已固化，沿用）：起应用一律剥 `ELECTRON_RUN_AS_NODE`；主进程入口沿用 `app.whenReady().then(main)`（勿改顶层 await——会互锁挂死）；测试用 `FO_USER_DATA` 隔离到 `.thincoder/tmp/verify-settings/`（不碰真实 `%APPDATA%`）；测试配置沿用 `verify:runtime` 写法（`browser.mode="edge"`，避免依赖未安装的随包 Chromium）；优雅退出沿用 `--quit`；新增测试接缝 `FO_OPEN_SETTINGS=1`（启动即打开设置窗口——开发 / 测试口径，与 `FO_USER_DATA` / `--quit` 同列）；中文断言一律 UTF-8 感知方式。

人工场景（操作 → 期望）：

| # | 场景 | 操作 | 期望（判据） |
|---|---|---|---|
| M1 | 登录引导（F5.5 / R9·F9.4） | 未登录平台 → 点「打开并检查」 | 浏览器窗口打开到 DeepSeek；登录引导文案可见（含「登录态只存本机，换机后每个平台需重新登录一次」）；人工登录后再点 ⇒ 状态 ready、最近检查时间更新。 |
| M2 | 改名正路径（AC-R5-4） | 改名后以新名真机派单 | 任务 done、outbox 出新目录（拒绝侧已由机器覆盖）。 |
| M3 | 交付目录回落与改点（AC-R5-6 运行期侧） | 先配可用目录 → 撤权 / 拔盘（或改名目录）使其不可用 → 派单 | 新单按回落策略落 `%USERPROFILE%\免费外包\outbox`；界面显示「已回落：<原因>」（页面打开时同步实际落点）+ 托盘 / 日志明示（不静默丢产物）；改回可用目录后新派单产物落配置目录。 |
| M4 | 开关载荷（AC-R8-2） | 界面改开关 → 真机派单 | `manifest.toggles.payload` 两键随动、`ok=true`（读数）。 |
| M5 | 调序选人（复测 AC-R4a-1） | 调序后不指定派单 | `manifest.worker` = 新首位、`selection.mode=priority`。 |
| M6 | 托盘三入口（设计 §1） | 点「打开设置 / 打开 outbox / 打开日志」 | 分别打开设置窗口 / 实际交付目录 / 日志目录。 |
| M7 | 与文档对照（AC-R9-4） | 界面显示（地址 / 端口 / 导出目录 / 字段名）对照 ① `docs/guide/agent-onboarding.md` | 字段名与口径一致（「以应用显示为准」）。 |
| M8 | 写失败回滚（T8） | 把 config.json 置只读 → 界面改动 | 明确报错 + 显示回滚（不静默）；恢复可写后改动成功。 |
| M9 | 单实例 | 应用运行中重复启动 | 不出现第二实例；设置窗口行为按上抛 2 的裁定。 |

### 边界与禁止范围

- **不做 b3 / b4**：Kimi 等适配器；打包、随包 `guide/`、换机验收（AC-R9-3）——「打开随包文档」在开发期指向仓库 `docs/guide/`。
- **不扩 MCP 工具面**：六件套封闭；不新增工具 / 端点 / 错误码；`tools/list`、`/healthz` 载荷、错误码表与 b1 同源一致（回归命令守门）。
- **不改 b1 已定契约**：引擎四方法语义不变（`worker.check` 为增量）；manifest 字段、`runtime.json` 字段、配置 schema 既有键语义不变。
- **界面不编辑 `mcp.port` / `mcp.host`**（期望端口写入通道 = 文件手改；设计 §2.3 / §4）。
- **渲染进程不直接触达文件系统与浏览器**（只经 IPC）；**不联网**（页面不加载任何远程资源）。
- **不写宿主私有配置文件**（导出仅写 `<userData>/export/`）；**不代登录、不存账号密码**；不做主题 / 皮肤。
- **不做文件监听**（手改 config.json 下次启动生效）；不做登录态自动轮询。
- **不删除** `<userData>/profiles/**`（删除外包工保留浏览器配置目录）；测试不碰真实 `%APPDATA%`；临时产物一律 `.thincoder/tmp/`。

### 上抛项（请主包AI / 评审裁定）

1. **引擎检查接口为增量（已裁定 2026-10-09，闭合）**：设计档「打开并检查」要求打开 / 复用浏览器窗口并刷新登录态（`settings-app.md` §2、`browser-engine.md` §5），但引擎接口摘要（`scheduler.md` §10）未列对应方法——本段按最小增量冻结为 `worker.check`（形状见「冻结接口」），四方法契约不变。（命名与形状已定，见「评审修复」小节与 `docs/design/modules/scheduler.md` §10。）
2. **二实例唤起的行为（已裁定 2026-10-09，闭合）**：设计档写「二实例启动时唤起已运行实例」（`overview.md` §2.1）；现行为 = 托盘通知（b1）。建议 = 打开 / 聚焦设置窗口（已定，见「评审修复」小节与 M9 判据）。
3. **导出出口口径（已裁定 2026-10-09，闭合）**：按设计档 `settings-app.md` §3 执行——固定导出目录 `<userData>/export/` + 「打开导出目录」按钮 + 每次覆盖刷新同一文件；不用系统保存对话框。任务书文字（转述）与设计档不一致处以此裁定为准，留痕见本条。
4. **四载体③的释义（已裁定 2026-10-09，闭合）**：按设计档 `overview.md` §7 执行——② = 应用内「接入指引」页、③ = 可复制的 MCP 配置片段（两形态；生成器为权威）；不做独立「多宿主静态样例汇总页」（属设计档新增范围，本批不做）。任务书文字（转述）与设计档不一致处以此裁定为准，留痕见本条。

### 起草自检补行（2026-10-09）

- **T1 的托盘范围（一致性补行）**：托盘菜单三入口 = 「打开设置 / 打开 outbox / 打开日志」（设计 §1）；T1 功能点、文件计划 `tray.mjs` 行与人工场景 M6 三处同源——以「三入口」为准。

### 评审修复（2026-10-09；轮次 1 评审 11 条发现逐条处置）

**裁定口径（主包AI）**：9 条改动（①②③④⑤⑥⑦⑧⑩）+ 1 条入实施前置（⑪）+ 1 条判非问题（⑨）；计数 = 🔴 0 · 🟡 7 · 🔵 4。本节「原 ⇒ 现」为现行口径；与上文冲突处以本节为准（上文为修订前原文，留痕不改——同 b1 §2 追加块形式）。

**① 设计档落点措辞**：原「（已评审批准；本批不改设计档）」⇒ 现「（b1 已评审批准；本批含两处设计增量——均已于设计档落定）」：

- `docs/design/modules/scheduler.md` §10 —— `worker.check` 增量（b2；2026-10-09 主包AI 裁定）。
- `docs/design/overview.md` §2.1 —— 二实例启动 ⇒ 唤起已运行实例：打开并聚焦设置窗口（b2；2026-10-09 主包AI 裁定）。
- 其余落点（settings-app.md / outbox.md / mcp-server.md / browser-engine.md 各节）照上文引用，内容不变。

**② 上抛 1／2 结案 + M9 判据 + 变更记录**（结案形式同上抛 3／4：「已裁定…（闭合）+ 留痕」）：

- 上抛 1 原「（待裁定）」⇒ 已裁定（2026-10-09，闭合）：`worker.check` 命名与形状按「冻结接口」确认（入参 `{worker}`；成功 `{status, detail?}`；失败走既有 `result.error`；四方法契约不变）；deadline 口径见 ⑤。
- 上抛 2 原「（待裁定）」⇒ 已裁定（2026-10-09，闭合）：二实例行为 = 打开 / 聚焦设置窗口（落 `overview.md` §2.1）；实施项见 ③。
- M9 判据：原「设置窗口行为按上抛 2 的裁定」（自指、不可观测）⇒ 现「重复启动不出现第二实例；已运行实例的设置窗口被打开并聚焦（窗口未销毁 ⇒ 聚焦；已销毁 ⇒ 重建后聚焦）」。
- `overview.md` 变更记录补 §2.1 增量一行（2026-10-09）——本轮已落设计档。

**③ 二实例实施项**：文件计划 `src/main/index.mjs` 行（原「接线：设置窗口控制器与服务实例化、托盘回调（打开设置 / outbox / 日志）、`FO_OPEN_SETTINGS` 接缝、`outbox-fallback` 事件转发」）⇒ 现增「二实例处理（`second-instance`）：打开 / 聚焦设置窗口（现行为止于托盘通知——`src/main/index.mjs:51`；`:36` 注释同步更新）」；切分 2 交付判据增自证读数：二次启动 ⇒ 不出现第二实例 ∧ 原实例设置窗口被打开并聚焦。

**④ 受影响文件表补预期增量**（估算，实施后按实际回调）：

- 修改表逐行补「预期增量」：`index.mjs`（254）≤ +40（预计 ~294）；`tray.mjs`（117）≤ +15；`config.mjs`（98）≤ +8；`workforce.mjs`（175）≤ +15；`scheduler.mjs`（296）+2；`host.mjs`（166）≤ +20；`package.json`（24）+1。
- `index.mjs` 若实测 >300 ⇒ 拆分计划 = 设置接线段（控制器 / 服务实例化 / 回调转发）外提 `src/settings/` 新件、index.mjs 单行调用。
- 新增表补「预计行数」列：`preload.cjs` ~40 · `window.mjs` ~120 · `service.mjs` ~180 · `patches.mjs` ~120 · `fragments.mjs` ~60 · `export.mjs` ~60 · `index.html` ~110 · `style.css` ~90 · `renderer.js` ~220 · `worker-check.mjs` ~120 · `settings.test.mjs` ~280（超 300 ⇒ 按对象拆分）· `b2-settings-ui.units.mjs`（+拆件）~250。

**⑤ `worker.check` 预算口径**（deadline 来源裁定）：

- 来源 = 主进程：设置服务调用 `worker.check` 时按 `limits.timeouts.openingMs` 设本次调用显式超时（`EngineClient.call` 的 `timeoutMs` 选项——`src/main/engine-client.mjs:208`）；不得沿用默认 30s（默认 < 默认 openingMs 60s ⇒ 慢检查必被误杀）。
- 晚到结果处置：超时 ⇒ 该次检查结果丢弃（在途请求超时即删——`engine-client.mjs:226-230`；晚到响应按既有「无对应在途请求」忽略——`:274`）；界面按超时示错（不悬挂、不静默）；下一次检查可重取。
- 不给引擎加预算入参（引擎不读配置——单一事实源口径同 `scheduler.md` §10 首条 `toggles`）；设计档 `scheduler.md` §10 已补同口径。
- 验收 k 细化：检查动作 ≤ `openingMs` 返回——口径 = 显式调用超时；超时 ⇒ 界面示错（该次结果丢弃、下一次可重取）。

**⑥ T3 边界（在途任务两类）+ 确认框文案 + 验收补条**：

- 边界原「执行中的任务不受影响（任务内的 worker 引用已固定）」⇒ 现「在途任务分两类——执行中：不受影响（任务内 worker 引用已固定）；排队中：出队复核按既有语义处置——该外包工不可用 ⇒ 降级到下一个可用外包工，无可用 ⇒ 终态 needs_human（`workforce.mjs:87` / `scheduler.mjs:106-117`）」。
- 确认框文案原「（提示「该外包工的浏览器配置目录保留」）」⇒ 现补「已排队的任务会改派或转人工」。
- 验收补条（机器）：单元增 `recheckQueued` 删除外包工后的排队处置（被删 ⇒ 改派到下一可用 / 无可用 ⇒ needs_human；指定任务 ⇒ 终态）——b1 units 未覆盖该路径。

**⑦ T9 未启动 / 顺延口径 + verify h 分段**：

- T9 功能点原「显示服务状态（运行中 / 停止）」⇒ 现「显示服务状态——运行中（显示实际地址与片段）/ 未启动（无 `runtime.json` ⇒ 「未启动」+ 原因 / 建议）/ 端口顺延（实际 ≠ 期望 ⇒ 显示实际地址 + 提示「宿主配置需更新」）」。
- 未启动原因 / 建议口径 = `overview.md` §2.3：「端口不可用——释放占用端口的程序，或改写 `mcp.port` 期望端口后重启」。
- verify h 原「显示地址 == `runtime.json.url` + 两形态复制 == 实际地址」⇒ 现 h 两段：① 服务已启动 ⇒ 显示地址 == `runtime.json.url`、复制 == 实际地址（顺延时随实际端口 + 「宿主配置需更新」提示）；② 服务未启动（无 `runtime.json`；夹具 = 占满期望端口 +1..+120 后起应用）⇒ 接入指引页显示「未启动 + 原因 / 建议」，日志同示（托盘沿用 b1）。
- 断言字母不增：仍 a–l（h 内分段）。

**⑧ `markChecked` 标注 + 记录形状 + 词表映射**：

- 标注：文件计划 `workforce.mjs` 行原「`markChecked`：检查结果写回（ready 也记录检查时间；失败态沿用既有冷却语义与词表）」⇒ 现「新增方法 `markChecked(workerId, {status, detail})`：检查结果写回」。
- 记录形状与语义（原未写明 ⇒ 现定）：形状 = 既有健康记录 `{status, detail, at, until}`（`workforce.mjs:16`）；成功检查替换既有健康记录（不叠加）。
  - ready / login_required ⇒ `until = null`（缓存态保留至下一次检查 / 任务结果 / 「我已处理」覆盖；login_required 不置冷却——冷却到期假性回 ready 不适用于登录态）。
  - captcha / unavailable ⇒ 沿用既有冷却（`until = now + COOLDOWN_MS`）。
- 词表映射（原缺失 ⇒ 现补）：引擎检查词表 ⇒ 界面徽标（= `list_workers` 对外词表）：ready / login_required / unavailable 同名直映；`captcha` ⇒ `unavailable`（detail「冷却中：验证码 / 风控」——既有一律映射：`mcp-server.md:54` / `workforce.mjs:99`）。
- busy / disabled 由 `list()` 既有合成（不属检查结果）；单元补 `markChecked` 写回用例按上述口径。

**⑩ T12 回指**：T12 关于页 行补来源回指：「来源 = 设计档 `settings-app.md` §6（关于页）——需求档 F5.1–F5.7 无「关于」项，属设计档已批准的额外面」。

**⑪ 实施前置（切分 4 第一步）**：

- 现状：`_electron` 真起本应用未证——只证到 API 面在场（`package.json:18/:21`；`node_modules/playwright-core/index.mjs:26` 导出 `_electron`）；b1 集成测试为直接 spawn electron 二进制（`test/integration/runtime.test.mjs:57-66`）。
- 判据：起应用 + 读一 DOM 节点 + 退出；通过 ⇒ 按原案（Playwright `_electron` 驱动）。
- 不通过 ⇒ 备选形态（沿用 spawn + `FO_OPEN_SETTINGS`，DOM 断言经 `--remote-debugging-port` + CDP 连接）；仍不通过 ⇒ 报主包AI 重切分。
- verify 表「（依赖已具备：electron 44.7.0 / playwright 1.64）」措辞同步改口径：依赖包在场；真起性 = 本前置。

**⑨ 判非问题（不改）**：DOM 契约不含平台选择 / 登录引导文案节点——M1 / M2 为人工场景核对，服务机器断言的契约不需要它们（主包AI 裁定）。

**上抛项状态（2026-10-09，评审修复后）**：4 条上抛均已裁定（闭合）——① `worker.check` 命名与形状：按冻结接口（增量，见 `scheduler.md` §10）；② 二实例行为：打开 / 聚焦设置窗口（落 `overview.md` §2.1）；③ 导出出口口径（留痕 = 原文上抛 3）；④ 四载体③释义（留痕 = 原文上抛 4）。原文「待裁定」字样为修订前历史表述，以本行与本节为准。

**数字自洽**：断言 = a–l（⑦ 为 h 内分段，不新增字母）；M1–M9 不变（⑥ / ⑦ 的补条落于单元与 verify h 分段，不新增人工场景）；单元行口径 = 原文 + ⑥ `recheckQueued` 用例 + ⑧ `markChecked` 细化；文件计划数字见 ④。

**本轮设计档改动（2026-10-09）**：`docs/design/overview.md`（变更记录补一行 + §2.1 注记）；`docs/design/modules/scheduler.md` §10（`worker.check` 补调用预算口径）。其余设计档未动（b1 已收口面不改）；`src/**` 未动。

## §3 设计评审（评审子代理）

### 轮次 1（评审子代理）

**评审对象**：本批 §2 任务书（T1–T12 条目表 / 文件计划 / 4 份切分与冻结接口 / 验收命令与人工场景 M1–M9 / 边界）+ 本批两处设计增量（`scheduler.md` §10 的 `worker.check`、`overview.md` §2.1 的二实例唤起）。b1 已批准收口部分不在范围。

**口径限制**：无 AGENTS.md / 无项目标准档 / 无文档地图 ⇒ 方法论与文档归属两项按在scope文档自述的规范判（批次档六段骨架、需求→设计→评审→批准→分批实施、设计档为权威）；需求内容清晰（`docs/requirements/overview.md` R5/R7/R8/R9 逐条可比对）。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Doc state | 🟡 | 本批自述「本批不改设计档」（b2-settings-ui.md:18「已评审批准；本批不改设计档」），但本批实际含两处设计增量（scheduler.md:115「**设置界面「打开并检查」的增量方法**（b2；2026-10-09 主包AI 裁定）」；overview.md:28「**二实例启动 ⇒ 唤起已运行实例：打开并聚焦设置窗口**。」） | 把「设计档落点」一节的措辞改为记录两处增量（落点 + 裁定日期），与 scheduler.md §10 的增量注记同源 |
| 2 | Doc state | 🟡 | 上抛 1／2 仍标「待裁定」（b2-settings-ui.md:202「引擎检查接口为增量（待裁定）」、b2:203「二实例唤起的行为（待裁定）」），而两处已在设计档落定（scheduler.md:115 注记「2026-10-09 主包AI 裁定」；overview.md:28 写明行为）；M9 判据自指 —— b2:187「设置窗口行为按上抛 2 的裁定」不可执行；overview.md 变更记录（:5–:11）亦无 §2.1 增量条目，与 scheduler.md §10 的内联裁定留痕形式不一致 | 按上抛 3／4 的「已裁定…（闭合）+ 留痕」形式同构处理 1／2；M9 判据改为可观测行为（重复启动不出现第二实例 + 设置窗口被打开并聚焦）；overview.md 变更记录补该增量一行 |
| 3 | Requirements/Clarity | 🟡 | overview.md §2.1 增量在本批无可实施项：`src/main/index.mjs` 的二实例处理仍是托盘通知（src/main/index.mjs:51「tray?.notify({ title: '免费外包已在运行', body: trayInfo() });」，:36 注释「b1 无设置窗口，以托盘通知与日志告知」），而文件计划的 index.mjs 行（b2:133）只列「设置窗口控制器与服务实例化、托盘回调（打开设置 / outbox / 日志）、`FO_OPEN_SETTINGS` 接缝、`outbox-fallback` 事件转发」——未含 second-instance 处理分支 | 在 index.mjs 的文件计划行补「二实例处理改为打开 / 聚焦设置窗口」；并在切分 2 的交付判据里给出可自证读数 |
| 4 | Affected-file annotations | 🟡 | 受影响文件表缺「预期增量」：修改表 7 行中仅 scheduler.mjs 标「+2 行」（b2:137），其余 6 行只给现况行数（实测与标称一致：index.mjs 254 / tray.mjs 117 / config.mjs 98 / scheduler.mjs 296 / host.mjs 166 / package.json 24），index.mjs（254）的增量未声明 ⇒ 无法判定是否跨 300 行档、亦无切分计划；新增表（b2:114）声称「行数为估算，实施后按实际回调」但无逐文件估算列（b1 表有「预计行数」列） | 每行补 `≤±N` 或「结构不变」；新增表补预计行数列；若 index.mjs 预计 >300 行，给出拆分计划 |
| 5 | Clarity/Acceptance | 🟡 | `worker.check` 无预算入参（scheduler.md:115 入参仅 `{worker:{id,name,platform}}`），而 AC-k 要求动作在 `limits.timeouts.openingMs` 内返回（b2:167「k 检查动作 ≤ `openingMs` 返回、状态更新或界面明示错误（F5.5）」）；既有 `EngineClient.call` 默认 30000ms 超时（src/main/engine-client.mjs:208）< 默认 openingMs 60000，超时即丢弃在途请求（engine-client.mjs:226-230 + :274「this.pending.delete(msg.id);」）⇒ 慢检查的写回结果会丢、徽标不更新；deadline 来源（引擎 DEFAULT_TIMEOUTS / 配置值 / 主进程调用超时）未定 | 在增量接口或设计档钉住 deadline 来源（参数透传配置值，或主进程按 openingMs 设调用超时并说明晚到结果的处理） |
| 6 | Acceptance/Edge | 🟡 | T3 边界称「执行中的任务不受影响（任务内的 worker 引用已固定）」（b2:45），但被删外包工的**已排队未执行**任务在出队复核时会按 `!w ⇒ E_WORKER_UNAVAILABLE`（src/main/scheduler/workforce.mjs:87）走降级或终态（src/main/scheduler/scheduler.mjs:106-117 recheckQueued）；验收命令 c（b2:167）与确认框文案（b2:44）均未覆盖该路径 | 在 T3 边界写明「执行中」与「排队中」两种在途任务的不同处置，并把该路径纳入验收（机器或人工） |
| 7 | Acceptance/Edge | 🟡 | overview.md §2.3 要求端口耗尽时「（设置界面 b2 同示）明示「端口不可用」与建议」（overview.md:60），而 T9 只写「显示服务状态（运行中 / 停止）」（b2:86）；verify h 断言「h 显示地址 == `runtime.json.url`」（b2:167）在服务未启动（无 runtime.json）时无定义 | 补「未启动 / 端口顺延」时的界面读数与文案判据（含无 runtime.json 时的显示口径），并给出对应断言或人工场景 |
| 8 | Clarity | 🔵 | workforce 侧写回项写作「`markChecked`：检查结果写回」（b2:136），但 `Workforce` 无 `markChecked`（src/main/scheduler/workforce.mjs 全类方法：byId/match/statusOf/setCooldown/clearHealth/clearAllHealth/unavailableCode/list/pick/nextAvailable）⇒ 未标明是新增；写回记录字段形状（`until` 语义 / 与既有冷却叠加）、以及引擎侧 `captcha` 到对外词表 `unavailable` 的映射（scheduler.md:115 vs mcp-server.md:54）未写明 | 标注为新增方法并写明记录形状与「成功检查替换既有健康记录」的语义；补词表映射一行 |
| 9 | Clarity | 🔵 | DOM 契约（b2:146）声明为「渲染实现与测试断言的共同面」，但缺新增对话的平台选择节点与 M1 需核对的登录引导文案（b2:179「含「登录态只存本机，换机后每个平台需重新登录一次」」）节点 | 若 M1 之外的断言需要核对文案，把对应 `[data-field]` / `[data-action]` 补进 DOM 契约 |
| 10 | Traceability | 🔵 | T12 关于页（b2:107「功能点：版本号；日志目录路径；「复制日志路径」按钮」）无需求条目 / AC 回指（需求档 R5 的 F5.1–F5.7 无「关于」项；来源应为 settings-app.md §6）——属设计档已批准的额外面，非需求缺口 | 补需求/设计回指（来源记 settings-app.md §6），使条目表每行的溯源链完整 |
| 11 | Doc hygiene | 🔵 | verify:settings 的依赖断言（b2:167「依赖已具备：electron 44.7.0 / playwright 1.64」）只可证到 API 面在场（package.json:18「"playwright": "^1.64.0"」、:21 `electron`；node_modules/playwright-core/index.mjs:26「export const _electron = playwright._electron;」）；b1 集成测试是直接 spawn electron 二进制（test/integration/runtime.test.mjs:57-66 startApp）而非 `_electron`，本机实际起得来未证 | 在切分 2／4 先跑一个 `_electron` 起应用的最小自证（或写明备选形态：沿用 spawn + `FO_OPEN_SETTINGS`），避免验收面末期才发现起不来 |

**计数**：🔴 0 · 🟡 7 · 🔵 4（共 11 条）。

**VERDICT: pass**（无 🔴；🟡/🔵 为上列 11 条，不阻断批准）

## §4 用户批准（主 agent）

### §4 用户批准（2026-10-09）

- **用户原话**：「批准」（2026-10-09 22:22，回应主包AI 的「§4 请批准」请求）。
- **批准对象**：本批候选设计 = `docs/batches/b2-settings-ui.md` §2（T1–T12 条目表 · 文件计划 · 4 份实施切分与冻结接口 · 验收命令 a–l 与人工场景 M1–M9 · 边界）+ **两处设计增量**（`docs/design/modules/scheduler.md` §10 `worker.check` 引擎方法；`docs/design/overview.md` §2.1 二实例启动 ⇒ 打开并聚焦设置窗口）。
- **前置条件（已满足）**：设计评审 VERDICT = pass（🔴 0 · 🟡 7 · 🔵 4，见 §3）；11 条发现全部处置并逐号核验（9 改 + 1 入实施前置 + 1 判非问题）；活面残留标记已清（`主包AI 直改·可回退`）。
- **批准后实施链**：免费外包产出渲染界面代码草案 → eng-coder 按 4 份切分落地（① 引擎检查通道 ∥ ② 设置主进程面与接线 ∥ ③ 渲染界面 ∥ ④ 测试与验收面）→ 父侧跑 `verify:settings`（a–l）+ 人工场景 M1–M9 → 收口。
- **设计凭证**：本批使用 b2 设计评审签发的凭证（凭证值不落档）。

## §5 实施记录（eng-coder）
**状态行**：实施完成（切分②设置主进程面与接线 + 切分③渲染界面（四文件落盘 · 自证 45/45 · advisor 两轮 pass · 终态 clean · 2026-10-09））



### 切分①「引擎检查通道」交付（2026-10-09）

**交付摘要**：引擎新增 `worker.check`（「打开并检查」）——打开 / 复用该外包工浏览器会话 → 平台页 → 登录态判定（原语复用 `opening.mjs`，未改其行为）；**不发送消息、不关窗口**；该外包工有在途任务 ⇒ 拒绝（`result.error`）；浏览器 / 会话起不来 ⇒ `{status:'unavailable', detail}`。四方法契约、行分隔 JSON-RPC 口径、MCP 工具面、错误码表均未动。

**改动 / 新增文件**（文件域内，未越界）：

- 改 `src/engine/host.mjs`（现 172 行）：方法清单注释 + `import { checkWorker }` + `createEngine` 装配 `checkWorker`（含「仅透传 worker」注记）+ `startServer` 分派 `worker.check` 分支。增量在 §2 ④ 预算（≤ +20）内。
- 新增 `src/engine/worker-check.mjs`（87 行；§2 ④ 估 ~120）。
- 临时自证件（`.thincoder/tmp/b2-worker-check/`，不入库）：`selfcheck.mjs`（模块级 / 协议级夹具 / 真机三段）、`fixture-register.mjs`（`--import` 预加载的夹具适配器 + 本地 fixture 页 + 发送观测桩）。

**验收读数（命令 → 读数）**：

- `node --check src/engine/host.mjs src/engine/worker-check.mjs` ⇒ OK。
- `node .thincoder/tmp/b2-worker-check/selfcheck.mjs` ⇒ **PASS**：
  - 模块级：坏参 ⇒ `E_BAD_ARGS`；在途拒绝 ⇒ `E_WORKER_UNAVAILABLE`；ready / login_required / captcha 三态；未知值 ⇒ `login_required`；未注册平台与「会话起不来」⇒ `unavailable` + detail；spy（send / openSession / close）= 0 / 0 / 0。
  - 协议级（`node --import fixture-register.mjs src/engine/host.mjs` + 临时客户端）：`engine.health` ok（适配器 deepseek,fixture-a,fixture-dead）；在途拒绝读数 `E_WORKER_UNAVAILABLE`（在途任务收尾 `E_LOGIN_REQUIRED`）；空闲三态 login_required(6.1s) → ready → captcha(6.1s)；死页 ⇒ `unavailable` + detail；未注册平台 ⇒ `unavailable`；坏参 ⇒ `E_BAD_ARGS`；**未发送消息**（fixture send / openSession / applyToggles 零调用 + 夹具服务器 sentHits=0）；**窗口未关闭 + 会话复用**（connected=true、pages 2→2、页面加载次数=1）。
  - 真机 deepseek（临时 userData）：`login_required`（7.7s；未登录态，验收允许）。
- 回归：`node --test docs/batches/b1-core-loop.units.mjs` ⇒ 27/27；`npm run verify:engine` ⇒ 3/3。
- 进程 / 端口：两引擎 `engine.shutdown` ⇒ 退出码 0；无 msedge / node 残留（按临时路径检索）；178xx 仅 17873 = 并行面应用实例（electron.exe，21:46 创建，早于本切分开工），非本切分残留。

**决策透明表**：

| 项 | 决定 | 依据 |
|---|---|---|
| 在途拒绝错误码 | 复用 `E_WORKER_UNAVAILABLE`（含 hint「等该外包工的任务结束后再检查」） | b2 边界禁新增错误码；两码均已在 mcp-server.md 错误码表内 |
| 未注册平台 / 页面起不来 | ⇒ `{status:'unavailable', detail}`（不走 result.error） | status 词表含 unavailable；T6「浏览器 / 会话起不来 ⇒ unavailable + detail」 |
| 判定超时 / 未知值 | ⇒ `login_required`（保守交人工） | T6 边界「未判定 / 超时 ⇒ login_required」；与 opening 口径同源 |
| 引擎侧预算 | 内部缺省 = `DEFAULT_TIMEOUTS.openingMs`（60s）；协议无预算入参；尽力而为、非硬上界 | scheduler.md §10「deadline 权威 = 主进程」；不给引擎加预算入参 |
| detail 文本 | 去 ANSI 色码 + 折叠换行 + 单行 ≤200 字 | detail 进健康记录 / 界面（list_workers）；Playwright 错误消息带 ANSI 与多行 Call log |
| 判定词表卫生 | 仅透传 ready / captcha，其余一律 login_required | 与 task-runner 对 `waitForLoginState` 结果的处置同源（非 ready / captcha ⇒ login_required） |

**审计与代码评审轮次与终态**：

- 内部探索偏离审计（explore 子代理）：**未执行**——通道连续 3 次 LLM 429（「余额不足或无可用资源包」），非本切分可修；以 advisor 代码评审 + 逐条验收读数替代，如实披露。
- advisor 代码评审（独立只读；对象 = 两文件 + 4 份设计 / 批次档）：**轮次 1 = pass**（0 🔴 · 1 可选 🟡 · 4 🔵）；结论要点 = 冻结接口 / 四方法契约 / 错误码边界 / 预算裁定 / 边界禁令逐点相符。
- 终态：`clean`（advisor pass，无遗留 must-fix；🟡 一条属设计面、已上抛）。

**fix round**：1 轮（纯注记、未动行为）——按 🔵 建议补 3 处：`worker-check.mjs` 头部注「预算尽力而为、非硬上界」；忙碌拒绝行注「复用既有码 = 边界禁新增错误码」；`host.mjs` 装配行注「仅透传 worker，预算不入协议」。改后复验：`node --check` OK + selfcheck PASS + 回归 27/27 · 3/3。

**上抛 / 未决（请父侧裁定）**：

1. **反向竞态（设计面缺口，非本切分实现偏差）**：在途拦截是「检查发起时」的时点快照（`worker-check.mjs:21` 读 `runner.tasks`；任务登记发生于 `task.run` 调用时——`task-runner.mjs:132`），检查期间到达的派单会使任务 opening 与检查在同一会话页并发（页面复用 `browser.mjs:163`）。冻结句「有在途任务时直接拒绝」（`scheduler.md:115`）已满足；反方向未被覆盖。候选处置：① 让检查纳入同一每外包工串行；② 或设计档记一条残余风险。引擎侧未自选（不越权）。
2. 本切分无随批落库的回归用例（`test/**` 无 `worker.check` 引用）——常驻守门在切分 ④ 的 k 断言；本切分证据 = `.thincoder/tmp/**` 自证件。

**文档漂移**：无（未触及受影响文件表 / 模块图描述；两文件行数均在 §2 ④ 估算内）。

### 切分 ② · 设置主进程面与接线（eng-coder，2026-10-09）

**交付摘要**：`window.fo` 八方法（preload + 主进程 IPC 面）· patch 七操作（配置唯一写入口：校验 → 原子写 + `.bak` → 广播）· 设置服务（快照合成 / 「打开并检查」编排 / 导出 / 打开路径 / 复制落点）· 设置窗口控制器（单例：未销毁 ⇒ 聚焦、已销毁 ⇒ 重建；沙箱预加载；拒绝非 file:// 导航）· 接线（托盘三入口 / 二实例打开并聚焦 / `FO_OPEN_SETTINGS` 接缝 / `outbox-fallback` 转发）；**b1 缺口** `ConfigStore.save` 写失败回滚内存已修；`markChecked` 按评审修复 ⑧ 口径新增。

**冻结接口落实对照**（逐条 file:line）

| 冻结项 | 落点 |
|---|---|
| `getSnapshot()` | `src/settings/preload.cjs:22` → `src/settings/window.mjs:52` → `src/settings/service.mjs:56` |
| `patch(op)` 返回 `{ok, error?}` | `preload.cjs:24` → `window.mjs:53` → `service.mjs:127`（返回形状 `service.mjs:126`） |
| `checkWorker(id)` | `preload.cjs:26` → `window.mjs:54` → `service.mjs:161` |
| `copyText(text)` | `preload.cjs:28` → `window.mjs:55-60`（Electron clipboard） |
| `exportFragments()` | `preload.cjs:30` → `window.mjs:61` → `service.mjs:216` → `src/settings/export.mjs:24` |
| `openPath(kind)`（outbox\|export\|logs\|guide） | `preload.cjs:32` → `window.mjs:62-66` → `service.mjs:227`（kind 白名单 `service.mjs:242`） |
| `pickOutboxDir()` | `preload.cjs:34` → `window.mjs:67-76`（提交前校验走 `service.mjs:206`） |
| `onChanged(cb)` | `preload.cjs:36-46` → `window.mjs:139-152`（推全量快照；退订函数已返回） |
| `worker.add {platform}` | `src/settings/patches.mjs:73`（平台白名单 `:20-24`、默认名唯一化 `:49`、id `:60`） |
| `worker.remove {id}` | `patches.mjs:92` |
| `worker.rename {id, name}` | `patches.mjs:103`（空白 / 重名拒绝） |
| `worker.move {id, dir:up\|down}` | `patches.mjs:119`（首 / 末位越界拒绝） |
| `worker.setEnabled {id, enabled}` | `patches.mjs:136` |
| `worker.setToggles {id, toggles}` | `patches.mjs:148`（部分更新；非法键 / 非布尔拒绝） |
| `outbox.set {dir}` | `patches.mjs:167`（注入检查器判可用性；失败不落配置） |
| 操作清单常量（七项） | `patches.mjs:9-17`（随快照 `ops` 字段暴露：`service.mjs:91`） |

**自证读数**（命令 → 结果）

| 自证 | 命令 | 读数 |
|---|---|---|
| 语法 | `node --check` × 12 个改动文件 | 全 OK（评审修复后复检仍全 OK） |
| 纯函数 / 编排单元 | `node --test .thincoder/tmp/b2-settings/units.mjs` | **31/31 通过**（patches 七操作合法与非法 · fragments 两形态与 §2 样例逐字一致 · export 两文件 + 覆盖刷新不新增副本 · **config 写失败 ⇒ 抛错且内存不变** · markChecked 形状 / 冷却 / 词表映射 / 名册守卫 · service 编排含超时与 busy · scheduler 事件去重键） |
| 应用级（CDP 驱动，`FO_OPEN_SETTINGS=1`） | `node .thincoder/tmp/b2-settings/app-proof.mjs` | 全部通过：八方法注入逐字一致（`["checkWorker","copyText","exportFragments","getSnapshot","onChanged","openPath","patch","pickOutboxDir"]`）· 渲染层 `typeof window.require = undefined` · 快照地址 == `runtime.json.url` · patch 落盘 + `/healthz` 随动 · 非法 patch 被拒且不落盘 · `onChanged` 广播到达渲染层（events=1）· 导出两文件按实际端口 · 复制 ok · 未知 kind 报错 |
| 应用级：二实例 | 同上（场景 B） | 二实例自身退出（exitCode=0）· 设置窗口被打开且 `document.hasFocus()=true` / `visibilityState=visible` · 日志「检测到第二实例启动：打开并聚焦设置窗口」 |
| 应用级：回落转发 | 同上（场景 C） | 日志链「交付目录回落：实际路径=…」→「设置窗口：交付目录回落事件转发」→「设置窗口：变更广播已发送」；快照 `outbox.note=已回落：配置目录不可用（ENOTDIR）` |
| 回归 | `node --test docs/batches/b1-core-loop.units.mjs` | 27/27 通过 |
| 回归 | `npm run verify:mcp` | 1/1 通过 |
| 回归 | `npm run verify:runtime` | 2/2 通过 |
| 端口 / 进程 | `netstat -ano` + 进程表 | 自证三场景端口无残留监听；178xx 无新增监听；自证所起应用实例全部优雅退出，无残留进程（现存 17873 = 既有实例 PID 4124，非本次所起，未触碰） |

**改动文件与行数（实际值；④ 的估算按「实施后按实际回调」口径在此落档）**

- 新增：`src/settings/preload.cjs` 47 · `window.mjs` 169 · `service.mjs` 285 · `patches.mjs` 225 · `fragments.mjs` 31 · `export.mjs` 29（预计 40/120/180/120/60/60）；**清单外新增** `src/settings/wiring.mjs` 78。
- 修改（现况 → 现值）：`src/main/index.mjs` 254 → 295 · `tray.mjs` 117 → 140 · `config.mjs` 98 → 104 · `scheduler/workforce.mjs` 175 → 218 · `scheduler/scheduler.mjs` 296 → 297。全部 < 300 行。

**审计与代码评审轮次与终态**

- 轮次 1（发散审计，explore 子代理只读）：2 findings —— ① 🟡 `wiring.mjs` 清单外新增的「>300 行」理由缺时点；② 🔵 scheduler 注释指针指错文件。处置：复原内联形态实测 **317 行 > 300**（脚本 `.thincoder/tmp/b2-settings/measure-inline.mjs` 读数），注释补时点与实际行数；指针改指 `wiring.mjs`。
- 轮次 2（代码评审，advisor `type=code`）：VERDICT **pass**（🔴 0 · 🟡 2 · 🔵 6）。fix round 1 处置 4 条（见下）；2 条不上抛不改（设计档通道名、任务状态变化不广播）。
- 终态：**clean**（fix 后 units 31/31 · 应用级自证全通过 · b1 三项回归全绿；无未处置 must-fix 项）。

**fix round 1（评审发现处置）**

| # | 发现 | 处置 |
|---|---|---|
| 1 | 🟡 删除后重建的外包工可能继承被删条目的健康状态（id 复用 + `until=null` 记录不失效） | 已修：`service.mjs:112-124` 每次配置变更后清理不在名册里的健康记录；`workforce.mjs:76-79` `markChecked` 对不在名册的 id 不写回；`service.mjs:196-199` 检查期间被删 ⇒ 结果丢弃并明示。补单元 3 例（31/31 含） |
| 2 | 🔵 `wiring.mjs` 注释称 Electron 面在 service.mjs/window.mjs | 已修：`wiring.mjs:4` 改为「Electron 面只在 window.mjs（与 preload.cjs），service.mjs 为纯 Node 面」 |
| 3 | 🔵 `tray.mjs` 头注释仍 b1 口径 | 已修：`tray.mjs:1-3` 改 b2 口径（三入口 + 未接线不显示死菜单项） |
| 4 | 🔵 启动早期二实例唤起可能既无窗口也无日志 | 已修：`index.mjs:55-58` 补 `log.warn`（诉求不静默丢失） |
| 5 | 🟡 设计档 `settings-app.md` §7 通道名（`config:get` / `config:patch`）与实现（`fo:snapshot` / `fo:patch`）不一致 | 不改（设计档非本切分文件域）⇒ 上抛父侧对齐 |
| 6 | 🔵 派单 / 任务结束不触发窗口广播（页面打开期间 busy 徽标不自更新） | 不改（设计未要求；打开页面取快照时点已正确合成 busy）⇒ 父侧按交互成本定 |

**上抛 / 未决（供父侧）**

1. 设计档 `docs/design/modules/settings-app.md` §7 的通道名与实现不一致（实现 = `fo:*`，冻结接口只钉了方法名）——请在设计档补口径或改名，避免切分 ③/④ 误按文档名接线。
2. 任务状态变化（busy ⇄ ready）不广播：如需页面自动刷新，建议接线处加节流 `task-update → emitChanged`（不要直接转发高频 progress）。
3. 清单外新增 `src/settings/wiring.mjs`（78 行）：触发条件 = 批次档 ④ 自身拆分计划（内联实测 317 > 300），已按实测留痕；另有措辞偏差——④ 写「index.mjs 单行调用」，实际为 15 行实例化块 + 3 行托盘回调转发（292 ⇒ 交付时 295 行，仍 ≤300）。
4. 临时自证脚本与读数留档：`.thincoder/tmp/b2-settings/{units.mjs,app-proof.mjs,measure-inline.mjs}`（切分 ④ 可据此转写 `docs/batches/b2-settings-ui.units.mjs`）。

**边界声明**：未触碰 `src/engine/**`（并行切分 ①）· `package.json` / `test/**` / 渲染层三件（切分 ③/④）· `docs/**`（设计档与批次档正文）· MCP 工具面 / 端点 / 错误码 · `profiles/**`；无文件监听；起应用一律剥 `ELECTRON_RUN_AS_NODE`，主进程入口仍为 `app.whenReady().then(main)`（无顶层 await）。

### 定点修 · T7 快照 workers 条目并入 `toggles`（eng-coder，2026-10-09）

**交付摘要**：`getSnapshot()` 合成 workers 视图时并入 `toggles`（值 = `config.current.workers[].toggles`），补齐 T7「深度思考 / 联网搜索开关随外包工**呈现当前配置值**」缺失的读面（快照 = 渲染层唯一读入口）。**只加在设置快照**：`list_workers`（`src/main/mcp/tools.mjs:89`）与 `/healthz`（`src/main/mcp/server.mjs:102`）**直取** `scheduler.listWorkers()`，不经 `getSnapshot()` ⇒ 两载荷逐字未变（前后对照读数见下）；`workforce.list()` 返回形状未动（改它会连带影响 MCP 视图词表）。

**改动（file:line，仅此一文件，285 → 293 行）**

- `src/settings/service.mjs:5` —— 文件头「快照字段 ↔ DOM 契约」冻结映射补 `workers[].toggles↔[data-toggle=thinking|search]`（补齐既有清单遗漏）。
- `src/settings/service.mjs:80-82` —— 内联注记（取值来源 / 兜底同源 / 两载荷不经此路）。
- `src/settings/service.mjs:83-86` —— `workers: scheduler.listWorkers().map((w) => ({ ...w, toggles: config.current.workers.find((x) => x.id === w.id)?.toggles ?? { thinking: false, search: false } }))`。

**验收读数（命令 → 读数）**

| 项 | 命令 / 手段 | 读数 |
|---|---|---|
| 语法 | `node --check src/settings/service.mjs` | OK（fix round 后复检仍 OK） |
| ① 快照含 toggles 且 == config 值 | `.thincoder/tmp/b2-settings/toggles-proof.mjs`（CDP 驱动，`FO_OPEN_SETTINGS=1`；config 两名外包工：w-1 false/false、w-2 true/true） | ✔ 每条含 `toggles`（布尔）· ✔ 逐条 == `config.json` 配置值 · ✔ 值非恒定默认（w-2=true/true 如实读出） |
| ② patch 后快照随动 | 同上：`patch({op:"worker.setToggles", id:"w-1", toggles:{thinking:true}})` | ✔ `{ok:true}` · ✔ 落盘 `{thinking:true, search:false}` · ✔ 再取快照 w-1.toggles 随动 `{thinking:true, search:false}` · ✔ w-2 不受影响 |
| ③ 两载荷逐字未变 | 同一改动前/后各起一次应用（`readings-before.json` / `readings-after.json`） | ✔ `healthz.workers` before==after · ✔ `list_workers.workers` before==after · ✔ 两条载荷键集 == `enabled,id,lastCheckedAt,name,platform,status`（**无 toggles**）· ✔ 两载荷彼此逐字一致 |
| 红色复现（缺陷） | 同驱动、还原为改动前形态再跑 | **5 项未通过**（快照条目 `toggles` 缺键 / 值不符 / patch 后快照不随动）——缺陷确证 |
| 自证总读 | `node .thincoder/tmp/b2-settings/toggles-proof.mjs` | 修复后 **17 项 ✔ 全通过** |
| 回归 | `node --test docs/batches/b1-core-loop.units.mjs` | **27/27 通过** |
| 回归 | `npm run verify:mcp` | **1/1 通过** |
| 回归 | `npm run verify:runtime` | **2/2 通过** |
| 进程 / 端口 | `netstat -ano` + 进程创建时间 | 自证所起实例全部优雅退出；178xx 仅 17873（PID 4124，创建于 21:46，**早于本次定点修**，非本次所起）；本次各场景端口（57050/57077/57086）无残留监听 |

**三处载荷对照（逐字）**

- 设置快照 `workers[i]`：`{id,name,platform,enabled,status,lastCheckedAt,toggles:{thinking,search}}`（修改前无 `toggles`）。
- `list_workers` / `/healthz` 的 `workers[i]`：`{id,name,platform,enabled,status,lastCheckedAt}` —— 修改前后逐字一致（见 ③）。

**决策透明表**

| 项 | 决定 | 依据 |
|---|---|---|
| 并入位置 | 只在 `getSnapshot()`；`workforce.list()` 形状不动 | 批次档边界「不得改动 `list_workers` 与 `/healthz` 载荷 / 不改 `workforce.list()` 返回形状」 |
| 取值口径 | `find by id`，兜底 `{thinking:false, search:false}` | 批次档 §2 建议形（「照此口径实现即可」）；兜底与 `src/main/config-schema.mjs:19` 默认同源 |
| 不取拷贝（直出 config 对象引用） | 不改 | 遵守父侧指定口径；两消费点（`src/settings/window.mjs:52` IPC 回值 · `:145` `webContents.send`）均结构化克隆 ⇒ 无实际缺陷（advisor 已核） |
| 与 `patch` 广播一致 | 天然成立（先写配置 → 再合成快照） | `service.mjs:137` `config.save` 先于 `:152` `emitChanged` → `getSnapshot` |

**审计与代码评审轮次与终态**

- 内部探索偏离审计（explore 子代理）：**未执行**——本轮由父侧明确界定「单文件、单点，**不做探索**」；以逐条验收读数 + advisor 代码评审替代，如实披露。
- advisor 代码评审（`type=code`；对象 = `src/settings/service.mjs` + 批次档 / 设计档）：**轮次 1 = pass**（🔴 **0** · 🟡 1（可选，**验收面无「快照回显」守门断言**——落点属切分④文件域，本修文件域外）· 🔵 5）。要点 = 改动为加字段、取值自 config、`list_workers` / `/healthz` 不经此路（冻结词表未动，与其内联注记相符）、渲染侧消费点（切分③）正好读 `w.toggles` ⇒ T7 读面缺口闭合。
- 终态：**`clean`**。

**fix round**：**1 轮（纯注释，未动行为）** —— 取 🔵 2 条落本文件：`:5` 头部契约映射补 `workers[].toggles`；`:80-81` 注记兜底默认与 schema 同源。另 🔵 3 条**不改并留痕**：① 取拷贝；② 统一 `cfg` / `config.current` 两取值口径（经核现写法更稳——与 `listWorkers()` 同读点，规避 `:61` `await` 后配置对象被替换的漂移）；③ §5 留痕（本条目即其兑现）。改后复验：`node --check` OK + 自证 17/17 + 回归 27/27 · 1/1 · 2/2。

**未决 / 上抛（供父侧）**

1. **验收面守门缺口（advisor 🟡，切分④范畴）**：批次档 §2 验收表 f（`b2-settings-ui.md:167`）原文只断「f 开关 ⇒ **config** `toggles` 随动」——未断**快照回显**侧，而本缺陷恰在快照读面；切分④落库单元（`docs/batches/b2-settings-ui.units.mjs`）若不同步补「`getSnapshot().workers[i].toggles` == config 值」断言，同一缺陷可回归而无常驻用例发现。本轮证据 = 临时驱动 `.thincoder/tmp/b2-settings/toggles-proof.mjs`（不入库）。请父侧定：验收表 f 是否扩为 config + 快照双读。
2. **切分③ 观察（文件域外，不评）**：本修落地后 `src/settings/renderer-workers.js` 的会话内回显兜底（其自注「可删」）已冗余——属切分③文件域，留父侧处置。

**边界声明**：仅动 `src/settings/service.mjs`（本文件域）；未触碰 `src/main/**` · `src/engine/**` · 渲染层三件 · `test/**` · `package.json` · `docs/**` 正文 · MCP 工具面 / 端点 / 错误码；起应用一律剥 `ELECTRON_RUN_AS_NODE`，主进程入口仍为 `app.whenReady().then(main)`。

### 切分 ③ · 渲染界面（eng-coder，2026-10-09）

**交付摘要**：设置窗口渲染层落地四文件（`src/settings/{index.html,style.css,renderer.js,renderer-workers.js}`）：四页签中文界面（外包工 / 接入指引 / 交付目录 / 关于）——外包工页（状态徽标 + 最近检查 / 行内改名 / 启用开关 / 深度思考·联网搜索开关 / 上移下移 / 打开并检查 / 删除二次确认 / 新增选平台）；接入指引页（服务状态·实际地址·SSE·版本·导出目录 / 两形态复制 / 一键导出 / 打开导出目录 / 打开随包文档 / 接入顺序与不覆盖宿主配置文案）；交付目录页（实际落点 / 已回落说明 / 选择目录 / 打开目录）；关于页（版本 / 日志目录 / 复制日志路径）。经典 script（无 ESM / 无构建）、零 Node 能力（只用 `window.fo` 八方法）、不引任何外部资源、深浅色跟随系统。起点 = 外包草案（`outbox/20261009-222247-bf4f/files/*`），逐条核对 §2 冻结 DOM 契约（**缺项 = 0**）与八方法。

**草案核对处置（缺的补 / 错的改 / 多的删）**

- 错的改（快照字段名，按 ② 实际实现纠）：`svc.running`→`service.state` · `svc.mcpUrl`→`service.url` · `outbox.actualDir`→`outbox.actual` · `outbox.fallbackReason`→`outbox.note` · `w.checkedAt`→`w.lastCheckedAt`；`checkWorker` 结果形状改直读 `{ok,status,detail}`。
- 错的改（片段权威）：两形态片段改取快照 `fragments.mcpJson / fragments.mcpServers`（主进程生成器权威），删掉渲染层自造 JSON 与 `copy-mcp-json` 的占位调用（草案残留 `fo.copyText('')`）。
- 错的改（平台选择）：`window.prompt` 换为页内「选择平台」对话框（清单来自快照 `platforms`；Kimi 灰显「待支持」）。
- 缺的补：服务未启动 / 端口顺延的提示（含「宿主配置需更新」）· T7 可见文案「派单时自动应用」· T10「不要整文件覆盖宿主 config.json」+ 导出目录显示 · 登录引导常显（按快照 `login_required` 推导，含设计档原文句）· 检查按钮 busy 禁用与「检查中…」· 无外部资源的 CSP。
- 多的删：草案的 `data-tabs` 死钩子、`copy-mcp-json` 占位行、`check.disabled` 里超出 T6 边界的 `!enabled` 条件（改按 T6 字面：仅 busy）。

**文件与行数（实际值；④ 估算的回调）**：`index.html` 116 · `style.css` 129 · `renderer.js` 219 · `renderer-workers.js` 260（渲染侧共 726 行；两脚本合计 479 行，均 ≤300 行档）。**清单外新增 `renderer-workers.js`**：触发 = 用户指令「renderer.js 若超 300 行拆成两个经典脚本」+ 单文件将超 300 行档；留痕形态同 ② 对 `wiring.mjs`。

**切分图（渲染层两经典脚本）**：`index.html:113` → `renderer.js`（核心：页签 / 快照刷新与 `onChanged` 订阅 / 提示条 / 接入指引·交付目录·关于三页渲染 / 复制·导出·打开·目录选择接线 / 启动；定义共享面 `window.FOUI = {$、el、fmtTime、notify、fail、state、refresh}`）→ `index.html:114` → `renderer-workers.js`（外包工页行渲染与行内交互 + 新增平台对话框 + 删除确认框；注册 `FOUI.workers = {render, openAddDialog, closeAddDialog}`，消费核心工具与状态）。**DOM 契约不受影响**：静态节点在 `index.html`，动态行节点在 `renderer-workers.js`（见下表）。

**DOM 契约对照（逐条 file:line）**

| 契约项 | 落点 |
|---|---|
| 页签 `[data-page]` ×4 | `index.html:14-17` |
| 面板 `[data-page-panel]` ×4 | `index.html:24` / `:37` / `:61` / `:76` |
| 行 `[data-worker-id]` | `renderer-workers.js:51` |
| 行内 `[data-field=name]` | `renderer-workers.js:58` |
| 行内 `[data-field=enabled]` | `renderer-workers.js:85` |
| 行内 `[data-field=status]` | `renderer-workers.js:74`（原始词表值另落 `data-state` `:75`） |
| 行内 `[data-field=checked]` | `renderer-workers.js:79` |
| 行内 `[data-toggle=thinking\|search]` | `renderer-workers.js:101`（值 = 配置 `w.toggles` `:100`） |
| 行内 `[data-action=up\|down\|delete\|check]` | `renderer-workers.js:119` / `:120` / `:121` / `:123`（统一落钩 `:42`） |
| `[data-action=add-worker]` | `index.html:27` |
| `[data-action=copy-mcp-json]` | `index.html:49` |
| `[data-action=copy-mcp-servers]` | `index.html:50` |
| `[data-action=export]` | `index.html:51` |
| `[data-action=open-export]` | `index.html:52` |
| `[data-action=open-guide]` | `index.html:53` |
| `[data-action=open-outbox]` | `index.html:69` |
| `[data-action=pick-outbox-dir]` | `index.html:68` |
| `[data-action=copy-logs-path]` | `index.html:83` |
| 确认框 `[data-confirm]` | `index.html:92` |
| `[data-action=confirm-yes]` / `confirm-no` | `index.html:97` / `:96` |
| `[data-field=mcp-url]` | `index.html:41` |
| `[data-field=sse-url]` | `index.html:42` |
| `[data-field=version]` | `index.html:43` |
| `[data-field=outbox-actual]` | `index.html:64` |
| `[data-field=outbox-note]` | `index.html:66` |
| `[data-field=export-dir]` | `index.html:44` |
| `[data-field=logs-dir]` | `index.html:80` |

**自证读数（命令 → 读数）**

| 自证 | 命令 | 读数 |
|---|---|---|
| 语法 | `node --check renderer.js renderer-workers.js` | OK |
| 无外部资源 | grep（`http://` / `https://` / `//cdn` / `@import url(`）四文件 | 0 命中；另无 `fetch(`/`XMLHttpRequest`/`WebSocket`/`require(`/`process.`/`innerHTML` |
| 应用级（CDP 驱动；`FO_OPEN_SETTINGS=1`；剥 `ELECTRON_RUN_AS_NODE`；`--remote-debugging-port=0` + `DevToolsActivePort`） | `node .thincoder/tmp/b2-renderer/app-proof.mjs` | **45/45 全绿**（A1–A35 + B1–B6） |
| 行数 | `find /c /v ""` | 116 / 129 / 219 / 260（逐文件 ≤300） |
| 进程 / 端口 | CIM + `Get-NetTCPConnection` | 无本切分残留（electron 仅 21:46 既有实例；受检端口 0 监听） |

关键读数摘：A——CSP 不过度拦截（脚本/样式真实生效）· 零 Node 能力（`window.require/process` undefined）· 四页签逐一切换（面板 + is-active 同步）· 徽标「可用/已停用」随动 · **开关：打开即回显 == 配置值 · 改落盘且界面态一致 · 不覆盖另一键 · 页面重载后回显（A15–A18）** · 改名列正反（重名 ⇒ 明示 + 回显旧名）· 上移 ⇒ config + `/healthz` + DOM 三随动 · 删除取消/确认 · 新增 DeepSeek ⇒ 默认名唯一化「DeepSeek 2」· 复制三钮（系统剪贴板实读）· 导出两文件 + 覆盖刷新；B——端口顺延 ⇒ 「宿主配置需更新」· 交付目录回落 ⇒ 「已回落：配置目录不可用（ENOTDIR）」+ 实际落点 · 「打开并检查」（引擎侧浏览器起不来）⇒ 徽标 unavailable + 最近检查时间更新 + 界面明示。

**决策透明表**

| 项 | 决定 | 依据 |
|---|---|---|
| 拆两经典脚本 | `renderer.js` 219 + `renderer-workers.js` 260 | 用户指令；单文件将超 300 行档 |
| 徽标文本 | 中文标签；原始词表值落 `data-state`/`title` | 中文界面 + 机器可断言（词表五值） |
| 服务未启动 | 复制 / 导出入口禁用 + 「未启动：原因；建议」 | 评审修复 ⑦；无实际端口时片段不可依循 |
| 登录引导 | 按快照 `login_required` 推导（非会话变量）——窗口重开后仍在 | advisor 轮次 1 发现 2 的处置 |
| 开关回写 | 部分更新（只发改动键） | 不覆盖另一键（A16） |
| 检查按钮禁用 | 仅 busy（执行中）——disabled 外包工仍可查登录态 | T6 边界字面 |
| `pickOutboxDir` 取消 | 静默（仅 `error` 弹错） | 主进程取消 = `{ok:false, canceled:true}` |
| 共享面 | 只导出实际消费项（`render` 已移除） | advisor 轮次 1 发现 3 的处置 |

**审计与代码评审轮次与终态**

- 内部探索偏离审计（explore 子代理）：**2 次尝试均被 LLM 429 拒**（「余额不足或无可用资源包」）——通道级故障，非本切分可修；以 advisor 代码评审 + 逐条实测读数替代（与切分 ② 同处置），如实披露。
- advisor 代码评审轮次 1（独立只读；对象 = 4 文件 + 批次档 §2 + 设计档）：**VERDICT pass**（0 🔴 · 1 可选 🟡 · 5 🔵）。
- fix round 1（处置 5 条）：① `index.html:30` 补可见文案「派单时自动应用」（T7 文案标注）+ `:6` CSP 补 `base-uri 'none'; form-action 'none'`；② 登录引导改按快照推导（删会话变量 `loginGuideFor`）；③ 共享面移除未消费的 `render`；④ 自证驱动补 4 项断言（A3b 零 Node / A8b 可见文案 / A18b 引导常显 / A18c 引导恢复）⇒ 45/45。
- advisor 轮次 2（复核修复声明）：**pass** —— 5 项 Fixed 核对相符；余 1 项（本批次档记录，🔵）随本条目落档闭合；无新 🔴。
- 终态：**clean**。

**上抛 / 未决（供父侧）**

1. ② 遗留（非本切分）：验收表 f 只断 config 未断「快照回显」；本切分 A15/A18 已证「快照带 toggles ⇒ 回显 == 配置值」，是否扩进 `verify:settings` 由父侧裁定。
2. `open-export` / `open-guide` 两枚按钮未做「真开」点击自证（会拉起外部程序）：链路同构 + ② 已证通道 + 错误路径（`open-outbox` 坏目录 ⇒ 界面明示）已自证；如需真开读数请在收口场景补（与 M6 托盘三入口同列）。
3. 本切分无随批落库的常驻用例（`test/**` 无渲染引用）——守门在切分 ④ 的 a–l 断言；本切分证据 = `.thincoder/tmp/b2-renderer/app-proof.mjs`（+ `probe.mjs`）。

**文档漂移**：无（未触及设计档；§2 ④ 的渲染层估算旧值已由本条目回调——116/129/219/260；`renderer-workers.js` 为清单外新增，触发与理由如上）。

**边界声明**：未触碰 `src/settings/*.mjs` / `preload.cjs`（切分 ② 面）· `src/main/**` · `src/engine/**` · `package.json` · `test/**`；渲染层不写死端口或路径（一律来自 `getSnapshot()`）；无文件监听、无轮询、不联网；起应用一律剥 `ELECTRON_RUN_AS_NODE`；临时产物一律 `.thincoder/tmp/b2-renderer/`。

### 切分 ④ · 测试与验收面（eng-coder，2026-10-10）

**交付摘要**：`verify:settings` 常驻守门落地——Playwright `_electron` 主路径（前置自证实测：缺省形态 launch 615ms / 显式 `executablePath` 898ms，均能取设置窗口 + 读 DOM + 二实例 `--quit` 优雅退出；**不通自动落 CDP 退化路径**，三条实现写在同一「取窗口」函数 `startSettingsApp`，注释含实测读数与取舍）+ 4 场景件覆盖 a–l（含父侧裁定的 f 快照双读、h①顺延段、h②未启动态）+ 随批单元档（4 测试件 + 夹具 + 聚合入口 = 35 例）。`package.json` 仅加 `verify:settings` 一行。

**新增 / 改动文件（实际行数）**

- 集成面（新增 7 件）：`test/integration/settings.test.mjs` 19（聚合入口 = npm 脚本目标）· `settings.workers-page.test.mjs` 236 · `settings.guide-page.test.mjs` 236 · `settings.check-action.test.mjs` 84 · `settings.persistence.test.mjs` 103 · `settings.driver.mjs` 195（读数工具）· `settings.session.mjs` 295（起应用 / 会话 / 三条取窗口路径）。
- 单元档（新增 7 件）：`docs/batches/b2-settings-ui.units.mjs` 29（聚合）· `.patches.mjs` 159 · `.fragments.mjs` 81 · `.workforce.mjs` 222 · `.service.mjs` 158 · `.check.mjs` 79 · `.fixtures.mjs` 123（共享夹具）。
- 修改（1 件）：`package.json` 仅 +1 行 `"verify:settings": "node --test test/integration/settings.test.mjs"`（`scripts` 其余未动，diff 核过）。
- **清单外拆件声明**：任务书枚举的两个新文件为「入口」；按 §2 ④「超 300 行 ⇒ 按测试对象拆分」与设计档 §3.3 口径拆为「入口 + 4 场景件 + 2 驱动件」与「入口 + 4 测试件 + 夹具」，全部 ≤300 行（最大 = `settings.session.mjs` 295）。

**验收读数（命令 → 读数）**

| 项 | 命令 / 手段 | 读数 |
|---|---|---|
| 语法 | `node --check` × 14 新增文件 | 全 OK |
| 单元 | `node --test docs/batches/b2-settings-ui.units.mjs` | **35/35 通过** |
| 入口 | `npm run verify:settings` | **6/6 通过 · 21–23s**（a–l 全覆盖 + h①顺延段 + f2） |
| a | 实测读数 | 四页签=workers/guide/outbox/about 全可见 · 面板+is-active 四页逐一切换 · 关窗后 /healthz ok=true |
| b | 实测读数 | 新条目=w-3/DeepSeek 2 enabled=true toggles={false,false} · list_workers=可见 · /healthz=可见 |
| c | 实测读数 | 确认框文案含「浏览器配置目录保留」+「已排队的任务会改派或转人工」 · 取消⇒保留 3 条 · 确认⇒config/list_workers//healthz 均移除 + DOM 行=2 |
| d | 实测读数 | 上移后 config=/healthz=/DOM 三者均为 [w-2,w-1] · 首/末按钮禁用=true/true · 下移复位 |
| e | 实测读数 | 新名=备用机三号（config+list_workers）· 旧名派单 code=E_WORKER_UNKNOWN（isError=true）· outbox 目录数=0→0（不建任务） |
| f | 实测读数 | config={thinking:false,search:true} · 快照=同值（**直比 == config 值**）· DOM=同值（部分更新不覆盖另一键） |
| g | 实测读数 | 非法⇒ok=false（「目录不可用（不存在且不可创建，或不可写）：…」）且 config.outboxDir 未变 + 界面仍示原路径 · 合法⇒落盘 + 界面显示新实际路径 |
| h① | 实测读数 | url==runtime.json.url（如 http://127.0.0.1:60125/mcp）· sse 同端口 · 剪贴板两形态 url==实际地址 |
| h①顺延段 | 实测读数 | 期望=60133 实际=60135 · mcp-url==runtime.json.url · note=「端口顺延：期望端口 60133 不可用，实际端口 60135；宿主配置需更新（以本页实际地址为准）。」 |
| h② | 实测读数 | 占端口区间=60141–60261 · status=未启动 · note=「未启动：端口 … 均被占用；建议：释放占用端口的程序，或改写 mcp.port 期望端口后重启」· 复制/导出禁用=[true,true,true] · runtime.json=无 · 日志同示 |
| i | 实测读数 | 导出=[.mcp.json, mcp-servers.json] 端口=实际端口 · 篡改 .mcp.json 后重导出=被覆盖刷新且仍 2 文件（不新增副本） |
| j | 实测读数 | version=0.0.1（== package.json）· logs-dir=实际路径 · 剪贴板==日志目录 |
| k | 实测读数 | elapsed=217ms（预算 openingMs=20000ms）· 徽标=不可用/unavailable · 最近检查时间更新 · 提示=检查完成：不可用 · 按钮不停留「检查中…」 |
| l | 实测读数 | 重启后 name=深索一号 · toggles={true,true} · outbox=改动后实际路径 · /healthz 同名 · 优雅退出即删 runtime.json |
| 回归 | b1 单元 / verify:mcp / verify:engine / verify:runtime | 27/27 · 1/1 · 3/3 · 2/2 |
| 回归（真机） | `npm run verify:loop` | 1/1 · taskId=20261009-235214-d15f · 16.6s · phases=opening>streaming>extracting · transport=sse · files=[verify_loop.py(46B? 47B)] · toggles ok=true |
| 进程 / 端口 | `netstat -ano` + `tasklist` | 无 electron 残留；178xx / 59xxx–60xxx 无监听 |

**前置自证（⑪）**：`_electron` **成**——① 缺省形态（playwright 自解析 electron + 注 loader.js）：`launch 615ms` ⇒ `firstWindow` 命中 `file:///…/src/settings/index.html` ⇒ DOM 读数 `tabs=4, window.fo=object` ⇒ 二实例 `--quit` 退出 exitCode=0；② 显式 `executablePath`：`898ms` 同通过。③ CDP 兜底同函数内实现并以 `FO_VERIFY_SETTINGS_DRIVER=cdp` 强测两组（读数行 `取窗口路径 = cdp`，均绿）。自证件 `.thincoder/tmp/b2-verify/{electron-prelim2.mjs,spawn-diag.mjs,prelim-*.log,settings-run-*.log,settings-final*.log}`。

**决策透明表**

| 项 | 决定 | 依据 |
|---|---|---|
| 取窗口主路径 | `_electron` 缺省形态 | ⑪ 判据「起应用 + 读一 DOM 节点 + 退出」实测通过 + 最快；CDP 兜底可强测 |
| 集成拆件 | 入口 + 4 场景 + 2 驱动 | §2 ④ / 设计档 §3.3「超 300 行 ⇒ 按测试对象拆分」（单文件 ≈900 行） |
| f 双读 | config + `getSnapshot().workers[].toggles` 直比 + DOM | 父侧裁定（快照读面曾出缺陷）；另让单元夹具取非默认值使双读有分辨力 |
| h①顺延段 | 独立成例（占住期望端口再起应用） | 批次档 §2 评审修复 ⑦ 现行口径（评审轮 1 指出缺此子段） |
| k 夹具 | 浏览器快速失败（channel=no-such-browser）+ openingMs=20000 | 不看真机登录态；预算有分辨力（实测 217ms ≪ 20000ms） |
| k 残余风险 | 真超时路径不再设端到端例（超时分支由单元伪造 E_TIMEOUT 覆盖） | 真超时夹具成本高；评审轮 2 判可接受——本条即记录 |
| 进程树清理 | win32 `taskkill /PID <pid> /T /F` | 实测：`_electron` 经 cmd 外壳启动（shell:true），只 kill 外壳会留孤儿 Electron 并锁住 userData ⇒ 下轮 `freshUserData` EPERM |
| 目录删除 | `fs.rmSync(maxRetries=5)` + 明确报错 | Windows 句柄释放滞后 |

**审计与代码评审轮次与终态**

- 内部探索偏离审计（explore 子代理）：**未执行**——通道 LLM 429（余额不足或无可用资源包），与切分 ①②③ 同因；以 advisor 代码评审 + 逐条实测读数替代，如实披露。
- advisor 代码评审轮次 1（对象 = 14 新增件 + `package.json` + 批次档 / 设计档）：**VERDICT pass**（0 🔴 · 2 🟡 · 5 🔵）。
- fix round 1（处置 4 条）：① 🟡 h① 顺延子段补断言（新增「h①·顺延段」例）；③ 🔵 对话框竞态 b 段改 waitDom、g 段 `sleep(300)` 删改 waitDom；④ 🔵 单元夹具改非默认值（openingMs 20000 / 视图改 w-2 含 thinking:true），对应断言同步；⑥ 🔵 启用开关补 f2 段（config false/true + 徽标 disabled/ready）。
- advisor 轮次 2（复核修复声明）：**pass**——①③④⑥ 逐条核实相符；新增 1 条 🔵（夹具视图 `enabled` 与配置口径不一致）；②⑤⑦ 判「有理由的不改」（父侧文档域 / 成本裁量）。
- fix round 2（处置该 🔵）：夹具视图改 `enabled:false/status:'disabled'` 与配置样板一致（未动任何断言）；复验 units 35/35。
- 终态：**clean**。

**上抛 / 未决（供父侧）**

1. 批次档 §2「DOM 契约（渲染实现与测试断言的共同面）」清单缺守门实际依赖项：`[data-add-dialog]` · `[data-platform-list] [data-platform]` · `[data-field=confirm-text|notice|service-status|service-note|about-version]` · `data-state` · `.is-active` · `window.FOUI.refresh`（评审轮 1 🟡、轮 2 维持）——测试面不能自改契约，请父侧补清单。
2. 设计档 `docs/design/overview.md` §13 验收体系命令表未登记 `verify:settings`——请父侧补一行（级别=集成 / 覆盖=a–l）。
3. 切分 ② 上抛 1（设计档 §7 通道名与实现不一致）与切分 ③ 上抛 2（`open-export` / `open-guide` 真开未机器自证）在本切分未触碰，维持原状态。
4. 首次修复前的 h① 偶发失败：失败首因未捕获到逐字断言行（该次运行输出未留档）；确认的次生缺陷 = 进程树未杀净（有 EPERM 确证读数）；加固（树杀 + 有界等待 + 目录重试）后**连续 8 次全入口全绿**（settings-run-1..6 + final + final2..5 中的加固后部分）。

**文档漂移**：无（未改设计档、批次档正文与 `src/**`；本段为 §5 追加）。

**边界声明**：未触碰 `src/**`（本轮未发现实现缺陷，缺陷只上抛）· b1 单元档与其它 `test/**` 用例未改 · 无新依赖 · MCP 契约 / 端点 / 错误码未动 · 人工场景 M1–M9 不在本命令内 · 起应用一律剥 `ELECTRON_RUN_AS_NODE`、隔离 userData 于 `.thincoder/tmp/verify-settings/`。

**补正（同段追加，勘误）**：① verify:loop 真机读数 = `files=[verify_loop.py(code_block,47B)]`（前文「46B? 47B」为笔误，以本行为准）。② 全入口运行计数 = 共 12 次（11 绿 / 1 失败）：失败 1 次为加固前（h①，1.45s，首因未留档）；加固后**连续 7 次全入口全绿**（settings-run-5、run-6、settings-final、final2、final3、final4、final5），前文「连续 8 次」为笔误。③ 轮次 2 新增 🔵 的处置（fix round 2）读数：`node --test docs/batches/b2-settings-ui.units.mjs` ⇒ 35/35。

## §6 验证与收口（父代理）

### b2 收口（2026-10-10）

**收口检查（D7 结算同步）**
- **四个切分 + 一轮定点修全部落地并父侧核验**：① 引擎检查通道（#40）· ② 设置主进程面与接线（#41）· ③ 渲染界面（#42）· ④ 测试与验收面（#44）· 定点修（#43 快照并入 `toggles`）。
- **父侧验收（主包AI 亲跑，不采信自述）**：`npm run verify:settings` **6/6** · 随批单元 **35/35** · b1 单元 **27/27** · `verify:mcp` **1/1** · `verify:engine` **3/3** · `verify:runtime` **2/2** · **`verify:loop` 真机 1/1**（任务 16.6s、`transport=sse`、取件 1 个）。
- **结构**：`src/**` 无 >300 行文件（最大 `scheduler.mjs` 298 · `index.mjs` 296 · `service.mjs` 293）；测试件与随批单元件全部 ≤300 行（唯一 295 行者 = 测试基础设施 `test/integration/settings.session.mjs`）。
- **`_electron` 前置（评审 ⑪ 兑现）**：**成**——缺省形态 615ms 起、读到 `file://…/src/settings/index.html`、`window.fo` 为 object；**CDP 退化路径亦强制测绿**（`FO_VERIFY_SETTINGS_DRIVER=cdp`）⇒ 备选不是死代码。
- **本批共修 3 处真缺陷**（均由实现/评审自发现，非父侧兜底）：① `ConfigStore.save` 写失败未回滚内存（b1 遗留，② 修）· ② 设置快照缺 `workers[].toggles` ⇒ T7 开关无法回显（③ 发现、② 定点修）· ③ 删除外包工后重建会继承旧健康状态（② 的 advisor 发现并修）。
- **跨切分评审（父侧 advisor，第二意见）**：轮 1 = changes-required（1 🔴 = 通道名同一机制两处不同；3 🔵）→ 修（批次档 §2 T8 改为以 `settings-app.md` §7 的 `fo:snapshot` / `fo:patch` 为准）→ **轮 2 = pass**。
- **验收可靠性（诚实项）**：④ 加固前 `verify:settings` 失败 1 次，定位两真因（自身脚手架：`_electron` 经 cmd 外壳启动致孤儿进程锁 userData；机制竞态：开窗早于 MCP 就绪的瞬态显示）——**加固的是脚手架，未放宽任何断言**；加固后连续 7 次全绿，父侧复跑 1 次全绿。
- **文档同步（由本批评审上抛触发）**：本档 §2「DOM 契约」清单补齐守门实际依赖项（`[data-add-dialog]` / `[data-platform-list]` / `[data-platform=<id>]` / `data-state` / `.is-active` / `confirm-text|notice|service-status|service-note|about-version|workers-empty` / `window.FOUI.refresh`）；`docs/design/overview.md` §13 命令表登记 `verify:settings` 并补 AC 映射；`docs/design/modules/settings-app.md` §7 通道名以 `fo:*` 为准（均为**主包AI 直改·小改·可回退**）。
- **台账**：#4 / #5 本批覆盖，已核销（证据见各台账行）；技术待办保留 **#15**（检查在途 vs 新派单的反向竞态，设计档 §10 已记残余风险）· **#16**（徽标不随任务状态自更新）· **#17**（启动期快照竞态）。
- **暂缓批复核**：无。
- **人工场景（M1–M9）**：机器可跑部分已由 `verify:settings` 覆盖；**需操作者的 7 项**留待人工——M1（真机登录引导）· M2（改名后真机派单）· M3（交付目录回落真机）· M4（开关载荷随动真机）· M5（调序后选人真机）· M6（托盘三入口真开）· M7（与 ① 文档对照）· M8（config 置只读 ⇒ 报错+回滚的 UI 观察）· M9（单实例 ⇒ 设置窗口打开并聚焦）。其中 **M2/M4/M5 依赖「免费外包」通道**，当前受**平台风控验证码**阻塞（`E_CAPTCHA_OR_RISK`，需在浏览器窗口人工处理 + 托盘「我已处理」）。
- **未收口项**：无（b3 / b4 属后续批次，各自立档）。

**冻结**：本记录自「已收口」状态行起冻结，此后不再回改；后续工作另立批次。
