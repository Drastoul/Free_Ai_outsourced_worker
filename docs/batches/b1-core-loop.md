# 2026-10-08 · 免费外包·核心闭环
> 六段 append-only，一段一作者：§1 讨论（主 agent）· §2 批次任务与设计（eng-designer）· §3 设计评审（评审子代理）· §4 用户批准（主 agent）· §5 实施记录（eng-coder）· §6 验证与收口（父代理）。
> 编制：主 agent · 2026-10-08 · 来源 = 用户需求文件《免费外包工具制作需求.txt》（2026-10-08）+ 第0步探针实测（free-outsource/probe/probe*.mjs 与 probe/out*/run.log）。
> 台账 = #1–#6（免费外包 · 归批）。前情 = 无（独立批）。
## §1 讨论（主 agent）
**状态行**：🔄 进行中（…）
<§1 模板占位：本批条目 / 关键判据 / 授权口径>

### 讨论记录（主包AI ↔ 用户）

**来源**：用户需求文件《免费外包工具制作需求.txt》（2026-10-08）。

**用户原话要点（六条）**
1. 工具暂名「免费外包」，可在 ThinCoder 或其他 AI 工具使用时工作；
2. 打开该工具的 AI-Agent 称作「主包AI」；
3. 核心功能：主包AI 发布任务 →「免费外包」在本地机器打开并使用网页版 DeepSeek 或其他 AI 平台 → 获取在网页版执行后返回的文件；
4. 「免费外包」打开一个简洁界面，用于设置主包AI 调用自己时所用的网页（按优先级使用），也可按主包AI 要求调用界面中已被用户输入的网页；
5. 简洁设置界面具备：新增外包工 / 删除外包工 / 调整优先顺序 / 外包工自定义名；
6. 制作完成后可打包为 Windows 下的 .exe 安装包，可分享给其他 PC 用户安装使用。

**已确认决策（2026-10-08 用户回复「ok」）**

| # | 决策点 | 结论 |
|---|---|---|
| A | 代码目录 | `D:\免费外包\free-outsource\`（ASCII 路径，规避中文路径工具链风险） |
| B | 首批平台 | DeepSeek + Kimi（架构做成可插拔适配器，后续加平台＝加模块） |
| C | 浏览器 | 工具自带 Chromium 为主，设置中可选「用系统 Edge」（本次探针实测走 Edge） |
| D | 运行形态 | 托盘常驻 + 独立设置窗口 |
| E | 打包 | electron-builder → NSIS `.exe` 安装包（便携版可选，暂不做） |
| F | 流程 | 走工程模式：需求档 → 设计档 → 设计评审 → 用户批准 → eng-coder 分批实施 |
| G | 交付目录 | 默认 `D:\免费外包\outbox\`（可在设置中修改） |
| H | 能力范围 | 除「取回文件」外，也支持「给网页 AI 上传附件」（主包AI 送文件给外包工） |

**第 0 步探针实测结论**（脚本 `probe/probe1..3*.mjs`，日志 `probe/out*/run.log`；全部为真机实测，非推断）

- 环境实测：Node v24.18.0、npm 11.16.0；npm 国内镜像 `registry.npmmirror.com` 可达（PONG 208ms）；本机有 Edge（无 Chrome），Playwright 以 `channel=msedge` **零浏览器下载**驱动成功；ThinCoder 桌面版确认支持 MCP —— 设置界面有独立 MCP 段（新增 / 编辑 / 重连 / Tools / Test 探活），配置落 `config.json` 的 `mcp.servers` 数组，另支持项目根 `.mcp.json`（`mcpServers` 对象形）第二源。
- 探针 1（登录 / 发消息 / 取回复）：短信登录一次后登录态持久（复用浏览器配置目录免登）；输入框 = `textarea`（placeholder「给 DeepSeek 发送消息」）；发送 = 聚焦输入 + insertText + Enter；答复约 8 秒取回，文本「探针测试成功」。
- 探针 2（送件 / 下载 / 新会话）：✅ 页面存在 `input[type=file]`（accept 覆盖 .py/.txt/.pdf/图片等），`setInputFiles` 上传后界面显示文件名；✅ 浏览器下载拦截落盘机制通过（本地 blob 下载实测捕获并落盘）；✅ 「开启新对话」按钮可点（`div._7b40dad`）；⚠️ **DOM 抓取会漏内容** —— 只取到最后一个 markdown 块。
- 探针 3（取件主通道定稿）：✅ 从 `chat/completion` 的 **SSE 流**还原答复全文（分片 append 结构），且带 `quasi_status / status = FINISHED` **明确结束标记**（不必靠"文本稳定"猜答完）；✅ 一条任务抽出两个真实文件（`greet.py`、`README.md`）；DOM 文本夹带界面按钮文字（复制/下载），确认只可作兜底。
- 结论：**取答复以"读网络流"为主通道、DOM 为兜底；取文件三层兜底 = ① 浏览器下载拦截 ② 回复内代码块/文件提取 ③ 回复全文落盘。**
- 风险（须在设计档中体现处置）：平台改版与风控（适配器隔离 + 人工接管通道）；登录态过期；网页端额度/频率限制；自动化与平台服务条款的冲突由用户自行判断。

**批次划分建议**
- 本批（b1）＝最小可用闭环：MCP 服务面 + 浏览器引擎 + DeepSeek 适配器 + 任务调度 + 取件交付。
- 后续：b2 设置界面（外包工增删改序 / 自定义名）；b3 Kimi 等平台适配器；b4 打包 .exe 与换机安装验收。

**待办节点**：设计档成稿 → 顾问设计评审 → 用户批准 → eng-coder 实施 b1。

### 追加需求与裁定（2026-10-08，用户追加）

- **需求7（台账 #7）**：「免费外包」须内置一个说明，以方便各类 AI-Agent 工具理解、并与操作者协作后接入使用。
- **路由裁定（主包AI）**：
  - 交付形态进本批设计档（须含：随包接入说明文档 / 应用内「接入指引」页 / 可复制的 MCP 配置片段 / 给 AI-Agent 读的说明文件 —— 四者内容分工，同一内容只详述一处）。
  - 实施分批：**随包接入说明文档随 b1 交付**（低成本，且是"可被接入"的前提）；**应用内「接入指引」页并入 b2 界面批**。
- **依据**：用户 2026-10-08 消息原话「"免费外包"需内置一个说明，以方便各类Ai-Agent工具理解并和操作者协作后接入使用」。

### 追加需求与裁定（2026-10-09，用户追加；**批准暂缓**）

- **用户原话**：「需要集浅验证第四部分的内容，网页版的深度思考/联网搜索开关点击应该在设置的时候就一并确定」。
- **解读与裁定（主包AI）**：
  1. **批准暂缓**：用户未批准 b1 开工；先补验证，再重走「设计更新 → 评审 → 批准」。
  2. **需求8（台账 #8）**：外包工的「深度思考」「联网搜索」两个开关，**在设置外包工时一并确定**（按外包工保存），派单时自动应用——不留给每次临时决定。
  3. **第四部分（未验证项）提前验证**：优先验「深度思考/联网搜索开关的读取与设置」「真实平台的下载取件路径」；Kimi 平台与打包链按后续批次就近验证（Kimi 需人工登录一次）。
- **路由初判（待设计更新后经评审确认）**：开关的「配置与应用」随 b1（适配器与调度要支持）；开关的「设置界面呈现」随 b2。
- **影响**：本批设计需更新（适配器能力、配置 schema、调度应用点、验收条目），更新后按流程重新评审，**不得夹带进原批准**。

### 追加验证记录（2026-10-09，主包AI 实测；对应「第四部分未验证项」提前验证）

- **探针 4–6**（脚本 `probe/probe4-deepseek-toggles.mjs`、`probe5-deepseek-toggle-click.mjs`、`probe6-deepseek-download-cdp.mjs`；日志 `probe/out4..6/run.log`）：
  1. **开关可读可设（已验证）**：DeepSeek 的「深度思考 / 智能搜索」= `div.ds-toggle-button`（`aria-checked` 与 `--selected` 类表状态）；`locator.click()` 一击生效（实测：深度思考 false→true、智能搜索 true→false）。
  2. **权威核对通道（已验证）**：`chat/completion` 请求载荷携带 `thinking_enabled` / `search_enabled`，与界面状态一致（实测 `thinking=true search=false`）。
  3. **真实平台下载取件（已验证）**：改用 CDP `Browser.setDownloadBehavior`（自动落盘）后，点代码块「下载」→ 文件 `deepseek_python_20261008_8233a3.py` **落盘成功**，内容与代码块一致；浏览器全程存活（`browserConnected=true`）。
  4. **副产物（需设计处置）**：点下载会打开一个 `edge://downloads-hub/` 新页面（页面数 1→2）；探针 4/5 的 `saveAs` 失败与「页面关闭」观感即源于此 ⇒ 设计改为 CDP 落盘。
  5. **残留未验（诚实标注）**：深度思考开启后的「思考文本」分片未在流内观测到（开关生效无疑；对交付无影响）；Kimi 等第二平台未探（需人工登录一次，b3）；打包链冒烟验证进行中（临时目录 `D:\免费外包\.thincoder\tmp\pkg-smoke`，含中文路径压测）。

