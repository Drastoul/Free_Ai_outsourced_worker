# 2026-10-12 · b7 自定义外包工
> 六段 append-only，一段一作者：§1 讨论（主 agent）· §2 批次任务与设计（eng-designer）· §3 设计评审（评审子代理）· §4 用户批准（主 agent）· §5 实施记录（eng-coder）· §6 验证与收口（父代理）。
> 编制：主 agent · 2026-10-12 · 来源 = 用户 2026-10-12 20:47「修正：新增外包工功能应可由用户自主填写名称、链接，以增加各类不同的 Ai 的 web 版，而不是只能 DeepSeek 和豆包中选」+ 同轮裁定「按 A；若需要稳定或填写后不可用，可接入主包 Agent 让主包优化，但免费外包自己不用做这一步，只留这个可以自主填写的接口。这种可由用户自己的主包 Agent 进行 2 次优化的方式，写入『新增』的提示和 .exe 附带的说明中」；需求档 R11（台账 #30）。
> 台账 = #30（免费外包 · 归批）。前情 = docs/batches/b6-small-items-and-repack.md §6（已收口 2026-10-11）。
## §1 讨论（主 agent）
**状态行**：进行中（b7「自定义外包工」：范围 = T1–T5（数据模型与主进程面 · 设置界面 · 引擎通用驱动 · 失败可诊断 · 文档与随包）· 需求 = R11（台账 #30）· 设计评审轮 1 = changes-required（🔴1🟡6🔵5，主包AI 已逐条裁定「准」并派定点修 #4）· 用户裁定：按 A（填名称+链接即可派单，通用尽力驱动）· 只留接口不做优化回路（二次优化由用户自己的主包AI 改驱动参数）· 标志「实验性」· 不改 MCP 六件套）

### §1 讨论与来源（主包AI，2026-10-12）

- **来源**：用户 2026-10-12 20:47「修正：新增外包工功能应可由用户自主填写名称、链接，以增加各类不同的 Ai 的 web 版，而不是只能 DeepSeek 和豆包中选」+ 同轮裁定（回应主包AI 的语义问询）：「**按 A**。若需要稳定或填写后不可用，可接入主包 Agent，让主包优化，但**免费外包自己不用做这一步，只留这个可以自主填写的接口**。这种可由用户自己的主包 Agent 进行 **2 次优化**的方式，**写入「新增」的提示和 .exe 附带的说明**中。」
- **需求落位**：需求档 **R11**（五要素 + AC-R11-1..3 + §6 映射两行；台账 **#30**）。
- **本批范围**：§2 的 T1–T5（数据模型与主进程面 · 设置界面 · 引擎通用驱动 · 失败可诊断 · 文档与随包）。
- **成本口径说明（如实记录）**：本单原计划「免费通道起草 → 设计代理落档」，但派单时宿主侧 MCP 断连（`Unknown tool`）⇒ 改由设计代理直写；通道恢复后已继续按成本口径分派（随包说明那一节的起草见本轮后续派单）。

**父侧裁定（回应设计代理上抛 U1–U6）**

- **U1（§1 占位）= Fixed（我，本条即落）**。
- **U2（F11.4 错误码口径）= 准**：本批**不新增错误码**，定位信息走既有码的 `message`（需求档不动）；日后确需新码 ⇒ 另走需求流程。
- **U3（版本号）= 准**：按 `0.0.1` **同版本覆盖刷新**（b6 先例）；交付/分发时须在说明里写明「同版本覆盖，重装即可」。
- **U4（R11 未提附件与开关）= Fixed（我）**：R11 边界补一条「本批自定义外包工**不含**送件、开关、下载捕获与新建会话（均按不支持处置，界面与随包说明如实标注）」。
- **U5（`docs/guide/**` 落笔人）= 主包AI**（起草继续走免费通道）。
- **U6（真实第三方站点实证）= 收进本批人工场景**（不阻塞；读数照实入 §6）。
- **另裁一条（设计代理报备的既有缺陷）**：`docs/design/modules/adapters.md` 存在**两个「§5」** ⇒ **本批不改号**（改号会打断已冻结记录里的既有指针），**记账为条件触发项**（见台账行：下次因其它原因触摸该文件时一并归位）。

## §2 批次任务与设计（eng-designer）
**状态行**：设计完成（七块齐备（T1–T5 · 冻结接口 · 机制设计五问 · 文件计划逐件行数 · 验收对照 · D1–D14 · 边界 / 上抛 U1–U6 · 读盘复核 · 三链自检）· 设计档增量已同步（adapters §6 / settings-app §2·§8 / overview §4 / scheduler §10·§11 / mcp-server §3.1·§3.2·§7）· 待评审）
<§2 模板占位：本批条目（覆盖） / 设计档落点 / 机制设计 / 受影响文件与测试面 / 验收对照 / 关键决策 / 上抛项>

### 本批（b7）范围与覆盖

覆盖条目（三条链：台账 #30 ↔ 本段 ↔ 需求档 R11 与设计档增量）：

- **R11 自定义外包工**（`docs/requirements/overview.md:296`）：功能点 F11.1–F11.6（`:302-307`）+ 验收 AC-R11-1..3（`:317-319`）；台账 #30（免费外包 · 归批）。
- 用户硬约束（本档档头「来源」行）：按 A（通用尽力驱动，填完即可派单）· 只留接口、不做优化回路（二次优化 = 用户自己的主包AI 改该外包工的**驱动参数**）· 标注「实验性」· 不改 MCP 六件套工具名/参数 · 内置平台行为不变。
- 需求档合规检查（检查面，不改需求档）：**五要素齐备、可设计**——模块目标 `:298`；功能点 F11.1–F11.6 `:302-307`（各自可验）；边界 `:309-313`；AC-R11-1 / R11-2 命令可验、AC-R11-3 人工可检 `:317-319`；依赖 `:321`；§6 映射两行 `:364-365` 与本批一致。无矛盾、无不可实现项、无归属不明。
- 本批性质：**新增一类外包工（自定义）+ 通用尽力驱动 + 失败可诊断**；不改内置平台（deepseek / kimi 适配器与行为零改动）、不改 MCP 契约、不加自动优化机制。

### 不在本批

- **不做优化回路 / 自学习**（用户硬约束）：不预置任何第三方站点选择器、不做「失败自动改参数」、不做参数推荐或站点清单。
- **不改 MCP 六件套**：工具名 / 入参 / 返回形状 / 错误码码值与语义全部不动（F11.4 的定位信息走既有 `message` 字段）。
- **不改内置平台**：`src/engine/adapters/deepseek*.mjs` / `kimi*.mjs` 零改动；会话复用（R10）机制零改动（自定义平台按既有 `newChat !== false` 口径不记账）。
- **自定义外包工本批不含**：送件（附件上传）· 平台开关（thinking / search）· 下载捕获（取件层①）· 新建会话（不调 `openSession`）。
- **不重设计**：调度状态机 / 协议面 / 打包链（配置与脚本沿用 b4；本批只做一次刷新构建，见 T5）。
- **需求档 / 其它批次档**：不改（需求档的笔 = 主包AI；本段只写设计落点与判据）。

### 设计档落点（本段同步落地；评审对象含以下各处）

- `docs/design/modules/adapters.md`：§2 接口注释增量（可选钩子 `bindWorker` / `loginFailure` / `dom.diagnose`；`streamCapture:false` 的发送确认口径）+ 新增「§6 自定义外包工（custom；b7）」＝**机制权威**（能力位表 / 驱动参数 / 启发式判据 / 本单锚定通用形态 / 诊断面 / 失败码映射）。
- `docs/design/modules/settings-app.md`：§2 增「自定义外包工（b7）」（入口 / 表单 / 驱动参数对话框 / 提示文案 / 校验 / 锚点）+ §8 增判据一条。
- `docs/design/overview.md`：§4 配置存储——`workers[]` 增 `url` / `driver` 字段、样例与校验口径。
- `docs/design/modules/scheduler.md`：§10 增量——`task.run` / `worker.check` 的 `worker` 载荷增 `url` / `driver`（自定义平台）+ 派单期附件能力门（`requireUpload`）；**另**（定点修追加）：§4 选人伪码两分支补附件能力门（`scheduler.md:51` / `:57`，口径指向 §10）+ §6 增「改驱动参数 ⇒ 清该条目冷却」（`:82`）。
- `docs/design/modules/mcp-server.md`：§3.2 增一条同步拒绝口径（带附件 + 该外包工平台不支持送件）+ §7 文档断言增「自定义外包工」节。
- `docs/design/modules/browser-engine.md`：**本批不改**（§9 已载「仅 `newChat !== false` 的适配器记账」；profile 隔离与启动机制零变化）。
- 权威顺序：机制以设计档为准（单一来源）；批次档本节 = 实施合同与判据。

### 条目表（T1–T5）

**T1 数据模型与主进程面**
- 目标：自定义外包工在 `config.json` 有单一形态（`platform:'custom'` + `url` + `driver`），校验 / 隔离口径明确；主进程把 `url` / `driver` 透传引擎（引擎不读配置）；带附件派单在**派单期**按能力门拒绝 / 跳过（不留冷却陷阱）。
- 功能点：① `src/main/config-schema.mjs`——`workers[].url`（http/https 绝对地址）与 `workers[].driver`（三键字符串，默认空串）归一化；`platform:'custom'` 且 url 缺 / 非法 ⇒ **隔离该条 + 记 issue**（既有「非法条目隔离」口径，`config-schema.mjs:136-141`）；非 custom 平台条目带 url / driver ⇒ 记 issue 并丢弃该键。② `src/main/scheduler/workforce.mjs`——新增 `toEngineWorker(w)`（引擎载荷单一来源：`{id,name,platform}`，自定义平台增 `url` / `driver`）；`pick(specified, {requireUpload})` / `nextAvailable(tried, {requireUpload})`：带附件派单时，显式指定不支持送件的外包工 ⇒ 同步拒绝 `E_WORKER_UNAVAILABLE`（**不建任务、不冷却**）；优先级 / 降级候选跳过不支持送件者。③ 调用点改造：`scheduler.mjs:60`（dispatch）、`scheduler.mjs:118`（排队期降级）、`execution.mjs:214`（运行期降级候选）、`service.mjs:185`（「打开并检查」载荷 → `toEngineWorker`）。
- 边界：内置平台（`upload:true`）行为零变化；空 `files` 路径零变化；不改 MCP 参数 / 返回形状。
- 验收：批内单元（schema 归一化与隔离 / requireUpload 过滤与同步拒绝）+ `npm run verify:settings`（AC-R11-1 落盘读数）。
- 依赖：无。

