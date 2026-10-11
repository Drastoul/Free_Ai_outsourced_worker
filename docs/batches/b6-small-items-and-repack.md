# 2026-10-11 · b6 小项清理与打包刷新
> 六段 append-only，一段一作者：§1 讨论（主 agent）· §2 批次任务与设计（eng-designer）· §3 设计评审（评审子代理）· §4 用户批准（主 agent）· §5 实施记录（eng-coder）· §6 验证与收口（父代理）。
> 编制：主 agent · 2026-10-11 · 来源 = 用户 2026-10-11 19:14「做」（回应主包AI 的「把这几个小项归一批收拾（#21–#28 + 打包刷新）」提议）+ 台账未决行 #17 / #23 / #24 / #26 / #28（#21/#22 的条件未满足；**#25/#27 已于 2026-10-11 19:25 由用户裁定并入本批** ⇒ §2 T6 / T7）+ 说明书更新（提交 f6ff0ef）需要重新打包才能进安装包。
> 台账 = #28（免费外包 · 归批）。前情 = docs/batches/b5-session-reuse.md §6（已收口 2026-10-11）。
## §1 讨论（主 agent）
**状态行**：已收口 2026-10-11（T1–T7 全部交付（切分 A 引擎面 #84 · 切分 B 设置面 #85 · T5 打包刷新父侧）并由父侧全套回归验收（b1 27 · b2 35 · b3 11 · b4 7 · b5 14 · b6 15 · verify:mcp 1 · engine 12 · runtime 2 · settings 6 · 真机 verify:loop 1 + verify:loop:kimi 1）；设计评审轮 1 pass + 两轮修复全处置；实施期真机抓到并修掉 Kimi 面板收起竞态缺陷；C1 取数命中（Kimi requestPayloadCapture=true，ok 只比受支持子键）；T5 经 release2 路线产包（350,943,899 B）并通过两条设计验收读数，verify:pack 段 A–D 因不可见文件锁挂账台账 #29；台账 #17/#23/#25/#26/#27/#28 已核销）
<§1 模板占位：本批条目 / 关键判据 / 授权口径>

### §1 讨论与范围裁定（主包AI，2026-10-11）

- **来源**：用户 2026-10-11 19:14「做」（回应主包AI 的提议「把这几个小项归一批收拾（#21–#28 + 打包刷新）」）⇒ 本批成立；覆盖台账行 = **#17 / #23 / #26 / #28**（另有三条随本批追认核销：#10 / #13 / #20——前提已被 b4 打包链与文档地图消费）。

- **范围裁定（主包AI；按台账 trigger 与「缺陷修复 vs 新机制」划线）**：
  - **在本批**：**并入（2026-10-11 19:25 用户裁定）**：#25 / #27 ⇒ §2 T6 / T7（能力位按子键化 · 设置界面「会话复用」开关与两键）；T1 #17（设置窗口启动期快照竞态）· T2 #23（引擎**用户可见**措辞中性化，错误码码值不动）· T3 #26（无开关能力平台的界面**陈述不实**，只修这一面）· T4 #28①②③（b5 收尾三条代码项）· T5 打包刷新（把说明书 `f6ff0ef` 与本批修复带进安装包，不重设计打包链）。
  - **不在本批（逐条理由）**：#21 / #22 —— 台账 trigger 为「**条件**」且条件未满足（「需要减小分发体积」/「再出现同形抖动时」）；#11 / #12 / #15 / #16 —— 更大的项；#14 —— 需新建仓库根 `AGENTS.md`（涉及项目约定文件，待与用户单独确认口径）；#28④ 与 #24 —— **人工场景**（真机「复用 × DOM 兜底」读数 / Kimi 带附件派单，后者需 Kimi 工位登录）。
  - **入本批的判据**：属**缺陷修复**（实现与既有需求/设计/记录相矛盾 ⇒ 回到源头的工作），不引入新机制、不动 MCP 契约与错误码语义。

- **两条裁定（回应设计代理上抛 U2 / U3）**：
  - **U2（#28 的核销口径）= 同意**：①②③ 随本批实施核销；**④ 转人工挂账**（与 #24 同列人工场景），**不以 fixture 层 J9 冒充真机读数**。
  - **U3（打包新内容判据）= 同意不沉淀**：随包 `guide/agent-brief.md` 与仓库现行文档字节相等、asar 内 `task-runner.mjs` 含新词 —— 均作**一次性读数**（不写常驻断言：文档微调不应逼重打包）。

- **需求档合规检查**：设计代理检查面**未发现缺口**（AC-R8-1 中 `chat/completion` 属 DeepSeek 核对通道的**证据面**表述；本批只中性化引擎**用户可见面**）；需求档随动两处（U5-1/U5-2）。
- **行号校正**：设计代理已逐条读盘校正派单所引坐标（`index.mjs:170/:221` · `task-runner.mjs:167/:195/:200` · 其余一致），见 §2 :162–176。

### 修复轮后的父侧裁定与轮次判定（主包AI，2026-10-11）

- **#82（评审 7 条中的 5 条 + `:22`）已核**：28 处改动落盘、**§3 记录面一字未动**（编辑前后逐行比对一致）；父侧另以残留词扫描复核（`另批` / `8–12` / `11 例` / `~130` / `deepseek:true` / `并列生效`）⇒ 剩余命中**全部**为 §3 评审原文或有意保留的语境句 ⇒ 其「0 遗留」自述成立。
- **#83（其两条报备）已核**：请求式措辞转陈述式；**基表删 14 行冗余 + 12 行信息并入合并表** ⇒ 同一源码/测试文件只剩一处行数计划；它还**抓出合并表自身一处错行**（`window.mjs` 误记「不改」，实际 T1 要动它）⇒ 已恢复 T1 的既有结论（未新造结论）。
- **对 #83 五条报备的裁定**：① `window.mjs` 两表互斥 = **Fixed（#83 已并）**；② `:192/:193/:194/:302` 的「现写 / 建议文案 / 主 agent 的笔」= **Fixed（主包AI 本轮直改）**——对象均已落盘，改为陈述式并删除提案残留；③ §3 所引旧文案 = **Not an issue**（记录面按令不动，正确）；④ `service.mjs`「两口径并存」= **Not an issue**（合并表已改为区间口径「295 → ~298…~301（净增读数以实施实测为准）」，差异表的「+6 ⇒ 301」是该结论的依据且被区间涵盖；**拆分落件结论不变**）；⑤ 时点提示 = **裁定：不需要评审轮 2**——轮 1 之后的一切编辑均为**轮 1 自身发现的处置**（即其建议内容）或**记录 / 计数卫生**，**机制设计、冻结接口、验收判据零变化**（可逐条比对），不构成新的评审对象；实施期若发现偏离，按修复轮流程另议。
- **裁定后状态**：设计链 = §2 定稿（T1–T7 · D1–D17 · 合并后唯一一套文件计划）+ 需求档三处随动（`:233` / `:236` / `:282`）+ 设计档五处同步；**待用户批准（§4）**。

## §2 批次任务与设计（eng-designer）
**状态行**：设计完成（fix 轮：#25/#27 并入成 T6/T7 · 合并后唯一一套文件计划 · 决策至 D17 · §1 随动与需求档随动已落 · 轮 1 评审发现定点修已落 · 待评审）
<§2 模板占位：本批条目（覆盖） / 设计档落点 / 机制设计 / 受影响文件与测试面 / 验收对照 / 关键决策 / 上抛项>

### 本批（b6）范围与覆盖

覆盖条目（三条链：台账行 ↔ 本段 ↔ 设计档）：**五个已定位小项**——

1. **#17 设置窗口启动期快照竞态**：开窗早于 MCP 就绪时，那一刻的「服务状态」广播（`src/main/index.mjs:221`）在页面加载期会被渲染层丢弃 ⇒ 接入指引页可能停留「未启动」且无手动刷新入口（影响 = 瞬态显示、非数据错误）。**修法 = 页面加载完成（`did-finish-load`）后补推一次全量快照**（D1）。
2. **#23 引擎措辞绑定 DeepSeek 协议名**：`src/engine/answer.mjs:62` 的 `E_SEND_FAILED` 文案与 `src/engine/task-runner.mjs:200` 的日志写 `chat/completion`，Kimi 任务失败照抄该措辞 ⇒ 中性化为「答复流请求」；**错误码与语义不动**。
3. **#26 设置界面对无开关能力的平台陈述不实**：`src/settings/index.html:30` 与 `src/settings/renderer-workers.js:95-116` 对每个外包工渲染「深度思考 / 联网搜索」并标「派单时自动应用」，而 `src/engine/adapters/kimi.mjs:34` 的 `toggles:false` 使引擎在 `src/engine/task-runner.mjs:167` / `:195` 整体跳过应用与复核 ⇒ **按能力位门控渲染**（不受支持的子键不渲染对应开关 + 行内一行提示；子键级口径见 D15）。只修「陈述不实」这一面；能力位子键化 = 台账 #25，已并入本批（T6）。
4. **#28 的 ①②③**（b5 收尾代码项）：① 基线打标失败被静默吞（`src/engine/adapters/deepseek-dom.mjs:24` / `kimi-dom.mjs:25` 的 `.catch(() => 0)`）⇒ 补一行日志；② `src/engine/session-policy.mjs:49` 的 `decide({now})` 无缺省 ⇒ 给缺省；③ `capabilities.newChat === false` 守卫（`src/engine/task-runner.mjs:159` / `:275`）无测试覆盖 ⇒ 补一条（落点见 D9）。
5. **打包刷新**：本批代码落地且机器判据全绿后重跑 `npm run dist` 与 `npm run verify:pack`，把 `docs/guide/agent-brief.md` 的新内容（提交 `f6ff0ef`：「派单体量与稳定性」与「连续失败自救顺序」两节）与本批修复带进安装包；清单 / 口径沿用 b4（`docs/batches/b4-package-ship.md` §2 与 `docs/batches/b4-package-ship.checklist.md`），不重设计打包链。

**本批性质**：缺陷修复类小项 + 一次打包刷新；**不引入新机制**——每项修到与既有设计一致；凡用户可见陈述与实际行为不符的（#23 / #26）按「陈述真实」最小修正。

**需求档合规检查（检查面，不改需求档）**：五处均与需求档同向、无缺口——① #26 与 R8 边界「不造平台未提供的开关」及 R8 末行「无任一受支持子键的平台 ⇒ 跳过开关子步；AC-R8-* 不适用；部分子键受支持按子键执行」同向（`docs/requirements/overview.md:229` / `:236`）；② #23 只改文案与日志词形（错误码表 `docs/design/modules/mcp-server.md:125` 的码值与语义面不变）；③ #17 属 F7.2（接入指引页显示服务实况）的实现面加固；④ #28 为 b5 收尾小项，机制与 AC-R10-* 判据不变（设计权威 `docs/design/modules/browser-engine.md` §9）；⑤ 打包刷新 = AC-R6-1 的重跑（`docs/requirements/overview.md:190`），无需求变更。

### 不在本批

- **条件未满足**：#21（打包体积优化——触发条件 = 需要减小分发体积）· #22（`verify:settings` 偶发抖动——触发条件 = 再出现同形抖动并抓到断言名与栈）。
- **更大的项**：#11 / #12 / #15 / #16。
- **单独议 / 需前置**：#14（开发环境坑落点需新建仓库根 `AGENTS.md`）· #24（Kimi 附件人工场景，需人工登录 Kimi 工位后执行）。
- **人工场景，不进代码面**：#28④（真机「复用 × DOM 兜底」补读数——b5 的 J9 只到 fixture 层）。
- **不重做**：打包链设计（配置 / 脚本 / 清单口径）· MCP 六件套契约 · 工单语义 · 调度与协议面。