### 打包链冒烟结果（2026-10-09，主包AI 实测）

- **环境**：临时目录 `D:\免费外包\.thincoder\tmp\pkg-smoke`（**中文路径压测**，零产品面影响）；最小 Electron 应用 + electron-builder 26.15.3。
- **结果（全绿）**：产出 `dist\PkgSmoke Setup 0.0.1.exe` —— **106.3 MB NSIS 安装包**；Electron 44.7.0 运行时与 NSIS 工具链（nsis-3.0.4.1 / 7zip / nsis-resources）均**经国内镜像下载成功**；中文路径全程无碍。
- **踩到并解决的坑（b4 必读）**：`electron-builder` 拒绝 `electron` 出现在 `dependencies`（必须 `devDependencies`）——首次冒烟即因此失败，改 `npm i -D` 后通过。
- **体积口径**：最小应用 106 MB；产品含随包 Chromium 后预计 ~200 MB+（与决策 C 的取舍一致）。
- 日志：`C:\Users\Administrator\.thincoder\tool-results\1791502165914-bash-14.log`；产物保留在临时目录（可随时清理）。

### 追加需求与裁定（2026-10-09，用户提出；主包AI 落需求档）

- **用户原话（要点）**：①「安装在其他 PC 后，本机 MCP 端点能适配新 PC 机器并通过主包 Agent 修改」②「设置页面是否需一个可以明确网页端下载的文件所存放的地址」。
- **裁定与落位**：
  - **R9（台账 #9）**：换机自适配与端点可改——端口默认 17873、占用顺延并在界面/日志明示实际端口；`runtime.json` + 界面显示 + 一键复制**两种形态**接入片段（`.mcp.json` / `config.json`）；端口可由配置固定（用户或主包AI 均可改）；接入片段可导出为文件；说明文档增「换机后首次接入」「端点变化后更新宿主配置」两节（与 R7 同源）；换机自适配（无 Node、浏览器随包、交付目录回落、每平台首次登录引导）。验收 AC-R9-1..4（b1/b2/b4 分落）。
  - **R5 澄清**：新增 F5.7「交付目录设置」（显示实际路径 / 可修改 / 一键打开；网页端下载文件与答复文本都落于该目录下每单子目录内）与 AC-R5-6（改目录生效；目录不可写 ⇒ 明确报错 + 回落，不静默丢产物）。
- **诚实标注（换机场景的硬约束）**：登录态不跨机迁移，**每台新 PC 需各自登录一次各平台**；端口顺延会造成宿主侧旧地址失效，修复路径由 R9 给出（这是设计缺口，已补，不是已知限制）。

### Kimi 最小验证（2026-10-09，进行中/未完成；诚实标注）

- **目标**：只验「这套架构能否接第二个平台」，完整适配器仍留 b3。
- **首轮（探针 7）结果：假阳性，已修正**——Kimi 未登录也能看到输入框（`div.chat-input-editor`，contenteditable）并让文本落地，但**发送被拦（弹出登录二维码）**；探针误把"自己打进去的那句话"判成答复。教训已固化进探针 8：① 必须等登录完成再发；② 判"答复到达"须排除输入框与编辑器祖先。
- **次轮（探针 8）：12 分钟内未完成人工登录 ⇒ 未跑完**（浏览器已关闭）。**Kimi 的登录与端到端取回复仍属未验证**；待用户在场时重跑（探针脚本已就绪：`probe/probe8-kimi-minimal-v2.mjs`，页面内挂状态提示条）。
- **已采集的平台情报（供 b3 用）**：输入 = `div.chat-input-editor`（contenteditable）；发送钮 = `div.send-button-container`（空态带 `disabled` 类）；页面存在 `input[type=file]`（`multiple`，accept 为空 ⇒ 待实测具体类型）；聊天接口族 = `https://www.kimi.com/apiv2/*`（含 `chat.v1.*` 服务面，POST）。

### 裁定（2026-10-09，对设计代理上抛项；主包AI）

1. **需求档 §6 未列 AC-R5-6** → **已补**（`docs/requirements/overview.md` §6：b1 行为 / b2 界面）。
2. **下载暂存区口径** → **维持现状**：`<userData>/downloads-staging/<workerId>/` 是**机器中间落点**（引擎初始化时固定，避免每任务重建 CDP 行为）；交付契约只保证**最终落点唯一**（`<outboxDir>/<taskId>/files/`）。**不把暂存区搬进交付目录**——理由：会污染执行中的任务目录、异常清理困难，且对"文件在哪"这件事没有增益（最终落点已唯一并在 manifest 记录）。
3. **AC-R9-4 的「与界面实际显示一致」随 b2 复测** → **口径确认，无需改动**（界面呈现本就是 b2 范围）。

### Kimi 最小验证 · 最终结果（2026-10-09，**通过**；本条取代上方「未完成」记录）

- **结论**：官网 `www.kimi.com` 的「登录 → 发送 → 取回复」全链路**跑通**，架构可接第二平台（完整适配器仍留 b3）。
- **登录**：人工登录一次后，登录态持久化在本工具浏览器配置（`.browser-profile`）内，后续免登（探针 9 只读复核：无「登录」线索、侧栏出现用户信息）。
- **发送**：编辑器 = `div.chat-input-editor`（contenteditable）；发送钮 = `div.send-button-container`（空态带 `disabled` 类）；**发送前必须清空编辑器**（否则残留文本会被追加）；发送成功判据 = 出现 `POST https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat`。
- **取回复（数据通道）**：响应为 **JSON 行流**（`{"op":"set|append", "mask":..., ...}`，`{"heartbeat":{}}` 心跳）——实测 18686 字节、`set` 13 次 / `append` 117 次；内容路径掩码 = `message` / `block.text` / `block.text.content` / `block.think` / `block.think.content` / `message.status` ⇒ **正文按 `append` 增量落在 `block.text.content`**（与 DeepSeek 的"读网络流"同策略，b3 可直接复用）。
- **取回复（DOM 兜底）**：助手正文渲染为 `div.paragraph`（实测命中「Kimi 探针测试成功。」）。
- **开关对应关系（R8 的跨平台落点，供 b3）**：请求选项里带 `thinking` / `enablePlugin` / `reasoningEffort` / `model`（如 `k2d6-chat`），tools 含 `TOOL_TYPE_SEARCH` / `TOOL_TYPE_CRON_JOB` ⇒ 外包工级「深度思考 / 联网搜索」在 Kimi 侧可映射到 `thinking` / 联网搜索 tool 开关。
- **探针踩坑（已固化进脚本纪律，供 b1 适配器实现参考）**：① 未登录也能打字 ⇒ 判"答复到达"必须与"自己发的内容"区分（`role: user` / 类名含 `user` 一律排除）；② 整页 `document.body.innerText` 会把大页面主线程拖住 ⇒ 只用点选式查询 + 每步限时；③ 发送判据以网络请求为准，不靠 DOM 猜。
- 脚本与产物：`probe/probe9-kimi-login-check.mjs`、`probe10..13-kimi-*.mjs`、`probe/out12|out13/`（含全量流 `out13/chat-resp.txt`）。

## §2 批次任务与设计（eng-designer）
**状态行**：设计完成（轮次 3 评审修复（P1–P10）已落盘（2026-10-09）；待主包AI 核验、用户复审）
<§2 模板占位：本批条目（覆盖） / 设计档落点 / 机制设计 / 受影响文件与测试面 / 验收对照 / 关键决策 / 上抛项>

### 本批（b1）范围：最小可用闭环

覆盖需求条目（三条链同源：需求档 R 条目 ↔ 设计档验收回指 ↔ 本段）：**R1**（MCP 接入）、**R2**（「主包AI」称谓约定）、**R3**（核心闭环：派单 → 网页版执行 → 取回文件）、**R4a**（默认按优先级）、**R4b**（按主包AI 要求指定调用）、**R7①④**（随包接入说明文档 + 给 AI-Agent 的说明文件）。