**T2 设置界面（新增自定义 + 驱动参数 + 提示）**
- 目标：能新增自定义外包工（名称 + 链接）、能编辑其驱动参数、界面如实标注「实验性 / 可由你的主包AI 优化」。
- 功能点：见「机制设计 4」——`[data-platform="custom"]` 入口（与既有平台按钮列并存）+ 同对话框内表单 + 行内提示 + `[data-driver-dialog]`；写路径 = `worker.add` 的 custom 分支与新增操作 `worker.setDriver`。
- 边界：不改既有行的 DOM 锚点与文案（内置平台行零变化）；不加 IPC 通道（沿用 `fo:patch`，`window.mjs:53` 单写入口）；不做站点预设 / 参数推荐。
- 验收：`npm run verify:settings` 新件（新增流程 + `config.json` + `list_workers` 双读 + 驱动参数写读 + 非法输入不提交）。
- 依赖：T1。

**T3 引擎通用驱动**
- 目标：自定义外包工派单走既有相位链（opening → uploading → sending → streaming → extracting → finalizing），以通用启发式驱动页面；答复经 DOM 通道取回并**锚定本单回合**。
- 功能点：见「机制设计 2」——新件 `custom.mjs` / `custom-page.mjs` / `custom-dom.mjs`；`registry.adapterFor(worker)` 绑定；task-runner 换绑定 + 对无流平台跳过发送确认；`worker.check` 支持自定义平台。
- 边界：`deepseek*.mjs` / `kimi*.mjs` 零改动；相位名与顺序不变；会话复用机制不变。
- 验收：`npm run verify:engine` 新件（happy path + 本单锚定 + 相位序 + 显式驱动参数生效）。
- 依赖：T1。

**T4 失败可诊断（F11.4）**
- 目标：驱动参数缺失 / 不匹配与无回复时，回执给主包AI 可操作定位信息（阶段 + 项名 + 实际值 / 候选链 + 采集诊断）。
- 功能点：见「机制设计 3」——opening 的 `loginFailure` 钩子（区分「登录墙」与「输入区未找到」）；`answer.mjs` 的无信号判定与 `dom.diagnose` 诊断串拼接；诊断日志行词形。
- 边界：**不新增错误码**（全部复用既有码）；不改 `hint` 表与 `needsHuman` 列；不改 E_* 语义；不改截图码集（`failure.mjs:9` 已含所需码）。
- 验收：`npm run verify:engine` 两例 + 批内单元（fake adapter 驱动 `collectAnswer` 的无信号路径与诊断拼接）。
- 依赖：T3。

**T5 文档与随包**
- 目标：随包说明含「自定义外包工 + 由主包AI 二次优化」一节；安装包内带新说明。
- 功能点：① `docs/guide/agent-onboarding.md` 新增「十、自定义外包工（实验性）」节（必含要素见「机制设计 5」；要点由本段给出，**落笔 = 本批实施**）；② `docs/guide/agent-brief.md`「出错怎么办」增一句（自定义外包工回执读法：码 + 定位信息 + 可用动作）；③ 代码全绿后 `npm run dist` + `npm run verify:pack`；④ 一次性读数：随包 `guide/agent-onboarding.md` 与仓库文档 sha256 相等。
- 边界：不重设计打包链；版本号不变（0.0.1 同版本覆盖——b6 先例；如需升版 = 用户裁定，见 U3）；段 C 读数照实、不造假绿。
- 验收：`npm run verify:mcp` 文档断言（新增节）+ `npm run verify:pack` 段 A–D + 一次性读数。
- 依赖：T1–T4 全部落地且机器判据全绿（顺序硬约束，b6 先例）。

### 机制设计（七问逐条答案，Q6/Q7 见后两块）

**1. 数据模型（Q1）**——自定义外包工 = 既有 `workers[]` 条目的一种，字段增量两键：

```json
{ "id": "w-3", "platform": "custom", "name": "某站点AI", "enabled": true,
  "url": "https://example.com/chat",
  "driver": { "inputSelector": "", "sendButtonSelector": "", "replySelector": "" },
  "toggles": { "thinking": false, "search": false } }
```

- `platform` 取值 = 单一 id `'custom'`（多台自定义外包工共用同一适配器，靠各自 `url` / `driver` 区分）；`name` 用户自填（列表内唯一，同既有改名规则）；`url` 必填（http/https 绝对地址）。
- `driver` 三键（**空串 = 通用启发式**，非空 = 该键覆盖）：`inputSelector`（输入区）· `sendButtonSelector`（发送按钮；空 ⇒ Enter 发送）· `replySelector`（回复区回合容器）。**这三键即 F11.3 的「二次优化」接口**（写入通道见机制设计 5 ④）。
- `toggles` 键保留（默认 `{thinking:false, search:false}`）——不删键、不改默认；自定义平台能力位两子键均 false ⇒ 引擎跳过开关子步、界面不渲染开关（b6 D6 回退口径，`settings-app.md:23`）。
- 补丁增量：`worker.add` 增 custom 分支（`{op:'worker.add', platform:'custom', name, url}`；新增时不给 driver，统一走 `worker.setDriver`）；**新增操作 `worker.setDriver`**（`{op:'worker.setDriver', id, driver:{…至少一键…}}`，部分更新，空串 = 恢复通用启发式；**落盘后清除该条目健康记录**——见 `scheduler.md` §6）。旧 op 形状零改动：内置平台仍只接受 `{platform}`（`patches.mjs:77` 的 `checkKeys` 对内置平台不放宽），`worker.remove/rename/move/setEnabled/setToggles` 对自定义条目不感知、零改动。
- 相容性：`list_workers` / `/healthz` 自动可见（名册来源同一 `workers[]`，`workforce.mjs:144-162`）；`dispatch_task.worker` 按名字 / id 指定不变；非 custom 平台条目不接受 url / driver（手改 ⇒ 记 issue 丢弃）。

**2. 引擎侧通用驱动（Q2）**——三件新模块 + 注册表绑定：

**a. 能力位逐项取值（`custom` 适配器）**：

| 位 | 取值 | 依据 / 后果 |
|---|---|---|
| `newChat` | `false` | 无通用「新建会话」判据；不调 `openSession`、不进会话复用记账（`browser-engine.md` §9「仅 `newChat !== false` 记账」）；页内旧回合由本单锚定处置 |
| `upload` | `false` | 无通用「上传完成」判据（文件名可见性 / 上传请求均不可预设）⇒ 带附件派单在**派单期**被拒 / 跳过（T1），不静默发出丢掉附件的任务 |
| `streamCapture` | `false` | **无法预设答复流 URL**（每站协议不同）⇒ 不猜、不匹配；答复走 DOM 通道（下条 b） |
| `downloadCapture` | `false` | 无通用「下载按钮」判据；取件走层②③ |
| `codeBlockExtract` | `true` | 命名约定（`# file:` 等）作用在采集文本上、平台无关（`text-files.mjs`）；DOM 文本无围栏 ⇒ 命中即得、未命中不报错（层③全文保底） |
| `toggles` | 两子键均 `false` | 无通用开关控件判据；引擎跳过应用与复核（`task-runner.mjs:167` / `:195`）；界面按 b6 D6 不渲染 + 行内提示 |
| `requestPayloadCapture` | `false` | 无载荷读键约定 ⇒ `result.toggles.ok = null`（不伪装绿，`answer.mjs:135-136`） |

**b. 取答复通道 = DOM 兜底通道（唯一）**：`streamCapture:false` ⇒ `collectAnswer` 不空等首字节、直接进 DOM 分支（`answer.mjs:76-80`），`delivery.transport='dom'` 如实回报。**发送确认改口径**：无流可观测 ⇒ 引擎对 `streamCapture === false` 的平台**跳过 `waitForSendConfirm`**（否则按 `capture.requestSeen` 空等 30s 后误报 `E_SEND_FAILED`，`answer.mjs:56-63`）；确认动作落进自定义适配器的 `send()`（输入区清空 ∨ 出现新回合元素，预算 6s），失败 ⇒ `E_SEND_FAILED`。

**c. 通用启发式判据（v1）**：
- **输入区**：`driver.inputSelector`（非空 ⇒ 只用它）→ `textarea` → `[contenteditable="true"]` → `input[type="text"]`（后三级取**最靠下的可见者**）。
- **发送**：`driver.sendButtonSelector` 非空 ⇒ 点击该按钮；空 ⇒ 聚焦输入区 → 清空 → `insertText`（落地校验失败 ⇒ 逐字 `type` 兜底，沿用既有手法，`deepseek-page.mjs:232-255`）→ Enter。
- **回复锚定（§3.4「本单回合锚定」的通用形态）**：`send()` 打基线 = ① 对命中的回合元素及其两代祖先打属性标；② 页内记「基线文本集」（命中元素归一化文本）+「本单发送文本」。`dom.collect()` 只接受**基线之后**的候选元素：可见 ∧ 非空 ∧ 不含输入区 ∧ 文本不在基线文本集 ∧ 非回声（归一化文本 == 发送文本，或以其前 40 字开头——用户消息气泡过滤）⇒ 取**最后一个**（F11.2「最新一条助手回复」）拼接；无 ⇒ 空串（引擎按 `E_NO_RESPONSE` 处置，不静默交付旧答复）。
- **回复区候选链**（`driver.replySelector` 为空时按序取第一个命中者）：`[data-message-author-role]` → `[class*="message" i]` → `[role="listitem"]`。
- **登录态判定**：输入区可见 ⇒ `ready`；验证码 / 风控词 ⇒ `captcha`；登录词 / 可见密码框 ⇒ `login_required`；输入区一直不出现 ⇒ 由 `loginFailure` 钩子给出 `E_SELECTOR_MISSING`（见 3）。
- **何时判失败**：见机制设计 3 的码映射表；口径 =「从未取到非空文本」到 `streamFirstByteMs`（默认 120s）判 `E_NO_RESPONSE`；「取到但未稳定」到 `taskTimeoutMs` 判 `E_TIMEOUT`。

**d. 绑定（url / driver 进引擎的路径）**：注册表增 `adapterFor(worker)`——平台适配器**可选**实现 `bindWorker(worker)`，`custom` 用它生成派生实例（覆盖 `url` 与 `driver`；其余函数引用不变）；调用点 = `task-runner.mjs:139` 与 `worker-check.mjs:63`（由 `getAdapter(worker.platform)` 改为 `adapterFor(worker)`）。**引擎不读配置文件**（沿用 `toggles` / `session` 的透传口径，`scheduler.md:111`）；载荷由 T1 的 `toEngineWorker` 生成。

**3. 失败可诊断（F11.4 / Q3）**——回执 = 任务 `error {code, message, hint}`；**定位信息全部落在 `message`**（`hint` 由错误码表按码给出、逐码不改——`errors.mjs:57-63` 不支持逐次 hint，故不扩这条链）：