### 设计档落点（本轮已由设计代理同步；评审对象含此两处）

- `docs/design/modules/settings-app.md`：§2 增「开关的能力门控（b6）」（:21）· §7 增「窗口加载完成补推（b6）」（:59）· §8 增 b6 验收一条（:67）。
- `docs/design/modules/adapters.md`：§2 能力位注释（:21）· §3.4 增「基线打标失败不静默（b6）」（:80）· §5.3 末条改为落地实况（:167；原「已知不符（已记账）」句删除——规范面不留废句，历史留本档）。
- **本批不改**：`browser-engine.md`（#28② 为 `decide` 参数缺省 = 实现层防呆；§9 的机制 / 判定顺序 / 不变量零变化）· `scheduler.md`（#23 的文案与日志无对应条目；`:93` 超时表只记错误码，码值未动）· 需求档（主包AI 的笔）。
- 权威顺序：机制以设计档为准（单一来源）；批次档本节 = 实施合同与判据。

### 条目表（T1–T5）

**T1 #17 启动期快照竞态兜底**
- 目标：开窗早于 MCP 就绪时，接入指引页在页面加载完成后必拿到服务实况（不停留于「未启动」）。
- 功能点：`src/settings/window.mjs` 的 `createSettingsWindow` 内、`loadFile` 调用前挂一次性监听 `win.webContents.once('did-finish-load', …)`：记一行 info `设置窗口：加载完成，补推一次全量快照（启动期竞态兜底）` + `void service.emitChanged('窗口加载完成')`（走既有全量快照广播链 `service.emitChanged → controller.broadcast`；幂等——无变化也只是重画一次）。
- 边界：不加手动刷新入口（D1 被否项）；不改渲染层 `boot()` 的既有取快照逻辑（`src/settings/renderer.js:204`）与广播链语义；不改开窗时序（`src/main/index.mjs:170` / `:215-218` 不动）。
- 验收：`npm run verify:settings`——① 既有「服务就绪后显示运行中」有界等待（`settings.guide-page.test.mjs:46-48`，测试驱动默认 `FO_OPEN_SETTINGS=1` ⇒ 全程即「开窗早于 MCP 就绪」的真实时序）不回归；② 新增：app.log 有界等待命中 `加载完成，补推一次全量快照`。读数口径见「验收对照」3。
- 依赖：无（单文件）。

**T2 #23 引擎措辞中性化**
- 目标：失败回执与日志不再替平台背书 DeepSeek 协议名（Kimi 失败照抄该措辞会误导）。
- 功能点：① `src/engine/answer.mjs:62` 文案 ⇒ `发送未确认：${budgetMs}ms 内未观测到答复流请求`；② `src/engine/task-runner.mjs:200` 日志 ⇒ `已发送（观测到答复流请求）`；③ 两文件的跨平台注释（`answer.mjs:3` / `:55`）同词形随动（该模块对任意平台生效）。**平台专属模块**（`deepseek*.mjs` / `kimi*.mjs`）内的 `chat/completion` 保留——那是 DeepSeek 协议的正确描述（如 `deepseek-stream.mjs:14`、`deepseek-page.mjs:19`）。
- 边界：`E_SEND_FAILED` 码值与语义不动（错误码表封闭；重试分类 `docs/design/modules/scheduler.md:75` 不动）；不改 `waitForSendConfirm` 判据（仍是「本任务流请求出现」）；不改 MCP 面。
- 验收：`npm run verify:engine`——J3 例（`test/integration/engine.session.test.mjs:151-172`）新增文案断言；J8 例（`:232`）日志等待词随动；另一次性读数：`answer.mjs` + `task-runner.mjs` 内 `chat/completion` 出现次数 = 0。
- 依赖：无。

**T3 #26 设置界面能力门控**
- 目标：对不受支持的子键（如 Kimi 的 thinking）不再出现「派单时自动应用」的假陈述。
- 功能点：见「机制设计 2」——快照 `platforms[].toggles` 派生 + 渲染层按子键门控 + 页面级提示句随动（`src/settings/index.html:30`）。
- 边界：不动 config schema（`toggles` 键保留、默认不变）· 引擎侧跳过行为与能力位口径的子键化 = T6（界面侧门控口径见 D15）· 不影响支持能力平台行的既有 DOM 契约（`[data-toggle]` / title「派单时自动应用」）。
- 验收：`npm run verify:settings`——新增断言（快照 `platforms[].toggles` = `deepseek {thinking:true,search:true} / kimi {thinking:false,search:true}` 子键对象；Kimi 行 `[data-toggle]` 恰 1（search）∧ `[data-field=toggles-unsupported]` 文本含「深度思考」）；DeepSeek 行两开关与既有 b/f 段断言逐字不回归。
- 依赖：无（与 T1 独立）。

**T4 #28 的 ①②③（b5 收尾代码项）**
- 目标：清掉 b5 代码评审的三条非阻断代码项。
- 功能点：① `deepseek-dom.mjs` / `kimi-dom.mjs` 的 `markAssistantBaseline(page, { log } = {})`：失败 ⇒ 记一行 `助手回合基线打标失败：<message，截断 120 字>` 且仍返回 0（不抛）；调用点 `deepseek.mjs:107` / `kimi.mjs:57` 透传 `{ log: ctx.log }`。② `src/engine/session-policy.mjs:49` 的 `decide` 增 `now = Date.now()` 缺省。③ `newChat === false` 守卫补一条测试（落点 = D9）。
- 边界：不改「打标失败 ⇒ 任务失败」（D7）· 不改 `markNewSession` / `recordOutcome` 的 `at`（D8：两调用点均显式传值，无可达 NaN 路径）· 不改会话机制语义。
- 验收：批内单元（`docs/batches/b6-small-items-and-repack.units.mjs`）+ `npm run verify:engine` 新例；读数见「验收对照」1/2。
- 依赖：无。

**T5 打包刷新**
- 目标：装机包 = 本批修复 + `f6ff0ef` 说明书新内容（同版本覆盖产物）。
- 功能点：① `npm run dist` ⇒ 刷新 `release/免费外包-0.0.1-setup.exe`；② `npm run verify:pack` 段 A–D；③ 两条一次性读数：随包 `guide/agent-brief.md` 与仓库现行文档 **sha256 相等**（证 `f6ff0ef` 进包）· asar 内 `src/engine/task-runner.mjs` 含本批新词「观测到答复流请求」（证修复进包）。
- 边界：不重设计打包链（配置 / 脚本 / 清单口径沿用 b4）· 版本号不变（0.0.1；如需升版 = 用户裁定）· 不做签名 / 更新通道 · b4 checklist 的 M1–M5 人工项仍挂账（本批不重跑）。
- 验收：见「验收对照」4/5；**顺序硬约束** = T1–T4 全部落地且机器判据全绿（已合入工作树）后才构建。
- 依赖：T1–T4。

### 机制设计

1. **T1 补推（唯一新增动作）**：设置窗口控制器 `open()` 内挂 `did-finish-load` 一次性监听 ⇒ 调 `service.emitChanged('窗口加载完成')`。选择理由：`did-finish-load` 是「此后向该窗口的 `webContents.send` 必达」的确定时点；补推走既有广播链（不新增通道 / 状态）；对「窗口打开晚于服务就绪」「服务未启动」两种情况同样成立（推的是当下快照）。
2. **T3 能力门控链（子键级）**：适配器 `capabilities.toggles` 子键对象（唯一权威：归一化后的各平台声明，见 T6）→ 主进程快照派生 `platforms[].toggles`（`platform-capabilities.mjs` 的 `buildPlatforms`；`service.mjs` 的 `getSnapshot` 调用；import 适配器注册表 `getAdapter`，`src/engine/adapters/registry.mjs:17`）→ 渲染层按子键门控（`renderer-workers.js` 的 `buildRow`：受支持子键 ⇒ 对应开关；不受支持子键 ⇒ 一行 `[data-field=toggles-unsupported]` 提示、不渲染该子键的 `[data-toggle]`）→ 页面级提示句随动（`index.html:30`）。缺信息 / 未知平台回退 = 两键均按不支持渲染（D6）。
3. **T4-① 打标失败可见化**：保持「不抛错」（DOM 只是兜底通道）+ 一行日志（取证线索——失败时 DOM 兜底可能把上一单回合计入）；日志随 `ctx.log` 进 task 日志（`<userData>/logs/app.log`）。
4. **T4-② 缺省**：`decide({ workerId, now = Date.now(), config, page } = {})`——缺省只在省略 `now` 时生效（生产调用点 `src/engine/task-runner.mjs:160` 始终显式传值，行为零变化；防呆面向直接调用 / 测试）。

### 受影响文件与测试面（**T1–T5 独有文件**；其余文件的行数计划见下文「合并后唯一一套计划」；行数口径 = read 工具读数，与 b5 §2 同；实施后按实际回调）

| 文件 | 现况 → 预期 | 职责 / 改动 | 拆分判断 |
|---|---|---|---|
| `src/engine/session-policy.mjs` | 121 → 121 | T4-②：:49 增 `now = Date.now()` | — |
| `src/engine/adapters/deepseek-dom.mjs` | 80 → ~84 | T4-①：`markAssistantBaseline(page, { log })` + 失败日志（仍返回 0） | — |
| `src/engine/adapters/kimi-dom.mjs` | 50 → ~54 | T4-①：同 | — |
| `docs/design/modules/settings-app.md` | 65 → 73（**已落**） | 设计档同步（:21 / :59 / :67） | — |
| `docs/design/modules/adapters.md` | 168 → 172（**已落**） | 设计档同步（:21 / :80 / :167） | — |
| （不改）`package.json` | 32 | 无新命令 / 依赖；`verify:engine` 已含两测试文件 | — |

### 冻结接口（本批实现不得偏离）

- **MCP 六件套零改动**（工具名 / 入参 / 返回形状 / 错误码码值与语义）。
- **设置快照只增** `platforms[].toggles`（增量键；既有键与形状不变；`platforms[].available` 语义不动）。
- **新增日志词形（正则可判，供读数）**：`加载完成，补推一次全量快照` · `已发送（观测到答复流请求）` · `助手回合基线打标失败`。用户可见文案：`发送未确认：<ms>ms 内未观测到答复流请求`（正则 `/发送未确认：\d+ms 内未观测到答复流请求/`）。
- **DOM 锚点**：新增 `[data-field=toggles-unsupported]`（不受支持子键的行内提示行）；`[data-toggle]` 按**子键级**出现（受支持子键才有对应锚点；支持平台行与 b2 逐字一致）——明细见「冻结接口（本 fix 轮增量）」。
- **环境口径（照做）**：起应用剥 `ELECTRON_RUN_AS_NODE`；中文断言 UTF-8 感知（不用 `findstr`）；临时件 `.thincoder/tmp/`；遇 429 / 额度类错误立即停止重试并如实报。

### 验收对照（机器判据 + 读数口径）