**不在本批**：R5（设置界面，b2）、R6（打包 .exe，b4）、R7②③（应用内接入指引页与配置片段生成，b2）、Kimi 适配器（b3）。

**R7 归属（主包AI 裁定，照录并落位）**：随包接入说明文档随 b1 交付（准入前提、成本低）；应用内「接入指引」页并入 b2 界面批。设计据此：R7①④ 文本随 b1，R7②③ 界面呈现随 b2。

### 设计档落点

- 需求档：`docs/requirements/overview.md`（R1–R7，五要素 + 可证伪验收）
- 架构设计：`docs/design/overview.md`（进程与 MCP 接入 / 配置 / 错误与人工接管 / 安全 / 接入说明四载体 / 打包 / 关键决策 K1–K12 / b1 文件计划 / 验收体系）
- 模块设计：`docs/design/modules/mcp-server.md`、`scheduler.md`、`adapters.md`、`browser-engine.md`、`outbox.md`、`settings-app.md`（b2）
- 文档地图：`docs/README.md`

### 机制设计摘要（详设见设计档，本段不展开）

- **进程**：Electron 托盘常驻（单实例）；引擎子进程跑 Playwright（`ELECTRON_RUN_AS_NODE`，崩溃可重启）；主进程承载 MCP 服务面与调度。
- **接入**：MCP 双传输（Streamable HTTP `/mcp` + 旧式 SSE `/sse`）+ `/healthz`；端口默认 17873，冲突顺延且提示可见；`runtime.json` 公布实际地址；b1 不做 stdio shim（触发条件 = 自举验收证明 URL 型不通，见 K9）。
- **工具面六件套**：`list_workers` / `dispatch_task` / `get_task` / `fetch_result` / `cancel_task` / `attach_files`；异步任务模型 + `waitSeconds` 长轮询（≤600s）。
- **调度**：严格优先级 + 忙则排队；不可用才降级（≤3 个外包工）；瞬时错误同外包工重试（≤2）；指定 = 硬绑定不降级。
- **DeepSeek**：收答复以网络流为主（协议与 `probe/out3/raw-sse.txt` 逐条对照）、DOM 兜底；取件三层（下载拦截 / 代码块提取 / 全文落盘）；送件 `setInputFiles`（决策 H）。
- **交付**：`<outbox>/<taskId>/`（manifest.json + answer.md + files/ + inbox/ + screenshots/）；manifest 单一写者、最后写。

### 受影响文件与测试面

见 `docs/design/overview.md`「b1 落地文件计划」：新建 `src/main/**`、`src/engine/**`、`src/shared/**`、`test/integration/**`、`docs/guide/agent-onboarding.md`、`docs/guide/agent-brief.md`；改 `package.json`（依赖与 scripts）。

### 实施顺序（每步可验证）

1. 应用骨架与配置（单实例 / 托盘 / config 原子写 / runtime.json / 日志 / 引擎子进程拉起）→ 判据：托盘在、runtime.json 生成、`GET /healthz` 可达。
2. MCP 服务面（双传输 + 六件套注册 + 错误码 + 参数校验；业务先接桩）→ 判据：`npm run verify:mcp` 通过。
3. 浏览器引擎（profile / 启动 / 新会话 / 下载捕获）→ 判据：`npm run verify:engine` 通过。
4. DeepSeek 适配器（发送 / 收流 / DOM 兜底 / 三层取件 / 送件）→ 判据：单元（raw-sse fixture、提取对照）+ 真机小任务。
5. 调度器（状态机 / 队列 / 选人 / 重试降级 / 超时 / 取消）→ 判据：单元 + 真机排队与降级复现。
6. 交付与取回（outbox / manifest / fetch_result 接通）→ 判据：`npm run verify:loop` 通过。
7. R7①④ 两份说明文本 → 判据：AC-R7-1（文档结构 + JSON 样例可解析）、AC-R7-3（与 tools/list 对照）。
8. 自举验收（写 `.mcp.json` → 宿主探活 → 主包AI 真实派单 → outbox 判据）。

### 验收命令（除 `verify:runtime` 自控应用启停外，其余命令在应用已启动前提下执行；中文断言一律用 UTF-8 感知方式，不用 findstr）

- `npm run verify:mcp`：initialize + tools/list 六件套 + `/healthz` 200 + 错误路径（空 task ⇒ `E_BAD_ARGS`；未知 worker ⇒ `E_WORKER_UNKNOWN`）。
- `npm run verify:engine`：本地 blob 页 → 下载拦截落盘 + 命名净化。
- `npm run verify:loop`：真实派单 ≤180s 内 done；`<outbox>/<taskId>/`：manifest.json（state=done）、answer.md 非空、files/ ≥1，`delivery.transport = "sse"`。
- `npm run verify:runtime`：占住 17873 ⇒ `runtime.json.port ≠ 17873`、日志含同一实际端口、按该端口探活成功；改期望端口 + 重启 ⇒ 以新端口服务、`runtime.json` 随动（AC-R9-1 / AC-R9-2 b1 侧；**自控应用启停**）。
- `node --test docs/batches/b1-core-loop.units.mjs`：单元全绿。
- 人工场景：带附件派单（AC-R3-4）、未登录降级（AC-R4a-2）、指定未登记名被拒（AC-R4b-2）、断网/登出落 needs_human（AC-R3-5）。
- 自举（b1 收口）：项目根写 `.mcp.json` → ThinCoder 探活成功且 Tools 出现六工具（AC-R1-1）→ 主包AI 派单 → outbox 新目录且 state=done；URL 型若不通 ⇒ 触发 K9 补 stdio shim。

### 验收对照（需求验收条目 → 本批落地判据）

| 验收条目 | 本批判据 |
|---|---|
| AC-R1-1 | 自举：宿主探活成功、Tools 出现六工具 |
| AC-R1-2 / AC-R2-2 | `npm run verify:mcp` |
| AC-R1-3 | 非 127.0.0.1 访问被拒（绑定校验） |
| AC-R3-1 / AC-R3-2 | `npm run verify:loop`（含 transport=sse） |
| AC-R3-3 | `npm run verify:engine` |
| AC-R3-4 | 带附件派单（人工场景） |
| AC-R3-5 | 断网 / 登出复现 → needs_human |
| AC-R4a-1..3 | 选人单元 + 排队 / 降级复现 |
| AC-R4b-1..3 | 指定命中 / 拒绝 / 硬绑定复现 |
| AC-R7-1 / AC-R7-3 | 文档结构断言 + tools/list 对照 |
| AC-R7-2 | b1 收口执行一次（陌生 AI 只读①完成接入） |
| AC-R7-4 | 人工可检（四载体分工，设计档「接入说明的形态与内容」） |

### 关键决策（本批相关，全文见设计档「关键决策记录」）

K1 引擎独立子进程 · K2 MCP 双传输 · K3 端口固定优先 + 顺延可见 · K4 流为主 DOM 兜底 · K5 每外包工并发 1 / 全局 2 · K6 严格优先级 + 忙排队 · K7 指定硬绑定不降级 · K9 b1 无 stdio shim · K10 outbox 非 D 盘回落用户目录。

### 上抛项（请主包AI / 用户裁定）

1. 需求档由 eng-designer 按派单起草（默认笔权在主包AI）——请核验采纳。
2. R7④（给 AI-Agent 的说明文件）交付批次按 ① 沿用 b1；如需改判请裁定。
3. 台账 #3 标题含「按优先级」——用户原话把优先级归第 4 条（本档拆为 R4a / R4b）；请定夺台账标题是否微调。
4. 「Chromium 随包」使安装包达 ~200MB 级（K8 / R6 边界的既定取舍）；b4 前如需改判（改首启下载）请提前说。
5. `.mcp.json` / `config.json` 的真实字段以宿主当前版本为准；自举验收若发现 URL 型不通，按 K9 触发 shim（不改业务层）。

### 上抛项回填与验收对照补行（2026-10-08，轮次 1 评审修复）

**轮次 1 设计修复**：§3 评审 14 条发现已逐条处置（13 条改动 + 第 14 条说明性无需动作）；改动落在设计档（`docs/design/overview.md` 与 `docs/design/modules/` 各档），需求档未改（笔权在主包AI）。

**上抛项裁定回填（主包AI 裁定）**

