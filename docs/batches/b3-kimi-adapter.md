# 2026-10-10 · b3 Kimi 适配器
> 六段 append-only，一段一作者：§1 讨论（主 agent）· §2 批次任务与设计（eng-designer）· §3 设计评审（评审子代理）· §4 用户批准（主 agent）· §5 实施记录（eng-coder）· §6 验证与收口（父代理）。
> 编制：主 agent · 2026-10-10 · 来源 = 用户 2026-10-09「按顺序完成其他流程」+ 设计档 docs/design/modules/adapters.md §4（新增平台接入清单）+ §2（适配器接口）+ 第0步探针实证（probe/*.mjs 与 probe/out7..out13）。
> 台账 = #18（免费外包 · 归批）。前情 = docs/batches/b2-settings-ui.md §6（已收口 2026-10-10）。
## §1 讨论（主 agent）
**状态行**：🔄 进行中（…）
<§1 模板占位：本批条目 / 关键判据 / 授权口径>

### 裁定（2026-10-10，对设计代理上抛项；主包AI）

1. **U1 `delivery.transport` 取值名（`sse`）用于 Kimi**：**维持沿用**（含义 = 「主通道（流捕获）」——**涵盖非 SSE 的流式协议**，如 Kimi 的 JSON 行流）；**本批不动协议面/枚举**。已同步设计档 `docs/design/modules/outbox.md` 的取值域说明（**主包AI 直改·小改·可回退**）。更名 / 扩枚举（如 `stream`）属协议面变更，另批议。
2. **U2 ①④ 随包文档是否写明 Kimi**：**本批不含**（§2 已显式排除）——平台清单属产品内容口径，**待 b3 适配器落地后在 ①④ 各加一句"已支持平台"**（由主包AI 在 b3 收口时落，避免文档提前承诺未验证的能力）。
3. **U3 需求档 AC-R8-* 未写「无开关能力的平台 ⇒ 跳过子步」**：**采纳**，已补入 `docs/requirements/overview.md`（AC-R8-3 之后一条：`capabilities.toggles = false` ⇒ 跳过开关子步、配置值保留、不报错；AC-R8-1/2/3 对该平台不适用）——**主包AI 直改·小改·可回退**。
- 说明：本批 §2 由设计代理起草，探针补全清单 K1–K9 中 **K1/K3/K4/K5/K7/K8/K9 缺证据** ⇒ 本批第 1 步 = 探针 15–18（真机取证），此后才进适配器实现；**未获用户批准前不实施**。

## §2 批次任务与设计（eng-designer）
**状态行**：设计完成（b3 Kimi 适配器（2026-10-10）：T1–T4 · 探针补全清单九项 · 文件计划 · 四切分（冻结接口）· 验收命令与人工场景 · 决策 D1–D8 · 上抛 U1–U3；待主包AI 核验、用户批准）
<§2 模板占位：本批条目（覆盖） / 设计档落点 / 机制设计 / 受影响文件与测试面 / 验收对照 / 关键决策 / 上抛项>

### 本批（b3）范围与覆盖

覆盖需求条目（三条链同源：需求档 R 条目 ↔ 设计档验收回指 ↔ 本段）：**R3·第二平台落位**（F3.1–F3.6 经适配器在 Kimi 上落地：新会话 → 送件 → 发送 → 收答复 → 取件 → 交付）· **R5·F5.1**（「b1 仅 DeepSeek 可选，Kimi 待 b3」的批次口径兑现——`requirements/overview.md:154`）· **R8·Kimi 侧能力位**（如实声明：有则应用与核对、无则跳过子步——口径见 `adapters.md` §3.8 末行）· 关联回归（AC-R3-3 下载捕获机制 · R4a/R4b 选人不受新平台影响）。

**不在本批**：R6 打包与 R9 换机操作（b4）· ①④ 随包文档的平台提及（**显式排除**，见「边界与禁止范围」）· MCP 工具面扩展（禁止——六件套封闭）· 调度与协议面改动（禁止）· DeepSeek 适配器行为（禁止改；唯一例外 = 共享化等价重构，见 D5）。

**设计档落点**（已评审批准，不改）：

- `docs/design/modules/adapters.md` —— §2 适配器接口（本批实现所依）· §4 新增平台接入清单（本批流程：先跑探针取证 → 填齐接口 → 干跑 `verify:engine` / `verify:loop` → 不改调度与协议面）· §3 DeepSeek 首实现作对照 · §3.8 末行「无此能力的平台 ⇒ 跳过本子步」。
- `docs/design/modules/browser-engine.md`（会话 / profile / CDP 下载落盘）· `docs/design/modules/outbox.md`（取件三层命名与上限；`delivery.transport` 取值域见 :54）· `docs/design/modules/scheduler.md` §10（引擎协议：适配器只被 `task.run` 调用）· `docs/design/overview.md` §3.3 / §13（文件计划与验收体系）。

**前置**：`.browser-profile` 已有 Kimi 登录态（读数 `probe/out9/state.json`：`loggedInGuess=true`、`hasEditor=true`、「我的 Kimi」账号标识在）；真机验收遇未登录 ⇒ 人工登录一次（R9 边界：每平台首次登录一次）。

### 探针补全清单（本批第 1 步；逐条对照 `adapters.md` §4 检查项）

| # | 检查项 | 现状（已有证据坐标） | 缺 | 第 1 步动作与判据 | 产物 |
|---|---|---|---|---|---|
| K1 | 登录 | 未登录也可看到输入框并落字（假阳性史）：`probe/probe7-kimi-minimal.mjs:104-119`、`probe/out7/run.log:25,29`；「登录词消失」作判据不可靠：`probe/out8/run.log:144`（LoginWithSMS `:112` 之后页面仍含「登录」字样）、`:63`（12 分钟未完成登录即失败）；已登录态读数：`probe/out9/state.json`（marks=["我的 Kimi"]、editor=true）；登录动作轨迹（短信 / 二维码请求）：`probe/out8/run.log:105-112`、`probe/out7/run.log:27,30` | **缺**：未登录 ↔ 已登录两态可机器判定的 predicate（不得只依赖「登录」词消失） | 探针15：已登录态取一次读数；再用临时 profileDir 取未登录读数；判据 = 两态各产出一组稳定判别特征（账号标识「我的 Kimi」/ 登录入口「登录以同步」/ 登录弹层元素）并按之给出 `checkLogin` 的 `ready`/`login_required`/`captcha` 分支读数 | `probe/out15/`（run.log + 两态 json） |
| K2 | 输入框 | `div.chat-input-editor`（contenteditable=true，**非 textarea**）：`probe/out7/run.log:15,21`、`probe/out9/state.json:8`、`probe/probe10-kimi-send.mjs:70`、`probe/probe13-kimi-stream.mjs:53`；输入前须清空（Ctrl+A + Backspace）：`probe/probe11-kimi-send-v2.mjs:79-87`、`probe/out11/run.log:4`（清空后 typed 与预期逐字一致） | 无 | （沿用；实施期以探针 11 / 13 形为准） | — |
| K3 | 发送 | 点 `div.send-button-container` 稳定触发 `ChatService/Chat` 请求（4 次真机）：`probe/out10/run.log:9`、`probe/out11/run.log:5`、`probe/out12/run.log:5`、`probe/out13/run.log:3`；空白输入时按钮带 `disabled` 类：`probe/out7/run.log:17`；发送确认以请求出现为准（纪律）：`probe/probe10-kimi-send.mjs:88-97` | **缺**：Enter 兜底能否发送（未登录态的 Enter 只弹登录框：`probe/out7/run.log:28-30`） | 探针16：登录态下用 Enter 发送一次；判据 = 出现 `ChatService/Chat` 请求 ⇒ 兜底可用；否则只保留按钮路径（不留死代码） | `probe/out16/run.log` |
| K4 | 新会话 | 侧栏「新建会话」文案：`probe/out7/run.log:14`、`probe/out9/state.json:7`；每次导航首页 = 空态、每次发送建新会话 id：`probe/out13/chat-resp.txt` 首帧（chat.id + name=「未命名会话」） | **缺**：「新建会话」元素点击验证与「新会话」的机器判据 | 探针16：点「新建会话」后发送；判据 = 发送前页面不含上一单消息文本 ∧ 本次发送后的 chat.id ≠ 上一单 chat.id | `probe/out16/` |
| K5 | 附件 | `input[type="file"]`（accept=""、multiple=true）：`probe/out7/run.log:17,23`、`probe/out7/discovery7.json` | **缺**：`setInputFiles` 后界面反馈与请求内附件引用（上传未实测） | 探针16：传一个 .txt → 等界面出现文件名 → 发送；判据 = 界面出现文件名 ∧ `ChatService/Chat` 请求体含该文件名 / 附件引用 | `probe/out16/` |
| K6 | 答复流 URL 与协议 | URL = `POST https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat`：`probe/probe11-kimi-send-v2.mjs:53`、`probe/out12/run.log:5`、`probe/out13/run.log:3`；协议 = 分帧 JSON（1 字节标志 + 4 字节大端长度 + JSON 载荷；帧 = heartbeat / `op:set` / `op:append`），正文在 `block.text.content`（先 set 快照、后 append）、思考在 `block.think.content`、结束 = `{"done":{}}` 帧（另有助手消息 `MESSAGE_STATUS_COMPLETED`）；全量样本 `probe/out13/chat-resp.txt`（19160 字节；respLen=18686、eventOffset 至 131）；宽松正则会误命中 `ListKimiPlus` 等：`probe/out10/run.log:4-6` | 无（样本可作 fixture；实施期以样本锁定逐字基线） | 编入 T4 fixture；`match` 精确到 `/kimi.gateway.chat.v1.ChatService/Chat` 结尾（含查询串剥离） | `probe/out13/chat-resp.txt` |
| K7 | 下载 | **无任何 Kimi 读数** | **缺**：Kimi 是否给代码块「下载」按钮（含真实下载事件与 CDP 落盘可行性） | 探针18：要一条含代码块的答复 → 在助手回合范围内找「下载」文案按钮；判据 = 找到 ⇒ 点它并复验下载事件 + CDP 落盘（机制对照 K13；Edge downloads-hub 崩溃坑见 `probe/out14/run.log:8-10`）；找不到 ⇒ `capabilities.downloadCapture=false`（取件退化 = 层②③，判据见「验收」⑤） | `probe/out18/`（run.log + dom-answer.html） |
| K8 | 开关能力位（R8 落点；§4 清单外·本批必需） | 请求载荷含 `options.thinking` / `enablePlugin` / `reasoningEffort` / `model` 与 `tools:[TOOL_TYPE_SEARCH,…]`：`probe/out13/chat-resp.txt` 的 `chat.lastRequest` 帧、`probe/out12/result.json` respHead；页面控件未取证 | **缺**：页面上是否存在用户可设置、状态可读的开关（对应「深度思考 / 联网搜索」语义）及其元素与读法 | 探针17：枚举输入区 / 工具栏可点控件（文案 + aria 快照）→ 逐个切换并观察**下一次**请求载荷对应键是否随动；判据 = 随动 ⇒ `toggles=true` + 给出 `requestPayload.toggles` 读键映射（沿用接口两键名 `thinking_enabled` / `search_enabled`）；不随动或无此类控件 ⇒ `toggles=false`（如实，不猜） | `probe/out17/`（run.log + controls.json） |
| K9 | DOM 结构（`dom.collect`；§4 清单外·本批必需） | 用户消息类名 `user-content__text` / `chat-content-item-user` / `segment-user`：`probe/out10/run.log:12`、`probe/out11/run.log:8`、`probe/probe12-kimi-send-v3.mjs:98`（排除纪律）；助手正文块 `div.paragraph`：`probe/out13/run.log:6`、`probe/out13/result.json` domClass；候选容器 `chat-content-list` / `chat-content-container`：`probe/out12/run.log:8` | **缺**：多块答复（段落 + 代码块）的助手回合容器结构与拼接范围 | 探针18：要一条多块答复；判据 = 记录助手回合容器类名与正文块集合，采集文本 ⊇ 全部正文块 ∧ 不含用户消息与界面按钮文案（复制 / 分享） | `probe/out18/dom-answer.html` |

### 条目表（T1–T4）

每条 = 模块目标 / 功能点 / 边界 / 验收判据 / 依赖；判据的机器实现见「验收命令与人工场景」；AC 编号 = 需求档验收条目。

**T1 探针补全取证（第 1 步；探针 15–18）**
- 目标：把 §4 清单与 R8 落点中缺的 Kimi 证据补齐，产出可直接编入适配器与测试的读数。
- 功能点：探针15（登录两态）/ 探针16（新会话 + Enter 兜底 + 附件）/ 探针17（开关能力位与载荷随动）/ 探针18（多块答复 + 下载探测 + DOM 结构）；产物落 `probe/out15..18/`；结论与读数写批次档 §5。
- 边界：不改产品代码；不代人工登录（首次登录由人完成）；未读数不得写成结论（写「待探针确认 + 判据」）。
- 验收：清单九项逐条有读数（K1、K3、K4、K5、K7、K8、K9 为本步产出；K2、K6 已足）；能力位判定带证据坐标。
- 依赖：`.browser-profile` 登录态（已有）或人工在场；环境坑口径照做（剥 `ELECTRON_RUN_AS_NODE`；`FREE_OUTSOURCE_PROFILE_DIR` 复用 profile；临时产物 `.thincoder/tmp/`）。
- 需求对应：R3 的实现前置（`adapters.md` §4 第 1 条）。

**T2 Kimi 适配器实现（引擎面）**
- 目标：任务派给 Kimi 外包工后，工具在 Kimi 上完成「新会话 → 送件 → 发送 → 收答复 → 取件」，交付与 DeepSeek 同构（outbox 规则一致）。
- 功能点：`kimi.mjs`（接口实现 / capabilities 如实 / extract 引共享）/ `kimi-page.mjs`（选择器台账 / checkLogin / openSession / send / upload（条件）/ applyToggles（条件））/ `kimi-stream.mjs`（match + parse 纯函数）/ `kimi-dom.mjs`（dom.collect）；registry 注册。能力位初值：`streamCapture=true`（K6 已证）；`newChat` / `upload` / `toggles` / `downloadCapture` / `requestPayloadCapture` 按 T1 读数落定（不足即 `false`，D7）。
- 边界：不改调度与协议面；不改 DeepSeek 行为；不引入新依赖；不造平台未提供的开关。
- 验收：AC-R3-1 / AC-R3-2 / AC-R3-4（Kimi 侧读数，经 `verify:loop:kimi`）；AC-R3-3（机制回归，沿用 DeepSeek fixture 用例）；AC-R8-1 / AC-R8-3（仅当 `toggles=true`；`false` ⇒ 走「跳过子步」路径、记 N/A 读数）；单元 = `stream.parse` 以 fixture 逐字一致。
- 依赖：T1（能力位与选择器）；D1 / D2 / D4。
- 需求对应：R3·F3.1–F3.6（第二平台实现）· R5·F5.1（可登记）· R8（Kimi 侧能力位）。

**T3 跨面接线与验收通道**
- 目标：Kimi 在设置面可选、在验收面可跑；两处既有跨面牵连落地。
- 功能点：`src/settings/patches.mjs` 的 `PLATFORM_CHOICES` kimi 行 ⇒ `available:true`、去 `note`（`patches.mjs:22`；保留即「待支持」语义残留）；`src/settings/index.html:102` 注释随动；`test/integration/loop.test.mjs` 以 `FO_LOOP_PLATFORM`（默认 `deepseek`）参数化 + 按适配器 `capabilities` 条件断言；`test/integration/settings.workers-page.test.mjs:78-81` 断言随动（Kimi 可选、不灰显、无「待支持」）；`package.json` 加 `verify:loop:kimi`。
- 边界：不动 `config-schema`（无平台白名单，见显式排除）；不新开 Kimi 专用 loop 文件（集成套件不按变更增设、任务不重复）；不设 env 时 DeepSeek 行逐字同今日。
- 验收：`npm run verify:loop`（默认 DeepSeek）行为不变；`npm run verify:loop:kimi` 走 Kimi 真机（判据见下节）；`npm run verify:settings` 全绿；Kimi 经 `worker.add` 落盘（设置面单测）。
- 依赖：T2（loop 需真实适配器注册）；T1（能力位定条件断言）。
- 需求对应：R5·F5.1 · AC-R3-* 的命令面 · AC-R8-*（条件）。

**T4 批内单元测试与 fixture**
- 目标：Kimi 的纯逻辑（流解析 / 命中判定 / 读键）可回归，基线可追溯。
- 功能点：`docs/batches/b3-kimi-adapter.units.mjs`（入口即测试，~220 行；超 300 行按对象拆）；`docs/batches/b3-kimi-adapter.fixtures/chat-resp.txt`（`probe/out13/chat-resp.txt` 的逐字节副本——探针产物不入版本库：`.gitignore:10`）+ `docs/batches/b3-kimi-adapter.fixtures/answer-stream.expected.md`（期望正文；实施期以 fixture 实算锁定）。
- 边界：不动集成套件（除 T3 两处随动）；不新增依赖；fixture 必须落批次目录（不引用 gitignore 的探针产物）。
- 验收：`node --test docs/batches/b3-kimi-adapter.units.mjs` 全绿；判据 = `stream.parse(fixture).text` 与期望正文逐字一致 ∧ `finished=true` ∧ 思考区非空且不混入正文 ∧ `match` 不命中 `ListKimiPlus` / `ListMessages` / `MarkChatAsRead` 类 URL ∧ `filesFromText`（共享实现）复跑 b1 基线两例一致。
- 依赖：T2（解析器形）；D1。
- 需求对应：验收体系单元行（`docs/design/overview.md` §13）。

### 机制设计（Kimi 适配器；落地所依）

- **打开与登录**：`ensureOnPlatform` + `waitForLoginState`（`src/engine/opening.mjs:8-41`，平台无关）→ `checkLogin` 判 `ready` / `login_required` / `captcha`；未登录 ⇒ `E_LOGIN_REQUIRED`（needs_human，窗口留人工），风控 ⇒ `E_CAPTCHA_OR_RISK`（启发式沿用 `adapters.md` §3.6 口径，Kimi 无专项证据）。
- **新会话**（`capabilities.newChat` 非 false 时）：`openSession` 每单独立——按 K4 结论取「点新建会话」或「导航首页」，判据见 K4。
- **发送**：清空输入框 → `insertText` → 落地校验（读 `innerText` 前 N 字特征串，contenteditable 无 `inputValue`）→ 点 `div.send-button-container`；**发送确认 = 观测到 `ChatService/Chat` 请求**（引擎侧 `waitForSendConfirm`，`src/engine/answer.mjs:56-63`，不依赖平台回执）。
- **收答复（主通道）**：响应体全量捕获 → `stream.parse`（D1）：帧内 JSON 对象扫描；`op:set` 赋（快照）/ `op:append` 追（只认 `block.text.content` 与 `block.think.content` 两个内容路径，其余帧（heartbeat / chat / message / 状态）不落正文）；`finished` = `done` 帧或助手消息 `message.status = MESSAGE_STATUS_COMPLETED`；无结束标记 ⇒ `E_STREAM_PARSE`（可能被截断，同 DeepSeek 口径）。
- **DOM 兜底**：未捕获流时引擎触发（2s × 3 次稳定，`src/engine/answer.mjs:109-125`）；`dom.collect` 只在**最后一个助手回合**内取正文块拼接，排除用户消息（类名含 `user`）与界面按钮文案（K9 判据）。
- **取件**：层① 下载 = 仅在 `downloadCapture=true` 且有 `downloads.trigger` 时触发（`src/engine/artifacts.mjs:181`；CDP 自动落盘机制不动）；层② 代码块提取 = 共享 `text-files.mjs`；层③ 全文 `answer.md`。
- **开关（R8）**：`capabilities.toggles=false` ⇒ 引擎跳过应用与复核（`src/engine/task-runner.mjs:160,188`）、配置值保留不报错、`manifest.toggles.payload=null`；`true` ⇒ `applyToggles` + `requestPayload.toggles` 两键映射（K8 定映射，键名沿用接口）。

### 文件计划（新增 / 改动 / 测试面）

行数 = 现状 → 预计（实施后按实际回调；任一文件超 300 行 ⇒ 按职责拆）。

| 文件 | 现状 → 预计 | 职责 / 改动 |
|---|---|---|
| `src/engine/adapters/kimi.mjs` | 新增 ~170 行 | 接口实现：`id='kimi'` / `platformName='Kimi'` / `url='https://www.kimi.com/'` / `selectors` / `capabilities`（如实，T1 落定）/ `checkLogin` / `openSession` / `send` / `uploadFiles`（条件）/ `applyToggles`（条件）/ `requestPayload`（条件）/ `stream` / `dom` / `extract`（引共享）/ `downloads`（条件） |
| `src/engine/adapters/kimi-page.mjs` | 新增 ~250 行 | 页面机械（对照 `deepseek-page.mjs` 切分）：选择器台账（文案优先，类名易变）/ 登录判定 / 新会话 / 清空 + 输入 + 落地校验 + 发送 / 附件 / 开关（条件） |
| `src/engine/adapters/kimi-stream.mjs` | 新增 ~150 行 | `match`（精确到 `/kimi.gateway.chat.v1.ChatService/Chat` 结尾）+ `parse`（JSON 帧扫描，纯函数，返回形同 `deepseek-stream.mjs`） |
| `src/engine/adapters/kimi-dom.mjs` | 新增 ~70 行 | `dom.collect`（最后助手回合正文块拼接；不含用户消息与按钮文案） |
| `src/engine/adapters/text-files.mjs` | 新增 ~25 行 | 代码块 → 文件清单纯函数（规则权威 `outbox.md` §4 层②；两平台共用，D5） |
| `src/engine/adapters/deepseek.mjs` | 151 → ~145 行 | `extract.filesFromText` 改引共享实现（**行为不变**；b1 单元 `docs/batches/b1-core-loop.units.engine.mjs:117-160` + `verify:engine` 守门） |
| `src/engine/adapters/registry.mjs` | 26 → 28 行 | `import kimi` + `registerAdapter(kimi)` |
| `src/settings/patches.mjs` | 226 行（1 行内容改动） | `PLATFORM_CHOICES` kimi 行：`available:true`、去 `note`（:22）；`worker.add` 的 available 校验（:81）自动放行，无需改 |
| `src/settings/index.html` | 117 行（注释一行） | :102 注释随动（「Kimi 灰显『待支持』」描述失效） |
| `test/integration/loop.test.mjs` | 279 → ~330 行 | `FO_LOOP_PLATFORM` 参数化（默认 `deepseek`，行为不变）+ 按适配器 `capabilities` 条件断言（toggles / downloadCapture）+ 每平台外包工名表 |
| `test/integration/settings.workers-page.test.mjs` | 236 行（断言块随动） | :78-81：Kimi `disabled=false`、无「待支持」；补 Kimi 经 `worker.add` 落盘一例 |
| `package.json` | 25 → 26 行 | scripts 加 `verify:loop:kimi`（Windows cmd 形：`set FO_LOOP_PLATFORM=kimi&&node --test test/integration/loop.test.mjs`；等价手工口径见「验收」） |
| `probe/probe15..18-kimi-*.mjs` | 新增 4 个（各 ~120–200 行） | 探针补全（K1 / K3–K5 / K8 / K7+K9）；产物 `probe/out15..18/`（gitignore，不入版本库） |
| `docs/batches/b3-kimi-adapter.units.mjs` + `docs/batches/b3-kimi-adapter.fixtures/{chat-resp.txt, answer-stream.expected.md}` | 新增 | 批内单元与 fixture（探针产物不入版本库 ⇒ fixture 落批次目录，逐字节复制） |
| **不改（显式排除）** | — | `src/main/config-schema.mjs`（`workers[].platform` 无白名单：:135-138 只要求非空字符串 ⇒ 加平台无需改；不引入白名单——会与设置面双源）· `docs/guide/agent-onboarding.md` / `agent-brief.md`（不含平台清单：`agent-brief.md:10`「首发 DeepSeek」为平台事实陈述、`agent-onboarding.md:66` 为外包工名样例；外包工名单是动态的走 `list_workers`；平台清单权威 = 设置面 `PLATFORM_CHOICES`）· `src/settings/service.mjs`（只透出 `PLATFORM_CHOICES`，:87；无需改）· `src/settings/renderer-workers.js`（按 `available`/`note` 通用渲染，:217-218；无需改）· `src/main/scheduler/**` 与 `src/main/mcp/**`（协议面 / 工具面封闭）· `src/engine/{answer,artifacts,opening,task-runner,browser}.mjs`（引擎面不动） |

### 实施切分（四份；文件域互不重叠；冻结接口）

| 切分 | 文件域 | 内容 | 依赖 |
|---|---|---|---|
| A 探针补全 | `probe/probe15..18-kimi-*.mjs` · `probe/out15..18/**` | T1 | 先跑（B 的输入） |
| B 适配器主体 | `src/engine/adapters/kimi*.mjs` · `text-files.mjs` · `deepseek.mjs`（一行级）· `registry.mjs` | T2 + D5 等价重构 | 依赖 A 的读数（能力位 / 选择器 / 容器） |
| C 跨面接线与验收通道 | `src/settings/patches.mjs` · `src/settings/index.html` · `test/integration/loop.test.mjs` · `test/integration/settings.workers-page.test.mjs` · `package.json` | T3 | 编辑可与 B 并行；验收运行依赖 B |
| D 批内单元与 fixture | `docs/batches/b3-kimi-adapter.units.mjs` · `docs/batches/b3-kimi-adapter.fixtures/**` | T4 | 依赖 B 的解析器形 |

**冻结接口（本批实现不得偏离）**：

- 适配器接口 = `docs/design/modules/adapters.md` §2（键集与返回形；不得扩字段）；`capabilities` 键集 = `src/engine/adapters/base.mjs:21-29`（未声明 = 不具备）。
- `stream.parse` 返回形 `{text, thinking, finished, events, skipped}`（消费方 `src/engine/answer.mjs:85-92`）；`checkLogin` 返回 `ready | login_required | captcha`（`src/engine/opening.mjs:25-41`）。
- `manifest.delivery.transport` 取值域 `sse | dom`（`docs/design/modules/outbox.md:54`；`sse` 含义 = 主通道（流捕获），口径与上抛见 D4 / U1）。
- 环境变量名 `FO_LOOP_PLATFORM`；`PLATFORM_CHOICES` 行形 `{id, label, available, note?}`（`src/settings/patches.mjs:20-23`）。
- 错误码表封闭（不新增码；Kimi 侧异常沿用 `E_LOGIN_REQUIRED` / `E_CAPTCHA_OR_RISK` / `E_SELECTOR_MISSING` / `E_SEND_FAILED` / `E_TIMEOUT` / `E_NO_RESPONSE` / `E_STREAM_PARSE`）。

### 验收命令与人工场景

**机器命令（逐条给读数）**

1. `node --test docs/batches/b3-kimi-adapter.units.mjs` —— 判据 = T4 各条（流解析逐字一致 / `finished=true` / 思考不混正文 / `match` 不误命中 / 共享提取复跑 b1 基线）。
2. `npm run verify:engine` —— 回归：浏览器 + 下载捕获 + 开关失败场景（DeepSeek fixture 面不动；不依赖平台登录）。
3. `npm run verify:loop:kimi`（等价手工口径：cmd `set FO_LOOP_PLATFORM=kimi&& npm run verify:loop`）—— Kimi 真机端到端，判据 = ① ≤180s 内 `state=done`（任务自身 timings，`loop.test.mjs:202-206` 口径）；② `manifest.delivery.transport = "sse"`（含义 = 主通道（流捕获）；读数 `dom` ⇒ 流捕获失败，判失败）；③ `answer.md` 非空；④ `files/` ≥1 且**至少一个 `source='code_block'`**（取件层②保底——无下载能力时的退化判据）；⑤ `capabilities.downloadCapture=false` ⇒ 不得出现 `source='download'`；⑥ toggles：`capabilities.toggles=true` ⇒ 载荷核对 `configured` ↔ `payload` 一致（Kimi 行配置值取 `{thinking:true, search:false}` 保分辨力，口径同 `loop.test.mjs:27`）；`false` ⇒ `manifest.toggles.payload = null` 且**跳过**载荷断言（合法路径 = 跳过子步，`adapters.md` §3.8 末行；读数入 §5）。
4. `npm run verify:loop`（不带 env）—— 判据 = 与今日逐字同（DeepSeek 行为不变）。
5. `npm run verify:settings` —— 回归：平台清单放行后设置面全绿（含 :78-81 随动断言 + Kimi 落盘一例）。

**人工场景**

- **M1 首次登录**（若 profile 无 Kimi 登录态）：设置界面「打开并检查」→ 窗口开到 Kimi → 人工登录一次 → 再检查 ⇒ 徽标 `ready` + 最近检查时间更新（话术：登录态只存本机、不跨机）。
- **M2 新增 Kimi 外包工**：设置界面新增 → Kimi 可选（不灰显、无「待支持」）→ 落盘 `workers` 出现 `platform='kimi'` → `list_workers` / `/healthz` 可见（AC-R5-1 复测）。
- **M3 真机派单**：给 Kimi 派一条含 `# file:` 代码块的任务（复用 loop 任务文本形）⇒ outbox 出现 `state=done` 任务目录、`answer.md` 为 Kimi 答复原文、`files/` 至少一个代码块产出文件。
- **M4（条件）开关**：探针判定 `toggles=true` ⇒ 界面改开关值 → 派单 → `manifest.toggles` 载荷随动（AC-R8-2 Kimi 侧）；`false` ⇒ 记录「Kimi 无此能力位：AC-R8-1/2/3 对 Kimi 不适用（合法路径 = 跳过子步）」。
- **M5（条件）下载**：探针判定有下载按钮 ⇒ 真机任务里点下载并复核 CDP 落盘（对照 K13）；无 ⇒ 全部产出文件 `source='code_block'`（退化路径成立）。

**环境坑（照做）**：起应用 / 引擎必剥 `ELECTRON_RUN_AS_NODE`（`test/integration/loop.test.mjs:55-58` 既有做法）；本会话 `process.execPath` 可能是 `ThinCoder.exe` ⇒ 探针 / 测试用 `require('electron')` 或显式 node 路径；探针与测试复用 `.browser-profile`（`FREE_OUTSOURCE_PROFILE_DIR`）；临时产物一律 `.thincoder/tmp/`。

### 关键决策记录（含被否方案）

- **D1 答复流解析 = 帧内 JSON 对象扫描（不依赖长度前缀）**。理由：引擎拿到的响应体已经过 UTF-8 解码（`response.text()`），样本里分帧前缀已现损耗（`probe/out13/chat-resp.txt` 19160 字节 vs respLen=18686 读数、文件内可见替换字符）⇒ 依赖前缀 = 脆。被否：严格按 Connect 分帧（1 字节标志 + 4 字节大端长度）解码（样本已不保证前缀完整）；复用 SSE 解析器（协议不同：无 `data:` 行，帧为长度分立）。
- **D2 发送 = 点 `div.send-button-container`**（4 次真机证据），发送前 Ctrl+A + Backspace 清空；落地校验读 `innerText`（contenteditable 无 `inputValue`）。Enter 兜底按 K3 定：可用则保留为兜底，不可用则删（不留死路径）。
- **D3 取件退化（Kimi 无下载能力时）**：层②（代码块抽取）承担 `files/` 产出；`downloadCapture=false` ⇒ 引擎自动跳过下载触发（`src/engine/artifacts.mjs:181`）；判据见「验收」④⑤。被否：为 Kimi 造下载按钮 / 走 `saveAs`（K13 已否）。
- **D4 `delivery.transport` 口径**：本批沿用 `sse` 值表示「主通道（流捕获）」（零协议面改动）；与 Kimi 实际协议名不符属命名问题 ⇒ 上抛 U1（不自改枚举、不改需求档措辞）。
- **D5 代码块提取共享化**：新增 `text-files.mjs`，DeepSeek 与 Kimi 同引（deepseek.mjs 行为不变，b1 单元 + `verify:engine` 守门）。被否：Kimi 复制一份（规则双源，`outbox.md` §4 才是权威）；Kimi 从 `deepseek.mjs` import（平台耦合）。
- **D6 loop 参数化走环境变量 `FO_LOOP_PLATFORM` + 按适配器 `capabilities` 条件断言**。被否：新开 `loop-kimi.test.mjs`（集成套件不按变更增设、任务重复）；把 Kimi 断言写死在主测试（双源 + 默认行为漂移风险）。
- **D7 能力位如实原则**：探针不足以支撑的能力位一律 `false` + 明确判据（不许猜）；`false` 的对应用例走「跳过子步 / 不适用」并记录读数。
- **D8 DOM 兜底验证强度 = 探针读数**（探针18 记录采集输出与界面全文对照）；本批不为它增设集成用例（与 b1 对 DeepSeek DOM 通道的验证强度同等：均为探针核验；如需更强回归另批固化本地 fixture 用例）。

### 边界与禁止范围

- **不改调度与协议面**：`task.run` 入参 / 回报（`scheduler.md` §10）· manifest 字段与终态机 · 错误码表 · 阶段超时 / 重试 / 降级策略 —— 一律不动。
- **不改 DeepSeek 适配器行为**（唯一例外 = D5 等价重构；由 b1 单元与 `verify:engine` 守门）。
- **不扩 MCP 工具面**（六件套封闭；设置面 / 界面不得新增工具）。
- **不改需求档与设计档**（发现设计缺口一律上抛——见「未决 / 上抛」）。
- **显式排除**（已定位，不做改动）：`src/main/config-schema.mjs`（无平台白名单，:135-138）；①④ 随包文档（不含平台清单，坐标见「文件计划」排除行）。
- 不引入新依赖；不改 `delivery.transport` 枚举（U1）。
- 探针结论不得写「可能 / 大概」；未读数 ⇒ 列「待探针确认」并给判据。

### 未决 / 上抛

- **U1 `delivery.transport` 取值名（`sse`）用于 Kimi（JSON 行流，非 SSE）的口径**：本批按 D4 沿用（含义 = 主通道（流捕获））。若要更名 / 扩枚举（如 `stream`），触及协议面与需求档 AC-R3-2 措辞（`requirements/overview.md:101`）⇒ 请主 agent / 用户裁定；裁定前本批按 D4 执行（不阻塞）。
- **U2 ①④ 随包文档是否提及 Kimi**：本批显式排除（理由：不含平台清单、名单动态化；平台清单权威 = 设置面）。若产品口径要求随包文档写明「支持的第二平台」⇒ 属 R7 内容分工（需求面），主 agent 的笔；可随 b4 打包批一并处理。
- **U3 需求档 R8 的 Kimi 侧口径备注**：设计档已有「无此能力的平台 ⇒ 跳过子步」（`adapters.md` §3.8 末行），需求档 AC-R8-* 未写该情形。若 T1 判定 Kimi `toggles=false`，建议在需求档 R8 边界或验收补一行口径（主 agent 的笔；不阻塞本批——本批按设计档路径执行并把读数记入 §5）。

## §3 设计评审（评审子代理）
## §4 用户批准（主 agent）
## §5 实施记录（eng-coder）
## §6 验证与收口（父代理）