1. **批内单元**：`node --test docs/batches/b6-small-items-and-repack.units.mjs` —— 判据 = ① 打标失败（fake page 的 `evaluate` 抛错）⇒ 两平台（deepseek / kimi）各记一行 `助手回合基线打标失败` 且返回 0、不抛；② `decide` 省略 `now` ⇒ `idleMs` 有限（`Number.isFinite`）且 TTL 到期（`at = Date.now() − 700000`，默认 ttl 600000）判 `ttl`、未到期（−1000）判 `reuse`。
2. **`npm run verify:engine`**（12 例 = 既有 3 + 会话 7 + 新守卫 1 + T6 新例 1）—— T2 读数：J3 的 `r1.error.message` 命中中性文案、J8 的日志等待命中 `已发送（观测到答复流请求）`；T4-③ 读数：守卫例 = `state.openSessions === 0` ∧ 日志无 `新会话（` / `复用会话（` ∧ `runner.sessionPolicy.units.size === 0` ∧ 任务仍 `done`；J1–J9 与既有 3 例不回归（除 J3/J8 两处按 T2 随动）。
3. **`npm run verify:settings`** —— T1 读数：app.log 有界等待命中 `加载完成，补推一次全量快照` ∧ h① 既有「运行中」有界等待不回归；T3 读数：快照 `platforms[].toggles` = `deepseek {thinking:true,search:true}` / `kimi {thinking:false,search:true}` ∧ Kimi 行 `[data-toggle]` 恰 1（`search`）∧ `[data-field=toggles-unsupported]` 文本含「深度思考」∧ DeepSeek 行 `[data-toggle]` = 2（b/f 段既有断言）。
4. **`npm run dist`** —— 读数 = exit 0 ∧ `release/免费外包-0.0.1-setup.exe` 存在、MZ 头、≥120MB、mtime 属本批构建窗口；失败读数照实记（EBUSY ⇒ 按 b4 checklist §0 的 `--config.directories.output=.thincoder/tmp/release2` 重建后合成）。
5. **`npm run verify:pack`** —— 段 A–D 4/4（段 C 依赖平台可达 / 登录态，照实读数、不造假绿）；另两条一次性读数见 T5-③。
6. **父侧收口回归（唯一一次全套）**：`verify:mcp` / `verify:runtime` / 四个批内单元（b1 27 · b2 35 · b3 11 · b5 14）+ `verify:loop` 真机（行为面未动，按父侧口径执行）。
7. **人工场景**：本批不新增；`#28④` 与 b4 checklist 的 M1–M5 仍挂账（见「上抛项」U2）。

### 关键决策记录（含被否方案）

- **D1（#17 修法）= `did-finish-load` 后补推一次全量快照**。理由：修在「推送可靠性」层——页面加载完成是「此后 `webContents.send` 必达」的确定时点；复用既有广播链（幂等、零新状态）。被否：① 接入指引页加「刷新」按钮——新增界面面、暗示页面会错（治症状）；② 只在渲染层加重试——渲染层已按广播/打开取全量，缺口在启动期那一次推送的丢失窗口；③ 挪开窗时序（先服务后开窗）——开窗语义本身合理（先给用户窗口），且页面加载仍可能慢于服务，挪动不消窗口。
- **D2（#17 判据）= 既有「运行中」有界等待 + 新日志读数**。不造「丢包可复现」的假断言（时序竞态不可稳定复现）；判据取「机制已触发（日志）+ 结果不回归（有界等待）」。
- **D3（#23 词形）= 中性词「答复流请求」**；跨平台模块（`answer.mjs` / `task-runner.mjs`）的文案 + 日志 + 注释统一；平台专属模块保留协议名。被否：① 按平台取词（措辞多份维护、可读性不增）；② 保留 `chat/completion`（对 Kimi 是错陈述）；③ 只改文案不改注释（同文件内两种称呼并存，读者混淆）。
- **D4（#26 隐藏 vs 禁用）= 隐藏 + 行内一行提示**。理由：引擎对该平台**整体跳过**应用与复核（`task-runner.mjs:167` / `:195`）⇒ 控件无任何效果；禁用态仍呈现「可能某天可用」的配置面，且配置里的惰性值与其有效值不可区分；隐藏 + 明示把事实说清一次。被否：禁用（保留无效歧义面）。
- **D5（#26 能力来源）= 主进程从适配器注册表派生快照 `platforms[].toggles`**（`getAdapter(id)?.capabilities?.toggles === true`）。理由：与引擎分支条件同源（单一权威）；注册表链条纯 Node（全仓仅 `src/engine/browser.mjs:10` import playwright）⇒ 主进程可安全 import。被否：① 在 `PLATFORM_CHOICES`（`src/settings/patches.mjs:20-23`）手抄能力位——第二份真值会漂（`available` 已是手工镜像，不再加一处）；② 渲染层硬编码平台→能力映射（更差）。
- **D6（#26 缺信息回退）= 按「不支持」渲染**（`platforms` 缺该键 / 未知平台 ⇒ 不渲染开关）。理由：陈述真实性优先；且未注册平台在引擎侧本就派不出去（`E_WORKER_UNAVAILABLE`）。
- **D7（#28① 失败语义）= 记日志、仍返回 0、不中断发送**。被否：升级为任务失败（DOM 只是兜底通道，升级会误杀正常任务）。
- **D8（#28② 范围）= 只给 `decide` 的 `now` 补缺省**；`markNewSession` / `recordOutcome` 的 `at` 不扩面——两个调用点均显式传值（`task-runner.mjs:164` / `:276`），无可达 NaN 路径。
- **D9（#28③ 落点）= `test/integration/engine.test.mjs`**（`verify:engine` 命令不变）。理由：`engine.session.test.mjs` 现况 280 行，加该例（≈35 行）越 300 档 ⇒ 或拆文件或迁移；`engine.test.mjs` 199 行余量充足，夹具（`engine-helpers.mjs`）同源。被否：拆出第三个测试文件（同命令再加文件 + 夹具重复）。
- **D10（打包刷新口径）= 沿用 b4 链**：`npm run dist` → `npm run verify:pack`；版本号不变（0.0.1，同版本覆盖产物）；清单 `b4-package-ship.checklist.md` 不动；新内容判据 = 与仓库现行文档字节相等（一次性读数，不沉淀为常驻断言——否则每次文档微调都要求重打包；见 U3）。
- **D11（测试面）= 新增批内单元 1 件 + 四处集成测试随动**（见文件表）；不新开 `verify:*` 命令。

### 边界与禁止范围

1. 不改 MCP 六件套契约 / 错误码码值与语义（#23 只改文案）。需求档 AC-R8-1（`docs/requirements/overview.md:233`）里 `chat/completion` 作为 DeepSeek 核对通道的表述属证据面，不在本批（仅引擎**用户可见面**中性化）。
2. 不改打包链（配置 / 脚本 / 清单口径）；不升版本号；不做签名 / 更新通道。
3. 不引入新机制：全部为既有机制的最小修正（补推 = 既有广播链的一次调用；门控 = 既有能力位的读取）。
4. 不改 config schema 与 `toggles` 配置键（Kimi 的键保留；界面门控口径 = 按子键，见 D15）；能力位子键化与「会话复用」界面 = 本批 T6 / T7。
5. 不改支持能力平台行的既有 DOM 契约（`[data-toggle]` / title「派单时自动应用」）。
6. 不改 `markNewSession` / `recordOutcome` 的 `at`（D8）；不改会话判定顺序与不变量。
7. 不改需求档 / 其它批次档（需求档的笔 = 主包AI；本段只写设计落点与判据）。
8. `src/main/index.mjs` 与 `package.json` 不改（见文件表）。
9. 环境口径照做（剥 `ELECTRON_RUN_AS_NODE` / UTF-8 中文断言 / 临时件 `.thincoder/tmp/` / 429 即停）。
10. 打包段 C 依赖平台可达与登录态——读数照实（不得造假绿）。

### 上抛项

- **U1（记录面）**：本档 §1 现为模板占位（状态「🔄 进行中（…）」），本段以档头「来源」行 + 派单事实 + 台账行为据起草（同 b4 §2 的做法）；非阻塞，请父侧知悉。
- **U2（台账 #28 的结算范围）**：本批只落 ①②③；第 ④ 条（真机「复用 × DOM 兜底」补读数）= 人工场景。若 ①②③ 验收全绿而 ④ 未做，请裁定 #28 的核销口径（建议：①②③ 核销 + ④ 转人工挂账；不建议以 fixture 层 J9 冒充真机读数）。
- **U3（打包新内容判据是否沉淀）**：本批用「随包文档与仓库现行文档字节相等」的一次性读数证 `f6ff0ef` 进包；**不建议**把它写成常驻断言（每次文档微调都会让 `verify:pack` 变红、逼重打包）。若要沉淀，请裁定口径（如仅在收口时人工核）。

### 对派单 / 台账已知事实的逐条复核（读盘校正；行号按现行文件）

| 项 | 派单 / 台账所引 | 读盘实况（现行） | 处置 |
|---|---|---|---|
| #17 开窗点 | `src/main/index.mjs:163` | `settings.openIfRequested();` 在 **:170** | 行号校正 |
| #17 广播点 | `:208` | `void settings?.emitChanged('服务状态');` 在 **:221**（`startMcpServer` 在 :191） | 行号校正 |
| #23 文案 / 日志 | `answer.mjs:62` / `task-runner.mjs:193` | `answer.mjs:62` 逐字一致；日志实为 **task-runner.mjs:200** | 行号校正 |
| #26 渲染点 | `renderer-workers.js:96` / `index.html:30` | 一致（开关块 `renderer-workers.js:95-116`；提示句 `index.html:30`） | ✓ |
| #26 引擎跳过点 | `task-runner.mjs:160 / :188` | 应用守卫在 **:167**、发送前复核守卫在 **:195** | 行号校正 |
| #26 能力位 | `kimi.mjs` `toggles:false` | `kimi.mjs:34`（对照 `deepseek.mjs:36` = true） | ✓ |
| #28① | 两 dom 模块「静默吞」 | `deepseek-dom.mjs:24` / `kimi-dom.mjs:25` 的 `.catch(() => 0)` | ✓ |
| #28② | `decide({ now })` 无缺省 | `session-policy.mjs:49` 一致 | ✓ |
| #28③ | `newChat === false` 守卫 | `task-runner.mjs:159`（opening）/ `:275`（finally） | ✓ |
| 竞态触发面（补强） | —（派单未给） | 测试驱动 `test/integration/settings.driver.mjs:68` 默认 `FO_OPEN_SETTINGS='1'` ⇒ `verify:settings` 全程即「开窗早于 MCP 就绪」的真实时序；`settings.guide-page.test.mjs:46-48` 注释已记该瞬态 | T1 判据据此设计 |
| 打包起点 | `f6ff0ef` = agent-brief 新内容 | 提交 2026-10-11 19:12:59（`docs/guide/agent-brief.md` +8 行两节）；盘上 `release/` 为 b4 更早构建 ⇒ 需重跑 | ✓ |

### 三链自检

本段条目（T1–T7）↔ 台账行 #17 / #23 / #25 / #26 / #27 / #28（①②③）（技术待办类）+ 打包刷新另挂需求 R6·AC-R6-1（`:190`；R8 边界 `:229` / 末行 `:236`、R10 边界 `:282` 为合规对照）↔ 设计档五处（`settings-app.md` §2·§7·§8 / `adapters.md` §2·§3.4·§3.8·§5.1–5.3 / `outbox.md`（manifest `toggles` 字段语义）/ `scheduler.md` §10 / `docs/design/overview.md` §3.2·§4；落点清单见「设计档落点」）——三条链同源；设计档同步五处本轮已落；需求档随动两处（U5-1 / U5-2）已由主 agent 落笔，无未处置语义新增。

### fix 轮 · #25 / #27 并入（T6 / T7；2026-10-11 19:25 用户裁定；定点扩写）