1. 需求档笔权：归主包AI——已采纳（本轮修复不改需求档；主包AI 已直改术语表「宿主」条目与 AC-R2-1 检索范围）。
2. R7④（给 AI-Agent 的说明文件）交付批次：沿用 b1（与 ① 同批）。
3. 台账 #3 标题：已改（已办）。
4. Chromium 随包 ~200MB：采纳（决策 C 的既定取舍）。
5. `.mcp.json` / `config.json` 字段：以宿主当前版本为准；自举验收若 URL 型不通 ⇒ 按 K9 触发条件不变（补 stdio shim，不改业务层）。

**验收对照表补行（与 `docs/design/overview.md` §13 同源）**

| 验收条目 | 本批判据 |
|---|---|
| AC-R2-1 | 称谓检索：检索面 `docs/**` + `src/**` + 界面词表（UI 文案常量），唯一例外 = 术语表「宿主」；b1 收口按口径执行（UTF-8 感知检索 + 命中项复核） |
| AC-R7-1 / AC-R7-3 | `npm run verify:mcp` 文档断言：① `agent-onboarding.md` 四节结构 + R9 两节 +「本工具端点配置」节；④ `agent-brief.md` 五要素自述；内嵌 JSON 片段可解析 + 字段形状（`mcpServers` 对象形 + `url`；`config.json` 的 `mcp.servers` 数组形）+ 工具清单与 `tools/list` 对照（细化原表同行判据；轮次 3 按 `docs/design/overview.md` §13 对象写实） |

### 追加需求 R8 落位（2026-10-09；实测证据 = 探针 4–6，见 §1「追加验证记录」）

**本批范围补行**：**R8**（外包工级「深度思考 / 联网搜索」开关）——配置与应用随 b1、界面随 b2；验收 AC-R8-1 / AC-R8-3 随 b1（命令），AC-R8-2 应用侧随 b1、界面侧随 b2。

**设计档落点**：

- `docs/design/modules/adapters.md`：§2 接口（`capabilities.toggles` / `applyToggles`）、§3.1 元素台账（开关 / 下载按钮）、§3.2 执行流水、§3.5 取件层①（CDP 自动落盘）、§3.8「外包工开关的应用与核对」（新增）、§5 验收判据。
- `docs/design/modules/browser-engine.md`：§3 启动参数（CDP 下载行为）、§4「下载捕获（CDP 自动落盘）」、§8 验收判据。
- `docs/design/modules/scheduler.md`：§2 phase 注、§6 开关失败归口、§7 opening 行、§11 验收判据。
- `docs/design/overview.md`：§3.2 数据流、§3.3 文件计划、§4 配置 schema（`workers[].toggles`）、§5 错误与人工接管、§10 K13、§12 b2 规划、§13 验收体系。
- `docs/design/modules/outbox.md`：manifest 增 `toggles` 字段、§4 取件层①口径。
- `docs/design/modules/settings-app.md`：§2 开关项（b2）、§8 AC-R8-2 界面侧。
- `docs/design/modules/mcp-server.md`：错误码表 `E_SELECTOR_MISSING` 触发面扩为含开关应用失败（不新增错误码——开关失败单点归口）。

**实施顺序调整**：第 3 步（浏览器引擎）含 CDP 下载行为设置与 `edge://downloads-hub/` 页面处置；第 4 步（DeepSeek 适配器）并入开关应用与核对（F8.2–F8.4）与 CDP 自动落盘（取件层①）；第 5 步（调度器）含 opening 开关子步与 `E_SELECTOR_MISSING` 归口。

**验收对照补行（与 `docs/design/overview.md` §13 同源）**

| 验收条目 | 本批判据 |
|---|---|
| AC-R8-1 | `npm run verify:loop`：`manifest.toggles` 载荷核对（`configured` vs `thinking_enabled` / `search_enabled`） |
| AC-R8-2 | 操作：改配置后复测派单载荷随动；界面侧随 b2（`modules/settings-app.md` §8） |
| AC-R8-3 | `npm run verify:engine` 开关失败场景（本地 fixture 页无开关元素 ⇒ 判 `E_SELECTOR_MISSING`、不发送）+ 调度单元（b1 单外包工 ⇒ needs_human） |

**关键决策**：新增 K13——下载落盘 = CDP 自动落盘（`Browser.setDownloadBehavior`）；被否 = `saveAs` 主路径（探针 5 实测失败，探针 6 定论）。

**上抛项状态（2026-10-09）**：探针 4–6 结论已入 §1（追加验证记录）；R8 已入需求档（主包AI 直写）；原 5 条裁定现状：① 需求档笔权归主包AI——已采纳；② R7④ 沿用 b1——已定；③ 台账 #3 标题——已办；④ Chromium 随包 ~200MB——采纳；⑤ 宿主字段以版本为准、K9 触发条件不变。

**口径说明（请主包AI 核验）**：F3 的「目录 = 任务 outbox 的下载暂存区」落为「下载暂存区 `<userData>/downloads-staging/<workerId>/`（任务收尾时归属移入 `<outbox>/<taskId>/files/`）」——CDP 下载行为在引擎 / 上下文初始化时设置（按外包工固定目录），任务级归属仍走取件规则；如与原意不符请指出。

### 追加需求 R9 与 F5.7 落位（2026-10-09；来源 = 用户 2026-10-09 提出，主包AI 已落需求档）

**来源**：R9（换机自适配与端点可改）与 R5·F5.7（交付目录设置）——用户原话要点与裁定见 §1「追加需求与裁定（2026-10-09，用户提出）」；需求档 `docs/requirements/overview.md` R9 节（F9.1–F9.6 / AC-R9-1..4）与 R5·F5.7（AC-R5-6）。

**本批范围补行**：

- **R9**——端点与发布面随 b1（F9.1 顺延与明示 / F9.2 的 `runtime.json` 发布面与两形态静态样例 / F9.3 期望端口可配置）；生成与一键复制（F9.2 界面侧）、一键导出（F9.6）随 b2（与「接入指引」页同批）；说明文档两节随 b1（F9.5）；换机自适配口径随 b1、界面呈现随 b2（F9.4）；AC-R9-3 随 b4。
- **R5·F5.7**（交付目录设置）——行为口径随 b1（实际路径解析 / 落点唯一性 / 不可用回落）；界面项（显示实际路径 / 可修改 / 一键打开）随 b2。

**设计档落点**：

- `docs/design/overview.md`：§1（批次范围）、§2.3（期望 / 实际端口、`runtime.json` 字段清单、两形态接入片段）、§3.3（`verify:runtime` 测试件与行数回调）、§4（`mcp.port` / `mcp.host` / `outboxDir` 口径）、§7（① 节结构含 R9 两节 / ③ 导出）、§11（R9 边界）、§12（b2 / b4 规划）、§13（R9 验收落点）。
- `docs/design/modules/mcp-server.md`：§2（`runtime.json` 发布面指针 + 与 `/healthz.port` 一致）、§3.4（`outboxDir` = 该单实际目录）、§7（`verify:runtime` 一致性断言 + 文档断言含 R9 两节）。
- `docs/design/modules/settings-app.md`：§2（登录引导）、§3（实际地址 + 一键复制两形态 + 一键导出）、§5（交付目录：实际路径 / 修改 / 打开 / 报错与回落）、§8（AC-R5-6 / AC-R9 界面侧判据）。
- `docs/design/modules/outbox.md`：§2（实际路径解析与回落 / 落点唯一性）、§4（下载暂存区 = 机器中间落点、归属移入 `files/`）、§8（AC-R5-6 运行期侧判据）。
- `docs/design/modules/browser-engine.md`：§5（登录态不跨机、每平台首登一次）。

**实施顺序调整**：第 1 步判据补「端口占用 ⇒ 顺延，`runtime.json` / 日志示实际端口」（`npm run verify:runtime` 可先行）；第 6 步并入交付目录实际路径解析与回落（F5.7）；第 7 步说明文本含 R9 两节。

**验收对照补行（与 `docs/design/overview.md` §13 同源）**

| 验收条目 | 本批判据 |
|---|---|
| AC-R9-1 | `npm run verify:runtime` 场景 1：占住 17873 ⇒ `runtime.json.port ≠ 17873`、日志含同一实际端口、按该端口探活成功（界面显示一致随 b2） |
| AC-R9-2 | `verify:runtime` 场景 2：改配置期望端口 + 重启 ⇒ 以新端口服务、`runtime.json` 随动；b1 收口操作：按实际端口更新宿主配置 → 探活 + 派单成功（与自举验收合并执行）；界面片段来源随 b2 |
| AC-R9-3 | 归 b4（换机操作；与 AC-R6-2 同批执行） |
| AC-R9-4 | 文档断言（`npm run verify:mcp` 内）：`docs/guide/*.md` 含 R9 两节；字段名与 `runtime.json` 实测键一致（人工核对；与界面显示一致随 b2） |
| AC-R5-6 | b1：目录不可用 ⇒ 回落 + 明示（不静默丢产物）、写时失败 ⇒ `E_OUTBOX_WRITE`；界面侧（改目录 / 界面报错）随 b2 |