| 阶段 | 情形 | 错误码（既有） | message 必含（词形示例） |
|---|---|---|---|
| opening | 输入区未找到（`inputSelector` 未设且候选链全未命中；已排除登录墙） | `E_SELECTOR_MISSING` | `opening：输入区未找到（inputSelector=自动；候选 textarea/[contenteditable]/input[type=text] 均未命中可见元素）` |
| opening | 登录墙 / 风控 | `E_LOGIN_REQUIRED` / `E_CAPTCHA_OR_RISK` | 既有口径（不改） |
| sending | 发送未确认（Enter / 按钮点击后输入区未清空且无新回合） | `E_SEND_FAILED` | `sending：发送未确认（发送方式=enter；输入区=.foo）` |
| streaming | 从未取到非空文本（无新回合 / 全被回声或基线过滤） | `E_NO_RESPONSE` | `发送后未观测到新回复（等待 120s）+ 采集诊断：候选=0（replySelector=自动；候选链 3 项均 0 命中）；基线过滤=0；回声过滤=1` |
| streaming | 取到但未稳定 | `E_TIMEOUT` | 既有文案 + 采集诊断 |
| 检查面 | 「打开并检查」同口径 | `{status:'unavailable', detail:<诊断>}` | 徽标 detail 即诊断（`service.mjs:208-215` 零改动） |

- **不新增错误码**（理由：用户硬约束「不改 MCP 六件套工具名/参数」；错误码表封闭 + b2 先例「忙碌拒绝复用 E_WORKER_UNAVAILABLE」`worker-check.mjs:53`；F11.4 只要求「沿用既有错误码 + 定位信息」）。**该口径列为上抛 U2 供核**。
- 实现面：opening 的区分由 `loginFailure(page)` 钩子承担（`custom.mjs` 提供；`opening.mjs` 新增 `loginFailureError(state, adapter, page)` 供 task-runner 与 worker-check 共用）；streaming 的诊断串由 `dom.diagnose(page)` 提供（返回单行短串；`answer.mjs` 只做拼接、不解析内容——两边解耦）。
- 日志：新增一行可判词形 `自定义驱动诊断：…`（随 task 日志进 `<userData>/logs/app.log`，供事后取证）；失败截图沿用既有码集（`failure.mjs:9` 已含 `E_SELECTOR_MISSING` / `E_NO_RESPONSE` / `E_TIMEOUT`）。

**4. 设置界面（Q4）**：
- **入口形态 = 与既有平台按钮列并存**：快照 `platforms[]` 增一行 `{id:'custom', label:'自定义', available:true}`（来源 = `PLATFORM_CHOICES` 增一行；`platform-capabilities.mjs` **零改动**——经注册表得 `toggles:{false,false}`，`platform-capabilities.mjs:7-12`）。新增对话框内点该行 ⇒ **同一 `[data-add-dialog]` 内展开自定义表单**（不新开对话框）：`[data-custom-form]` + `[data-field=custom-name]` + `[data-field=custom-url]` + `[data-field=custom-error]` + `[data-action=custom-submit|custom-back]`。
- **校验**：名称非空（列表内唯一——服务端 `worker.add` 校验，冲突回显错误、**不提交**）；URL 必须 `new URL()` 可解析且协议 ∈ {http, https}（服务端校验；界面不做本地猜测，错误一律回显 patch 结果）。驱动参数对话框：三键文本（长度 ≤ 200），空串合法（= 通用启发式）；选择器**语法**不在此校验（无 DOM 处无法判定）——语法错误在派单回执中定位（`E_SELECTOR_MISSING` + 项名 + 值）。
- **提示文案（F11.5）**：① 表单内与 custom 按钮处：`实验性：通用尽力驱动，不承诺对所有站点稳定。若派单失败，可由你的主包AI 优化该外包工的驱动参数（输入区 / 发送 / 回复区选择器）。`；② 自定义行内常显 `[data-field=custom-hint]`（含「实验性」与「主包AI」两词，供机器断言）；③ 行内 `[data-action=driver]`「驱动参数」按钮 ⇒ `[data-driver-dialog]`（三输入 + 同一提示 + 保存）；④ 自定义行内另立 `[data-field=custom-limits]`——如实标注四项不支持能力中的**送件（附件）/ 下载捕获 / 新建会话**（第 4 项「平台开关」由 `[data-field=toggles-unsupported]` 承载；R11 边界 `requirements/overview.md:314`「界面与随包说明如实标注」）。
- **既有断言 / 契约相容性分析**：
  - `[data-platform-list] [data-platform]`：名单 2 → 3（`settings.workers-page.test.mjs:81` 的**精确断言**须随动为 `['deepseek','kimi','custom']`；`:82-84` 两条 deepseek/kimi 断言不变）。
  - `[data-worker-id]` 行：内置平台行零变化（不新增、不改序）；自定义行沿用同一行结构，仅追加 `[data-field=custom-hint]` 与 `[data-action=driver]`。
  - `[data-toggle]` 子键门控：自定义行按 b6 D6 回退 ⇒ 零个 `[data-toggle]` + `[data-field=toggles-unsupported]` 文本含「深度思考、联网搜索」（既有断言只查 DeepSeek / Kimi 行，不受影响）。
  - `[data-field=session-policy]` 块内不得出现行级 `[data-toggle]`（`settings.workers-page.test.mjs:211`）：不受影响（新元素不在该块内且非 `[data-toggle]`）。
  - 归档单元：`docs/batches/b2-settings-ui.units.patches.mjs:15-30` 断言 `PATCH_OPS` 八项与平台清单两项 ⇒ 随动 +1 op（`worker.setDriver`）+1 条目（`custom:可`）；`:66`（内置平台多余字段仍拒绝）保持通过。

**5. 随包说明增量（F11.5 / Q5）**——落点 `docs/guide/agent-onboarding.md` 新增「十、自定义外包工（实验性）」（要点由本段给出，落笔 = 本批实施）；必含要素：

① 是什么 / 怎么新增：设置 → 外包工 → 新增外包工 →「自定义」→ 填名称与链接 ⇒ 即可派单（通用尽力驱动）；
② 会做什么 / 不做什么（如实）：可用 = 发文本、取回最新一条回复全文与代码块提取；不可用 = 附件上传、平台开关、下载按钮、新建会话；不承诺站点稳定性；
③ 失败怎么读：回执含「阶段 + 未匹配项 + 实际值 / 候选链」定位信息（错误码仍是既有那几个）；
④ **二次优化怎么做**（本节核心）：驱动参数三键（`worker.driver.inputSelector` / `sendButtonSelector` / `replySelector`）= 引擎通用启发式的覆盖口；两条写入通道——设置界面「驱动参数」对话框（即时生效）或直接编辑 `config.json`（**建议先退出应用再改**：应用运行中任何界面改动会把内存态整份写回、手改内容可能被覆盖；手改后需重启应用生效——不做文件监听是既有口径 `settings-app.md:62`）；**本工具不做自动优化 / 参数推荐**，优化由用户自己的主包AI 完成；
⑤ 登录态：每个外包工独立浏览器配置目录（自定义站点登录态只存本机、不随包外传），换机后重新登录一次；
⑥ 排障建议：先「打开并检查」看登录态与输入区诊断、再派单；失败截图为选择器修正的第一手证据。

并：`docs/guide/agent-brief.md`「出错怎么办」增一句（主包AI 的动作面：自定义外包工 `E_SELECTOR_MISSING` / `E_NO_RESPONSE` 的 message 含定位信息 ⇒ 建议用户补驱动参数，或改派其他外包工）。

### 冻结接口（本批实现不得偏离）

- **MCP 六件套零改动**（工具名 / 入参 / 返回形状 / 错误码码值与语义 / hint 表）。
- **配置增量只增两键**：`workers[].url`（custom 专属，http/https）与 `workers[].driver`（三键对象，默认空串）；`toggles` 键保留不动；内置平台条目形状逐字不变。
- **补丁操作清单增量**：+`worker.setDriver`；`worker.add` 增 custom 分支（内置分支形状不变、多余字段仍拒绝）。
- **设置快照增量**：`platforms[]` +1 行（custom）· `workers[]` 的 custom 条目增 `url` / `driver`（其余键与形状不变）。
- **引擎可选接口增量**：适配器可选实现 `bindWorker(worker)` / `loginFailure(page)`；`dom` 可选 `diagnose(page)`（返回单行短串）。既有适配器不实现 ⇒ 行为零变化。
- **错误码**：不新增、不改语义（定位信息走 `message`）。
- **新日志词形（正则可判）**：`自定义驱动诊断：`；既有词形不动。
- **DOM 锚点（新增，供断言）**：`[data-platform="custom"]` · `[data-custom-form]` · `[data-field=custom-name|custom-url|custom-error|custom-hint|custom-limits]` · `[data-action=custom-submit|custom-back|driver]` · `[data-driver-dialog]` · `[data-field=driver-input|driver-send-button|driver-reply|driver-error]`。
- **环境口径（照做）**：起应用剥 `ELECTRON_RUN_AS_NODE`；中文断言 UTF-8 感知（不用 `findstr`）；临时件 `.thincoder/tmp/`；遇 429 / 额度类错误立即停止重试并如实报。

### 受影响文件与测试面（Q6；行数口径 = 本日 read 读数——含末尾空行；实施后按实际回调；设计档 .md 行因本批设计增量已落档，标「已落」；>300 者给出拆分）