**扩批来源与覆盖**：用户 2026-10-11 19:25 裁定把 **#25**（能力位按子键化）与 **#27**（设置界面「会话复用」开关与两键）**并入 b6**（原「另批」裁定被定点推翻——仅此两点；其余范围裁定不动）。本块 = §2 增补：新条目 **T6 / T7** + 配套（机制设计续 5–8 · 合并文件计划 · 冻结接口增量 · 验收对照 8–13 · 决策 D12–D17 · 与草案差异 / 上抛 / 边界）。**T3 的行门控口径与文件行数按下文「合并后唯一一套计划」为准（本块覆盖）**；T1 / T2 / T4 / T5 条目不变（T5 顺序硬约束扩为 **T1–T7**）。

**§1 随动项（段白名单：eng-designer 仅 §2——该随动已由主包AI 落笔，2026-10-11 19:25 裁定）**：
1. 档头「来源」行（:3）已含 19:25 裁定（#25 / #27 并入本批 ⇒ §2 T6 / T7）。
2. §1 范围裁定（:14 / :15）已落 19:25 裁定：#25 / #27 在「在本批」项内（⇒ §2 T6 / T7），「不在本批」清单不含此两项。

**需求档随动项（已由主包AI 落笔，2026-10-11）**：
- **U5-1（已落）**：`docs/requirements/overview.md:236` 现文 =「无**任一受支持子键**的平台（`capabilities.toggles` 两子键皆不支持）⇒ 跳过开关子步，其 AC-R8-1/2/3 不适用；**部分子键受支持**的平台（如 Kimi 的 search）按受支持子键执行——不受支持子键跳过、不报错、不核对。」
- **U5-2（已落）**：`docs/requirements/overview.md:233`（AC-R8-1）已补注：「核对范围 = 受支持子键；`ok` 按受支持子键全等判定（b6 起）；`payload` 未捕获 ⇒ `ok` 为 `null`（合法路径，不伪装绿）。」

**设计档落点（本 fix 轮已由设计代理同步；评审对象含此五处）**：
- `docs/design/modules/settings-app.md`：§2 按子键门控改写 + 能力来源条（:21-23）+ 新增「会话复用块（b6）」（:24-25）· §8 断言两条（:71-72）。
- `docs/design/modules/adapters.md`：§2 能力尺寸与 `applyToggles` 注释（:21 / :27）· §3.8 回报形状与按子键执行（:107 / :110-111）· §5.1 台账增「联网搜索」行（:145）· §5.2 载荷读键（:156）· §5.3 能力表两行与末三条（:165-166 / :168-170）。
- `docs/design/modules/outbox.md`：manifest `toggles` 例与字段语义（:48 / :55-56）——**兼容口径权威落点**（读盘修正：草案原定 mcp-server.md；证据见下「与草案的差异」⑥）。
- `docs/design/modules/scheduler.md`：§10 回报清单形状（:112，等行随动）。
- `docs/design/overview.md`：§3.2 第 7 步形状（:120）+ §4 `session` 界面读写（:198）。
- `docs/design/modules/mcp-server.md`：**不改**——读盘：TaskView（`mcp-server.md:41-47`）不含 `toggles`；`src/main/**` 的 `toggles` 消费路径只在 config-schema / execution / policy / task（grep 实证）⇒ 该文件面不存在 `manifest.toggles` 契约。

**机制设计（续 §2 编号）**：
5. **T6 子键化链**：`DEFAULT_CAPABILITIES.toggles = { thinking: false, search: false }`（`base.mjs:21-29`）→ `defineAdapter` 归一化（`base.mjs:42-68`：旧 `true` ⇒ 两子键支持；`false` / 缺省 / 非法 ⇒ 两不支持）→ 引擎守卫（`task-runner.mjs:167` / `:195`）改「任一子键受支持」→ `applyTogglesWithLog`（`answer.mjs:152-166`）只把**受支持子键的子集**传 `adapter.applyToggles`、复核也只比对该子集 → `buildTogglesReport`（`answer.mjs:130-137`）产出 `{configured, payload, ok, checked, unsupported}` → 主进程**纯透传**（`execution.mjs:173` → `task.mjs:100`）写 manifest（新字段自动随动，主进程零改动）。
6. **T6 Kimi 应用机械**：`kimi.mjs` 新增 `applyToggles`（只收 search 子键；`base.mjs` 的 `REQUIRED_FUNCTIONS:31-35` 不含此方法 ⇒ 现状 Kimi 无、本批补）→ 面板机械落新件 `kimi-toggles.mjs`（`.toolkit-trigger-btn` 开面板 → 行「联网搜索」→ 子面板「自动搜索 / 关闭搜索」`aria-checked` 复核 → Escape 关面板；失败 ⇒ `E_SELECTOR_MISSING`，不发送）。锚点证据 = `probe/probe17-kimi-toggles.mjs:155-164`（开面板）/`:243-269`（行点击）/`probe/out17/result.json:53-79`（子面板两行 + aria-checked）。
7. **T6 取数项 C1（真机，实施期第一事；草案遗留项①保留）**：临时启用 `requestPayloadCapture: true` + 增 `requestPayload.toggles` 映射（容忍分帧前缀的 JSON 定位；读 `options.thinking` / `tools` 含 `TOOL_TYPE_SEARCH`；**产出键形 = `{thinking_enabled, search_enabled}`**——须与 `answer.mjs:134` 的 `ok` 比对读键同源，`adapters.md` §2 接口已定此形状），真机 Kimi 单一次 ⇒ `manifest.toggles.payload` 非空 = **命中 ⇒ `requestPayloadCapture` 落值 `true`**（search = 应用 + 复核），`docs/design/modules/adapters.md` §5.3 `:166` 该行随动（「启用与否待取数」改写为落值实况；见文件表条件行）；为空 / 解析失败 ⇒ **回退 `false`**（search = 只应用，`ok` 落 `null`，档里写明不伪装绿），`:166` 该行同递归口为取数结论。**读盘细化**：引擎捕获路径只读 `request.postData()`（`answer.mjs:18`），probe17 取证用 `postDataBuffer()` 优先（`probe/probe17-kimi-toggles.mjs:104-105`）⇒ 「`postData()` 对该分帧体是否可读」= 待取数的那一点；本批**不为此改造捕获路径**（属新机制，另行立项）。
8. **T7 写路径与挂点**：新增补丁操作 `session.set`（部分更新 `{reuse?, ttlMs?, maxTasksPerSession?}`；逐键校验镜像 `config-schema.mjs:205-212` 区间）⇒ 走既有 `service.patch` 链（校验 → 原子写 → 广播；`service.mjs:136-163`）。`renderer.js` **零改动**（读盘：页面渲染分发 `render()` → `renderWorkersPage()` → `FOUI.workers.render()` 已存在，`renderer.js:100-115`）⇒ 会话块挂点 = `renderer-workers.js` 的 `render()`（`:141-148`）调用新件 `renderer-session.js` 注册的 `FOUI.session.render()`（注册时序无关：首帧渲染在 boot 之后）。

### 条目（T6 / T7）

**T6 #25 能力位按子键化**
- 目标：`capabilities.toggles` 按子键声明；用户把某子键配成 `false` 时，**凡该平台支持该子键**（Kimi 的 search、DeepSeek 的两键）引擎都真的对齐；`manifest.toggles.ok` 不再被平台无控件的子键拖成恒 `false`。
- 功能点：① `base.mjs` 新形状 + 归一化（旧 `true/false` 兼容展开）；② `task-runner.mjs` 两处守卫按子键；③ `answer.mjs` 按受支持子键过滤 / 复核；④ `manifest.toggles` 增 `checked` / `unsupported`、`ok` = 受支持子键全等（旧字段含义不动）；⑤ DeepSeek 显式 `{thinking:true, search:true}`（零行为变化）；⑥ Kimi `{thinking:false, search:true}` + `applyToggles`（search 子键，新件 `kimi-toggles.mjs`）；⑦ 取数项 C1（机制设计 7）；⑧ `loop-helpers.mjs` 断言口径随动（防覆盖静默退化）。
- 边界：不改 MCP 六件套工具名 / 参数 / 返回形状；不改 `workers[].toggles` 配置键（用户面不变）；不做子键第三态；不做「按平台猜能力」；不改捕获路径（`postData()` 面）与调度 / 重试 / 超时 / 错误码；Kimi 的 thinking 永不下控件操作。
- 验收：见「验收对照」8/9/10/12；真机端到端（人工场景②）挂账。
- 依赖：无（与 T1–T5 文件零重叠的除 `task-runner.mjs`（T2 词形）与 `deepseek.mjs`/`kimi.mjs`（T4-①），均等行或 +1 不冲突）；T3 的行门控随 T6 改口径（合并口径见下）。

**T7 #27 设置界面「会话复用」块**
- 目标：给既有 `session`（`config-schema.mjs:38` / `:205-212`；机制权威 = `browser-engine.md` §9）补界面入口，用户可见可改；不改引擎语义、不改 MCP 契约。
- 功能点：① `index.html` 外包工页顶部 `[data-field=session-policy]` 块（复用开关 + 空闲 TTL + 单会话任务上限 + 一行后果说明）；② `renderer-session.js` 渲染与接线（非法值不提交、回退 + `[data-field=session-error]` 行内提示）；③ 快照增 `session` 子对象（经 `snapshot-session.mjs`）；④ 新补丁操作 `session.set`（`patches.mjs`）；⑤ `preload.cjs` / `patches.mjs` 注释计数随动。
- 边界：不改引擎侧会话机制（不变量 / 判定顺序 / 写回）；不改 `session` 区间与默认；`manifest` 不加 `session` 字段（b5 已否，不翻案）；不新增页签 / 不做 per-worker session / 不做秒分换算 / 不做复用预览等新读数面。
- 验收：见「验收对照」11。
- 依赖：无（唯一触碰面 = 设置界面三文件 + `patches.mjs`，与 T3 共享文件已合并计行）。

### 受影响文件与测试面（**合并后唯一一套计划**——本批源码 / 测试文件行数计划的唯一权威；前表仅保留 T1–T5 独有文件；行数口径 = read 工具读数，同 §2 原表）