**上抛项（请主包AI 核验）**：

1. R9 与 F5.7 来源 = 用户 2026-10-09 提出（见 §1 同日条）；本段落位如与主包AI 裁定原意有出入，请指出。
2. 口径说明：F5.7「下载文件不再别处默认落点」落为**交付落点唯一**（`<outboxDir>/<taskId>/files/`，经下载暂存区归属）；CDP 下载暂存区 `<userData>/downloads-staging/<workerId>/` 保持为任务执行期的**机器中间落点**（上一轮已落，未推翻）。如要求暂存区也置于交付目录内，请裁定（属范围调整，需改 R8 轮已落的 CDP 口径）。
3. 需求档 §6 映射表未列 AC-R5-6 行（R5 现列 AC-R5-1..5）——请核对补行（需求档笔权在主包AI）。

### 轮次 3 评审修复落位与上抛项状态回填（2026-10-09）

**轮次 3 设计修复**：§3 轮次 3 评审 10 条发现（🟡 3 · 🔵 7）经主包AI 逐条裁定「采纳」，已按 P1–P10 逐点落盘（P 编号与发现编号 #1–#10 一一对应）；改动落在设计档（`docs/design/overview.md` 与 `docs/design/modules/` 各档）；§2 内 R9 范围行、验收命令清单、验收对照表 AC-R7-1 行已按轮次 3 口径就地更新；需求档未改（笔权在主包AI）。

**上抛项状态（R9 与 F5.7 落位块所列 3 条，逐条标状态）**

1. **落位与裁定原意是否一致** → **已裁定（闭合）**：落位口径按 §1「裁定（2026-10-09，对设计代理上抛项；主包AI）」三项确认。
2. **下载暂存区是否搬入交付目录** → **已裁定（闭合）**：维持现状（§1 同条裁定第 2 项）——`<userData>/downloads-staging/<workerId>/` 为机器中间落点；交付契约只保证最终落点唯一。
3. **需求档 §6 补 AC-R5-6 行** → **已裁定（闭合）**：已补（§1 同条裁定第 1 项；需求档 §6 该行已在位）。

**真正待裁项**：无。

## §3 设计评审（评审子代理）

### 轮次 1（评审子代理）

评审对象：需求档 docs/requirements/overview.md · 设计档 docs/design/overview.md + 6 份模块设计 · 批次档 docs/batches/b1-core-loop.md（§1/§2）。全部引用已按磁盘现状逐行核对。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Document ownership | 🔴 | `E_SELECTOR_MISSING`（页面结构变化 / 页面改版）的终态两处相互矛盾：`docs/design/overview.md:177` 处置写「任务 failed；保存失败截图」，而 `docs/design/modules/scheduler.md:38` 把页面改版列入 needs_human 一侧（「页面改版 / 全部外包工不可用）⇒ needs_human」），错误码权威表 `docs/design/modules/mcp-server.md:103` 同码 needsHuman=是（行内含「需适配器适配（附截图）」）。b1 单外包工配置下降级无从发生（`docs/design/modules/scheduler.md:73` 的「任务转下一优先级」路径空缺），两档对终态的表述（failed / needs_human）直接冲突，实施者必须二选一。 | 把该错误的终态收敛到单一一处（错误码权威表 + 调度档 §3/§6 的降级与终态规则），并把 `docs/design/overview.md:177` 改为与之一致（写清降级路径与降级耗尽后的终态），两档同源。 |
| 2 | Document ownership | 🔴 | `E_ENGINE_DOWN` 的触发域与处置两处不一致：`docs/design/overview.md:181` 写「重启引擎子进程；进行中任务 failed 并标记可重派」，`docs/design/modules/scheduler.md:105` 同义；但 `docs/design/modules/scheduler.md:73` 把 `E_ENGINE_DOWN`（启动失败）列入「外包工不可用（可降级）」行，处置为「该外包工置冷却（默认 10 分钟」并「任务转下一优先级」——同一码两套处置（失败可重派 vs 自动换人），且引擎级故障冷却单个外包工语义不成立。 | 明确该码的触发域（引擎子进程故障 / 单外包工启动失败，必要时拆成两个码），并只在一处写明处置：引擎故障 ⇒ 重启 + 进行中任务 failed（可重派）；在 `docs/design/modules/scheduler.md:73` 可降级行移除该码或注明其另属一类。 |
| 3 | Clarity | 🟡 | dispatch 期「拒绝 vs 建任务落 needs_human」的边界未定：`docs/design/modules/scheduler.md:49`（「拒绝：`E_LOGIN_REQUIRED` / `E_WORKER_UNAVAILABLE`（硬绑定，不降级）」）与 `docs/design/modules/scheduler.md:56`（「全部跳过 ⇒ 终态 needs_human，错误 E_NO_WORKER」）给出两种形态；契约 `docs/design/modules/mcp-server.md:57` 的 dispatch_task 错误表既未列 `E_LOGIN_REQUIRED` 也未列 `E_NO_WORKER`。需求判据 `docs/requirements/overview.md:138` 写「任务落到 needs_human / E_LOGIN_REQUIRED（或 E_WORKER_UNAVAILABLE）」；与 AC-R4b-2 的「任务不创建」（`docs/requirements/overview.md:137`）连读，按现设计「拒绝」路径不建任务，该判据只在 opening 阶段登录检查失败时才可复现。 | 在 mcp-server §3.2 一次写清 dispatch 期错误码全集与「建任务 / 不建任务」规则（哪些错误以 MCP 错误信封返回、哪些以任务状态承载），并与 AC-R4b-3 判据对齐或注明其复现步骤。 |
| 4 | Document ownership | 🟡 | 配置 schema 缺 `limits.taskTimeoutMs`：`docs/design/modules/scheduler.md:88` 以「`limits.taskTimeoutMs`（默认 300s）」为 streaming 总时长上限，`docs/design/modules/scheduler.md:80` 又声明「阶段超时表（默认值，配置可改）」，但权威 schema `docs/design/overview.md:164` 的 limits 只有 maxFileBytes / maxInlineTextChars / maxTaskChars / maxAttachFiles 四键；`docs/README.md:28` 声明配置 schema 单一来源即「配置存储」一节。 | 在 schema 补入 `limits.taskTimeoutMs`（及「配置可改」所涵盖的其余超时键），或把调度档 §7 改为「内置默认值、暂不可配」，二者取一。 |
| 5 | Acceptance criteria | 🟡 | b1 的文本 / 命名类验收缺可执行落地：AC-R2-1（`docs/requirements/overview.md:72`，需求标「命令可证伪」）未出现在批次档 §2 验收对照表（该表最接近处为 `docs/batches/b1-core-loop.md:114`「| AC-R1-2 / AC-R2-2 | `npm run verify:mcp` |」）与需求档 §6 批次映射（`docs/requirements/overview.md:232`）；AC-R7-1 / AC-R7-3 在 `docs/design/overview.md:267` 只写「AC-R7-1 / R7-3 用命令（文档结构 + 与 `tools/list` 对照）」，`docs/design/overview.md:268` 归入 `npm run verify:*`，但三个 verify 脚本均未声明含文档结构断言。 | 指名检查手段（例如把 ①④ 的「四节结构 + JSON 样例可解析 + 工具清单与 tools/list 对照」纳入 verify:mcp 或新增 verify:docs），并写明 AC-R2-1 的检索范围与判据。 |
| 6 | Requirements coverage | 🟡 | F1.4 的 `/healthz` 载荷在契约档缺位：需求 `docs/requirements/overview.md:47` 要求返回「返回 ok / 版本 / 端口 / 外包工概览」（架构档 `docs/design/overview.md:49` 同），但契约权威档只写到 `docs/design/modules/mcp-server.md:18`「探活，开放（仅本机可达）」，验收判据 `docs/design/modules/mcp-server.md:122` 只断言「`/healthz` 返回 200 且含版本与端口」——「外包工概览」既无载荷定义也未进断言。 | 在 mcp-server 档明示 /healthz 返回体字段（含 workers 概览）并把该断言纳入 verify:mcp，使契约与需求 F1.4 逐字对齐。 |
| 7 | Clarity | 🟡 | 调用方双称谓：F2.1（`docs/requirements/overview.md:65`「全库文档、界面文案、MCP 工具描述统一使用「主包AI」指代调用方」）与 AC-R2-1（`docs/requirements/overview.md:72`「同一角色出现第二个称谓即判失败」）约束下，同一角色在库内多处称「宿主」（如 `docs/design/overview.md:51`「宿主的 URL 型客户端实现未实测到传输细节」、`docs/design/modules/mcp-server.md:86`「宿主不适合阻塞调用」、`docs/design/modules/settings-app.md:29`，以及需求档自身 `docs/requirements/overview.md:46`），而术语表未收录「宿主」（`docs/requirements/overview.md:27` 只把该角色定义为「打开「免费外包」的 AI-Agent 工具（首发 ThinCoder 桌面版）——任务的发布方」）。 | 在术语表定义「宿主」的角色边界（MCP 客户端容器）或全文统一称谓；并据此把 AC-R2-1 的检索词范围写明，避免验收把既有措辞判成失败。 |
| 8 | Clarity | 🟡 | 重启语义未闭合：`docs/design/modules/scheduler.md:99` 与 `docs/design/modules/outbox.md:52` 都用「标 `interrupted`」描述重启后扫描到的非终态 manifest，但 `interrupted` 不在 state 枚举（`docs/design/modules/scheduler.md:17`「queued / running / done / failed / canceled / needs_human」）与终态集（`docs/design/modules/scheduler.md:37`「终态：`done / failed / canceled / needs_human`」）内，也未说明是 state 值还是独立标记字段；且「任务表在主进程内存」（`docs/design/modules/scheduler.md:98`），重启后 get_task / fetch_result 对已完成任务的行为未定义。 | 写明 interrupted 的承载形式（新 state 值或 error / 标记字段）并同步枚举与 TaskView；同时写明重启后取件路径（如 get_task / fetch_result 是否回退读 manifest）。 |
| 9 | Scope | 🟡 | 协调项（非缺陷）：批次档 §2「上抛项（请主包AI / 用户裁定）」（`docs/batches/b1-core-loop.md:130`）5 条待裁定——需求档采纳、R7④ 批次沿用 b1、台账标题、安装包 ~200MB 取舍、宿主字段以版本为准与 K9 触发；其中 #1、#4 影响本批批准与范围口径。 | 批准时逐条落裁定并回填需求档 / 批次档，使设计前提与用户口径一致。 |
| 10 | Affected-file size annotations | 🔵 | 修改型文件只给增量、未给当前行数：`docs/design/overview.md:113` 的「`package.json`（改） | +6 行」。实测现状：package.json 共 13 行（末行 `package.json:13` 为 `}`），scripts 仅 `probe:deepseek` 一条（`package.json:8`）、依赖仅 playwright 一条（`package.json:11`）；「+6 行」= 2 依赖 + 4 scripts，与实测一致，合计约 19 行，远低于 300 行分层线，无需拆分计划。 | 补为「当前 13 行 → ~19 行（+6）」，保持受影响文件表同格式。 |
| 11 | Affected-file size annotations | 🔵 | 测试面表（表头 `docs/design/overview.md:139`）只给职责、未给预计行数或规模说明（如 `docs/design/overview.md:141` 的 units.mjs 行），新增测试文件是否越过 300 行分层线无法预检。 | 为新增测试文件补预计行数，或统一声明「实施后超 300 行按分层规则拆分」。 |
| 12 | Clarity | 🔵 | 状态枚举缺冷却态映射：契约 `docs/design/modules/mcp-server.md:41` 的「status ∈ ready / login_required / busy / unavailable / disabled」不含调度档引入的冷却态（`docs/design/modules/scheduler.md:60`「`login_required`、`captcha_cooling`、`unavailable` 均视为不健康」）；界面词表（`docs/design/modules/settings-app.md:14`）亦为五值。 | 在契约写明 `captcha_cooling` 对外映射为 unavailable（或补枚举值），避免同一状态两套词表。 |
| 13 | Clarity | 🔵 | 选人结果的落盘时点未定，影响 AC-R4a-3 判据：`docs/design/modules/scheduler.md:55` 说「即使它正忙也选它（任务在其队列排队）」，`docs/design/modules/scheduler.md:66` 又说「出队时重新执行 `pick`（状态可能已变）」，架构档次序为「建任务（写 outbox 初始 manifest）→ 选人」（`docs/design/overview.md:99`）；AC-R4a-3 判据是「判据：manifest.worker 仍为 A」（`docs/requirements/overview.md:118`），若 worker / selection 只在出队时写入，排队期间判据不成立。 | 写明「派单即写入 worker / selection，出队仅复核（若已不可用按降级规则处理）」，使排队期判据可复现。 |
| 14 | Methodology | 🔵 | 评审前提与文档归属检查说明（非缺陷）：本仓无 AGENTS.md / 独立项目标准档，方法论按批次档 §1 决策 F 的流程与 `docs/README.md` 写作约定评估（职责头、变更记录、单一来源、AC 命名、探针产物不进正文——已遵守）；文档地图实际存在且登记齐全（`docs/README.md:11` 起，guide 两份状态「待 b1 实施交付」见 `docs/README.md:19`），未发现新建文件抢占既有章节或重复详述 R7 四载体分工。 | 无（供核验范围说明）。 |