| 文件 | 现况 → 预期 | 职责 / 改动 | 拆分判断 |
|---|---|---|---|
| `src/engine/adapters/custom.mjs` | 新增 → ~110 | 适配器装配：能力位 / `bindWorker` / `checkLogin`+`loginFailure` / `send` / `dom.collect`+`dom.diagnose` / `stream` 占位 / `openSession` 占位（`newChat:false` ⇒ 不应被调用；但属 `defineAdapter` 必需函数，`base.mjs:46-50`） / `extract` | — |
| `src/engine/adapters/custom-page.mjs` | 新增 → ~170 | 页面机械：输入区定位 / 发送 / 发送确认 / 登录词表与判定 | — |
| `src/engine/adapters/custom-dom.mjs` | 新增 → ~120 | DOM 采集：基线打标 / 收集过滤 / 诊断串 | — |
| `src/engine/adapters/registry.mjs` | 27 → ~45 | 注册 `custom`；`adapterFor(worker)`（可选 `bindWorker` 派生） | — |
| `src/engine/adapters/base.mjs` | 85 → ~95 | 注释：可选钩子与 `streamCapture:false` 口径（能力默认值零改） | — |
| `src/engine/task-runner.mjs` | 293 → ~298 | `adapterFor`；`streamCapture===false` 跳过发送确认；登录失败走 `loginFailureError` | 两处小改；不越 300 |
| `src/engine/opening.mjs` | 41 → ~65 | 新增 `loginFailureError(state, adapter, page)`（钩子 → 既有码 + 定位信息） | — |
| `src/engine/answer.mjs` | 173 → ~200 | `no-stream-capability` 的「无信号」判定（`streamFirstByteMs`）+ `dom.diagnose` 拼接 | — |
| `src/engine/worker-check.mjs` | 86 → ~100 | `adapterFor(worker)`；诊断 → `{status:'unavailable', detail}` | — |
| `src/main/config-schema.mjs` | 216 → ~251 | `url` / `driver` 归一化；custom 缺 url ⇒ 隔离 + issue | — |
| `src/main/scheduler/workforce.mjs` | 219 → ~246 | `toEngineWorker`；`pick` / `nextAvailable` 增 `requireUpload`（能力位取自适配器注册表归一化——附件能力门单一来源） | — |
| `src/main/scheduler/execution.mjs` | 288 → ~293 | worker 载荷走 `toEngineWorker`；降级候选传 `requireUpload` | 不越 300 |
| `src/main/scheduler/scheduler.mjs` | 298 → 298 | dispatch（`:60`）/ 排队期降级（`:118`）两处调用行追加 `requireUpload`（**零新增行**） | **定死**：仅现有调用行追加参数、不新增行 ⇒ 不越 300（不采条件式方案） |
| `src/settings/patches.mjs` | 263 → ~276 | 路由 + `PATCH_OPS` + `PLATFORM_CHOICES`（+custom）；细节校验移 `patches-custom.mjs` | 拆出 `patches-custom.mjs` 避免越 300 |
| `src/settings/patches-custom.mjs` | 新增 → ~90 | `worker.add`(custom) / `worker.setDriver` / URL 与 driver 校验 | — |
| `src/settings/service.mjs` | 299 → ~293 | worker 视图构建移 `snapshot-workers.mjs`；checkWorker 走 `toEngineWorker`；`worker.setDriver` / url / driver 变更 ⇒ 清除该条目健康记录（`workforce.clearHealth`，见机制设计 1 补丁增量） | 拆出 `snapshot-workers.mjs`（同 `snapshot-session.mjs` 先例） |
| `src/settings/snapshot-workers.mjs` | 新增 → ~35 | 快照 workers 视图（toggles / url / driver 合并） | — |
| `src/settings/renderer-workers.js` | 280 → ~296 | custom 行提示 + 驱动按钮 + 表单入口委派（细节在新件） | 细节落 `renderer-custom.js` |
| `src/settings/renderer-custom.js` | 新增 → ~150 | 新增表单 + 驱动参数对话框 + 接线 | — |
| `src/settings/index.html` | 129 → ~150 | 自定义表单 / 驱动对话框 / 脚本行（+`renderer-custom.js`） | — |
| `src/settings/platform-capabilities.mjs` | 12 → 12 | **零改动**（custom 行自动派生 `{false,false}`） | — |
| `test/integration/engine.custom.test.mjs` | 新增 → ~200 | 自定义派单四例（happy / 锚定 / 缺失不匹配 / 无回复 / 驱动参数生效） | — |
| `test/integration/engine-helpers.mjs` | 167 → ~225 | fixture 路由：custom 会话页（含预置旧回合）/ 无输入页 / 无回复页 | — |
| `test/integration/settings.custom.test.mjs` | 新增 → ~130 | 新增流程 + 双读 + 驱动写读 + 非法输入 | — |
| `test/integration/settings.test.mjs` | 18 → 19 | 聚合新增件（一行 import） | — |
| `test/integration/settings.workers-page.test.mjs` | 295 → ~297 | 平台清单断言随动（2 → 3 项） | — |
| `test/integration/mcp-face.docs.mjs` | 133 → ~135 | ① 断言清单增「自定义外包工」节 | — |
| `package.json` | 32 → 33 | `verify:engine` 增新测试件 | — |
| `docs/batches/b2-settings-ui.units.patches.mjs` | 167 → ~173 | 归档单元随动（**跨批协调项**，见 §2「跨批协调项（b7 ↔ 既收口批次）」）：`PATCH_OPS` 八项 → 九项（+`worker.setDriver`）/ `PLATFORM_CHOICES` 两项 → 三项（+`custom:可`）；`:15-30` 的 `deepEqual` 精确断言 ⇒ 必红，须随动该件 | 改写途径 = 就地基线随动（该件为开发期随批单元、非记录面；b2 批次档记录面不回改） |
| `docs/batches/b7-custom-workers.units.mjs` | 新增 → ~100 | 批内单元（见验收对照 1） | — |
| `docs/guide/agent-onboarding.md` | 145 → ~179 | 第十节（要素见机制设计 5） | — |
| `docs/guide/agent-brief.md` | 105 → ~112 | 「出错怎么办」一句 | — |
| `docs/design/modules/adapters.md` | 已落（现盘 230） | §2 注释 + §6 机制权威（本批设计增量已写入本档，无剩余实施动作） | — |
| `docs/design/modules/settings-app.md` | 已落（现盘 78） | §2 / §8 增量（同上） | — |
| `docs/design/modules/mcp-server.md` | 已落（现盘 154） | §3.2 一条 + §7 断言行 | — |
| `docs/design/modules/scheduler.md` | 已落（现盘 128） | §4 / §6 / §10 增量（附件能力门 · 改参数清冷却） | — |
| `docs/design/overview.md` | 已落（现盘 314） | §4 schema 样例与字段说明 | — |
| `docs/design/modules/browser-engine.md` | 91 → 91 | **本批不改** | — |
| `docs/README.md` | 39 → 40 | 文档地图行随动（guide 职责一句 + b7 批次档索引行） | — |

### 验收对照（Q7；机器判据 + 读数口径）

1. **批内单元**：`node --test docs/batches/b7-custom-workers.units.mjs` —— 判据 = ① schema：custom 条目带 url/driver 归一化通过；缺 url / 非 http(s) ⇒ 隔离并记 issue；内置条目带 url ⇒ 记 issue 丢弃；② `worker.setDriver`：部分更新 / 空串 / 未知键拒绝 / 非 custom 条目拒绝；`worker.add`(custom) 名称重复拒绝、`{platform:'deepseek', name:'X'}` 仍拒绝；`PATCH_OPS` 含新 op；③ `adapterFor`：内置平台原样返回、custom 派生实例带该 worker 的 url/driver 且**原适配器不被污染**；④ `workforce.pick/nextAvailable` 的 `requireUpload`：显式指定无送件能力者 ⇒ `E_WORKER_UNAVAILABLE`（同步拒绝、不置冷却）；优先级 / 降级跳过该候选；⑤ `collectAnswer` 无信号路径（fake adapter + fake page）：`streamCapture:false` 且无文本 ⇒ 到 `streamFirstByteMs` 抛 `E_NO_RESPONSE` 且 message 含 `dom.diagnose` 诊断串；有文本后正常稳定返回；⑥ `workforce` 健康清除语义：置冷却后 `clearHealth(id)` ⇒ `statusOf(id).status === 'ready'`（`clearAllHealth` 行为不变）——「改驱动参数 ⇒ 清该条目健康记录」的判据底座（触发点 = T1③ 的 `worker.setDriver` 落盘路径，见 service.mjs 行）。
2. **`npm run verify:engine`**（含新件 `test/integration/engine.custom.test.mjs`）读数：
   - R11-a（happy path + 本单锚定）：本地 fixture 站点（textarea + `div.message` 列表；**预置一条「上一单」回合**）以自定义外包工派单 ⇒ `result.error === null`；`delivery.transport === 'dom'`；`answer.md` 文本 == 本单回复且**不含**预置旧回合文本（§3.4 锚定）；日志相位序含 opening → sending → streaming（引擎另发 uploading 相位，属既有行为，与判据不冲突）。
   - R11-b（驱动参数缺失 / 不匹配 ⇒ 定位信息）：fixture 页无输入区 ⇒ `error.code === 'E_SELECTOR_MISSING'` ∧ message 含「opening」与「输入区」∧ 留失败截图；fixture 页回复区类名不在候选链 ⇒ 注入短 `timeouts.streamFirstByteMs` ⇒ `error.code === 'E_NO_RESPONSE'` ∧ message 含回复区诊断（**不静默挂起**：到点必失败并回报）。
   - R11-c（接口生效）：同一「回复区类名不在候选链」页，`worker.driver.replySelector` 指向正确容器 ⇒ 任务成功（证明 F11.3 的补充 / 修正接口真实可用）。
   - R11-d（发送未确认）：fixture 页 Enter 无任何反应 ⇒ `error.code === 'E_SEND_FAILED'` ∧ message 含「sending」与发送方式。
3. **`npm run verify:settings`**（含新件 `test/integration/settings.custom.test.mjs`）读数：AC-R11-1 = 打开新增对话框 ⇒ `[data-platform="custom"]` 存在且可用；填名称 + 链接提交 ⇒ `config.json` 出现该条目且 `url` 逐字一致；`list_workers` 可见（MCP 调用）；`/healthz` 可见。另：名称重复 / URL 非法 ⇒ 不提交 + 报错；`[data-field=custom-hint]` 文本含「实验性」与「主包AI」；`[data-field=custom-limits]` 文本含「送件（附件）」「下载」「新建会话」，且自定义行 `[data-field=toggles-unsupported]` 文本含「深度思考」「联网搜索」（四项不支持能力的界面如实标注，R11 边界 `requirements/overview.md:314`）；驱动参数对话框保存三键 ⇒ `config.json` 三键落盘、重开对话框回读一致。既有断言不回归（平台清单断言按机制设计 4 随动为三项）。
4. **`npm run verify:mcp`**：`tools/list` 恰六件套（零改动）∧ 文档断言含 `docs/guide/agent-onboarding.md`「自定义外包工」节（AC-R11-3 文档侧机器化）。
5. **`npm run dist` + `npm run verify:pack`**：exit 0 ∧ 安装包存在（MZ 头、大小与 mtime 属本批窗口）∧ 段 A–D 4/4（段 C 依赖平台可达，照实读数）∧ 一次性读数：随包 `guide/agent-onboarding.md` 与仓库文档 sha256 相等。
6. **父侧收口回归（唯一一次全套）**：`verify:mcp` / `verify:runtime` / `verify:engine` / `verify:settings` / 批内单元（b1 27 · b2 35 · b3 11 · b5 14 · b6 · **b7**）+ `verify:loop` 真机（**行为面 = 内置平台**，按父侧口径执行）。
7. **人工场景**：AC-R11-3 界面提示（新增表单 / 行内提示 / 驱动对话框）与随包说明第十节（人工可检）；**判据（人工可检 · F11.3 回路）**：先以驱动选择器缺失制造一次 `E_SELECTOR_MISSING`（该条目置冷却）⇒ 在界面保存驱动参数 ⇒ **立即重派**（不需等 10 分钟冷却、不需点托盘「我已处理」）建任务执行；**建议（非判据）**：用一台真实第三方站点（DeepSeek / Kimi 之外，需人工登录）试派一单，读数照实记入 §6——「填完即可派单」的实证，不造假绿。

**边界（不做什么）**：不做自动优化 / 自学习；不预置站点参数；不改内置平台行为与 MCP 契约；自定义外包工本批不支持送件 / 开关 / 下载 / 新建会话。

**风险（如实）**：① 通用启发式误判——回复区候选链可能命中错误容器或漏（站点类名不含候选词）⇒ 缓解 = 取「最新一条」+ 本单锚定（属性标 + 基线文本集 + 回声过滤）+ 界面「实验性」如实标注 + 驱动参数接口；残余风险如实保留。② 站点整区重渲染可能清掉基线属性 ⇒ 基线文本集比对兜底，仍可能误判 ⇒ 失败回执可诊断、可重派。③ 站点改版 ⇒ 回执定位（阶段 + 项）+ 驱动参数修正，无需工具改版。④ 登录态关系：每外包工独立 profile（登录态隔离、只存本机）；登录墙靠词表 + 密码框启发式识别，识别不到时以「输入区未找到」回执（message 内提示「若站点需要登录请先在窗口登录」），不误报成功。⑤ 风控 / 验证码 ⇒ 既有 `E_CAPTCHA_OR_RISK` + needsHuman 路径（词表启发式，命中即交人工）。⑥ 无回复场景的等待上限 = `streamFirstByteMs`（默认 120s）+ 既有瞬时重试（≤2 次）⇒ 硬绑定失败下单次最坏约 6 分钟；回执在每次尝试都可读，主包AI 可据此建议调参或改派（亦可调既有 `limits.timeouts.streamFirstByteMs`）。