| 文件 | 现况 → 预期 | 职责 / 改动（T6+T7 合并） | 拆分判断 |
|---|---|---|---|
| `src/engine/adapters/base.mjs` | 69 → ~89 | T6：`DEFAULT_CAPABILITIES.toggles` 对象形 + `normalizeToggles` + `defineAdapter` 归一路径 | ≤300 |
| `src/engine/adapters/kimi.mjs` | 77 → ~97 | T4-①：:57 透传 `{ log: ctx.log }`（+1）+ T6：能力位 `{thinking:false,search:true}` + 注释重写 + `applyToggles`（search 子键，import `EngineError`）｜条件 C1 命中 ⇒ ~111 | ≤300 |
| `src/engine/adapters/kimi-toggles.mjs` | 新增 ~60 | T6：联网搜索子面板机械（probe17 锚点 + `aria-checked` 复核 + Escape 关面板；失败 ⇒ `E_SELECTOR_MISSING`） | — |
| `src/engine/adapters/deepseek.mjs` | 139 → 140 | T4-①：:107 透传 `{ log: ctx.log }`（+1）+ T6：能力位显式 `{thinking:true,search:true}`（等行替换，+0） | — |
| `src/engine/answer.mjs` | 167 → ~187 | T2：:62 文案 + :3 / :55 注释中性化（等行）+ T6：`applyTogglesWithLog` 子键过滤 / 复核 + `buildTogglesReport` 受支持子键比对 + `checked`/`unsupported` | ≤300 |
| `src/engine/task-runner.mjs` | 293 → 293 | T2：:200 词形（等行）+ T6：:167 / :195 两守卫等行替换（`toggles.thinking \|\| toggles.search`） | 贴档、零净增 |
| `src/settings/index.html` | 117 → ~127 | T3：:30 提示句改子键口径（等行）+ T7：新增 `[data-field=session-policy]` 块（+~10） | ≤300 |
| `src/settings/renderer.js` | 222 → 222 | **零改动**（读盘结论：渲染分发已存在 `:100-115`；挂点落 renderer-workers / 新件） | — |
| `src/settings/renderer-workers.js` | 261 → ~275 | T3：`buildRow` 按子键门控（+~12；头注契约随动）+ T7：`render()` 挂 `FOUI.session.render()`（+~2） | session 块渲染与接线抽 `renderer-session.js` |
| `src/settings/renderer-session.js` | 新增 ~45 | T7：会话块渲染 + 事件接线 + 非法回退 | — |
| `src/settings/service.mjs` | 295 → ~298…~301（净增读数以实施实测为准） | T3：platforms 派生（经 `platform-capabilities.mjs`，+1；头注契约行随动）+ T7：`session:` 行（经 `snapshot-session.mjs`，+2） | **两处预留拆分同时落件**：`platform-capabilities.mjs` + `snapshot-session.mjs` |
| `src/settings/platform-capabilities.mjs` | 新增 ~15 | T3：`buildPlatforms(choices = PLATFORM_CHOICES, lookup = getAdapter)`（缺省 import 注册表；映射子键对象；缺信息 / 未知平台 ⇒ 两键 `false`；两参数可注入——供批内单元覆盖回退分支） | — |
| `src/settings/snapshot-session.mjs` | 新增 ~12 | T7：`buildSessionSnapshot(session)` 纯函数（投影三键） | — |
| `src/settings/patches.mjs` | 226 → ~250 | T7：`session.set`（`PATCH_OPS` 7→8 + 逐键校验 / 部分更新 +~24） | ≤300 |
| `src/settings/preload.cjs` | 48 → 48 | T7：注释「七操作」计数随动（等行） | — |
| `src/settings/style.css` | 130 → ~138 | T7：`session-policy` 块与非法态样式（复用 `.switch` / `.hint`） | — |
| `test/integration/engine.test.mjs` | 199 → ~267 | T4-③ 守卫新例（~35；fixture `newChat:false`，复用 `engine-helpers.mjs` 夹具；头注覆盖清单随动）+ T6：部分支持 fixture 例（~33；applyToggles 实收 = 仅 search / 任务 done / `result.toggles` 五键） | ≤300（落点理由 = D9：`engine.session.test.mjs` 280 + 该例 ≈ 35 行 ⇒ 越 300） |
| `test/integration/engine.session.test.mjs` | 280 → ~283 | T2：J3 文案断言 + J8 日志词随动 | ≤300 |
| `test/integration/loop-helpers.mjs` | 75 → ~85 | T6：`assertTogglesOutcome` 受支持子键口径（删除 `!== true` 判定——新形状下会静默跳过 DeepSeek 载荷断言） | — |
| `test/integration/settings.workers-page.test.mjs` | 257 → ~285 | T3：h 段增 Kimi 子键断言（+~12；头注随动）+ T7：会话块五读数（+~16） | ≤300 |
| `test/integration/settings.guide-page.test.mjs` | 236 → ~242 | T1：补推日志读数（有界等待） | ≤300 |
| `docs/batches/b6-small-items-and-repack.units.mjs` | 新增 ~140 | T4（打标失败日志（两平台 fake page）+ `decide` 缺省 `now`，~70）+ T6（归一化 6 组 / `buildTogglesReport` 3 组 / `applyTogglesWithLog` 过滤 2 组，~40）+ T7（`session.set` 合法·部分·非法·多余字段 + `buildSessionSnapshot`，~20）+ T3（`buildPlatforms` 2 组：两平台映射照能力位 · 缺信息 / 未知平台回退 ⇒ 两键 `false`，~10） | — |
| `docs/batches/b2-settings-ui.units.patches.mjs` | 166 → ~171 | T7 随动：op 精确清单断言（`:15-29`）7→8 + 标题「七项」→「八项」（**不改则红**；读盘新发现） | — |
| `docs/design/modules/{settings-app,adapters,outbox,scheduler}.md` · `docs/design/overview.md` | 见「设计档落点」 | 本轮已落 | — |
| （条件）`docs/design/modules/adapters.md` `:166` | C1 收口 ⇒ 随动 | C1 命中 ⇒ 该行改写为落值实况（`requestPayloadCapture: true`，search = 应用 + 复核）；未命中 ⇒ 该行收口为取数结论（保持 `false`） | — |
| `src/settings/window.mjs` | 173 → ~180 | T1：`open()` 内补 `did-finish-load` 一次性监听 + 一行 info 日志（≤ +7）｜T7：IPC 通用转发面无改动（读盘 `:53` / `preload.cjs:24`） | — |
| （不改）`src/main/index.mjs`（及 `src/main/**`） | 285 | T1 的竞态由「页面加载完成补推」兜住（开窗时序 `:170` / `:215-218` 不动）｜T6：`toggles` 纯透传（`execution.mjs:173` → `task.mjs:100`）⇒ 新字段自动随动；`config-schema.mjs` 的 `session` 不动 | — |
| （不改）`docs/design/modules/mcp-server.md` | 152 | 读盘：无 `manifest.toggles` 契约面（见「设计档落点」） | — |

### 冻结接口（本 fix 轮增量；与 §2 前文冲突处以本节为准）

- **设置快照只增**：`platforms[].toggles` ⇒ `{thinking, search}` 子键对象（T3 口径升级）；`session` ⇒ `{reuse, ttlMs, maxTasksPerSession}`。既有键与形状不变。
- **补丁操作表 7→8**：新增 `session.set {reuse?, ttlMs?, maxTasksPerSession?}`（至少一键；多余字段拒绝，`checkKeys` 同口径）。
- **DOM 锚点（新增）**：`[data-field=session-policy|session-reuse|session-ttl-ms|session-max-tasks|session-error]`；`[data-toggle]` 改**子键级**出现（受支持子键才有对应锚点）——DeepSeek 行 = 2（照旧）、Kimi 行 = 1（search）。
- **`manifest.toggles`**：新字段 `checked` / `unsupported`（互斥、并集 = 两键）；`ok` = 受支持子键全等（未捕获 ⇒ `null`）；`configured` / `payload` 含义与形状不动。
- **日志词形无新增**（T6/T7 复用既有「开关应用 / 开关发送前复核 / 配置已更新并落盘」；Kimi 面板机械的失败走 `E_SELECTOR_MISSING` 既有口径）。

### 验收对照（续 §2 编号 8–13；机器判据 + 读数口径）

8. **批内单元（b6 units，~140 例面）**：`node --test docs/batches/b6-small-items-and-repack.units.mjs` ——T6 读数：① 归一化 6 组（`true`⇒`{t,t}` / `false`⇒`{f,f}` / 缺省⇒`{f,f}` / `{search:true}`⇒`{f,t}` / 非法⇒`{f,f}` / 旧值兼容）；② `buildTogglesReport` 4 组（DeepSeek 形两键 = 今日逐字；Kimi 形 payload `null` ⇒ `ok:null` ∧ `checked:['search']` ∧ `unsupported:['thinking']`；部分支持 + 已捕获 ⇒ `ok` 只比受支持键；**无受支持子键 + 已捕获 ⇒ `ok:null`**）；③ `applyTogglesWithLog` 2 组（fake adapter 实收 = 受支持子键子集、未支持键不出现；全不支持 ⇒ 不调用）。T7 读数：`session.set` 合法 / 部分更新 / 非法（非整数 / 越界 / 空对象）/ 多余字段 / 纯函数性；`buildSessionSnapshot` 三键投影。T3 读数：`buildPlatforms` 2 组——① 两平台映射照能力位（`deepseek {thinking:true,search:true}` / `kimi {thinking:false,search:true}`）；② 缺信息 / 未知平台（经注入的 `choices` / 查找函数构造）⇒ 两键 `false`。T4 既有 ~70 例不回归。
9. **`npm run verify:engine`** ——T6 新例读数：部分支持 fixture（`toggles:{thinking:false,search:true}`）⇒ ① `applyToggles` 实收 = `{search:…}`（无 `thinking` 键，调用计数可断）；② 任务仍 `done`；③ `result.toggles` = `{configured:{thinking,search}, payload:null, ok:null, checked:['search'], unsupported:['thinking']}`。既有 3 例 + J1–J9（T2 随动处除外）不回归；`toggles:false` fixture 的「守卫跳过」路径由既有会话套件全程覆盖（不新增）。
10. **`npm run verify:loop`（真机 DeepSeek；T6 面）** ——读数：`manifest.toggles` = `configured {thinking:true,search:false} ↔ payload {thinking_enabled:true,search_enabled:false}`、`ok:true`、**新增 `checked:['thinking','search']` ∧ `unsupported:[]`**（三旧键逐字同今日 + 两新键出现）；`loop-helpers` 更新后载荷断言照常命中（不改口径等价性）。
11. **`npm run verify:settings`** ——T3 子键读数：快照 `platforms[].toggles` = `deepseek {thinking:true,search:true}` / `kimi {thinking:false,search:true}` ∧ Kimi 行 `[data-toggle]` 恰 1（`search`）∧ `[data-field=toggles-unsupported]` 文本含「深度思考」∧ DeepSeek 行 `[data-toggle]` = 2（b/f 段既有断言逐字不回归）。T7 读数：① 快照 `session` = `{reuse:true, ttlMs:600000, maxTasksPerSession:5}`（默认）；② 控件四锚点存在（`session-reuse` 勾选 = true；两数值 `value` = `"600000"` / `"5"`）；③ 块内 `[data-toggle]` 计数 = 0（与行级隔离）；④ 非法回滚：`session-ttl-ms` 填 `-1` 触发 change ⇒ 不提交、值回 `"600000"`、`[data-field=session-error]` 出现、`config.json` 未变；⑤ 写生效双读：`window.fo.patch({op:'session.set', reuse:false})` ⇒ `{ok:true}` ∧ `config.json` 的 `session.reuse === false` ∧ 快照 `session.reuse === false`；⑥ 直调非法 op：`session.set {ttlMs:-1}` ⇒ `ok:false` 且 error 明示、`config.json` 未变。
12. **人工场景与取数（真机，进 §5 如实读数，不造假绿）**：**C1 取数**（机制设计 7；实施期先跑，决定 `requestPayloadCapture` 落值）· **人工场景②**：真机 Kimi 派单一次 ⇒ 界面 search 被引擎对齐（开 / 关）+ 请求体 `tools` 不带 / 带 `TOOL_TYPE_SEARCH` 随动（b3 A1 探针层已证，`docs/batches/b3-kimi-adapter.md:375`；引擎路径端到端待此场景收口）· 附带：`verify:loop:kimi` 真机跑一次（新形状下 `assertTogglesOutcome` 按子键跳过载荷断言、apply 会真实点击 search 控件——读数入 §5）。
13. **父侧收口回归（唯一一次全套）**：照 §2 原第 6 条执行 + **`b2 units`（改动后重跑）**；`verify:pack` 段 C 照实读数。

### 关键决策（续 D12–D17）