计数：🔴 2 · 🟡 7 · 🔵 5（合计 14 条）

VERDICT: changes-required

### 轮次 2（评审子代理）

**核验对象**：§3 轮次 1 发现表 14 条（+ 明显新问题）。本轮引用按磁盘现状逐行核对（8 份文档 + 本批次档 §2/§3）。

| # | Orig# | File | Severity | Status | Notes |
|---|---|---|---|---|---|
| 1 | 1 | docs/design/overview.md:186 + modules/scheduler.md:38,80 + modules/mcp-server.md:122 | 🔴 | Fixed | overview:186「归「外包工不可用（可降级）」类：该外包工置冷却，任务转下一优先级；降级耗尽（b1 单外包工配置直接落）⇒ needs_human」；scheduler:38「页面改版（`E_SELECTOR_MISSING`）/ 降级耗尽）⇒ needs_human」；scheduler:80「⇒ 终态 **needs_human**，错误码 = 最后一次尝试的错误码」；mcp-server:122 该码 needsHuman=是——三档同源，冲突消除。 |
| 2 | 2 | modules/scheduler.md:76,83 + modules/mcp-server.md:130 + docs/design/overview.md:190 | 🔴 | Fixed | scheduler:76 可降级行码集改为「`E_LOGIN_REQUIRED` `E_CAPTCHA_OR_RISK` `E_SELECTOR_MISSING` `E_WORKER_UNAVAILABLE`」（E_ENGINE_DOWN 已移出）；scheduler:83「属引擎级故障（引擎子进程不可用）：处置 = 主进程重启引擎 + 进行中任务 failed（可重派），见 §10；不按外包工错误类处理」；mcp-server:130 错表行同义；overview:190 不变且一致。 |
| 3 | 3 | modules/mcp-server.md:70,74-76 + modules/scheduler.md:39,57,61 | 🟡 | Fixed | mcp-server:70「错误（派单期**同步拒绝、不创建任务**）：`E_BAD_ARGS`、`E_BAD_FILE`、`E_WORKER_UNKNOWN`、`E_WORKER_DISABLED`、`E_LOGIN_REQUIRED`、`E_WORKER_UNAVAILABLE`、`E_NO_WORKER`。」；:76「AC-R4b-3 两条复现路径：① 指定对象缓存态即未登录 ⇒ 同步拒绝、不建任务；② 缓存态健康、opening 检查发现登录失效 ⇒ 任务落 needs_human / `E_LOGIN_REQUIRED`。」；scheduler:57「全部跳过 ⇒ 拒绝（不建任务）：E_NO_WORKER」——边界与码全集对齐。 |
| 4 | 4 | docs/design/overview.md:165-170,176 + modules/scheduler.md:87-94 | 🟡 | Fixed | overview:169「"streamFirstByteMs": 120000, "taskTimeoutMs": 300000, "extractingMs": 60000」；:176「阶段超时（毫秒）——与 `docs/design/modules/scheduler.md`「阶段超时表」逐键对应」；scheduler:93「`limits.timeouts.taskTimeoutMs`（300s）」——六键逐一对齐。 |
| 5 | 5 | docs/requirements/overview.md:73,234 + docs/design/overview.md:271,277-278 + modules/mcp-server.md:143 + 批次档 §2 | 🟡 | Fixed | requirements:234「| AC-R2-1 | b1 | 命令（称谓检索：`docs/**`、`src/**`、界面词表；唯一例外＝术语表「宿主」） |」；:73 AC-R2-1 检索范围与例外；design/overview:277 称谓验收口径；mcp-server:143「R7 文档断言（同一命令内执行）：`docs/guide/*.md` 四节结构 + 内嵌 JSON 片段可解析 + 工具清单与 `tools/list` 对照（AC-R7-1 / AC-R7-3）。」；批次档 §2 补行 :154-155。 |
| 6 | 6 | modules/mcp-server.md:23-33,141 | 🟡 | Fixed | :23「`GET /healthz` 载荷（200；无需 token）：」+ 载荷含 ok/version/port/workers；:141 断言「载荷含 `ok` / `version` / `port` / `workers`（§2）」。 |
| 7 | 7 | docs/requirements/overview.md:28,73 | 🟡 | Fixed | :28「| 宿主 | 承载主包AI 的 MCP 客户端程序（如 ThinCoder 桌面版）——仅在传输 / 进程语境使用，不指代任务发布方 |」；:73 AC-R2-1 例外条款与之一致。 |
| 8 | 8 | modules/scheduler.md:104-105 + modules/outbox.md:52 + modules/mcp-server.md:114 | 🟡 | Fixed | scheduler:104「写入独立标记字段 `interrupted`（`{ at, previousState }`，不进 `state` 枚举）」；:105「重启后任务表为空：`get_task` / `fetch_result` 对内存中不存在的任务一律返回 `E_TASK_UNKNOWN`（不回落读 manifest）」；outbox:52 同；mcp-server:114 错表行含「应用重启前」。 |
| 9 | 9 | docs/batches/b1-core-loop.md §2 | 🟡 | Fixed | §2 回填（:142-148）五条上抛项逐条裁定入档；验收对照补行 :154-155。用户批准仍为 §4 流程步（协调项，非缺陷）。 |
| 10 | 10 | docs/design/overview.md:114 | 🔵 | Fixed | 「| `package.json`（改） | 当前 13 行 → ~19 行（+6） |」——口径补齐。 |
| 11 | 11 | docs/design/overview.md:138-145 | 🔵 | Fixed | 「测试面（行数为估算；任一文件实施后超 300 行 ⇒ 按测试对象拆分）：」+ 表补预计行数（~250/~150/~120/~100）。 |
| 12 | 12 | modules/mcp-server.md:54 | 🔵 | Fixed | 「冷却映射：调度内部态 `captcha_cooling` 对外一律映射为 `unavailable`，冷却原因写入 `detail`（如「冷却中：验证码 / 风控」）——不新增枚举值。」 |
| 13 | 13 | modules/scheduler.md:69 + docs/design/overview.md:100 | 🔵 | Fixed | scheduler:69「**选人结果在派单时写入** `worker` / `selection`，并随初始 manifest 落盘（排队期即可查得 `manifest.worker`——AC-R4a-3 判据）」；design/overview:100「建任务并写 outbox 初始 manifest（含 `worker` / `selection`）」——同序。 |
| 14 | 14 | — | 🔵 | Accepted | 评审前提/归属检查说明（无 AGENTS.md 与标准档；文档地图登记齐全）——无需动作，理由成立。 |