### 关键决策记录（含被否方案）

- **D1（平台标识）= 单一 `'custom'` id + 每工人 `url` / `driver`**。理由：一个适配器即可承载任意站点；名册 / 能力派生（快照 `platforms[]`）不需要动态注册。被否：① 每站点一个 platform id（需动态注册 + 快照/能力双源）；② url 塞进 `driver`（语义混淆：driver = 页面机械，url = 站点身份）。
- **D2（透传路径）= 主进程 `toEngineWorker` 载荷 + 适配器派生绑定 `adapterFor(worker)`**。理由：沿用「引擎不读配置」单一事实源口径（`scheduler.md:111`）；`worker` 对象本就是载体。被否：① 引擎读 `config.json`（多写者 / 破坏口径）；② url 作 `task.run` 顶层参数（偏离 worker 对象权责）。
- **D3（收答复通道）= DOM 唯一（`streamCapture:false`），不猜流 URL**。被否：① 泛化 `stream.match`（同源 POST / 任意 POST）——无协议解析器且引入误命中；② 让用户另填流 URL 模式（超出口径：F11.3 只要三个选择器）。
- **D4（发送确认）= 落进 `send()` 的 DOM 信号 + 引擎对 `streamCapture===false` 跳过 `waitForSendConfirm`**。被否：① 保留空等（无流时 30s 后必误报 `E_SEND_FAILED`）；② 新增第三个能力位表达「无流确认方式」（能力面扩键，`streamCapture:false` 已足够表达）。
- **D5（能力位取值）** = 机制设计 2a 表；其中 `upload:false` 的被否方案 = 「`setInputFiles` + 固定等待」——无法证实上传完成，可能静默发出丢掉附件的任务（比拒绝更糟）。
- **D6（附件能力门放派单期）**：显式指定无送件能力的外包工 ⇒ 同步拒绝（不建任务、不冷却）；优先级 / 降级跳过该候选。被否 = 沿用引擎期 `E_WORKER_UNAVAILABLE`（10 分钟冷却 + 硬绑定任务 needs_human——「填完即可派单」被附件误伤，属可避免的坑）。
- **D7（失败码）= 全部复用既有码**（映射见机制设计 3）；不新增码。理由：用户硬约束 + 错误码表封闭 + b2 先例。被否 = 新增 `E_DRIVER_MISMATCH`（改错误码表 = 变更 MCP 契约面）。
- **D8（登录态区分）= `loginFailure` 钩子**：登录墙 ⇒ `E_LOGIN_REQUIRED`（既有）；「输入区未找到」⇒ `E_SELECTOR_MISSING` + 定位。被否 = 一律 `E_LOGIN_REQUIRED`（会把主包AI 引向「去登录」，实际该改选择器）。
- **D9（本单锚定通用形态）= 属性标 + 页内基线文本集 + 回声过滤**（§3.4「存储形式自由」）。被否 = 仅属性标（站点整区重渲染即失效，可能静默交付旧回合——b5 明令禁止的口径，`adapters.md:82`）。
- **D10（界面入口）= 平台清单内并列 `custom` 一行 + 同对话框内表单**。被否：① 独立「自定义」按钮（脱离快照驱动的既有形态）；② 替换平台列表（内置平台的默认名 / 能力语义挂在清单上）。
- **D11（驱动参数写路径）= 新 patch op `worker.setDriver` + 界面对话框**（并保留 `config.json` 手改通道）。被否：① 只留手改（用户不可自理、须退出应用）；② 新 IPC 通道（`fo:patch` 已是唯一写入口）。
- **D12（回复区候选链三项 + `replySelector` 覆盖）**。被否：① 更多候选（噪音大、命中率未必升）；② 仅 `replySelector`（无参数即不可用，违背「填完即可派单」）。
- **D13（文档落点）= `agent-onboarding.md` 第十节 + `agent-brief.md` 一句**。被否 = 新建独立 guide 文件（随包载体分工已定，另立破坏单点）。
- **D14（打包范围）= 一次刷新构建（`dist` + `verify:pack`），版本号不变 0.0.1 同版本覆盖**（b6 先例）。如需升版 = 用户裁定（U3）。

### 边界与禁止范围

1. 不改 MCP 六件套契约（工具名 / 入参 / 返回形状 / 错误码码值与语义 / hint 表）；不新增错误码。
2. 不改内置平台：`src/engine/adapters/deepseek*.mjs` / `kimi*.mjs` 零改动；内置平台行为面（含开关、附件、会话复用）零变化。
3. 不引入自动优化 / 自学习机制；不预置任何第三方站点参数；不做参数推荐。
4. 不改 `toggles` 配置键与默认值；不改 `session` 三键与机制；不改 outbox / 打包链设计。
5. 自定义外包工本批不含：送件、平台开关、下载捕获、新建会话（四项在界面、guide 与边界处如实标注）。
6. 不改需求档 / 其它批次档（需求档的笔 = 主包AI；本段只写设计落点与判据）。
7. 环境口径照做（剥 `ELECTRON_RUN_AS_NODE` / UTF-8 中文断言 / 临时件 `.thincoder/tmp/` / 429 即停）。
8. 打包段 C 依赖平台可达与登录态——读数照实（不得造假绿）；人工实证非判据。

### 上抛项

- **U1（记录面）**：本档 §1 现为模板占位（状态「🔄 进行中（…）」）——本段以档头「来源」行 + 派单事实 + 台账 #30 为据起草（同 b4 / b6 §2 做法）；非阻塞，请父侧知悉（§1 的笔 = 主 agent）。
- **U2（F11.4 错误码口径请核）**：本批结论 = **不新增错误码**，定位信息走既有 `message`（理由见机制设计 3）；需求档因此无需改动。若主包AI 认为需要新码（如 `E_DRIVER_MISMATCH`），属错误码表变更 → 须走需求流程后另批。
- **U3（版本号与打包范围）**：本批按 0.0.1 同版本覆盖刷新（b6 先例）；是否升版本号 / 是否需要单独发版记录 = 用户裁定。
- **U4（需求档两处未提项）**：R11 未提自定义外包工的①附件与②平台开关能力——本批按「不支持」处置并写进界面提示 / guide / 边界（R11 边界「不承诺第三方站点稳定性」同向）；请在需求档斟酌是否补一句（笔在主线）。
- **U5（guide 第十节的落笔人）**：本段已给必含要素（机制设计 5）；`docs/guide/**` 不在本代理写域 ⇒ 请在实施切分时指派落笔人（建议随 T5 与代码同批落地，避免 AC-R11-3 无人承接）。
- **U6（人工实证建议）**：建议收口前用一台真实第三方站点试派一单（需人工登录），读数照实记入 §6——非判据、不阻塞。

### 对派单 / 已知事实的逐条复核（读盘校正；行号按现行文件）

派单五点已知事实全部核实一致：① `PLATFORM_CHOICES` 封闭清单（deepseek / kimi）且 `worker.add` 只收清单内 id —— `patches.mjs:23-26` / `:77-84`；② 快照 `platforms[].toggles` 由适配器注册表派生 —— `platform-capabilities.mjs:7-12` + `service.mjs:92`；③ 引擎按 `worker.platform` 取适配器 —— `task-runner.mjs:139` / `worker-check.mjs:63` / `registry.mjs:17-19`；④ 答复主通道靠 URL 匹配 —— `answer.mjs:14-15` + `stream.match`；⑤ 自定义平台无法预设 URL ⇒ 走 DOM 兜底 + 本单锚定 —— `answer.mjs:76-80` / `:109-125`，锚定约束 `adapters.md:82`。

追加读盘校正（派单未覆盖、本段据此设计）：

- **发送确认依赖流观测**：`waitForSendConfirm` 只看 `capture.requestSeen`（`answer.mjs:56-63`）⇒ 无流平台不改口径会 30s 空等后误报 —— 本批按 D4 处置。
- **适配器形状约束**：`defineAdapter` 强制要求 `stream.match/parse`、`dom.collect`、`extract.filesFromText`（`base.mjs:68-74`）⇒ 无流适配器仍需提供 `stream`（`match:()=>false` + 显式「不应被调用」的 parse）——已在 T3 落点注明。
- **「打开并检查」载荷过窄**：现为 `{id,name,platform}`（`service.mjs:185`）⇒ 自定义平台需带 url/driver，否则检查将以未绑定 url 失败 —— 本批按 T1 ③ 处置。
- **附件 × 无送件能力的现有后果**：引擎 uploading 相位抛 `E_WORKER_UNAVAILABLE`（`task-runner.mjs:183-185`）并使该外包工冷却 10 分钟（`workforce.mjs:51-61` + `execution.mjs:190`）—— 本批按 D6 前移。
- **两处既有断言将因清单增项而红**（**预期随动、非回归**）：`settings.workers-page.test.mjs:81`（平台清单精确断言）· `b2-settings-ui.units.patches.mjs:15-30`（`PATCH_OPS` 八项 + 平台清单两项）—— 已在文件表标注。
- **测试样板可复用**：`engine.test.mjs:203-230` 的 fixture harness（`registerAdapter` + worker 对象）与 `:242-255` 的 `newChat:false` 守卫例即本批新件的直接先例。

### 三链自检

- 台账 **#30** ↔ 本段 T1–T5 ↔ 需求档 **R11**（`docs/requirements/overview.md:296`）与 **AC-R11-1 / R11-2 / R11-3**（`:317-319`）逐条对应；本段不新增需求档条目。
- 设计档落点逐一有主：适配器机制 = `adapters.md` §6（新）；界面 = `settings-app.md` §2 / §8；配置 = `overview.md` §4；引擎接口 = `scheduler.md` §10；契约口径 = `mcp-server.md` §3.2 / §7。
- AC-R11-3 的三处载体（表单提示 / 行内提示 / guide 第十节）全部有落点与判据（2 处界面在 T2、文本在 T5，L 落笔人见 U5）。

### 待实测确认（真机读数项；不阻塞本批机器判据，读数记入 §6）

以下三项依赖真实第三方站点读数，本段只能给设计口径（fixture 层可验、真机不可预验）；**照实记录、不造假绿**：