- **D12（#25 形状）= `capabilities.toggles` 改 `{thinking, search}` 子键对象，`defineAdapter` 归一化兼容旧 `true/false`**。理由：能力声明唯一权威处（`base.mjs`）一次转换，引擎 / 界面 / 测试三面同源；旧值展开不制造行为跳变（`true` = 原来两键都应用）。被否：① 保持单布尔 + 第二字段（第二份真值会漂）；② 按平台硬编码（b6 D5 已否同形做法）。
- **D13（#25 兼容口径）= `manifest.toggles` 只加字段、旧字段语义不动**：`configured` / `payload` 含义与形状不变；`ok` 由「两键全等」改为「**受支持子键**全等」（不无声改——`checked` / `unsupported` 把核对范围显式写进载荷；落 `outbox.md` + `adapters.md`）。被否：① 重定义 `toggles` 整体形状（破坏旧字段）；② 不加字段默默改 `ok`（无声变更）。
- **D14（#25 Kimi 落值）= `{thinking:false, search:true}` + search 应用机械；`requestPayloadCapture` 保持 `false` 至取数 C1**。理由：search 有控件、状态可读、载荷随动（probe17 A1 3 轮）；thinking 无控件恒 true（如实声明为不支持）；`payload` 恒 `null` 属合法路径、不伪装绿（不预判取数结果）。
- **D15（#26×#25 合并）= UI 门控从行级改按子键级**（`platforms[].toggles` 子键对象；Kimi = 只渲染「联网搜索」+「深度思考」提示行）。理由：T6 后「支持」= 子键级；行级隐藏会把 Kimi 的 search（引擎确会应用）重新变成陈述不实——本批两项同批落地，口径必须同源。被否：保持行级（Kimi 两开关全隐）——search 生效后可配不可见，违背「陈述真实」。
- **D16（#27 写路径）= 新增 `session.set`**（草案名 `settings.setSession` 不采用——表内风格为 `<域>.<动作>`）。理由：读盘无通用配置写 op（`patches.mjs:9-17` 冻结 7 op；`:33-38` 多余字段守卫；`:200-201` 未知 op 拒绝）；IPC 面通用转发无白名单（`window.mjs:53`）。被否：把三键塞进既有多用途 op（无此 op）。
- **D17（合并文件计划与拆分）= 唯一一套（见上表）**：`renderer-session.js`（T7 渲染）+ `platform-capabilities.mjs`（T3 派生——其预留已在本档；合并后 295+6=301 越档，触发该预留）| `snapshot-session.mjs`（T7 投影——派单预留）；`renderer.js` 零改动（读盘推翻草案「+~3」）。

### 与草案的差异（读盘为准；逐条理由）

| # | 草案 | 读盘结论（file:line） | 处置 |
|---|---|---|---|
| ① | `renderer.js` 需核（约 `:204` 附近；+~3 挂点） | 渲染分发已存在：`renderer.js:100-115`（`render()`→`renderWorkersPage()`→`FOUI.workers.render()`）；挂点属 `renderer-workers.js:141-148` | renderer.js 零改动；挂点落 renderer-workers / 新件 |
| ② | `patches.mjs` 「是否已有通用写 op，待实测确认」 | 无——冻结 7 op（`patches.mjs:9-17`）+ `checkKeys` 守卫（`:33-38`） | 新增 `session.set`；且 **b2 patches units 的精确清单断言（`b2-settings-ui.units.patches.mjs:15-29`）必须随动**（草案未列，否则红） |
| ③ | 快照断言键集「待实测确认（精确 vs 含键）」 | **无精确键集断言**：集成逐字段读（`settings.workers-page.test.mjs:160-176`）；b2 units 逐字段（`b2-settings-ui.units.service.mjs:52-73`，`:72` = `deepEqual(snap.ops, PATCH_OPS)` 常量同源） | 新增键（`session` / `platforms[].toggles` 子键）无需放宽既有断言 |
| ④ | `loop-helpers` 未列 | `loop-helpers.mjs:68` 的 `capabilities.toggles !== true` 在新形状下对 DeepSeek 也成立 ⇒ **静默跳过载荷断言（覆盖退化）** | 新增随动行（文件表） |
| ⑤ | Kimi 「apply 只对受支持子键下控件操作」（未给实现载体） | `kimi.mjs` 全文无 `applyToggles`；`base.mjs:31-35` 的 `REQUIRED_FUNCTIONS` 不含它 ⇒ 现状调用即崩 | 补 `kimi.mjs.applyToggles` + 新件 `kimi-toggles.mjs`（probe17 锚点） |
| ⑥ | `manifest.toggles` 兼容口径落 `mcp-server.md` | `mcp-server.md:41-47` TaskView 不含 `toggles`；`src/main/**` 无 `toggles` 消费路径（grep）⇒ 该面不存在此契约；字段权威在 `outbox.md:48/:55` | 落 `outbox.md` + `adapters.md` §3.8；`mcp-server.md` 不改（§1 实况同款读盘修正） |
| ⑦ | 草案 §3.3 示例写 `payload: {"search": false}` | 实况：`payload` 形状 = 各适配器映射原形（DeepSeek = `{thinking_enabled, search_enabled}`，`deepseek.mjs:82-98`；比对读键见 `answer.mjs:134`） | 按读盘写；`payload` 形状不动 |
| ⑧ | `service.mjs` 拆分「一处预留（snapshot-session）」 | 合并净增 ≈ +6 ⇒ 301 > 300 ⇒ **两处预留同时触发**（T3 的 `platform-capabilities` 其预留本在档） | 两拆分落件（见文件表） |
| ⑨ | 草案 §3.3 「`ok` 不再恒 null」 | 恒 `null` 与否系于取数 C1（capture 未启用 ⇒ 仍 `null`，属合法路径） | 目标表述收敛为「不再被无控件子键拖成恒 `false`」；`null` 分支如实挂账 |

### 上抛项（续 U4–U6）

- **U4（§1 写权）**：本档 §1 的「不在本批」与来源行随动已由主包AI 落笔（2026-10-11 19:25 裁定；**段白名单：eng-designer 仅 §2**）。
- **U5（需求档随动）**：`requirements/overview.md:236`（部分子键口径）与 `:233`（AC-R8-1 适用范围）两处**已由主包AI 落笔**（2026-10-11）。
- **U6（真机归属）**：**C1 取数**（实施期第一事；决定 Kimi `requestPayloadCapture`）与**人工场景②**（引擎路径端到端）——均属真机取证，读盘解不了；未取数前不改进 D14 落值。**`verify:loop:kimi` 真机跑一次**可一并收口（见验收 12）。

### 边界（本 fix 轮；与 §2 前文并列生效）

1. 不改 MCP 六件套工具名 / 参数 / 返回形状；不改错误码表。
2. 不改 `workers[].toggles` / `session` 的配置键面与区间；不改引擎侧会话机制、捕获路径、调度 / 重试 / 超时。
3. 不引入草案之外的新机制（除上述两处拆分 = 纯文件边界 + 一处 `session.set` op —— 均在 D12–D17 内）。
4. 不改需求档 / 其它批次档 / §1（需求档与 §1 随动项见上抛 U4 / U5）。
5. 环境口径照做（剥 `ELECTRON_RUN_AS_NODE` / UTF-8 中文断言 / 临时件 `.thincoder/tmp/` / 429 即停 / 打包段 C 不造假绿）。

## §3 设计评审（评审子代理）

### 轮次 1（评审子代理）

**对象**：b6（含 19:25 扩批）§2 T1–T7 + §1 范围裁定 + 需求档两处随动 + 设计档五处同步（settings-app / adapters / outbox / scheduler / design overview）。盘面：7 份文档全读；行数标注抽样 23 处逐一对盘全部相符（service.mjs 295 · task-runner.mjs 293 · engine.session.test.mjs 280 · patches.mjs 226 · preload.cjs 48 · b2 units patches 166 · window.mjs 173 · renderer-workers.js 261 · renderer.js 222 · index.html 117 · answer.mjs 167 · session-policy.mjs 121 · base.mjs 69 · kimi.mjs 77 · deepseek.mjs 139 · 两 dom 件 80/50 · 四测试件 199/280/257/236 · loop-helpers.mjs 75 · src/main/index.mjs 285 · package.json 32 · style.css 130）。评审面限制：无 AGENTS.md / 无项目标准档 / 无文档地图——方法学合规与文档归属按模板判据评估。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Doc hygiene | 🟡 | T6/T7 并入与 T3 口径升级（行级→子键级）后，§2 前文失效表述未删且与 fix 轮冲突：:46 仍把「#25（能力位按子键化——协议面/需求面变更）· #27（设置界面「会话复用」开关与两键）」列为「新机制 / 新界面，另批」；:79/:99/:140 仍写旧行门控/布尔口径（「`platforms[].toggles` = `deepseek:true / kimi:false`」「Kimi 行 `[data-toggle]` 计数 0」「不渲染 `[data-toggle]`」）；:133 旧冻结条款「`[data-toggle]` 仅对声明开关能力的平台出现（支持平台行与 b2 逐字一致）」与 :277「`[data-toggle]` 改**子键级**出现…Kimi 行 = 1（search）」互斥，而 :273 自称「与 §2 前文冻结项并列生效」⇒ 冲突条款名义上仍生效（:201 的覆盖声明只点名「T3 的行门控口径与四处文件行数」，未覆盖冻结接口块）；:197 三链自检仍只到 T1–T5 | 删除/改写被覆盖的旧口径表述（历史留记录面）；冻结接口以子键级为唯一口径、取消冲突条款的「并列生效」效力；三链自检补 T6/T7 |
| 2 | Doc hygiene | 🟡 | 档头「来源」行（:3）仍含「（及 #21/#22 的条件未满足、#25/#27 属新机制另批）」——§1 随动项 #1 要求的 19:25 追加未落、该小句现已失真；§1 :22 仍写「需求档不动」，与 §2 U5（需求档随动两处）及盘上需求档 :233/:236 已随动的事实相反 | 按 §1 随动项 #1 在「来源」行追加 19:25 裁定并删除失真小句；:22 改为「需求档随动两处（U5-1/U5-2）」 |
| 3 | Requirements | 🟡 | 需求档 R10 边界（`docs/requirements/overview.md:282`）仍写「本批无设置界面开关（手改 `config.json`）」——T7 正是给 `session` 补界面入口，`docs/design/overview.md:198` 已记「界面读写 = …（b6）」；需求面未随 T7 标注（U5 随动清单只含 R8 两处），留下失效于现状的陈述 | 将该行明确为 b5 范围陈述或补 b6 口径（b6 起提供「会话复用（全局）」块），并纳入需求档随动清单 |
| 4 | Affected-file size | 🔵 | `service.mjs` 拆分算术两口径并存：合并文件表「295 → ~298（+1 +2）」vs 差异表⑧/D17「净增 ≈ +6 ⇒ 301 > 300」——表内「两处越档触发」与 ~298（未越档）不自洽（两拆分落件不受影响） | 统一净增读数并把「越档触发」与数字对齐（两拆分同时落件的结论不变） |
| 5 | Clarity | 🔵 | 编号/计数未随 fix 轮更新：验收对照标题「（续 §2 编号 8–12）」（:281）实体至 13，靠 :327「勘误」行打补丁（修订式表述留规范面）；验收 2「11 例 = 既有 3 + 会话 7 + 新守卫 1」（:139）未含 T6 新例（应为 12）；设计档「已落」行数（settings-app 65→68 / adapters 168→169，:123/:124）与盘上（73 / 172）不符（.md 豁免注释要求，仅读数为旧） | 直接改标题/例数并删除勘误行（历史留记录面）；设计档行数标注按需刷新 |
| 6 | Acceptance coverage | 🔵 | 新件 `src/settings/platform-capabilities.mjs`（含 D6「缺信息 / 未知平台 ⇒ 两键 false」回退分支）未列入批内单元清单（`buildSessionSnapshot` 有、`buildPlatforms` 无）——与其余新纯函数均有单元（归一化 6 组 / buildTogglesReport 3 组 / applyTogglesWithLog 2 组）不对称 | 批内单元补一组 `buildPlatforms` 读数（映射 + 缺信息回退），或写明该分支不可达、由集成读数覆盖 |
| 7 | Clarity | 🔵 | 取数 C1 命中后的收口未写全：① `requestPayloadCapture` 落 true 后 `docs/design/modules/adapters.md:166` 行「启用与否待取数」将成为失效表述，文件计划未列该条件随动；② Kimi `requestPayload.toggles` 映射的产出键形未写明——`answer.mjs:134` 的 `ok` 比对读 `thinking_enabled` / `search_enabled`，映射产出须与之同键 | 补 C1 两分支的设计档随动口径（命中 ⇒ `requestPayloadCapture` 落值 + adapters.md §5.3 行随动）与映射产出键形（与比对读键同源） |