新问题：无（本次修复未引入新的 🔴/🟡 级问题；复核改动区域未发现逻辑级不一致）。

计数：🔴 2 · 🟡 7 · 🔵 5（共 14 条：13 Fixed + 1 Accepted；New 0）

VERDICT: pass

### 轮次 3（评审子代理）

评审对象（第 3 轮复审）：三块新增内容的设计落位——R8（外包工级开关：配置与应用）、R9（换机自适配与端点可改：端口 / `runtime.json` / 两形态片段与导出 / 说明文档两节）、F5.7（交付目录设置：实际路径 / 落点唯一 / 不可用回落）；并复核第 1/2 轮结论未破坏。引用按磁盘现状逐行核对（需求档 + 设计档 + 6 模块 + 本批次档 §1/§2）。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Scope | 🟡 | F9.6 / 载体③ 的批次归属两处不同：批次档 §2 把 F9.6 放进 b1（`docs/batches/b1-core-loop.md:252`「F9.3 期望端口可配置 / F9.6 片段一键导出能力」），设计档把它放进 b2（`docs/design/overview.md:228`「生成逻辑 b2；样例 b1」、`docs/design/overview.md:72`「设置界面（b2）显示**实际 MCP 地址** + 一键复制两形态片段 + 一键导出为文件」、`docs/design/overview.md:280`「「接入指引」页（②③：实际地址 / 一键复制 / 一键导出）」）。同一交付物「应用内一键导出片段」属哪一批无唯一定论，实施与验收会各按一处执行。 | 统一 F9.6 / ③ 的批次口径（b1 只保留静态样例与 `runtime.json` 发布面，生成 / 一键复制 / 一键导出随 b2），并把批次档 §2 的范围行与设计档 §7③、§2.3、§12 改成同源表述。 |
| 2 | Requirements | 🟡 | F9.3 把主包AI 列为「期望端口」的写方，但设计未给该写方任何通道：需求 `docs/requirements/overview.md:246`「端口可由配置文件固定：用户或主包AI 写入期望端口」、`docs/requirements/overview.md:240`「用户或主包AI 都能把宿主侧配置改对」；设计侧只有 `docs/design/overview.md:163`「文件手改也可被加载（下次启动生效）」与 `docs/design/overview.md:59`「用户或主包AI 写入即按之启动」（均为结论、无入口），工具面是封闭六件套（`docs/design/modules/mcp-server.md:36`「工具契约（六件套）」），① 的节结构也明说只写「到哪里看**实际值**」（`docs/design/overview.md:232`「只写「到哪里看**实际值**」（设置界面 / `runtime.json` / 导出目录）与更新步骤」）——主包AI 无从「只读说明」得到本工具 `config.json` 路径与 `mcp.port` 键。 | 明示该写入通道（例如 ① 增列本工具配置路径与 `mcp.port` 键、或写明期望端口仅由用户 / 界面写入并把 F9.3 的主体收紧），使 F9.3 的写方可复现。 |
| 3 | Clarity | 🟡 | R8 的三个引擎侧数据面缺口都落在 AC-R8-1 的判据链上：① `task.run` 不传 `toggles`，而 F8.2 要求引擎据此对齐页面开关——引擎接口摘要为 `docs/design/modules/scheduler.md:110`「`engine.health`、`task.run({taskId, worker, prompt, files, outboxDir})`、`task.cancel({taskId})`」；② 请求载荷捕获能力未声明——`docs/design/modules/adapters.md:20` 的 `capabilities` 注释为「// 能力声明（调度与取件据此分支）」，`:21` 的能力项只有 `streamCapture`，无请求体捕获项，而 §3.8 的权威核对依赖它；③ 引擎回报形状未写，而 manifest 的 `toggles` 必须由主进程写（`docs/design/modules/outbox.md:55`「`payload` = 捕获到的 `chat/completion` 请求载荷两键（任务未发送或未捕获 ⇒ `null`）」、`docs/design/overview.md:117`「返回结果清单 → 主进程写 manifest 终态」）。 | 在接口摘要里补齐三处：`task.run` 传入该外包工的 `toggles`（或声明引擎自读配置）、`capabilities` / 接口增加请求载荷捕获项（读出 `chat/completion` 的 `thinking_enabled` / `search_enabled`）、以及回报清单字段（`delivery` / `toggles.payload` / `ok`）。 |
| 4 | Document ownership | 🔵 | 批次档 §2 的 R9 上抛项 2/3 已在 §1 被裁定，但 §2 仍以未决形态列出：`docs/batches/b1-core-loop.md:278`「如要求暂存区也置于交付目录内，请裁定」与 `docs/batches/b1-core-loop.md:279`「需求档 §6 映射表未列 AC-R5-6 行」，而 `docs/batches/b1-core-loop.md:102`「**下载暂存区口径** → **维持现状**」、`docs/batches/b1-core-loop.md:101`「**需求档 §6 未列 AC-R5-6** → **已补**」，需求档该行亦已在位（`docs/requirements/overview.md:290`「| AC-R5-6 | b1（行为）/ b2（界面） | 操作 |」）。已闭合项与仍待裁项混列，下游易重复处理。 | 在 §2 追加块内对上抛项逐条标状态（已裁定 → 指向 §1 对应条），把已闭合项与真正待裁项分开列。 |
| 5 | Clarity | 🔵 | §2「验收命令」清单未随 R9 补行更新：清单头写 `docs/batches/b1-core-loop.md:159`「### 验收命令（应用已启动前提下；中文断言一律用 UTF-8 感知方式，不用 findstr）」下的条目里没有 `verify:runtime`，而 `docs/batches/b1-core-loop.md:269` 的 AC-R9-1 判据以它为唯一手段；且该命令在设计档是自控启停（`docs/design/overview.md:158`「自控应用启停」），与清单头「应用已启动前提下」不同源。 | 在 §2 验收命令清单补 `npm run verify:runtime` 一行并写明启停口径（自控 / 需应用已启动），与设计档 §13 同源。 |
| 6 | Clarity | 🔵 | 端口顺延上限耗尽后的行为未定：`docs/design/overview.md:59`「被占则 `+1` 顺延（最多 +20）」只给上界，+20 全部被占时的处置（启动失败并明示 / 继续顺延 / 回落随机端口）与对应错误码未写，而 `docs/design/modules/mcp-server.md:113` 起的错误码表也没有启动期端口失败的归口。 | 写明 +20 全占用时的终局行为与可见告知（并归入某错误码或托盘提示口径）。 |
| 7 | Document ownership | 🔵 | `runtime.json` 的生命周期只定义了写、未定义失效：`docs/design/overview.md:60`「字段清单（启动成功即写；实际端口或地址变化时覆写）」与 `docs/design/overview.md:64`「主进程 PID（服务是否在跑，以进程存活为准）」给了 `pid`，但退出是否删除该文件、消费方（主包AI / 操作者）如何据 `pid` 判活未写；崩溃后残留的旧文件会保留过期端口。 | 写明退出时删除或保留 `runtime.json` 的口径，并写明消费方按 `pid` 判活的步骤（或标注该判定由说明文档 ① 承担）。 |
| 8 | Acceptance criteria | 🔵 | `verify:mcp` 的文档断言对象与形状断言范围偏松：`docs/design/modules/mcp-server.md:146`「`docs/guide/*.md` 四节结构 + R9 两节（「换机后首次接入」「端点 / 端口变化后如何更新宿主配置」）」以 glob 覆盖两份文档，但「四节」只适用 ①，④ 是 `docs/design/overview.md:229` 的「服务自述五要素：我是谁 / 我提供什么 / 怎么调用 / 出错怎么办 / 何时需要人来操作」；同时 AC-R7-1 要求的字段形状核对（`docs/requirements/overview.md:210`「字段名与 ThinCoder 实测形状一致（`mcpServers` 对象形、`url` 字段）」）只落到「内嵌 JSON 片段可解析」。 | 把断言对象写实（四节结构 → ① `agent-onboarding.md`；五要素自述 → ④ `agent-brief.md`），并把字段形状断言（`mcpServers` 对象形 + `url` 字段，及两形态中的 `config.json` 的 `mcp.servers` 数组形）纳入同一断言。 |
| 9 | Acceptance criteria | 🔵 | AC-R8-2 的「日志」侧判据无设计落点：需求 `docs/requirements/overview.md:233`「界面与日志可见应用动作」，设计侧只给机器核对与 b2 界面（`docs/design/overview.md:299`「AC-R8-2 = 操作（改配置重派复测载荷随动；界面侧随 b2）」），日志面（引擎是否记开关目标值 / 实际值 / 复核结果）未写，而 §6 日志口径只约束「不记录敏感值」。 | 给「应用动作」一个可核对的日志落点（开关目标值 / 实际值 / 复核结果），或把 AC-R8-2 的判据显式收敛为载荷随动 + `manifest.toggles`。 |
| 10 | Acceptance criteria | 🔵 | AC-R5-6 的两段行为分属两层、触发条件不同，复现步骤未写明：需求 `docs/requirements/overview.md:171`「把目录设为不可写 → 界面明确报错并按回落策略处理（不静默丢产物）」，而设计里界面侧是提交前校验即拒（`docs/design/modules/settings-app.md:45`「校验失败 ⇒ 界面明确报错、不落配置（不静默接受）」），运行期回落需目录在配置之后才失效（`docs/design/modules/outbox.md:23`「解析时点 = 启动（供界面显示） / 目录配置改动时 / 每单建任务时（决定该单实际目录，写初始 manifest 前）」）。 | 在判据里写清两段路径：界面侧＝选不可写目录被拒（不落配置）；运行期侧＝先配置可用目录、再令其不可写（撤权 / 拔盘）后派单 ⇒ 回落 + 托盘 / 日志 / 界面明示（不静默丢产物）。 |