1. **v1 回复区候选链（`[data-message-author-role]` → `[class*="message" i]` → `[role="listitem"]`）的真实命中率**——命中即得、未命中走「输入区/回复区未匹配」回执 + `replySelector` 修正（D3/D8 口径已容错）。
2. **发送确认的 DOM 信号覆盖度**（输入区清空 ∨ 出现新回合元素）——不覆盖的站点会在 `E_SEND_FAILED` 处如实失败，可由 `sendButtonSelector` 或后续驱动参数扩展修正。
3. **回声过滤（发送文本归一化比对）对用户气泡格式的鲁棒性**（站点加前缀 / markdown 重渲染时可能漏过）——漏过时可能延长等待或误取，属「实验性」残余风险（风险 ①）。

U6 的人工实证建议即这三项的取数动作；若读数与设计口径冲突 ⇒ 按「设计档修正 + 定点修」流程回改（不静默带过）。

### 跨批协调项（b7 ↔ 既收口批次；评审轮 1 · #3）

- **① 归档单元 `docs/batches/b2-settings-ui.units.patches.mjs`（随动，必做）**：改写途径 = **就地基线随动**（该件是开发期随批单元、非记录面；b2 批次档 `docs/batches/b2-settings-ui.md` 的记录面一字不回改）。基线口径 = `PATCH_OPS` 八项 → 九项（+`worker.setDriver`）、`PLATFORM_CHOICES` 两项 → 三项（+`custom:可`）；其 `:15-30` 的 `deepEqual` 精确断言必红 ⇒ 本批**必须随动该件**（不能只靠批内新件）；`:66`（内置平台多余字段仍拒绝）保持通过。
- **② `verify:loop` 不支持 `custom`（边界注记）**：注册 `custom` 后 `test/integration/loop-helpers.mjs:18` 的 `PLATFORM_WORKER_NAMES`（由适配器注册表派生）自动多出一项 ⇒ `FO_LOOP_PLATFORM=custom` 会被接受，但真机环无 url 来源、必然失败。**本批判据不含 `verify:loop` 的 custom 面**（`verify:loop` 行为面 = 内置平台，按父侧口径执行，见「验收对照」6）；不为此改 `loop-helpers.mjs` 名表（其派生口径正确），仅在边界与验收处注记。
- **③ `docs/README.md` 索引随动**：文档地图增 b7 批次档索引行（与 guide 职责一句同批落地）；对应受影响文件表的 `docs/README.md` 行。

## §3 设计评审（评审子代理）

### 轮次 1（评审子代理）

评审对象 = 批次档 b7 §2（T1–T5 · 机制设计 Q1–Q5 · 冻结接口 · 受影响文件与测试面 · 验收对照 · D1–D14 · 边界与 U1–U6）＋需求档 R11 ＋设计档六处增量（adapters §6 / settings-app §2·§8 / scheduler §10·§11 / mcp-server §3.1·§3.2·§7 / overview §4 / browser-engine 零改）；对象状态 = 待评审。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | 需求覆盖 | 🔴 | 界面缺四项不支持能力的如实标注：`docs/requirements/overview.md:314` 要求「均按不支持处置，界面与随包说明如实标注」，设计亦自称「四项在界面、guide 与边界处如实标注」（`docs/batches/b7-custom-workers.md:272`），但界面规格只落了「平台开关」一项（`docs/batches/b7-custom-workers.md:160` 的 `[data-field=toggles-unsupported]`）；送件 / 下载捕获 / 新建会话在 T2 功能点、提示文案（`docs/batches/b7-custom-workers.md:156` 三处文案）与 `npm run verify:settings` 判据（`docs/batches/b7-custom-workers.md:239`）中均无文案、锚点或断言 | 在自定义行（或新增表单）补一条如实标注（锚点可扩 `[data-field=custom-hint]` 文案或另立 `[data-field=custom-limits]`，含「不含送件（附件）/ 下载捕获 / 新建会话」），并在 `npm run verify:settings` 增一条对应文本断言；若判定界面无需标注，则同步把需求边界该句收窄，避免界面口径与需求边界两处并存 |
| 2 | 需求覆盖（F11.3 回路） | 🟡 | 驱动参数不匹配这一「预期首次失败」会撞 10 分钟冷却：`E_SELECTOR_MISSING` 属可降级类（`src/main/scheduler/policy.mjs:18`）⇒ 任务收尾置该外包工冷却（`src/main/scheduler/execution.mjs:190`），此后指定派单被 `pick` 同步拒绝 `E_WORKER_UNAVAILABLE`（`src/main/scheduler/workforce.mjs:185-187`）；设计为附件坑做了派单期前移（D6，`docs/batches/b7-custom-workers.md:256`），但「改完参数 ⇒ 立即重派」这条二次优化回路（`docs/batches/b7-custom-workers.md:169`）未说明如何越过冷却/健康记录 | 明确 `worker.setDriver`（或 url / driver 变更）是否清除该条目健康记录（可复用 `pruneWorkerHealth` 口径），或在 guide 要素④与行内提示写明「改完参数先清冷却（托盘『我已处理』）再重派」，并给出一条判据 |
| 3 | 跨批随动（协调项） | 🟡 | 跨批随动面不全：① affected-files 把已收口批次的归档单元当普通文件改动（`docs/batches/b7-custom-workers.md:219` 的 `docs/batches/b2-settings-ui.units.patches.mjs`），未记该件的改写途径与基线口径；② 注册 `custom` 后 `test/integration/loop-helpers.mjs:18` 的名表自动多出一项 ⇒ `FO_LOOP_PLATFORM=custom` 会被接受，但真机环无 url 来源、必然失败，设计未在「两处既有断言」之外列此项 | 在 §2 增一条跨批协调项，写明归档单元改写的途径与基线方式（或改由批内单元断言新增 op，不动归档件）；并在验收/边界注记 `verify:loop` 不支持 custom（或让名表排除无 url 来源的平台） |
| 4 | 清晰度（单一来源） | 🟡 | 附件能力门的**能力来源**未指定：`docs/design/modules/scheduler.md:113` 只写「平台能力 `upload !== true`」，未指明判定位取自适配器注册表并归一化（现成同源先例 = `src/settings/platform-capabilities.mjs:7`），存在第二份能力表漂移的空间 | 明确该判定取注册表（缺项/未知平台按「不支持送件」），把它记为单一来源，与界面 `platforms[].toggles` 派生同一处 |
| 5 | 文档归属（跨节滞后） | 🟡 | 新增的「带附件跳过 `upload !== true` 候选」是选人规则，却只落在 §10 与 mcp-server §3.2（`docs/design/modules/scheduler.md:113`）；选人算法本体 §4 的伪码仍只有停用 / 冷却 / 不健康三类跳过条件（`docs/design/modules/scheduler.md:54`），读 §4 的人看不到该过滤 | 在 §4 算法伪码内补该过滤条件（或就地加一条指向 §10 的引用），保持选人规则单处可读 |
| 6 | 清晰度（诊断） | 🟡 | 派单期附件拒绝的 message 词形未定（`docs/design/modules/mcp-server.md:77` 只写「⇒ `E_WORKER_UNAVAILABLE`（不建任务、不置冷却）；优先级路径跳过该类外包工」），而该码的 hint 固定为「人工处理后重派」（`docs/design/modules/mcp-server.md:122`）——对「附件不被支持」这一情形会把主包AI 引向无效动作 | 明确该拒绝的 message 词形（含「该外包工平台不支持送件（附件）」与可用方向：去附件或改派），或在文档中记录该码在此情形的 hint 不适配口径 |
| 7 | 受影响文件尺寸标注 | 🟡 | `scheduler.mjs` 行的现况读数已过期且拆分方案是条件式：表内记「297 → ~300 …若越 300：`toEngineWorker` 相关改放下游（不改机制）」（`docs/batches/b7-custom-workers.md:203`），磁盘实况为 298 行 ⇒ 越 300 的概率高，「若越」式方案不足 | 按现况重算该行并定死拆分（或明确零增长改法：`requireUpload` 仅就现有调用行追加参数、不新增行） |
| 8 | 受影响文件尺寸标注 | 🔵 | 其余源件现况读数系统性少 1（实测 vs 表内）：task-runner 293/292 · scheduler 298/297 · execution 288/287 · config-schema 216/215 · workforce 219/218 · patches 263/262 · service 299/298 · workers-page.test 295/294 · b2 units 167/166 · agent-onboarding 145/144 · README 39/38（不影响档位判断，均在 300 以下） | 按盘上实际读数刷新该表（或注明取数时点），避免下一批继续沿用偏移基线 |
| 9 | 数值漂移（设计档） | 🔵 | 设计档增量已落，但 affected-files 表的「现况 → 预期」仍按增量前读数：`docs/batches/b7-custom-workers.md:223` 记 adapters 171 → ~210（现盘 230）· `:224` 记 settings-app 72 → ~95（现盘 78）· `:227` 记 overview 310 → ~325（现盘 313）；纯 .md 免于档位判定，但数字与磁盘不一致 | 按落档后读数刷新这几行，或注明该列 = 增量前基线 |
| 10 | 清晰度（实现细节） | 🔵 | 新件职责清单缺必需方法：`defineAdapter` 的必需函数含 `openSession`（`src/engine/adapters/base.mjs:49`），而 `custom.mjs` 行只列「`stream` 占位」（`docs/batches/b7-custom-workers.md:191`）——`newChat:false` 时不会被调用，但装配期仍会因缺函数抛错 | 在该行职责补 `openSession` 占位（显式「不应被调用」），与 `stream` 占位同口径 |
| 11 | 文档卫生（记录面） | 🔵 | U1 已裁 Fixed，但 §1 仍留模板占位行与「（…）」状态串：`docs/batches/b7-custom-workers.md:6` 的状态行与 `:7` 的 `<§1 模板占位：…>` ——该节已有实际内容，残留会让读者以为未填 | 清掉 §1 的模板占位行与状态串「（…）」 |
| 12 | 引用精度 | 🔵 | 引用行号与所述内容不符：`docs/batches/b7-custom-workers.md:259` 以 `adapters.md:79` 指「b5 明令禁止的口径」（`:288` 同），而「本单回合锚定 / 不静默交付旧答复」在 `docs/design/modules/adapters.md:82`，`:79` 是 DOM 夹带按钮文字的注意事项 | 把该处引用改为 `adapters.md:82` 或改引节名「本单回合锚定」 |

**读盘复核（本评审实测，供核对）**：`src/engine/answer.mjs:76-80` 的 `streamCapture === false` ⇒ 直接进 DOM 分支**已实现**（设计所述为既有行为，非新增）；DOM 分支无信号判定现走 `totalDeadline`（`:112`、`:121`）⇒ 设计所述改按 `streamFirstByteMs` 判 `E_NO_RESPONSE` 确为变更点，与 `answer.mjs:173 → ~200` 行计划一致；`getAdapter` 在引擎侧仅 `src/engine/task-runner.mjs:139` 与 `src/engine/worker-check.mjs:63` 两处 ⇒ `adapterFor(worker)` 改点穷尽；`src/settings/window.mjs:53` 确为 `fo:patch` 单写入口；`src/settings/patches.mjs:77` 的 `checkKeys(op, ['platform'])` 与 `b2-settings-ui.units.service.mjs:72` 的 `snap.ops` 同引用断言（新增 op 不会连带打断该件）；`settings.workers-page.test.mjs:81` / `:272-274`、`b2-settings-ui.units.patches.mjs:15-30` / `:66` 三处断言与设计的「两处随动」口径一致。