**计数**：🔴 0 · 🟡 3 · 🔵 4（共 7 条；另：行数标注抽样 23 处全部相符）

**VERDICT: pass**

## §4 用户批准（主 agent）

### §4 用户批准（2026-10-11）

- **用户原话**：「批准」（2026-10-11 21:14，回应主包AI 的「b6 设计链已定稿、请批准开工」请求）。
- **批准对象**：本档 **§2**（T1–T7 条目表 · 机制设计 · **合并后唯一一套文件计划** · 冻结接口（含子键级 DOM 锚点与 `manifest.toggles` 兼容口径）· 验收对照 1–13 · 决策 D1–D17 · 边界与「不在本批」）+ **§1 的范围裁定**（含 2026-10-11 19:25「#25 / #27 并入本批」的定点扩批）+ **评审轮 1 的 pass 结论与两轮修复处置**（#82 的 28 处 + #83 的两条报备与其抓出的合并表错行）+ 需求档三处随动（`:233` / `:236` / `:282`）+ 设计档五处同步。
- **用户可见变化（批准时已逐条告知并获认可）**：① Kimi 行两开关消失、换成一行提示（修掉假陈述）；② Kimi 的「联网搜索」自本批起真正生效，「深度思考」不应用且 `ok` 落 `null`（不伪装绿）；③ 设置界面新增「会话复用（全局）」块（复用开关 + 空闲 TTL + 单会话上限），结束「手改 `config.json`」阶段；④ 引擎失败回执 / 日志措辞中性化（Kimi 失败不再显示 DeepSeek 协议名）；⑤ 安装包重建（说明书新内容 + 本批全部修复进包）。
- **实施切分（两个改动面互不重叠，并行开工）**：
  - **切分 A = 引擎面**：T2（措辞中性化）· T4（b5 收尾三条）· T6（能力位按子键化 + 新件 `kimi-toggles.mjs` + `manifest.toggles` 兼容口径）· 批内单元件（T4/T6/T7 三组）。
  - **切分 B = 设置面**：T1（启动期快照竞态）· T3（行→子键门控 + `platform-capabilities.mjs`）· T7（会话复用块 + `renderer-session.js` + `snapshot-session.mjs` + 补丁 op 7→8 与 b2 归档单元随动）。
  - **T5（打包刷新）**＝两切分落地并验收后，父侧直接执行（`npm run dist` → `npm run verify:pack`，不重设计打包链）。
- **成本路线**：本轮代码**由两个 eng-coder 直接实施**（设计已是完整实施合同：冻结接口 + 伪码 + 逐件行数 ⇒ 判据为「净省」——外包同等行数的写作需多一轮适配与核对，边际价值为负）；免费通道留给**起草类**工作（如 T5 清单刷新与后续批次的设计草案）。用户 19:25 的「能外包就外包」总则与「自动做净省工作」的授权，本轮据此解释执行。

## §5 实施记录（eng-coder）

### §5 实施记录 · 切分 B（设置面：T1 / T3 / T7）（eng-coder，2026-10-11）

**状态行**：实施完成（切分 A（引擎面 T2/T4/T6 + 批内单元件）· 审计 1 轮 clean · 代码评审 1 轮（0🔴/1🟡/3🔵，🟡 为设计档随动、余已修）· 真机 verify:loop 与 verify:loop:kimi 各 1/1）

**交付摘要**
- 落盘 13 件（新件 3）：T1 `window.mjs`（`loadFile` 前挂 `did-finish-load` 一次性监听 ⇒ info 日志 + `void service.emitChanged('窗口加载完成')`）；T3 `index.html`（提示句按子键口径）/ `renderer-workers.js`（`buildRow` 按子键门控 + `[data-field=toggles-unsupported]` 提示行）/ `platform-capabilities.mjs`(新，`buildPlatforms(choices=PLATFORM_CHOICES, lookup=getAdapter)`；缺信息/未知平台 ⇒ 两键 false) / `service.mjs`（`platforms: buildPlatforms()`）；T7 `index.html`（session-policy 块五锚点）/ `renderer-session.js`(新：渲染+接线+非法回滚) / `snapshot-session.mjs`(新：三键投影) / `service.mjs`（`session:` 行）/ `patches.mjs`（`session.set`；`PATCH_OPS` 7→8）/ `preload.cjs`（注释随动）/ `style.css`（`.session-policy` 块）+ 两集成测试件随动。**`renderer.js` 零改动**（git diff 空 + 审计 grep 双证）。
- 验收读数：`npm run verify:settings` = **6/6 全绿**（`.thincoder/tmp/b6-verify-settings.log`；fix 后复跑 `…-r2.log` 同绿）——f3 六读数（快照 `{reuse:true,ttlMs:600000,maxTasksPerSession:5}` · 控件 `{policy:true,reuse:true,ttl:"600000",maxTasks:"5",innerToggles:0}` · 非法 `-1` ⇒ 值回滚+错误行可见+未落盘 · 合法写 ⇒ config/快照双读 `reuse=false` · 直调非法 ⇒ `ok=false` 且错误明示）· h·b6（Kimi 行 `[data-toggle]` 恰 1=search ∧ 提示行=「该平台不支持：深度思考（不会应用）」∧ platforms.toggles = `deepseek{true,true}/kimi{false,true}`）· h①·T1（app.log 命中「加载完成，补推一次全量快照」）。`node --test docs/batches/b2-settings-ui.units.mjs` = **35/35**。
- 逐件行数（read 工具口径，全 ≤300）：window.mjs 173→178 · index.html 117→130 · renderer-workers.js 261→281 · renderer.js 222（不动）· service.mjs 295→**299**（净增实测 +4；两处拆分仍按 D17 落件）· patches.mjs 226→263 · preload.cjs 48→48 · style.css 130→137 · platform-capabilities.mjs 13（新）· renderer-session.js 85（新）· snapshot-session.mjs 13（新）· workers-page.test 257→295 · guide-page.test 236→241。
- 补丁 op 与快照形状实况：`PATCH_OPS` = 8 项（尾部追加 `'session.set'`）；`session.set {reuse?, ttlMs?, maxTasksPerSession?}` 至少一键、`checkKeys` 拒多余字段、区间 `ttlMs` 1..MAX_SAFE_INTEGER ∧ `maxTasksPerSession` 1..1000（与 `config-schema.mjs:210-211` 同口径）、部分更新合并进既有 `session`；快照**只增** `platforms[].toggles`（`{thinking,search}` 子键对象，来源 = 适配器注册表 `getAdapter`，非手抄）与 `session`（三键投影），既有键与形状零改动。
- 越界声明：无（未触碰 `src/engine/**`；未改 MCP 契约 / 需求档 / 设计档 / 其它批次档；无新页签、无 manifest 字段、无行内 session）。
- 上抛/报备：① `docs/batches/b2-settings-ui.units.patches.mjs` 的 7→8 随动被跨批写门拒绝（正确行为）⇒ **由父侧承接**（已落盘；我复跑 35/35 同绿）；该件头注 :2 仍写「（patches：七操作合法与非法）」——父侧三处随动未含该行，报备（非我写面）。② T3 的 Kimi 读数依赖切分 A 已落盘的引擎能力值（工作树实读 `kimi.mjs:36` = `{thinking:false,search:true}`、`deepseek.mjs:36` 两键 true），已具备。③ `renderer-session.js` 85 行 vs 计划 ~45（估算偏差，行为面按设计全落地；≤300 无档位问题）。④ 进程/端口：我侧测试链残留 = 0；盘上另有 4 个 electron + 2 个 node 进程（19:11 起、`--user-data-dir` = 真实 `%APPDATA%\free-outsource`）属先行实例，非本会话所留，未动。

**审计与代码评审轮次（终态 clean）**
- 内部发散审计（explore · 只读）：1 轮 ⇒ **pass / findings 0**（核对内容：DOM 锚点逐字 · 补丁表 · 快照只增 · T1 时序与日志词形 · 测试覆盖六读数 · 行数 ≤300 · 越界）。
- 内部代码评审（advisor · code）：轮 1 = **pass（🔴0 🟡0 🔵4）**；fix 1 轮（4 条 🔵 全落地）；轮 2 = 定点复核修复声明 ⇒ **pass**（4/4 Fixed、无新问题、跨件引用复核通过）。
- fix round 明细：① `renderer-workers.js` 挂点补 `else console.error(...)`（与 `renderer.js:104` 同口径）② `renderer-session.js` `syncControls` 补「每次广播重写」取舍注释（轮 1 允许的最小口径）③ `preload.cjs` 快照面注补「平台子键能力 / 会话三键」④ workers-page 测试补 `policy` 容器锚点正断言（消 ③ 空过面）；复跑 `verify:settings` 6/6。
- 决策透明表：无设计外决策；实施期取舍读数 = service.mjs 净增 +4（非预估 +6，两拆分仍落件）· `renderer-session.js` 行数上浮（ES5 样式与逐键错误文案）· T1 判据按 D2 用「日志 + 有界等待」（不造竞态假断言）。

### §5 实施记录 · 切分 A（引擎面：T2 / T4 / T6 + 批内单元件）（eng-coder，2026-10-11）

**交付摘要**：T2 / T4①②③ / T6①–⑧ 全部落盘；写面 = §4 切分 A 的 13 件（源码 9 + 测试 3 + 新单元件 1），**零越界**（`git status` 复核：本切分未触碰 `src/settings/**`、MCP 六件套、错误码面）。逐件行数（read/字节口径，同 §2）= 原况 → 实测：

| 文件 | 行数 | 备注 |
|---|---|---|
| `src/engine/adapters/base.mjs` | 69 → 86 | `toggles` 子键默认值 + `normalizeToggles`（导出）+ `defineAdapter` 归一路径 |
| `src/engine/adapters/kimi.mjs` | 77 → 126 | 能力位 `{thinking:false,search:true}` + `applyToggles` + `requestPayload.toggles`（C1 命中）+ 基线日志透传（计划 ~97；C1 命中预估 ~111） |
| `src/engine/adapters/kimi-toggles.mjs` | 新增 182 | 面板机械（计划 ~60；逐处 `page.evaluate` 内联 `vis` 助手 + 有界等待逻辑所致） |
| `src/engine/adapters/deepseek.mjs` | 139 → 139 | 能力位显式 `{thinking:true,search:true}`（同行替换）+ 基线透传（同行替换；计划 +1 属笔数预估偏差） |
| `src/engine/adapters/deepseek-dom.mjs` | 80 → 84 | 打标失败一行日志、仍返回 0 |
| `src/engine/adapters/kimi-dom.mjs` | 50 → 54 | 同上 |
| `src/engine/answer.mjs` | 167 → 174 | T2 文案/注释 + 子键过滤复核 + `buildTogglesReport` 五键 + `fmtToggles` 在场键渲染 |
| `src/engine/task-runner.mjs` | 293 → 293 | 两守卫等行替换（零净增）+ T2 日志词 |
| `src/engine/session-policy.mjs` | 121 → 121 | `decide` 缺省 `now = Date.now()` |
| `test/integration/engine.test.mjs` | 199 → 281 | 守卫例 + 部分支持例（共用样板函数 fixtureHarness/runFixtureTask） |
| `test/integration/engine.session.test.mjs` | 280 → 281 | J3 中性文案断言 + J8 日志词随动 |
| `test/integration/loop-helpers.mjs` | 75 → 78 | 子键口径载荷断言（删 `!== true` 静默跳过） |
| `docs/batches/b6-small-items-and-repack.units.mjs` | 新增 250 | T4/T6/T3/T7 四组，15 例（计划 ~140） |