计数：🔴 0 · 🟡 3 · 🔵 7（合计 10 条）

复核说明（第 1/2 轮结论未破坏）：`E_SELECTOR_MISSING` 终态三档同源（`docs/design/overview.md:203` / `docs/design/modules/scheduler.md:38` / `docs/design/modules/scheduler.md:80` / `docs/design/modules/mcp-server.md:124` needsHuman=是）；`E_ENGINE_DOWN` 已移出可降级行（`docs/design/modules/scheduler.md:76` 行内无该码、`docs/design/modules/scheduler.md:84` 单列引擎级处置）；派单期同步拒绝全集在位（`docs/design/modules/mcp-server.md:71`）；`limits.timeouts.taskTimeoutMs` 已入 schema（`docs/design/overview.md:183`）；`interrupted` 为独立标记字段（`docs/design/modules/scheduler.md:105`）；`captcha_cooling` → `unavailable` 映射在位（`docs/design/modules/mcp-server.md:55`）；选人结果派单时写入（`docs/design/modules/scheduler.md:69`）；`/healthz` 载荷含 `workers`（`docs/design/modules/mcp-server.md:29`）。受影响文件行数标注：唯一修改型文件已带当前行数与增量（`docs/design/overview.md:126`「当前 13 行 → ~20 行（+7）」），与其同行列出的 2 依赖 + 5 scripts（含新增 `verify:runtime`）自洽；全表无 ≥300 行预估文件，无需拆分计划（`package.json` 实测行数不在本次评审范围，标注中「当前 13 行」未核）。评审前提限制：本仓无 AGENTS.md、无项目标准档声明、文档地图未在本次上下文声明（`docs/batches/b1-core-loop.md:133`「文档地图：`docs/README.md`」为库内指针，未纳入本次阅读范围），故方法论与文档归属两项按降级口径评估。

VERDICT: pass

## §4 用户批准（主 agent）

### 用户批准（2026-10-09）

- **用户原话**：「批准。因已到 Token 高付费时段，不再继续开展工作，等待我发送 [继续] 后接续。」
- **批准范围**：b1（最小可用闭环）实施 —— 需求 **R1 / R2 / R3 / R4a / R4b / R7①④ / R8（配置与应用）/ R9（端点与发布面）/ F5.7（交付目录行为口径）**。
  **不在本次批准范围**：设置界面与接入指引页（b2）· Kimi 适配器（b3）· 打包 .exe 与换机验收（b4）。
- **设计依据**：需求档 `docs/requirements/overview.md`（R1–R9）；设计档 `docs/design/overview.md` + 6 份模块设计；批次档 §2。
  评审链：轮 1 = changes-required（14 条）→ 轮 2 = **通过** → 轮 3 = **通过**（10 条发现全部修复并经主包AI 逐处核验）。
- **设计凭证**：第 3 轮签发的 designToken 属**运行时状态，不落文档**；若会话或凭证过期，续接时按流程重新走设计评审后再实施（不得凭过期凭证开工）。
- **批准时点的暂停**：用户要求暂停实施 —— **未开工**（无 eng-coder 派单）、**未落基线提交**（仓库当前零提交）。
- **续接清单（收到 [继续] 后按序执行）**：
  1. 基线提交（路径限定，仅本项目文件；提交前再次确认）
  2. 派 eng-coder 实施 b1（任务书 = 批次档 §2；携 `batchDoc` + `designId` + 第 3 轮 designToken）
  3. 交付后逐条跑验收命令（`verify:mcp` / `verify:engine` / `verify:loop` / `verify:runtime` + 单元 + 人工场景）
  4. 自举验收：把本工具接入 ThinCoder「设置 → MCP」段，主包AI 真实派单并取件
  5. 台账推进（#1–#9 由「待讨论」推进到「在途」，交付核验后走「待核销 → 已核销」）

## §5 实施记录（eng-coder）
## §6 验证与收口（父代理）