**评审面限制（如实）**：本仓无 `AGENTS.md`（工作目录根与评审范围内子目录均无）且无文档地图文件 ⇒ 方法论合规按 4 步流程惯例与各档自述判据评定；文档归属按各档职责行与 `docs/README.md` 的索引表评定（非项目方提供的地图）。

**计数**：🔴 1 · 🟡 6 · 🔵 5 = 12 行。

VERDICT: changes-required

### 轮次 2（评审子代理）

评审对象 = b7 §2 的评审轮 1 十二条处置核对（对象状态 = 待评审）；本轮只核 12 条处置落实（及随批 label 修正 / §1 状态行），不新找问题。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Clarity（#7 处置） | 🟡 | 同一格内自相矛盾：`docs/batches/b7-custom-workers.md:202` 预期列写「298 → ~299」，而同格改动 / 拆分列写「两处调用行追加 `requireUpload`（**零新增行**）」「仅现有调用行追加参数、不新增行 ⇒ 不越 300（不采条件式方案）」；本评审实测该文件盘上读数 = 298（read 总行数）⇒ 零新增行时预期仍应为 298，「~299」无来源 | 把该格预期改为与零增长口径一致（如 `298 → 298`），或写明哪一处会多出这一行；#7 的核心诉求（定死零增长、不越 300）已满足 |
| 2 | 尺寸标注（#8 处置未覆盖全表） | 🔵 | #8 的刷新只落在轮次 1 列举的 11 行上，其余源 / 测试行仍是旧基线（少 1）。抽验（read 总行数 / 表内）：`docs/batches/b7-custom-workers.md:197` answer 174/173 · `:196` opening 42/41 · `:198` worker-check 87/86 · `:193` registry 28/27 · `:194` base 86/85 · `:210` platform-capabilities 13/12 · `:207` renderer-workers 281/280 · `:209` index.html 130/129 · `:212` engine-helpers 168/167 · `:214` settings.test 19/18 · `:216` mcp-face.docs 134/133 · `:217` package.json 33/32 · `:221` agent-brief 106/105 · `:227` browser-engine 92/91。已刷新行经抽验与盘上一致（scheduler.mjs 298 · service 299 · patches 263 · task-runner 293 · execution 288 · config-schema 216 · workforce 219 · workers-page.test 295 · b2 归档单元 167 · README 39 · agent-onboarding 145） | 按盘上读数补齐这些行，或统一注明取数时点；全部 < 300，无档位影响 |
| 3 | 数值漂移（#9 处置） | 🔵 | 五行「已落（现盘 X）」中四行与盘上读数不符：`docs/batches/b7-custom-workers.md:222` adapters 记 230（实测 232）· `:223` settings-app 记 78（实测 79）· `:224` mcp-server 记 154（实测 156）· `:225` scheduler 记 128（实测 133）；`:226` overview 记 314 一致。差值来自本轮定点修（#4 单一来源句、#6 message 词形 / hint 说明）落笔晚于取数时点 | 按当前盘上读数刷新这四行，或在该列注明取数时点（纯 .md，免档位判定） |
| 4 | 文档状态（同段两处口径不一致） | 🟡 | 落点清单未随定点修更新：`docs/batches/b7-custom-workers.md:52` 只列 `scheduler.md`「§10 增量」、`:53` 只列 mcp-server「§3.2 + §7」，`:301` 三链自检同样只认「引擎接口 = `scheduler.md` §10；契约口径 = `mcp-server.md` §3.2 / §7」；而同 §2 的受影响文件行 `:225` 记「§4 / §6 / §10 增量（附件能力门 · 改参数清冷却）」——`scheduler.md:51`/`:57`（§4 伪码两分支）、`scheduler.md:82`（§6 清冷却）、`mcp-server.md:56`（§3.1 自定义条目行）三处实际落点未进清单 | 把落点清单补成实际触摸到的节（scheduler §4·§6·§10、mcp-server §3.1·§3.2·§7），或注明该清单不含定点修追加的落点 |
| 5 | 清晰度（#2 触发面） | 🔵 | 「改参数 ⇒ 清冷却」的触发面写宽：`docs/design/modules/adapters.md:203` 与 `docs/batches/b7-custom-workers.md:205` 均写「（或 url / driver 任何变更）」，但本批补丁面只有 `worker.add`(custom) 与 `worker.setDriver`（`docs/batches/b7-custom-workers.md:108`「新增时不给 driver，统一走 `worker.setDriver`」），无 url 变更写路径；手改 `config.json` 不被监听、需重启（重启后健康表为空）⇒「url 变更」一支不可达 | 把触发面收成 `worker.setDriver` 落盘，或注明 url 变更无写路径（随重启天然清空健康表） |
| 6 | 文档卫生（#11 连带残留） | 🔵 | U1 仍以「现在是坏的」口吻留在 §2 上抛项：`docs/batches/b7-custom-workers.md:278`「本档 §1 现为模板占位（状态「🔄 进行中（…）」）」；而 §1 占位行已删、状态行已收实况（`:6`），同档 `:17` 已裁「U1（§1 占位）= Fixed（我，本条即落）」；残留会被当作未决项重开 | 把该条收成与 §1 一致的口径（标「Fixed（§1 已收实况）」或改写为「本段起草依据」），使上抛清单只留未决项 |

十二条处置核对结论：#1（`[data-field=custom-limits]` + 两侧同文断言，`settings-app.md:29`/`:78` ↔ `b7:155`/`:238`）· #2（`clearHealth` 真实存在于 `workforce.mjs:107`，`scheduler.md:82` + `adapters.md:203` + 单元⑥ + 人工场景判据 `b7:242`）· #3（跨批协调项 `b7:314-318` + 归档件随动口径 + `verify:loop` 注记 `b7:241`/`:317`）· #4（单一来源四档同文：`scheduler.md:65`/`:118`、`adapters.md:192`、`mcp-server.md:77`、`b7:200`）· #5（`scheduler.md:51`/`:57` 两分支 + `:65` 指向 §10）· #6（`mcp-server.md:78` message 词形 + `:79` hint 不适配）· #10（`b7:190` / `adapters.md:184` 补 `openSession` 占位，`base.mjs:46-50` 实测必需）· #11（§1 `:6` 状态行已收实况、占位行已删）· #12（`b7:258` / `:287` 均引 `adapters.md:82`，实测该行为「本单回合锚定」句）——均已落实；随批修正（`label:'自定义'`，`b7:153`；「实验性」仅留在提示文案 / guide 节名）与 §1 状态行核过。残项 = 上表 6 行（#7 读数、#8 未覆盖行、#9 落档后读数、落点清单、url 触发面、U1 残留）。

**评审面限制（如实）**：本仓无 `AGENTS.md`、无文档地图文件 ⇒ 方法论与文档归属按 4 步流程惯例与各档自述判据评定。为核 #7/#8/#9 的读数与随动面，除评审范围内六档外另抽验了受影响文件与断言件的盘上行数 / 行内容（read 读数，口径 = 含末尾空行，与表内自述口径一致）；`requirements/overview.md` 未在评审范围内，其行号引用记 `unverified`。

**计数**：🔴 0 · 🟡 2 · 🔵 4 = 6 行。

VERDICT: pass

## §4 用户批准（主 agent）

### §4 用户批准（2026-10-12）

- **用户原话**：「批准。「自定义（实验性）」只写「自定义」」（2026-10-12 21:40，回应主包AI 的「b7 设计链已备齐、请批准开工」请求）。〔2026-10-12 主包AI 更正：本行曾因 label 字面量批量替换被误伤（用户原话被改动），现恢复原话——记录面的用户原话不得改写。〕
- **批准对象**：本档 **§2**（T1–T5 · 机制设计 Q1–Q5 · 冻结接口 · 受影响文件与测试面 · 验收对照 · D1–D14 · 边界与上抛 U1–U6 · **跨批协调项**）+ **§1 的裁定**（U1–U6）+ **评审轮 1 的 12 条处置**（🔴 1 · 🟡 6 · 🔵 5 全部 Fixed，含主包AI 自修的 #11）+ 需求档 **R11** + 设计档增量（`adapters.md` §6 机制权威 · `settings-app.md` · `scheduler.md` · `mcp-server.md` · `design/overview.md`）。
- **随批修正（用户当场追加）**：平台清单该行的 **label 只写「自定义」**（去掉括号内的「实验性」）；**「实验性」的警示保留在提示文案与随包说明中**（F11.5 的如实标注口径不受影响）。落点 = `PLATFORM_CHOICES` 的 label + 本档与设计档中该字面量（主包AI 直改为纯字面量替换，可回退）。
- **用户可见变化（批准前已逐条告知并获认可）**：① 新增对话框多一个「自定义」选项，填名称 + 链接即可建外包工并派单；② 自定义行内如实标注四项不支持能力 + 「可由你的主包AI 优化」提示 + 行内「驱动参数」按钮；③ 派单失败回执给「阶段 + 哪一项没找到」的定位信息，交给用户的主包AI 做二次优化；④ 改完驱动参数**立即能重派**（不撞 10 分钟冷却）；带附件派给不支持送件的外包工 ⇒ **派单期直接拒绝**并给出可用方向；⑤ 随包说明新增一节（含两条写入通道与「运行中手改 config.json 会被内存态覆盖」的提醒）；⑥ 安装包按 `0.0.1` **同版本覆盖刷新**（重装即可）。
- **实施切分（并行；文件域互不重叠）**：**切分 A = 引擎通用驱动面**（`custom.mjs` / `custom-page.mjs` / `custom-dom.mjs` 三新件 + `registry.mjs` 的 `adapterFor` + `task-runner.mjs` / `worker-check.mjs` 的传递 + 必需函数占位 + 无信号判据 + 引擎侧测试与集成例）；**切分 B = 配置与主进程面**（`config-schema.mjs` 的 `url`/`driver` 归一 + 补丁 op `worker.setDriver` 与 `clearHealth` 清冷却 + 派单期附件能力门（`workforce` / `scheduler` / `execution`）+ `service.mjs` 的 worker 视图构建与拆出 `snapshot-workers.mjs` + 批内单元件）；**切分 C = 设置界面面**（`index.html` / `renderer-workers.js` / 新件 `renderer-custom.js` / 界面测试三件）。〔2026-10-12 更正（主包AI）：`service.mjs`、拆出的 `snapshot-workers.mjs`、补丁 op `worker.setDriver` 归**切分 B**；`platform-capabilities.mjs` 本批零改动；随包说明一节由主包AI 落笔（已落 `docs/guide/agent-onboarding.md` 第十节）。派单口径以切分任务书为准。〕。
- **跨批随动**：`docs/batches/b2-settings-ui.units.patches.mjs`（精确数组断言 8→9 op 与 2→3 平台）由主包AI 承接（见 §2 跨批协调项）。
- **T6 打包刷新**：三切分落地并验收后由父侧执行（`npm run dist` → `npm run verify:pack`；`0.0.1` 同版本覆盖）。
- **成本路线**：代码由 eng-coder 直接实施（设计已是完整实施合同：冻结接口 + 文件计划 + 逐条判据）；**起草 / 检索类继续走免费外包**（随包说明一节、站点情报、后续增量）。