**验收读数（本机实测；命令 ⇒ 读数）**

1. `node --test docs/batches/b6-small-items-and-repack.units.mjs` ⇒ **15/15 pass**（T3/T7 组按冻结接口写、切分 B 落盘后复跑全绿）。
2. `npm run verify:engine` ⇒ **12/12 pass**（既有 3 + 会话 7 + 新守卫 1 + T6 部分支持 1；J3 命中中性文案、J8 日志词 `已发送（观测到答复流请求）`）。
3. `npm run verify:loop`（真机 DeepSeek）⇒ **1/1**，17.3s，transport=sse；`manifest.toggles` = `configured{thinking:true,search:false}` / `payload{thinking_enabled:true,search_enabled:false}` / `ok:true` / **`checked:["thinking","search"]` / `unsupported:[]`**（§2 验收 10 读数逐字）。
4. `npm run verify:loop:kimi`（真机）⇒ **1/1**，27.8s，transport=sse；读数 = `payload{thinking_enabled:true,search_enabled:false}` / `ok:true` / **`checked:["search"]` / `unsupported:["thinking"]`**（§2 验收 12 附带读数）。
5. T2 一次性读数：`answer.mjs` + `task-runner.mjs` 内 `chat/completion` 出现次数 = **0**；逐件行数全部 ≤300。

**C1 取数（真机，机制设计 7）＝命中**：临时启用 `requestPayloadCapture: true` + `requestPayload.toggles` 映射后真机 Kimi 单一次 ⇒ `manifest.toggles.payload` 非空（`{thinking_enabled:true, search_enabled:false}`）⇒ **落值 `true`（映射保留）**，search 子键 = 应用 + 复核（真机日志 `开关点击「联网搜索」→false 策略=面板 复核后=false`）。证据链（盘面）：`.thincoder/tmp/verify-loop/app/outbox/20261011-212658-43e7/manifest.json` + 同根 `logs/app.log`。

**fix round 1（真机缺陷与修复）**：首轮 `verify:loop:kimi` 红 —— `E_SELECTOR_MISSING 开关「联网搜索」未对齐：目标=false 实际=true`。真机诊断（`.thincoder/tmp/probe-kimi-toggle-state2.mjs`）测出：**点击选项后面板 ≈200–900ms 自行收起；收起前子面板 `aria-checked` 停留旧值**（composer 芯片已翻、aria 未翻）⇒ 原「点击 → 睡 400ms → 直接重开读」读到陈旧面板。修复：点击后先有界等应用收起（4s）+ Escape 兜底 + 校验已收起，再重开复核；`readSearchState` 一律「先收起、再全新打开」。修后真机复验（`.thincoder/tmp/probe-kimi-toggle-module.mjs`）四段（点击关 2.4s / 幂等读 1.1s / 点击开 2.3s / 幂等读 1.1s）全一致，且 `verify:loop:kimi` 转绿。

**内部审计（explore 发散审计）＝1 轮，终态 clean**：13 件 + §2 + `adapters.md` 全读逐条核对；无「部分实现 / 静默简化 / 越界」，1 项文档漂移（见上抛 1，不判实现缺陷）。

**内部代码评审（advisor，1 轮，4 条 = 0🔴 · 1🟡 · 3🔵，VERDICT: pass）与处置**

| # | 级 | 发现 | 处置 |
|---|---|---|---|
| 1 | 🟡 | `docs/design/modules/adapters.md:166` C1 随动未落（设计档笔） | 上抛 1（父侧文档层处置） |
| 2 | 🔵 | `buildTogglesReport` 空 `checked` 时空集真（无受支持子键 + 已捕获 ⇒ `ok:true` 误导） | 已修：`payload && checked.length ? … : null`；新增单元例「无受支持子键 + 已捕获 ⇒ ok null」（15/15） |
| 3 | 🔵 | `kimi-toggles.mjs` 打标只增不删（跨任务复用页面可能命中陈旧标记元素） | 已修：两处打标前先清同名旧标记（`removeAttribute`） |
| 4 | 🔵 | Escape 兜底后一次性可视性裁决（隐含依赖固定 150ms） | 已修：改为同形有界等待，超时仍 `E_SELECTOR_MISSING` |
| — | — | 修后复验（全部重跑） | units 15/15 · verify:engine 12/12 · 真机模块探针四段全一致 · verify:loop:kimi 1/1 · verify:loop 1/1 |

**决策透明表（实施期自主决定）**

| # | 决定 | 理由 | 偏离裁定 |
|---|---|---|---|
| a | `fmtToggles` 改为只展示在场键（Kimi 日志成 `{search:false}`，非 `{thinking:undefined, search:false}`） | 部分支持平台的日志如实反映本次核对范围；全键输入输出逐字不变（DeepSeek 面零变化） | 设计未点名该函数；最小如实实现，不改任何判据 |
| b | `deepseek.mjs` 基线透传用同行替换 ⇒ 139 → 139（非计划 +1） | 设计行数为预估，§2 明示「实施后按实际回调」 | 行数回调，语义一致 |
| c | 新增「无受支持子键 ⇒ `ok:null`」单元例（评审 🔵 处置） | 与需求档 `overview.md:236`「不适用」及「不伪装绿」同向 | 评审驱动，T6 报告组 3→4 组 |
| d | Kimi 真机账号「联网搜索」：取证后复原为会话前的 `自动搜索` 状态 | 减少对用户账号侧效应 | 无（诊断件仅在 `.thincoder/tmp/`，不进仓库面） |

**上抛项（供父侧收口）**

1. **设计档随动（非实施者笔）**：`docs/design/modules/adapters.md:166` 现值仍 `false` +「启用与否待取数」⇒ 应按 §2 条件行改写为落值实况（`true`；search = 应用 + 复核）。
2. **T5（打包刷新）**：按 §4 由父侧在两切分落地后执行；本切分未动打包链与版本号。
3. **环境**：真机运行期间盘上另有 **19:11 启动的既有应用实例**（默认 userData `%APPDATA%\free-outsource`）——非本次产物，未处置；本切分自身进程/端口已清（`verify:loop*` 断言优雅退出、测试端口复查已释放）。

**fix round 2（评审轮 2 复核 + 收尾）**：advisor 轮 2 逐条复核三条 🔵 修复声明 ⇒ **Fixed ×3 · VERDICT: pass**（answer.mjs 空 `checked` ⇒ `ok:null`、kimi-toggles 打标前清同名旧标记、Escape 兜底后有界等待）；新增 🔵 一条（单元件头部「3 组」计数漂移）⇒ 已修（改「4 组」，与文件内 4 例对齐）；修后复跑 units **15/15**。终态 = **clean**（0 遗留 🔴 / 🔵 0；🟡 1 条为设计档随动，由父侧文档层持有）。

## §6 验证与收口（父代理）

### b6 收口（2026-10-11）

**收口检查（D7 结算同步）**
- **T1–T7 全部交付**：切分 A（#84 引擎面：T2 / T4 / T6）· 切分 B（#85 设置面：T1 / T3 / T7）· T5 打包刷新（父侧直跑）。
- **父侧验收（主包AI 亲跑——唯一一次仓库套件运行）**：b1 **27** · b2 **35** · b3 **11** · b4 **7** · b5 **14** · **b6 15** · `verify:mcp` 1 · **`verify:engine` 12** · `verify:runtime` 2 · `verify:settings` 6 · **`verify:loop`（DeepSeek 真机）1** · **`verify:loop:kimi`（真机）1**。
- **关键读数**：Kimi 行 `[data-toggle]` **恰 1（search）** + 一行不支持提示 ✓；快照 `platforms[].toggles` 子键对象（DeepSeek `{true,true}` / Kimi `{false,true}`）✓；补丁 op **7→8**（`session.set`）+ 会话复用块**五锚点**齐备 + 非法回退不落盘 ✓；`manifest.toggles` 增 `checked` / `unsupported` 且 `ok` 只比受支持子键 ✓；**C1 取数命中 ⇒ Kimi `requestPayloadCapture = true`**，真机 `ok:true` · `checked:["search"]` · `unsupported:["thinking"]`（**不伪装绿**）✓；T2 中性化（两文件 `chat/completion` **0 命中**）✓；J3 文案断言与 J8 日志词随动 ✓。
- **实施期真机缺陷（已修）**：Kimi 选项面板在点击后 ≈200–900ms **自行收起** ⇒ 读到陈旧 `aria-checked`（`E_SELECTOR_MISSING`）⇒ 修法 = 点击后有界等应用收起 + Escape 兜底 + 复核前重开 ✓（#84 真机诊断探针四段读数一致 ✓）。
- **T5 打包刷新（部分挂账，如实记录）**：`release/win-unpacked/resources/app.asar` 被**不可见占用者**锁定（三次 `EBUSY`；`免费外包.exe` / `electron.exe` / `node.exe` 三个进程名过滤全空；目录改名 `EPERM`；自还原改名探针仍 `EBUSY`）⇒ 按 `docs/batches/b4-package-ship.checklist.md:14` 的**既有处置**改走 `.thincoder/tmp/release2` 重建路线 ✓：构建成功（161.5s，无 `EBUSY`）· 新安装包 **350,943,899 B（≈334.7 MiB）** 已摆到 `release/免费外包-0.0.1-setup.exe` ✓ · **两条设计验收读数均通过**：① 随包 `resources/guide/agent-brief.md` sha256 **== 仓库现行**（`cd6fe02b…`）⇒ 说明书新内容（`f6ff0ef`）已进包 ✓；② asar 内 **含** T2 新词、**不含**旧词 ⇒ 本批修复已进包 ✓；另抽查 asar 含 `session-policy` / `kimi-toggles` / `platform-capabilities` / `renderer-session` 四新件 ✓。**`verify:pack` 段 A–D 未跑**（其路径硬编码读 `release/win-unpacked`，被同一锁阻塞）⇒ **挂账台账 #29**（条件 = 锁释放 / 重启后 / 下次打包前）。
- **本批缺陷与修复**：无回滚级缺陷。设计评审 2 轮（轮 1 **pass** + 两轮修复处置）· 实施侧：A 切分审计 1 轮 + 代码评审 2 轮 · B 切分审计 1 轮 + 代码评审 2 轮（均 pass，🔵 全部就地修）。
- **父侧直改披露（可回退）**：需求档 3 行（`:233` / `:236` / `:282`）· 本档档头 1 行 + §2 残留 4 处 + 计数 1 处 · **b2 归档件 4 行**（跨批写门正确拒绝后由父侧承接）· `docs/design/modules/adapters.md` 2 处（C1 落值）。
- **留下的 🟡 / 🔵**：无（评审 7 条全处置；实施侧 🔵 全修）。
- **人工场景**：`verify:loop` 与 `verify:loop:kimi` 已覆盖两平台端到端 ✓；`verify:pack` 段 A–D 待锁释放（#29）。
- **台账**：#17 / #23 / #25 / #26 / #27 / #28 已核销；新增 **#29**（`verify:pack` 补跑）。
- **暂缓批复核**：无。

**冻结**：本记录自「已收口」状态行起冻结，此后不再回改。