## §5 实施记录（eng-coder）

### §5 实施记录 · 切分 B（配置与主进程面：T1 / T4 主进程侧 / T2 补丁 op 面）（eng-coder，2026-10-12）

**交付摘要**（写面 = 派单 9 件 + 表外 3 项；与切分 A / C 并行、文件域不重叠；`service.mjs` / `snapshot-workers.mjs` / `worker.setDriver` 归属经父侧确认 = 切分 B）

- `src/main/config-schema.mjs`（215→258）：custom 条目 `url`（http/https 绝对地址）与 `driver`（三键字符串，默认空串）归一化；custom 缺/非法 url ⇒ 隔离该条 + 记 issue（既有「非法条目隔离」口径）；非 custom 条目带 url/driver ⇒ 逐键记 issue 并丢弃；driver 非对象/未知键/非字符串 ⇒ 记 issue（不静默丢）。
- `src/main/scheduler/workforce.mjs`（219→246）：`toEngineWorker(w)`（引擎载荷单一来源：内置 `{id,name,platform}`；custom 增 url/driver）；`pick(specified,{requireUpload})` / `nextAvailable(tried,{requireUpload})` 附件能力门；`supportsUpload` = 适配器注册表归一化（`getAdapter(platform)?.capabilities?.upload === true`；缺项/未注册 ⇒ 不支持）；拒绝词形逐字 = `mcp-server.md` §3.2（含「请去掉附件后重派，或改派支持送件的平台」）。
- `src/main/scheduler/scheduler.mjs`（298→298，零新增行）：dispatch 与排队期降级两调用行原地追加 `requireUpload`。
- `src/main/scheduler/execution.mjs`（288→289）：`task.run` 载荷 `worker: toEngineWorker(worker)`；运行期降级候选传 `requireUpload`。
- `src/settings/patches.mjs`（263→276）：`PATCH_OPS` 八项→九项（尾追 `worker.setDriver`）；`PLATFORM_CHOICES` 增 `{id:'custom', label:'自定义', available:true}`；`worker.add` 前置 custom 分支路由；共享小工具经 `kit` 参数注入给 patches-custom（避免循环引用）。
- `src/settings/patches-custom.mjs`（新增 96）：`addCustomWorker`（`{platform:'custom', name, url}`；空名/重名/坏 url/多余字段一律不提交；新增不给 driver）· `setDriver`（部分更新、空串合法、未知键/非 custom/未知 id/超长(>200)/非字符串一律拒绝）· URL 与 driver 校验唯一实现处。
- `src/settings/service.mjs`（299→299）：workers 视图构建移 `snapshot-workers.mjs`（同 snapshot-session 先例）；`worker.check` 载荷 `toEngineWorker`；`worker.setDriver` 落盘后 `clearHealth(op.id)`（`scheduler.md` §6 b7 回路——「改完即重派」；与 pruneWorkerHealth 同机制、目标不同）。
- `src/settings/snapshot-workers.mjs`（新增 30）：workers 快照 = list_workers 词表 + toggles；custom 条目另带 url/driver（内置键形不变）。驱动三键常量自 patches-custom 导入（settings 面单一来源）。
- 批内单元：入口 `docs/batches/b7-custom-workers.units.mjs`（20）+ `.units.config.mjs`（187，①schema / ②补丁）+ `.units.workforce.mjs`（178，④能力门与载荷 / ⑥健康清除与 setDriver 触发点）＝ 14 例。
- 表外（均报备）：`src/settings/preload.cjs` 注释「八操作」→「九操作」（随 op 数同步；1 词）；批内单元原件 363 行超 300 ⇒ 按 b1/b2 批内单元先例拆 3 件（对设计表单件 ~100 的表外新增）。

**验收读数（本机实测；命令 ⇒ 读数）**

1. `node --test docs/batches/b7-custom-workers.units.mjs` ⇒ **14/14 pass**（①②④⑥；fix 前/后各跑一次同绿）。
2. 批次归档单元合计（b1/b2/b3/b4/b5/b6/b7）⇒ **123 例：122 pass / 1 fail**——红 = `docs/batches/b2-settings-ui.units.patches.mjs`「操作清单 = 冻结的八项；平台清单 = deepseek 可 / kimi 可」的 `deepEqual`（actual = 九项含 `worker.setDriver` / 平台三项含 custom）＝ **预期红、跨批协调项由主包AI 承接**（§2「跨批协调项」①；本切分按派单不改该件）；b2 单件复跑 35 例 = 34 pass / 1 fail（同处，无新增红）。
3. `npm run verify:settings`（剥 ELECTRON_RUN_AS_NODE）⇒ **7/7 pass**（含 C 的 b7 界面用例「b7 自定义外包工：入口 / 非法不提交 / 新增双读 / 界面标注 / 驱动参数写读」——驱动参数对话框三键落盘 + 重开回读经本切分的 `worker.setDriver` / 快照面；既有 a–l 断言零回归）。fix 后复跑同 7/7。
4. `npm run verify:engine` ⇒ **19/19 pass**（含 A 的 R11-a..d 与 `adapterFor` 例；既有例零回归）。
5. 逐件行数（read 口径，含末尾空行；全 ≤300）：config-schema 258 · workforce 246 · scheduler 298 · execution 289 · patches 276 · patches-custom 96 · service 299 · snapshot-workers 30 · units 20/187/178。设计表预估「实施后按实际回调」：实况 = service 299（预估 ~293）· config-schema 258（~251）· patches-custom 96（~90）· execution 289（~293）· snapshot-workers 30（~35）；批内单元实为三件（预估单件 ~100）。
6. 补丁 op 与快照形状实况：`PATCH_OPS` = 九项（尾追 `worker.setDriver`；内置分支 `checkKeys(op,['platform'])` 不动 ⇒ `{platform:'deepseek', name:'X'}` 仍拒「多余字段」）；`worker.add`(custom) 落盘条目 = `{id, platform:'custom', name, enabled:true, url, driver:{三键空串}, toggles:{false,false}}`（id 取最小可用 `w-<n>`；url trim）；`worker.setDriver` 部分更新合并 `{...DEFAULT_DRIVER, ...w.driver, ...op.driver}`；快照 `workers[]` custom 条目**只增** `url` / `driver`，内置条目形状逐字不变；`platforms[]` 三项（`custom{thinking:false,search:false}` 经注册表自动派生，platform-capabilities.mjs 零改动）。

**越界声明**：无。未触碰 `src/engine/**`（切分 A 域）· `src/settings/renderer-*` / `index.html`（切分 C 域）· 需求档 / 设计档 / 其它批次档 · `docs/batches/b2-settings-ui.units.patches.mjs`（跨批归档件，主包AI 承接）。MCP 六件套工具名/参数/返回形状与错误码零变化（复用 `E_WORKER_UNAVAILABLE`，不新增码）。

**进程与端口**：全部验证跑完复查无遗留 electron / node 进程（`process` 读数为空）；verify:settings 各例自带退出与 runtime.json 清理（l 例读数「退出即删 runtime.json=true」）。

**审计与代码评审轮次（终态：clean）**

- 内部分歧审计（explore · 只读，1 轮）⇒ **clean**：冻结接口逐条落实（配置两键 / +1 op / 快照形状 / 引擎载荷 / 错误码不新增 / message 词形逐字）· 判据非假绿（deepEqual/正则逐条断言）· 无越界改动 · 注释与实现一致。
- 内部代码评审（advisor · code）：轮 1 = **pass**（🔴0 · 🟡3 · 🔵2）。fix round 1（可修项 2 条落地）：① 快照两来源同步取齐——`getSnapshot` 在首个 await 前捕获 `const workerList = scheduler.listWorkers();` 与 `cfg` 同源（消「await 期间换配置 ⇒ 两侧分取」的陈旧行风险），`snapshot-workers.mjs` 注释改为「须与 listWorkers() 同一同步步取齐；缺项为防御分支」（原「不可达」措辞与代码不符）；② `snapshot-workers.mjs` 的驱动三键常量改 `import { DRIVER_KEYS } from './patches-custom.mjs'`（settings 面单一来源；config-schema 侧因 main↔settings 分层保留独立副本，报备）。其余 3 条（③⑤ 单元层缺件、受影响文件表读数未回调、文档态句面过宽）按评审自身建议走记录面/文档面（见上抛）。fix 后复跑：b7 单元 14/14 · b2 无新增红 · verify:settings 7/7。
- **上抛项**：
  1. 跨批随动 `docs/batches/b2-settings-ui.units.patches.mjs` 未落（主包AI 承接；收口回归要求全套绿 ⇒ 收口前须绿）。
  2. `attach_files`（附件补送）路径仍在本批能力门之外：queued / running(opening·uploading) 可追加文件 ⇒ 引擎 uploading 相位兜底拒（`E_WORKER_UNAVAILABLE`）⇒ `DEGRADABLE` 置 10 分钟冷却（D6 想避免的冷却陷阱；该 message 也不带「去掉附件」引导）。设计口径缺口（本批四处调用点不含补件路径），请父侧裁定：补 attach 期门（scheduler / tools 面）或在本档边界与 guide 如实记录。
  3. 文档态句面过宽：本档 §2 行 205 与 `scheduler.md` §6 写「`worker.setDriver`（或 url / driver 任何变更）」，实现只 setDriver（本批无 url 写路径）——留设计侧修正（评审轮 2 #5 已记）。
  4. 批内单元 ③⑤ 在单元层不落（③ 由 A 的 `test/integration/engine.custom.test.mjs` 覆盖、⑤ 行为侧由同件 R11-b「无回复」集成例覆盖；读数均绿）——本批内单元件头部已如实标注替代口径，供收口判定。

**决策透明表（实施期自主决定）**

| # | 决定 | 理由 | 偏离裁定 |
|---|---|---|---|
| a | patches ↔ patches-custom 的共享小工具由 patches.mjs 经 `kit` 参数注入 | 避免两文件循环 import / 零复制 / 调用点显式可见 | 设计未指定缝；行为面零偏离 |
| b | `supportsUpload` 留在 workforce.mjs 内部（不导出） | 消费面只此一处；能力来源仍是适配器注册表（单一来源） | 无偏离 |
| c | service.mjs 的 setDriver 清冷却用单行 if 内联（无命名 helper） | service.mjs 299 行贴 300 上限，零新增注释行 | 无偏离 |
| d | 批内单元拆 3 件（363 行 > 300） | 「任一文件超 300 ⇒ 按测试对象拆分」惯例（b1/b2 批内单元先例） | 表外新增 2 件，报备 |
| e | preload.cjs 1 词注释同步（八操作→九操作） | 注释与 op 表不符会误导跨面改动 | 表外 1 处，报备 |

## §6 验证与收口（父代理）
