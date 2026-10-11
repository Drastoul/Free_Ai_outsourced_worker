# 2026-10-11 · b5 会话复用
> 六段 append-only，一段一作者：§1 讨论（主 agent）· §2 批次任务与设计（eng-designer）· §3 设计评审（评审子代理）· §4 用户批准（主 agent）· §5 实施记录（eng-coder）· §6 验证与收口（父代理）。
> 编制：主 agent · 2026-10-11 · 来源 = 用户 2026-10-10 观察（分次单独提交触发平台风控验证码；建议同一会话连续派单、阶段边界再换）+ 用户 2026-10-11 16:07「B5，依旧能拆给用免费外包，就用免费外包」+ 设计档 docs/design/modules/browser-engine.md（会话 / 配置目录 / 崩溃重启）与 adapters.md（openSession 语义）。
> 台账 = #19（免费外包 · 归批）。前情 = docs/batches/b3-kimi-adapter.md §6（已收口 2026-10-11）。
## §1 讨论（主 agent）
**状态行**：🔄 进行中（…）
<§1 模板占位：本批条目 / 关键判据 / 授权口径>

### §1 讨论与来源（主包AI）

- **来源**：用户 2026-10-10 观察（分次单独提交会把平台风控验证码打出来）+ 用户 2026-10-11 16:07「B5，依旧能拆给用免费外包，就用免费外包」；需求行 = 台账 **#19**。
- **需求要点（用户口径）**：同一平台同一外包工**连续派单复用同一聊天会话**；以**空闲 TTL + 单会话任务数上限**为「阶段边界」；**任务出错或超时即换新会话**（故障不继承）；收益 = 减少风控触发 + 相邻任务上下文连续。
- **硬约束**：不改 MCP 六件套契约（不加参数、不改返回形状）· 不改工单语义（答复仍取「最新一条带结束标记的助手消息」、取件三层不变）· 每外包工并发仍为 1。
- **本批成本策略（用户明确）**：**能拆给免费外包的活就拆给免费外包**（本项目自有通道、免费），慢一点没关系；付费 provider 只做兜底，任务尽量压小。⇒ 本批的设计草案由**免费外包**产出（任务号 `20261011-160743-fd85`，`outbox/20261011-160743-fd85/answer.md`，41 秒交付），设计代理只做「按房规归一 + 补缺口 + 落格式」，不重复设计。
- **草案自带的 9 项「待实测确认」**（明确不猜，须在本批落实归属：第 0 步探针 或 上抛）：① 复用后第二次 `send` 的请求 URL（决定 `stream.match` 是否扩）② 单会话上下文上限 ③ 取消是否污染上下文 ④ `worker.check` 是否影响复用判断 ⑤ `task-runner.mjs` 现况行数 ⑥ `task.run` 是否接受新 `session` 入参（方案 A/B 分叉）⑦ 会话页在但服务端已失效的判据 ⑧ `ttlMs` / `maxTasksPerSession` 默认值 ⑨ `manifest` 是否加只读 `session` 字段。
- **状态**：§2 待设计代理起草（本轮）→ 评审（用户发动）→ 批准 → 实施。

### 父侧读盘事实补充（2026-10-11，主包AI；供 §2 直接引用，**免费取数**）

起草 §2 前已读盘核对下列事实（草案的「待实测确认」清单第 4/5/6 项据此**结清**）：

| 项 | 读盘读数 | 结论 |
|---|---|---|
| ⑤ `task-runner.mjs` 现况行数 | **283 行** | 草案「+25 行」⇒ **308 ✗ 越 300 档** ⇒ 拆分**必须**执行（把决策/记账全推给新模块，`task-runner.mjs` 只留调用点与写回） |
| ⑥ `task.run` 是否可加 `session` 入参 | 主进程**已在**用同形入参：`src/main/scheduler/execution.mjs:148` `'task.run'`、`:152` `prompt: t.request.task`、`:154` `outboxDir: t.taskDir`、`:155` `toggles: { ...(worker.toggles \|\| { thinking: false, search: false }) }` | **方案 A 有活先例**（与 `toggles` 完全同形）⇒ 推荐 A。注意 `execution.mjs` **现况 287 行**（+N ⇒ 也可能需越档处置） |
| ④ `worker.check` 与会话 | `src/engine/worker-check.mjs`（87 行）语义 = 打开/复用会话页检查登录，**不建会话、不发送** | 与会话单元无耦合（它不调 `openSession`）；是否「它复用后影响后续复用判断」留实现期核对 |
| 引擎自读配置的既有做法 | `src/engine/browser-config.mjs`（75 行）注释明写「引擎**只读**配置…config.json 的 `browser` 段仅作启动选项来源之一」 | **方案 B 也有先例** ⇒ 分叉两条都站得住；裁定理由应写成「单一事实源 vs 引擎自治」的取舍（`toggles` 走参数、`browser.*` 走自读 ⇒ 若选 A，应说明为何会话策略跟 `toggles` 而不跟 `browser.*`） |
| 复用改造落点 | `src/engine/task-runner.mjs:157` `if (adapter.capabilities.newChat !== false) {` / `:158` `await adapter.openSession(page, { log: ... })` | 草案定位**与实数一致** ✓（opening 段内、`ensureOnPlatform`(:148)/`waitForLoginState`(:150) 之后） |

- **通道状态（记档）**：2026-10-11 16:08。三名 provider **全部不可用**（sensenova 本周额度尽 · bigmodel 余额不足 · deepseek 直连 `token plan entitlement exhausted`）⇒ **§2 只能由设计代理落**（批次档段落白名单：主包AI 不得写 §2），**故本批在付费通道恢复前无法推进 §2**；其余可免费完成的部分（草案、事实、判据设计）已全部就绪。

### §2 交付后的父侧裁定（2026-10-11，主包AI）

**先记**：§2 已核验（七块齐备 · 6 项待实测归属表清楚 · 文件计划逐件行数含越档拆分链 · 验收 J1–J7 机器判据 · D1–D10 带理由与被否方案 · 边界 10 条 · 对草案 8 处复核（**第 1 条修正正确**：写回落点 = 每次引擎 run 的 finally，重试 = 新 run ⇒ 天然新会话，草案"要在 sending 段补写"不成立））。

1. **U1（需求档缺口）= Fixed**：已补 **R10 会话复用**（五要素：模块目标 / F10.1–F10.6 / 边界 / AC-R10-1..4 / 依赖）入 `docs/requirements/overview.md`，并在 §6 映射表补两行（AC-R10-1..3、AC-R10-5..6 命令、AC-R10-4 真机·人工）——**主包AI 直改·可回退**。三链同源补齐。
2. **U2（`session.reuse` 默认 `true` + 本批无界面入口）= 准**（默认开）：理由 = 用户需求本就要此行为（台账 #19），默认关则功能在无界面入口期间**不可达**（D5）；「设置界面开关」**另批**（已开台账行）。此项**须在批准时由用户确认**（属行为变更）。
3. **U3（取消 ⇒ 换新，保守）= 准**：污染不可机判、取值不依赖读数 ⇒ 不设探针、取保守侧；日后要「取消后仍复用」需用户给判据。
4. **U4（不做服务端会话有效性预检）= 准**：兜底链（每单登录检查 + 出错即换新 + 重试即新 run）成立；预检属新机制。
5. **U5（`ttlMs` / `maxTasksPerSession` 上界无读数）= 准**：两键可调 + P1 取下界旁证；默认取 `600000` / `5`，运行期观测回调。
6. **U6（`manifest.session` 默认不加）= 准**：避免返回面扩散（D8）；验收改由集成读数 + 日志承载。
7. **D1 = 方案 A（主进程经 `task.run` 透传）= 准**：与 `toggles` / `timeouts` / `limits` 同形且有活先例（`execution.mjs:148-158`）；引擎不自行读配置（单一事实源）。
8. **D7（`stream.match` 扩面）= 条件项，且父侧已用免费证据降级**：b1 期 `probe4` 已在**同一会话内连发两次**且两次都被 `/api/v0/chat/completion` 过滤器捕获（`probe/out4/run.log:10/:16`，源码 `:117-120` 只在 setup 新建一次会话）⇒ URL 面**大概率不变**；仍保留 P1 的一次直验（平台改版风险）。**注意此证据的局限（2026-10-08 读数、方法级推断而非 id 级比对）**，故不据此取消 P1。

### 实施偏差记录与收口待办（2026-10-11，主包AI）

1. **探针命名与行数偏差**：§2 文件计划记 `probe19-b5-deepseek-reuse.mjs` / `probe20-b5-kimi-reuse.mjs`（~150/~90 行）；实施实测 = `probe/probe19-b5-session-reuse.mjs`（**259 行**）/ `probe/probe20-b5-kimi-session-reuse.mjs`（**252 行**）——按父侧派单命名，两文件均 ≤300 档内；§2 文件计划行由父侧直改随动。
2. **T1 判定（D7）= 两平台均不触发**：`deepseek-stream.mjs` / `kimi-stream.mjs` 的匹配面 **0 行改动**。证据：P1 9/9 URL 逐字同值 + `chat_session_id` 9/9 同值 `d3de68c2-f1ee-4e51-a47b-2683023c90b1` + `parent_message_id` 递增（2/4/…/16）；P2 2/2 命中 `/kimi.gateway.chat.v1.ChatService/Chat`，第 2 单请求 `chat_id` = 第 1 单响应 `chat.id`。旁证读数：单会话任务数上限 **N=8 全绿（未探到上界）⇒ 默认维持 5**；空闲 60s 后同会话仍可用。
3. **收口待办（不宣为结论）**：P1 探针的 SSE 正文通道读数呈思维链样式（71–111 字），而同单 DOM 末块 =「收到」——**是否平台改版 / 是否影响引擎答复纯度未验证** ⇒ 收口时随 `verify:loop` 真机核对交付答复文本；若确认异常，按缺陷另开处置（不并入 b5 判据）。

## §2 批次任务与设计（eng-designer）
**状态行**：设计完成（b5 会话复用（2026-10-11）：范围与覆盖 · 设计档同步四处（browser-engine §9 / scheduler / overview / adapters）· 探针 P1/P2（6 项归属逐项结清）· T1–T4 · 文件计划与冻结接口 · 验收 J1–J9 + 人工 M · 决策 D1–D10 · 上抛 U1–U6；评审轮 1 的 10 条逐号修订已并入（另 #14 核对 / 2 处同类行数回调）；待批准）
<§2 模板占位：本批条目（覆盖） / 设计档落点 / 机制设计 / 受影响文件与测试面 / 验收对照 / 关键决策 / 上抛项>

### 本批（b5）范围与覆盖

覆盖需求（三条链：台账 #19 ↔ 本段 ↔ 设计档 `browser-engine.md` §9 / §8 · `scheduler.md` §2/§7/§10–§11 · `adapters.md` §3.2/§3.4 · `overview.md` §3.2/§4/§13）：**会话复用策略**——同一平台同一外包工**连续派单复用同一聊天会话**（减少风控触发 + 相邻任务上下文连续）；以**空闲 TTL + 单会话任务数上限**为阶段边界；**任务出错 / 超时 / 取消即换新**（故障不继承）。来源 = 用户 2026-10-10 观察 + 2026-10-11 16:07「B5…」；需求原文 = 台账 #19 证据行 + 本档 §1「需求要点」。

**判据靶心（本批验收条目；AC 映射 = J1→AC-R10-1 · J2/J3/J4→AC-R10-2 · J5→AC-R10-3 · M→AC-R10-4 · J8→AC-R10-5 · J9→AC-R10-6（评审轮 2 第 15 条随动）；J6/J7 为设计侧条目）**：J1 连续两单复用 · J2 TTL 到期换新 · J3 出错即换新 · J4 上限换新 · J5 禁用回退（`reuse:false` ⇒ 每单新会话）· J6 既有行为不回归 · J7 批内单元全绿 · J8 取消即换新（F10.3 取消侧的端到端读数——评审 #8）· J9 复用 × DOM 兜底（交付 = 本单回合——评审 #9；AC 追认由主 agent 裁定）。

**不在本批**：MCP 六件套契约（不加参数 / 不改返回形状；**manifest 加 `session` 字段默认不做**——D8/U6）· 工单语义（答复口径 / 取件三层）· 调度与协议面（错误码 / 阶段超时 / 重试降级策略）· 设置界面（`session` 无界面入口，手改 `config.json`——U2）· 服务端会话有效性预检（新机制，超范围——U4）· 上下文压缩 / 摘要 · 会话预热 · 跨引擎重启持久化 · 其它平台适配器行为（本批适配器面的两处例外 = D7 的 `stream.match` 扩面 + DOM 兜底「本单锚定」——评审 #9）。

**需求档缺口（发现即报；主 agent 的笔）**：`docs/requirements/overview.md` 现条目 R1–R9 无会话复用条目（台账 #19 尚未落需求档）⇒ 上抛 U1（建议补 R10 五要素 + AC-R10-*，§6 映射随动）。本批按 §1 已确认口径执行，不被该缺口阻塞。

### 设计档落点（本轮已由设计代理同步；评审对象含此三处）

- `docs/design/modules/browser-engine.md`：**新增 §9「会话复用策略（b5）」**（机制权威：会话单元与不变量 / 判定顺序表 / 写回派生判别 / 作废场景 / DOM 兜底交互 / 配置与日志）；§8 增会话复用验收一条（:63）。
- `docs/design/modules/adapters.md`：§2 接口注释（:26）与 §3.2 执行流水第 1 步（:54）会话口径随动（何时新建由 §9 判定；复用命中 ⇒ 不调 `openSession`）· §3.4「本单回合锚定」约束（:79）· §5.1 Kimi 同口径注（:145）。
- `docs/design/modules/scheduler.md`：§2 opening 括注随动（:17）· §7 阶段超时表 opening 行（:91）· §10 `task.run` 入参加 `session` + 口径（:111）· §11 集成行（:123）。
- `docs/design/overview.md`：§3.2 数据流第 3 步（:116）· §4 配置样例 + `session` 键条（:190/:198）· §13 `verify:engine` 行随动（:298）。
- 权威顺序：机制以设计档为准（D2 单一来源）；批次档本节 = 实施合同与判据。

### 第 0 步探针（T1；草案 9 项「待实测」归属逐项结清）

先记：草案第 ④⑤⑥ 项已由 §1 事实表结清（④ `worker.check` 与会话单元无耦合 · ⑤ `task-runner.mjs` 283 行 · ⑥ `task.run` 加 `session` 有活先例 = `src/main/scheduler/execution.mjs:148-155` 的 `toggles` 同形）。其余 **6 项归属**：

| # | 事项 | 归属 | 动作 / 判据 / 产物（或理由） |
|---|---|---|---|
| ① | 复用后第二次 `send` 的请求 URL | **探针 P1** | 真机 DeepSeek 同会话连发，抓每次 POST URL；判据 = 第 2 次起是否仍命中现状匹配面（`src/engine/adapters/deepseek-stream.mjs:14-17` 的 `/api/v0/chat/completion` + 可选查询串）；不变 ⇒ `stream.match` 不动；变化 ⇒ 走 T2 条件项 D7。产物 `probe/out19/result.json` |
| ② | 单会话上下文上限 | **探针 P1（有界）** | 同会话连发 N=8 单（短 prompt）；判据 = 首次失败 / 截断（`finished=false`）的 k（若 ≤8）⇒ `maxTasksPerSession` 默认取 min(5, k−1)；8 单全绿 ⇒ 记「上限未探到」、默认维持 5。产物同 P1 |
| ③ | 取消是否污染上下文 | **上抛 U3** | 污染为语义量、不可机判（可判的只有「取消后会话还能否用」，无论读数取值都不变）⇒ 设计取保守：`canceled` ⇒ 换新；若要放开复用需用户给判据 |
| ⑦ | 会话页在、服务端已作废的判据 | **上抛 U4** | 客户端无确定性构造手段（需服务端作废）；兜底链成立（`send` 失败 / 超时 ⇒ 错误 ⇒ 换新）；预检属新机制、超本批范围 |
| ⑧ | `ttlMs` / `maxTasksPerSession` 默认值 | **上抛 U5；探针 P1 给下界旁证** | 上界（平台空闲容忍 / 上下文拐点）不可测且两键为配置项（可调、非机制承诺）；本批默认取 600000 / 5；P1 附「idle 60s 后同会话再发仍可用」下界读数 |
| ⑨ | `manifest` 加只读 `session` 字段 | **上抛 U6（默认不加）** | 涉工具返回面风险（硬约束 1）+ 4 点扩散（engine result → policy → execution → task.mjs manifest）；本批验收不依赖它（集成读数 + 日志行承载）；如需可观测性另批议 |

**探针清单（本步执行；`probe/**` 属工程工具面，不入 files 声明、照实披露）**：

- **P1 `probe/probe19-b5-session-reuse.mjs`**（实施实测 259 行）：只读复用 `.browser-profile`（不删不重置）→ 打开 DeepSeek → 新会话 → **同一会话连续发送**（N=8；每次记请求 URL + 答复完成标记 + 长度）→ idle 60s → 再发一次。判据 = ①② 与 ⑧ 下界三读数；产物 `probe/out19/{run.log,result.json}`。
- **P2 `probe/probe20-b5-kimi-session-reuse.mjs`**（实施实测 252 行）：同法两连发。判据 = 第二次 `send` 是否仍命中 `/kimi.gateway.chat.v1.ChatService/Chat` + 答复完成；产物 `probe/out20/{run.log,result.json}`。**理由**：复用机制平台无关（`newChat !== false` 的适配器都在内）而 Kimi 已注册可选 ⇒ 其复用安全性须取数、不得猜（草案未涉及，属本段补强）。
- 环境坑照做：剥 `ELECTRON_RUN_AS_NODE`；中文断言 UTF-8 感知；临时产物 `.thincoder/tmp/`；遇 429 / 额度类错误立即停止重试并如实报。

### 条目表（T1–T4）

**T1 第 0 步探针（P1 / P2）**
- 目标：把复用改造的平台侧未知（URL 面 / 上限面 / Kimi 复用面）取证到可判定。
- 边界：不改产品代码；只读复用登录态；未读数不得写成结论。
- 验收：P1/P2 读数落 `probe/out19|20/`，结论入 §5。
- 依赖：`.browser-profile` 双平台登录态（已有）。

**T2 引擎侧实现（会话策略 + 接线）**
- 功能点：新增 `src/engine/session-policy.mjs`（`SessionPolicy` 状态机 + `DEFAULT_SESSION_CONFIG` + 冻结接口 `decide` / `markNewSession` / `recordOutcome`——名以「冻结接口」为准）；`task-runner.mjs` opening 接复用分支（复用 ⇒ 跳过 `openSession`）、finally 接写回、构造器注入 `sessionPolicy`（缺省自建 = `?? new SessionPolicy()`）。
- **DOM 兜底锚定（评审 #9）**：`send()` 记「发送前助手回合基线」、`dom.collect()` 只取基线后的新回合（无新回合 ⇒ 空串 ⇒ 上层 `E_NO_RESPONSE`）——DeepSeek / Kimi 两侧同口径（`adapters.md` §3.4）；不改接口签名；判据 = J9。
- 条件项 **D7**：P1 判定 URL 面变化 ⇒ 扩 `deepseek-stream.mjs` 的 `matchStreamUrl`（纯函数 + 单元例）；P2 同形 ⇒ 同法扩 `kimi-stream.mjs` 的 `match`。
- 边界：不改 phase 链 / 超时表 / `result` 形状 / 错误码 / 适配器接口与 capabilities 键集 / `worker.check`。
- 验收：J1–J5 / J8 / J9 集成读数 + J7 单元全绿。
- 依赖：T1（D7 判定）；D2–D4。

**T3 主进程侧接线（配置 + 透传）**
- 功能点：`config-schema.mjs` 加 `session` 块（`DEFAULT_CONFIG` + `normalizeConfig`）；`execution.mjs` 在 `task.run` 入参透传（同 `toggles` 形）。
- 边界：不动调度语义 / 选人 / 重试策略 / MCP 工具面。
- 验收：J5 场景 + normalize 非法项回退用例（b5 单元）+ `verify:engine` 不回归。
- 依赖：D1（方案 A）、D6。

**T4 测试面**
- 功能点：批内单元 `docs/batches/b5-session-reuse.units.mjs`；集成拆件 `test/integration/engine-helpers.mjs`（抽件）+ `engine.test.mjs`（重构、行为不变）+ `engine.session.test.mjs`（7 场景 = J1–J5 + J8 + J9）；`package.json` 的 `verify:engine` 行纳入两测试文件（`node --test test/integration/engine.test.mjs test/integration/engine.session.test.mjs`）。
- **注入缝隙（评审 #7）**：fixture 适配器 = `defineAdapter({ ...deepseek, id: 'fixture', url: <本地 fixture 页> })` 经 `registerAdapter` 注册（先例 `engine.test.mjs:229-235`；测试进程内 id 唯一、无需卸载）；本批 fixture 自备 `stream.match`（命中本地答复路由）+ `stream.parse`（静态 `finished` 体 ⇒ 单可 done）、`openSession` 换计数桩；**读数主判 = 进程内计数对象**（`state.openSessions++`），日志行（`复用会话（` / `新会话（原因=`）为佐证。引擎侧 = `new TaskRunner({ browser, log, emit })` 直接构造（先例 `:239`）；`sessionPolicy` 为构造器可选入参（测试可覆盖；生产缺省 `?? new SessionPolicy()`）；每例 `finally` 收尾（`browser.closeAll()` + `server.close()`，先例 `:269-272`）。
- 边界：`loop.test.mjs` 不动（真机回归）；不新增 `verify:*` 命令。
- 验收：J1–J5 / J7 / J8 / J9 逐条读数。
- 依赖：T2 / T3。

### 对草案的复核（修正与澄清；逐条给理由）

1. **§7.3「`send` 失败须在 sending 段同步写 `recordOutcome`」——修正**：写回落点 = **每次引擎 run 的 finally**；重试 = 主进程发起的**新引擎 run**（`execution.mjs` 循环），失败 run 已落 `error` ⇒ 重试 run 自然新会话。草案前提（「终态可能已是 done」）混淆了任务终态与引擎 run 终态 ⇒ 无需 sending 段补写（D4）。
2. **文件的草案路径校正**：`src/config-schema.mjs` ⇒ 实际 `src/main/config-schema.mjs`（205 行）；`src/engine/session-policy.test.mjs` / `task-runner.test.mjs` ⇒ 按项目惯例改为**批内归档单元**（`docs/batches/b5-session-reuse.units.mjs`）+ 集成拆件（D10）。
3. **`host.mjs` 不改**（草案 +6 行）：方案 A 下 `TaskRunner` 于构造器缺省自建 `SessionPolicy`（`?? new SessionPolicy()`），而 `TaskRunner` 是**引擎级单例**（`createEngine` 内构造一次——`src/engine/host.mjs:40` / `:49`）⇒ 策略单元跨单存活（不变量 = 评审 #6，见 `browser-engine.md` §9 与机制设计 1）；`host.mjs`（173 行）无需动（D1）。
4. **`task.sessionCreatedThisTask` 字段——取消**（草案 1.4）：`markNewSession` / `recordOutcome` 两个调用点已覆盖 `sessionStartedAt` 与终态写回，不新增 task 字段（少一处状态）。
5. **草案「取消是否污染」的待实测定位（③）** ⇒ U3：取值不依赖读数（无论读数如何都取保守换新）⇒ 不设探针。
6. **草案 5.2 的 `manifest.session`** ⇒ D8/U6：本批默认不加（返回面风险 + 4 点扩散 vs 收益）。
7. **补强**：探针面补 P2（Kimi 复用读数）——机制平台无关且 Kimi 已注册可选；草案只覆盖 DeepSeek。
8. **概念状态表转实现**：草案 §1.3 的 `absent/active/expired/faulted/logged_out/replaced` 概念态落为 **reason 域**（`disabled|absent|replaced|error|canceled|ttl|count|reuse`）+ 单元字段，语义不变。

### 机制设计（会话复用；落地所依）

1. **会话单元**：内存态、按 `workerId` 隔离、不落盘 —— `{ pageRef, sessionStartedAt, taskCount, lastTaskEndedAt, lastOutcome }`。**不变量：单元实例锚定引擎进程生命周期**——装配于 `createEngine`（`src/engine/host.mjs:40`）、由引擎级 `TaskRunner`（`:49` 构造一次）持有、跨 `task.run` 复用；引擎重启 ⇒ 实例消失 ⇒ 首单 `absent`（评审 #6；机制权威 = `browser-engine.md` §9）。
2. **判断时点**：opening、`openSession` 之前（`task-runner.mjs:157-159` 原位）——`ensureOnPlatform(:148)` / `waitForLoginState(:150)` 之后；登录检查每单照做。
3. **判定顺序（`decide`，首个命中为准）**：`disabled`（`reuse:false`）→ `absent`（无单元）→ `replaced`（`pageRef` 不一致 = 上下文重启过）→ `error` → `canceled` → `ttl`（`now > lastTaskEndedAt + ttlMs`）→ `count`（`taskCount >= maxTasksPerSession`）→ `reuse`。返回 `{reuse, reason, taskCount, idleMs}`。
4. **写回（`recordOutcome`；每个引擎 run 的 finally，per-attempt）**：按 result 派生 `done` / `error` / `canceled` 落 `lastOutcome`——判别 = `result.canceled === true` ⇒ `canceled`；否则 `result.error` 非空 ⇒ `error`；否则 `done`（取数点 `src/engine/task-runner.mjs:95` / `:223-225` / `:236-237`）；`done` 才 `taskCount++`；均更新 `lastTaskEndedAt`；守卫 = 仅 `adapter?.capabilities?.newChat !== false` 记账（无会话概念的适配器不记账）。
5. **配置取用（方案 A）**：主进程经 `task.run.session` 透传；引擎缺省回落 `DEFAULT_SESSION_CONFIG`（与 `DEFAULT_TIMEOUTS` 同口径；两处默认值须一致）。
6. **日志**：`复用会话（taskCount=… idleMs=…）` / `新会话（原因=…）`（进 `logs/app.log`，兼作人工场景读数）。
7. **与既有机制的关系**：`worker.check` 不建会话 / 不写单元（§1 已核；实现期如观测到异常按缺陷处置）；降级换人 ⇒ `workerId` 不同、单元独立；`browser.close(workerId)`（opening 超时清理，`:257`）⇒ 下一 run `pageRef` 不一致 ⇒ `replaced`；引擎重启 ⇒ 单元消失 ⇒ 首单 `absent`。
8. **复用 × DOM 兜底**：兜底须锚定本单回合——`send()` 记基线、`collect` 只取基线后的新回合（约束权威 = `adapters.md` §3.4；判据 = J9）。

### 受影响文件与测试面（文件计划；行数 = 现况 → 预期，实施后按实际回调；行数口径 = `read` 工具读数）

| 文件 | 现状 → 预期 | 职责 / 改动 | 拆分备注 |
|---|---|---|---|
| `src/engine/session-policy.mjs` | 新增 ~130 | 状态机 + `DEFAULT_SESSION_CONFIG` + 冻结接口 `decide` / `markNewSession` / `recordOutcome`（不 import Playwright，可单测） | — |
| `src/engine/task-runner.mjs` | **283 → ≤293**（净增 ≤10） | 决策 / 记账全推新模块；本件只留 import + 构造器注入 + run 参数 + opening 一处调用 + finally 一处调用 | **越档拆分方案（§1 指令，已内建）**：方案即「决策/记账全推 `session-policy.mjs`」；若末测 >300 ⇒ 把 finally 写回升进 `recordOutcome`（含 result 派生与 try/catch）并把 opening 调用收成单行；仍越 ⇒ 会话接线抽 `task-runner.session.mjs` |
| `src/main/config-schema.mjs` | 205 → ~228 | `DEFAULT_CONFIG.session` + `normalizeConfig` 块（非对象 ⇒ 整块回退 + issue；`ttlMs` pickNumber(1..MAX_INT)；`maxTasksPerSession` pickNumber(1..1000)；`reuse` pickBoolean；`reuse:false` 时其余保留不报错） | — |
| `src/main/scheduler/execution.mjs` | 287 → ~289 | `task.run` 入参 +1 行 `session`（同 `toggles` 形） | 若异常越 300 ⇒ 入参组装抽件 |
| （不改）`src/engine/host.mjs` | 173 | 方案 A 无需动 | — |
| （条件）`src/engine/adapters/deepseek-stream.mjs` / `kimi-stream.mjs` | 111 / 154 → 触发时各 ≤ +~6 | D7 扩面（`matchStreamUrl` / `match` 纯函数 + 单元例）；**D7 未触发 ⇒ 本行不实施（0 行改动）** | — |
| `src/engine/adapters/deepseek.mjs` / `deepseek-dom.mjs` / `kimi.mjs` / `kimi-dom.mjs` | 138 / 63 / 76 / 35 → 各 ≤ +~12 | DOM 兜底锚定（评审 #9）：`send()` 记基线 / `collect` 只取基线后的新回合；不触 `deepseek-page.mjs` / `kimi-page.mjs` | — |
| `test/integration/engine-helpers.mjs` | 新增 ~80 | 抽件：`freshRoot` / `writeBrowserConfig` / `makeBrowser` / `startFixtureServer` | — |
| `test/integration/engine.test.mjs` | 274 → ~230 | 抽件重构（3 例行为不变） | 274 + 新场景必越 300 ⇒ 拆件即此 |
| `test/integration/engine.session.test.mjs` | 新增 ~230 | 7 场景（J1–J5 + J8 + J9） | — |
| `docs/batches/b5-session-reuse.units.mjs` | 新增 ~155 | 决策表（含注入 `now` 的 TTL 边界）/ 写回派生 / normalize 用例（入口即测试） | 超 300 按对象拆 |
| `package.json` | 32 → 32 | `verify:engine` 行改双文件命令 | — |
| `docs/design/modules/browser-engine.md` | 90 → ~92 | §9 首版已落（`:66–:89`）；本轮评审修 +不变量 / +result 派生判别 / +DOM 兜底交互；§8 场景表（:63） | 本轮已落 |
| `docs/design/modules/adapters.md` | 166 → ~168 | §2 接口注释（:26）/ §3.2 执行流水（:54）会话口径随动；§3.4 本单锚定约束（:79）+ §5.1 Kimi 注（:145） | 本轮已落 |
| `docs/design/modules/scheduler.md` | 125 → 125 | §2 / §7（:91）/ §10 / §11（:123）；本轮 #4 为同位替换，净 0 | 本轮已落 |
| `docs/design/overview.md` | 311 → 311 | §3.2 数据流（:116）/ §4 配置例 + 键条（:190/:198）/ §13 行（:298）；本轮 #4 为同位替换，净 0 | 本轮已落 |
| `probe/probe19-b5-session-reuse.mjs` / `probe/probe20-b5-kimi-session-reuse.mjs` | 新增 259 / 252（实施实测） | P1 / P2（工程工具面） | 照实披露 |

**冻结接口（本批实现不得偏离）**：
- `SessionPolicy`：`decide({workerId, now, config, page}) → {reuse, reason, taskCount, idleMs}`；`markNewSession(workerId, {reason, page, at})`；`recordOutcome(workerId, {outcome, at})`；reason 域 = `disabled | absent | replaced | error | canceled | ttl | count | reuse`；outcome 域 = `done | error | canceled`。
- `DEFAULT_SESSION_CONFIG = {reuse:true, ttlMs:600000, maxTasksPerSession:5}`（引擎侧与 `config-schema` 两处一致）。
- `task.run` 新增**可选**入参 `session`（上三键；缺省 ⇒ 引擎默认）；**MCP 工具面零改动**。
- 日志行形（正则可判）：`复用会话（taskCount=` / `新会话（原因=`。
- 错误码表封闭（不新增码）；环境变量名无新增。

### 验收对照（机器判据 + 读数口径）

**机器命令（逐条给读数）**：

1. `node --test docs/batches/b5-session-reuse.units.mjs`（**J7**）—— 判据 = 决策表全绿：`absent ⇒ 新建` · `reuse ⇒ 复用` · `ttl ⇒ 换新` · `count ⇒ 换新` · `error ⇒ 换新` · `canceled ⇒ 换新` · `reuse:false ⇒ disabled` · `pageRef 变化 ⇒ replaced` + 判定优先级 + 写回语义（done 计数 / error·canceled 落标记）+ normalize 非法项回退；TTL 边界（注入 `now`：`now = lastTaskEndedAt + ttlMs` ⇒ 复用、`+1ms` ⇒ 换新——**J2 主判据**，评审 #12）；写回派生（`result.canceled === true ⇒ 'canceled'`）。
2. `npm run verify:engine`（**J1–J5 / J8 / J9**；= 抽件后既有 3 例 + `engine.session.test.mjs` 7 场景）—— 读数口径 = **fixture 计数对象**（`state.openSessions`，主判）+ 引擎日志行（佐证）；注入缝隙与 fixture 契约见 T4（适配器注册先例 `engine.test.mjs:229-235` · `TaskRunner` 直构先例 `:239` · `finally` 收尾先例 `:269-272`）：
   - **J1 连续两单复用**：两单均 `done` ⇒ 计数 = **1**；第二单日志 = `复用会话（`。
   - **J2 TTL 到期换新**：`ttlMs=1000` + 间隔 ≥1500ms ⇒ 计数 = **2**；日志 = `新会话（原因=ttl）`（**兜底例**；主判据 = 单元面注入 `now` 的 TTL 分支——评审 #12）。
   - **J3 出错即换新**：首单注入失败（`E_SEND_FAILED`）⇒ 次单计数 = **2**；日志 = `新会话（原因=error）`。
   - **J4 上限换新**：`maxTasksPerSession=2` 三单 ⇒ 计数 = **2**；第三单日志 = `新会话（原因=count）`。
   - **J5 禁用回退**：`reuse:false` 两单 ⇒ 计数 = **2**；日志 = `新会话（原因=disabled）`。
   - **J8 取消即换新**：首单运行中 `runner.cancel({taskId})` ⇒ `result.canceled === true`；次单计数 = **2**；日志 = `新会话（原因=canceled）`（评审 #8）。
   - **J9 复用 × DOM 兜底**：fixture 页预置上一单回合 + 本单流未捕获（本地请求无响应 ⇒ DOM 路径）⇒ 交付文本 = **本单回合**、不含上一单文本（`delivery.transport = "dom"`）（评审 #9）。
   - 既有 3 例（下载捕获 / profile 复用 / 开关失败）逐字不回归。
3. `npm run verify:loop`（**J6 真机**）—— 判据 = 1/1 pass（单任务链行为不变，读数同今日形）。
4. **回归（父侧收口跑，唯一一次全套）**：`node --test docs/batches/b1-core-loop.units.mjs` 27/27 · `node --test docs/batches/b2-settings-ui.units.mjs` 35/35 · `npm run verify:mcp` 1/1 · `npm run verify:runtime` 2/2（配置面邻近回归）。
5. **人工场景 M（真机连续两单；操作按判据核验）**：经应用连续派两单给同一外包工 ⇒ 读数 = 两单 `manifest.state=done`；第二单 `<userData>/logs/app.log` 含 `复用会话（` 行、**无**第二单 `新会话（` 行；浏览器窗口不新建聊天页。机器化复读依赖 U6（manifest 字段）。

**口径说明**：`verify:loop` 单任务无法机器判「复用」（需同一引擎生命周期内两单 + 结构化读数）⇒ 机器判据落集成面（2）；真机复用 = 人工场景（5）+ P1/P2 平台侧读数。

### 关键决策记录（含被否方案）

- **D1 配置取用 = 方案 A（主进程经 `task.run` 透传 `session`；引擎不自行读配置）**。理由：与 `toggles` / `timeouts` / `limits` 完全同形且有**活先例**（`src/main/scheduler/execution.mjs:148-158`）；单一事实源（`scheduler.md` §10 口径）；配置改值**下次派单即生效**。被否：**方案 B**（引擎自读 `session`，`browser-config.mjs` 式）——启动期快照、生效时机不明，且 `session` 属任务编排策略而非浏览器启动选项。**裁定建议 = A**（§1 同向）；若裁定 B ⇒ T3 改引擎侧读取函数 + host 装配（+`host.mjs` ~6 行）。
- **D2 复用判断时点 = opening、`openSession` 之前**（`task-runner.mjs:157` 原位）。理由：选人期无浏览器状态（跨进程）且违「引擎内部状态」约束；此处页面已就绪、登录已判。被否：选人期判断；任务结束后预判。
- **D3 判定顺序与 reason 域**（见机制设计 3）。`canceled` 独立成 reason（日志归属清晰；取值同为换新）。被否：canceled 并入 error；ttl/count 先于 error。
- **D4 写回时机 = 每次引擎 run 的 finally（per-attempt）**；修正草案 §7.3（见「对草案的复核」1）。被否：sending 段补写（多一改动点、无必要）。
- **D5 默认值 = `reuse:true` / `ttlMs:600000` / `maxTasksPerSession:5`**。理由：用户需求即要此行为；本批无设置界面入口（默认 false 则功能不可达）；两键为阶段边界兜底、值可调。被否：默认 false（等待界面）——功能死、与用户口径相悖。上抛 U2 / U5。
- **D6 配置落法**：顶层 `session` 键（与 `scheduler` 平级）；归一化沿用 `pickBoolean` / `pickNumber` 风格；非法项回退 + issue。被否：`workers[].session`（需求是全局阶段边界；按人另立需求）；并入 `scheduler` 块（语义属会话）。
- **D7 `stream.match` 扩面 = 条件项（待 P1/P2）**：仅纯函数 + 单元例；读数不变则不动。被否：预先扩面（未读数不猜；放宽匹配面有误命中风险）。
- **D8 `manifest.session` = 本批不做（U6）**：返回面风险 + 4 点扩散 vs 观测收益；验收已由集成读数 + 日志承载。备选（若批准）：engine `result.session` → `policy.mjs` → `execution.mjs` 吸收 → `task.mjs` manifest（行数另计）。
- **D9 `task-runner.mjs` 越档处置**：决策 / 记账全推 `session-policy.mjs`（§1 指令）；预期 283 → ≤293；兜底链见文件表「拆分备注」列。被否：会话逻辑内联（283 + ~17 ≈ 300 贴档、无余量）。
- **D10 测试面落法**：单元 = 批次档伴随件；集成 = 新 `engine.session.test.mjs` + 抽件 `engine-helpers.mjs`；`loop.test.mjs` 不动。被否：塞进 `engine.test.mjs`（越 300）；塞进 `loop.test.mjs`（越 300 + 真机无结构化读数）；新开 `verify:*` 命令（集成套件不按变更增命令）。

### 边界与禁止范围

1. 不改 MCP 六件套契约（不加参数 / 不改返回形状；manifest 不加字段——D8/U6）。
2. 不改工单语义：答复仍取「最新一条带结束标记的助手消息」；取件三层不变；一单一单；复用下的 DOM 兜底锚定（T2）= 该口径在本单成立的前提。
3. 不引入并发（每外包工串行维持）。
4. 不做跨外包工会话共享（按 `workerId` 隔离）；不做跨机 / 跨引擎重启持久化（内存态）。
5. 不改适配器接口签名与 capabilities 键集（`openSession` 只改「何时调」；`dom.collect` 只加行为约束——评审 #9，签名不变）；唯一条件例外 = D7。
6. 不做上下文压缩 / 摘要；不做会话预热。
7. 不做服务端会话有效性预检（U4）；不动错误码 / 调度语义 / 重试降级策略。
8. 不改 `worker.check` 语义（不建会话、不写会话单元）。
9. 不含设置界面开关、不改界面文案（U2）。
10. 其它平台不改：Kimi 复用 = 通用机制自然覆盖 + P2 取数；若需扩面 ⇒ D7 同法处理。

### 上抛项

- **U1 需求档缺口（重要）**：`docs/requirements/overview.md` 无会话复用条目 ⇒ 三链同源在需求档侧缺环。建议主 agent 补一条（五要素 + AC-R10-*，判据 J1–J6 映射；§6 映射行随动）。本批按 §1 执行，不阻塞。
- **U2 行为变更确认**：`session.reuse` 默认 `true`（升级后连续派单即复用）且本批无设置界面入口（手改 `config.json`）。请批准时一并确认；如需用户可见开关 ⇒ 另批（涉设置界面）。
- **U3 取消口径**：本批 = `canceled ⇒ 换新`（保守）；若要「取消后仍复用」需用户给判据（污染不可机判）。
- **U4 会话失效预检**：本批不做（兜底链成立）；若要预检 ⇒ 新机制另立设计。
- **U5 默认值上界**：`ttlMs` / `maxTasksPerSession` 上界无读数（探针表 ⑧）；运行期观测回调（值可调）。
- **U6 `manifest.session` 只读字段**：默认不加；如需 ⇒ 用户裁定（涉返回面 + 4 点扩散）。

### 评审轮 1 修订（2026-10-11；定点修、逐号对齐；本段 = 修订记录）

评审发现表 = §3 轮次 1（🔴 1 · 🟡 9 · 🔵 4，`changes-required`）。本轮处置：**逐号 10 条**（1·4·5·6·7·8·9·10·11·12）+ **#14 坐标校正**（开工前已由主包AI 落地，本轮读盘核对一致）+ **2 处同类行数回调**（无评审号，随 #11 类别）。需求档三条（#2/#3/#13）= 主包AI 自修，本段未碰，未改需求档。

| 号 | 处置 | 落点与现行原文（行号 = 本档 read 工具读数） |
|---|---|---|
| 1 | ✅ adapters.md 随动 | `adapters.md:26` 接口注释「新建聊天会话（何时新建由 …browser-engine.md §9 判定；复用命中 ⇒ 不调用）」· `:54` 执行流水第 1 步「会话准备…复用命中 ⇒ 沿用当前会话（不调 `openSession`）；未复用 ⇒ 调 `openSession` 新建」· `:32` dom 注释「本单回合…（b5 起锚定本单）」；且已入「设计档落点」（本档 :62）与文件表（:154，166 → ~168） |
| 4 | ✅ 概述随动 | `scheduler.md:91`「opening（打开页面 / 会话复用判断（未复用则新会话） / 应用外包工开关）」· `overview.md:116`「打开页面并按会话复用判定（复用命中 ⇒ 沿用当前会话；未复用 ⇒ 新会话，见 §9）」 |
| 5 | ✅ 名统一（冻结接口为准） | `decide` / `markNewSession` / `recordOutcome`：本档 :95 / :141 / :130 / :131 / :142；`applyOpeningSession` / `recordTaskOutcome` 在**活面零残留**（设计档 + §2 已检；§3 评审表属记录面，不动） |
| 6 | ✅ 不变量 + 锚点 | `browser-engine.md:70`「**不变量：单元实例锚定引擎进程生命周期**——单实例装配于 `createEngine`（`src/engine/host.mjs:40`）、由引擎级 `TaskRunner`（`:49` 构造一次）持有、跨 `task.run` 复用」；本档机制设计 1（:128）与复核 3（:119）同载 |
| 7 | ✅ 读数缝隙 | 本档 T4 新增「注入缝隙」（:110）：fixture 注册先例 `engine.test.mjs:229-235`；`sessionPolicy` = 构造器可选入参 + `??` 缺省；主判 = 计数对象、日志行佐证；`finally` 收尾先例 `:269-272`；验收 2 口径行随动（:171） |
| 8 | ✅ canceled 判别 + 读数 | `browser-engine.md:86`「`result.canceled === true` ⇒ `canceled`；否则 `result.error` 非空 ⇒ `error`；否则 `done`（取数点 `task-runner.mjs:95` / `:223-225` / `:236-237`；主进程同口径 `policy.mjs:92-93`）」；新增 **J8**（本档 :177，集成例：`runner.cancel` ⇒ 次单计数 = 2、`新会话（原因=canceled）`） |
| 9 | ✅ 复用 × DOM 兜底 | `adapters.md:79`「本单回合锚定」约束（`send()` 记基线、`collect` 只取基线后新回合；无新回合 ⇒ 空串 ⇒ `E_NO_RESPONSE`）+ `:145` Kimi 同口径注 · `browser-engine.md:88` 交互条 · 本档机制设计 8（:135）；新增 **J9**（本档 :178：交付文本 = 本单回合、不含上一单文本）；边界口径随动（本档 :55「不在本批」/ :202 / :205） |
| 10 | ✅ 条件行行数 | 文件表 :146：`deepseek-stream.mjs / kimi-stream.mjs = 111 / 154 → 触发时各 ≤ +~6`；并写明「**D7 未触发 ⇒ 本行不实施（0 行改动）**」 |
| 11 | ✅ 行数回调 | 文件表 :153：`browser-engine.md 90 → ~92`（90 = 落位后实录；`64` 为改动前读数，已删不留残句）；同类回调：`:149` engine.test.mjs 274 · `:155` scheduler 125 · `:156` overview 311；表头补行数口径（:137 = `read` 工具读数） |
| 12 | ✅ J2 主判据下沉 | 验收 1（:170）：注入 `now` 的 TTL 边界（恰等 ⇒ 复用 / +1ms ⇒ 换新）= **J2 主判据**；集成墙钟例（:173）标为「兜底例」 |
| 14 | ✅ 坐标校正 | 「设计档落点」overview 条（:64）现为 `:190/:198`（开工前已落；本轮读盘核对与 `overview.md:190/:198` 实况一致） |

**范围纪律（本轮）**：未改 `src/**` · `test/**` · 需求档 · 其它批次档；未改 MCP / 协议 / 错误码 / 调度语义；未新开机制——#9 的锚定 = 既有兜底在新前提下的约束补强（接口签名不变）；#8 的判别 = 现行 result 形状的显式化（`canceled` 标志已存在于 `task-runner.mjs:95/:223-225/:236-237`）。

**附带发现（非阻塞，报而不改）**：`docs/batches/b3-kimi-adapter.md:112`（b3 已收口记录）存「`openSession` 每单独立」旧口径——属已冻结的记录面（历史），未动；如需在新批次里回指 b5 口径，由主包AI 裁定。

## §3 设计评审（评审子代理）
**状态行**：评审完成（第 2 轮（旧 14 条全部 Fixed；新增文档面 🟡 1，不阻塞）；口径 = VERDICT pass）



### 轮次 1（评审子代理）

**本轮评审面**：批次档 §2 + §1 · `docs/design/modules/browser-engine.md` · `scheduler.md` · `adapters.md` · `docs/design/overview.md` · `docs/requirements/overview.md`（源码/草案/探针产物不在范围；无 AGENTS.md、无文档地图、无标准档 ⇒ 方法学与文档归属按三链同源自查口径判定，已在报告中声明限制）。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Document ownership | 🔴 | `adapters.md` 仍按「每单一条独立会话」描述执行流水与 openSession 语义，与 `browser-engine.md` §9 的复用机制相矛盾（同一机制两处不同描述；§2 同步清单只列 browser-engine / scheduler / overview，无 adapters）。证据：`adapters.md:54`「新会话（`capabilities.newChat`）——每单一条独立会话。」`adapters.md:26`「新会话（每单独立，避免上下文污染）」 vs `browser-engine.md:83`「\| 8 \| 其余 \| 复用（跳过 `openSession`） \| `reuse` \|」`browser-engine.md:68`「同一外包工**连续任务复用同一聊天会话**」 | 把 adapters.md 两处（§2 接口注释 + §3.2 执行流水第 1 步）改为与新判断时点一致的表述（何时新建由 browser-engine §9 决定；复用命中时不调 openSession），并把 adapters.md 列入本批同步清单与文件计划行 |
| 2 | Requirements | 🟡 | 需求档 R10 块尾出现两条「依赖」：`requirements/overview.md:290`「**依赖**：R1（端点与工具面）、R7（接入说明）、b2 界面、b4 打包。」实为 R9 的依赖（R9 五要素缺「依赖」，R10 自己的依赖在 :288） | 删除 :290 行或把它移回 R9 验收段之后；R10 只保留 :288 一条依赖 |
| 3 | Requirements (traceability) | 🟡 | §6 映射把 AC-R10-4 载体写成 `verify:loop`，与本批设计口径冲突：`requirements/overview.md:331`「真机 / 人工（`verify:loop` 连续两单）」 vs `b5-session-reuse.md:176`「`verify:loop` 单任务无法机器判「复用」」，且 `design/overview.md:299` 的 verify:loop 亦为单任务链 | 把 :331 括注改为「真机 / 人工（连续两单操作 + 日志行核验）」，与 AC-R10-4 条文（:286）及 §2 人工场景 M 对齐 |
| 4 | Doc-state（跨档滞后） | 🟡 | 两处概述性文字仍写「每单新会话」：`scheduler.md:91`「opening（打开页面 / 新会话 / 应用外包工开关）」（同档 §2 已改为「会话复用判断（未复用则新会话）」:17）；`design/overview.md:116`「引擎按外包工取浏览器上下文（复用已有则开新会话）」 | 两句补上新条件下的一分句（复用命中 ⇒ 不新建），或引用 browser-engine §9 作为口径来源 |
| 5 | Clarity | 🟡 | 同一批内两套助手名并存：T2/文件表用 `applyOpeningSession` / `recordTaskOutcome`（`b5-session-reuse.md:94`、`:137`），冻结接口用 `decide` / `markNewSession` / `recordOutcome`（`:154`），:117 复核又只提 `markNewSession`；冻结接口声明「不得偏离」⇒ 实现者无法判定哪套是契约 | 统一为一套名字（以冻结接口为准），删去另一套 |
| 6 | Clarity / Feasibility | 🟡 | 会话单元实例归属未写死：`b5-session-reuse.md:116`「方案 A 下 `TaskRunner` 缺省自建 `SessionPolicy`，`host.mjs`（173 行）无需动（D1）」+ `:94`「构造器注入 `sessionPolicy`（缺省自建）」，而机制承诺「引擎重启 ⇒ 内存态消失 ⇒ 首单 `absent`」（`browser-engine.md:86`）——若 `TaskRunner` 每 `task.run` 构造，缺省自建会每单清空单元 ⇒ 复用永不成立、J1 必失败；该不变量未写 | 显式写明「一个会话单元实例锚定一个引擎进程生命周期」并指明锚点（实例由 host 持有并跨单复用）；若锚点需 host 侧改动，文件计划同步补行 |
| 7 | Clarity（读数可实施性） | 🟡 | J1–J5 读数依赖「fixture 适配器 `openSession` 计数」（`b5-session-reuse.md:165`），但 T2 边界冻结适配器接口、T4 未写注入缝隙（fixture 适配器如何进入执行链、计数从何处读：进程内注入还是引擎日志计数）；引用的 `engine.test.mjs:229-239` 属跨档证据，本次不可核验 | 写明注入缝隙（参数覆盖 + `??` 默认回落、finally 还原）与读数来源（进程内计数对象或日志行解析），使 J1–J5 逐条可判 |
| 8 | Acceptance criteria | 🟡 | 写回如何从 `result` 判出 `canceled` 未定义：`browser-engine.md:85` 只说「按 result 派生 `done` / `error` / `canceled`」，错误码表封闭、取消后的 result 形状在评审面缺；且 AC-R10-2（`requirements/overview.md:284`）只列 TTL / 出错 / 上限三例，「取消 ⇒ 换新」（F10.3）只有决策表单测（`b5-session-reuse.md:164`），无端到端判据 | 写明 result→`canceled` 的判别字段 / 信号，并为该分支补一条可判读数（集成例或人工场景） |
| 9 | Requirements coverage | 🟡 | 复用引入「页面已存在上一单答复」新前提，而 DOM 兜底完成判据是页面级：`adapters.md:75`「取「最后一个助手回合」范围」+ `adapters.md:77` 触发条件 = 网络流未捕获 +「DOM 文本连续稳定」⇒ 复用下旧答复长期稳定，兜底可能把上一单答复判成本单结果（静默错交付）；§2 边界「不改工单语义」（`b5-session-reuse.md:55`）无判据支撑，J1–J7 / AC-R10-* 亦无该组合场景（实现不可核验，故列咨询项） | 在设计里给出复用与 DOM 兜底的交互约束（兜底须锚定本单回合，或复用命中时按本单回合出现判定），并补一条判据 |
| 10 | Affected-file annotation | 🟡 | 条件改动行缺行数标注：`b5-session-reuse.md:142`「（条件）`src/engine/adapters/deepseek-stream.mjs` / `kimi-stream.mjs` \| 视 P1/P2 读数」——无现状行数与增量（表头声明「行数 = 现况 → 预期」） | 补两文件现状行数与 `≤±N` 预期，或写明 D7 未触发时该行不实施 |
| 11 | Doc hygiene（数值） | 🔵 | 文件表该行与磁盘不符：`b5-session-reuse.md:148` 写 `docs/design/modules/browser-engine.md`「64 → ~105」且备注「本轮已落」，而该文件当前 90 行（§9 = :66–:89 已落）——「现状」列行间语义不一致 | 按实际回调该行，或注明该行「现状」= 改动前读数 |
| 12 | Test fragility | 🔵 | J2 以墙钟间隔判 TTL：`b5-session-reuse.md:167`「`ttlMs=1000` + 间隔 ≥1500ms ⇒ 计数 = 2」 | TTL 分支主判据放冻结接口 `decide({…, now})` 的纯函数单测（注入 now），墙钟例只作兜底 |
| 13 | Doc hygiene（记录面 + 错字） | 🔵 | 需求档记录面未随 R10 更新：`:4`「> **台账**：需求池条目 #1–#6（免费外包 · 归批）。」（R10 台账 = #19；R7–R9 亦未入），变更记录（:6–:12）无 R10 追加行（R7/R8/R9 均有）；另 `:278`「不做跳外包工会话共享」（「跳」应为「跨」） | 补一条 2026-10-11 R10 追加的变更记录行、更新台账口径、改「跳」为「跨」 |
| 14 | Citation accuracy | 🔵 | `b5-session-reuse.md:63` 引 `design/overview.md:189/:198` 指「§4 配置样例 + `session` 键条」，实例中 `session` 行在 :190（:189 是 `scheduler` 行），:198 正确 | 把 :189 改为 :190（或写明 :189–:190 区间） |

**范围外备查（不给严重度）**：① 免费外包产出的草案原文（`outbox/20261011-160743-fd85/answer.md`）不在评审范围 ⇒ §2「对草案 8 处复核」按 §2 自述与设计档交叉核对，未逐条对草案原文复核；② §1 的跨档证据（`probe/out4/run.log:10/:16`、`src/main/scheduler/execution.mjs:148-155`、`src/engine/task-runner.mjs:157`、各源码行数 283/287/205/173）在范围外未核验，行数自查仅做到「表内一致 + 与 §1 事实表一致」（目录级已核：`probe/` 现有 out/…out18、probe4–probe18，19/20 号不冲突；文件计划中标「新增」的三个文件在盘上确不存在；`.browser-profile/` 存在，双平台登录态未验）。本轮已核的在范围读数：`browser-engine.md:63/:68/:83/:85/:86`、`scheduler.md:17/:91/:111/:123/:124`、`design/overview.md:190/:198/:298/:299/:310`、`requirements/overview.md:261–290/:330–331`、`adapters.md:26/:54/:75/:77`、批次档 `:55/:63/:94/:116/:117/:137/:142/:148/:154/:164/:165/:167/:176` 均与文内引用一致（除第 11、14 条）。

计数：🔴 1 · 🟡 9 · 🔵 4

VERDICT: changes-required

### 轮次 2（评审子代理）

**轮次 2 评审面**：批次档 §1/§2（含 `:221–:241` 修订记录）· `docs/design/modules/browser-engine.md` · `docs/design/modules/scheduler.md` · `docs/design/modules/adapters.md` · `docs/design/overview.md` · `docs/requirements/overview.md`——全部用 `read` 复读后逐字核对（源码 / 探针产物 / 草案原文仍不在范围）。

**旧 14 条处置核对（全部 Fixed）**

| # | Orig# | 文件 | 严重度 | 状态 | 本轮 read 证据（逐字） |
|---|-------|------|--------|------|----------------------|
| 1 | 1 | docs/design/modules/adapters.md | 🔴 | Fixed | `:26`「新建聊天会话（何时新建由 docs/design/modules/browser-engine.md §9 判定；复用命中 ⇒ 不调用）」· `:54`「复用命中 ⇒ 沿用当前会话（不调 `openSession`）；未复用 ⇒ 调 `openSession` 新建」；已入同步清单 `b5-session-reuse.md:62` 与文件表 `:154`（166 → ~168）；全库 grep「每单独立 / 每单一条 / 独立会话」在该文件零残留（仅命中 b3 已收口记录 `b3-kimi-adapter.md:112` 与本批记录面） |
| 2 | 2 | docs/requirements/overview.md | 🟡 | Fixed | `:262`「**依赖**：R1（端点与工具面）、R7（接入说明）、b2 界面、b4 打包。」（R9 归位，位于 AC-R9-4 之后）· R10 依赖唯一一条 `:293` |
| 3 | 3 | docs/requirements/overview.md | 🟡 | Fixed | `:335`「真机 / 人工（连续两单操作 + 日志行核验）」——不再声称 `verify:loop` 覆盖 AC-R10-4 |
| 4 | 4 | docs/design/modules/scheduler.md · docs/design/overview.md | 🟡 | Fixed | `scheduler.md:91`「opening（打开页面 / 会话复用判断（未复用则新会话） / 应用外包工开关）」· `overview.md:116`「打开页面并按会话复用判定（复用命中 ⇒ 沿用当前会话；未复用 ⇒ 新会话，见 `modules/browser-engine.md` §9）」 |
| 5 | 5 | docs/batches/b5-session-reuse.md | 🟡 | Fixed | 活面名唯一：`:95`「冻结接口 `decide` / `markNewSession` / `recordOutcome`——名以「冻结接口」为准」· `:141` · `:160`；grep 全库旧名只命中 `:229`（修订记录自述）与 `:258`（§3 轮次 1 记录面）⇒ 活面零残留成立 |
| 6 | 6 | docs/design/modules/browser-engine.md | 🟡 | Fixed | `:70`「**不变量：单元实例锚定引擎进程生命周期**——单实例装配于 `createEngine`（`src/engine/host.mjs:40`）、由引擎级 `TaskRunner`（`:49` 构造一次）持有、跨 `task.run` 复用（不随单重建）」；批次档 `:128` / `:119` 同载（host.mjs 读数属范围外，未核） |
| 7 | 7 | docs/batches/b5-session-reuse.md | 🟡 | Fixed | `:110`「**注入缝隙（评审 #7）**」整段（fixture 注册 · `sessionPolicy` 构造器可选入参 + `??` 缺省 · 「读数主判 = 进程内计数对象」· finally 收尾）· `:171`「读数口径 = **fixture 计数对象**（`state.openSessions`，主判）+ 引擎日志行（佐证）」 |
| 8 | 8 | docs/design/modules/browser-engine.md | 🟡 | Fixed | `:86`「`result.canceled === true` ⇒ `canceled`；否则 `result.error` 非空 ⇒ `error`；否则 `done`」；新增 J8 = `:177`；需求档 AC-R10-5 `:290` + §6 映射 `:334` |
| 9 | 9 | docs/design/modules/adapters.md | 🟡 | Fixed | `:79`「本单回合锚定（b5 起，所有适配器通用）」+「无新回合 ⇒ 返回空串」；`:145`「复用下的本单锚定（b5）」；`browser-engine.md:88`「DOM 兜底不得以「页面最后一个稳定文本」作完成判据」；J9 = `:178`；需求档 AC-R10-6 `:291`；边界随动 `:55`/`:202`/`:205` |
| 10 | 10 | docs/batches/b5-session-reuse.md | 🟡 | Fixed | `:146`「111 / 154 → 触发时各 ≤ +~6」+「**D7 未触发 ⇒ 本行不实施（0 行改动）**」；DOM 锚定四文件行数另列 `:147`（138 / 63 / 76 / 35 → 各 ≤ +~12） |
| 11 | 11 | docs/batches/b5-session-reuse.md | 🔵 | Fixed | `:153`「90 → ~92」（实测：该文件本轮 read = 92 行、§9 收于 `:91`；90 = 落位后实录，改动前「64」已删不留残句）· 表头口径 `:137`「行数口径 = `read` 工具读数」· 同类回调 `:149`/`:155`/`:156` |
| 12 | 12 | docs/batches/b5-session-reuse.md | 🔵 | Fixed | `:170`「TTL 边界（注入 `now`：`now = lastTaskEndedAt + ttlMs` ⇒ 复用、`+1ms` ⇒ 换新——**J2 主判据**，评审 #12）」· `:173` 墙钟例标「（**兜底例**；主判据 = 单元面注入 `now` 的 TTL 分支——评审 #12）」 |
| 13 | 13 | docs/requirements/overview.md | 🔵 | Fixed | `:5`「> **台账**：需求池条目 #1–#9、#19（免费外包 · 归批）。」· `:14` R10 变更记录行 · `:281`「不做跨外包工会话共享」（跳→跨） |
| 14 | 14 | docs/batches/b5-session-reuse.md | 🔵 | Fixed | `:64`「§4 配置样例 + `session` 键条（:190/:198）」与 `docs/design/overview.md:190`/`:198` 实况一致 |

**新发现（本轮）**

| # | 文件 | 严重度 | 状态 | 证据（本轮 read 逐字） | 处置建议 |
|---|------|--------|------|----------------------|----------|
| 15 | docs/batches/b5-session-reuse.md | 🟡 | New（文档面滞后，非机制面；报而不改，不阻塞） | AC-R10-5/6 落需求档后本档未随动：`:53`「J6/J7 与判据补强 J8/J9 为设计侧条目」· `:36`「并在 §6 映射表补两行（AC-R10-1..3 命令、AC-R10-4 真机·人工）」 vs `docs/requirements/overview.md:334`「| AC-R10-1..3、AC-R10-5..6 | b5 | 命令（`verify:engine` 集成读数） |」 | 把 `:53` 映射括注与 `:36` 的 AC 面同步到 AC-R10-1..3 / R10-5..6 / R10-4 |

**范围外 / 无严重度观察**：① `docs/design/modules/adapters.md:101`「应用时机：opening 阶段、新会话打开后、发送前」与 `:75`「取「最后一个助手回合」范围」在复用命中时不成立（受 `:79` 锚定约束兜底）——轮次 1 未点名、非本轮修复引入，仅备查；② `docs/design/overview.md:4`「> **依据**：需求档 R1–R9；」未含 R10（同类记录面滞后）；③ 源码行数与跨档引用（host.mjs:40/:49、engine.test.mjs:229-239/:239/:269-272、execution.mjs:148-155、task-runner.mjs:95/:223-225/:236-237）在评审面外，未核；④ b3 已收口记录 `b3-kimi-adapter.md:112` 旧口径（本档 `:241` 已披露）。

计数：旧 14 条 = Fixed 14（🔴 1 · 🟡 9 · 🔵 4 全落实）；新增 🟡 1（文档面，不阻塞）· 🔵 0 · 🔴 0

VERDICT: pass

## §4 用户批准（主 agent）

### §4 用户批准（2026-10-11）

- **用户原话**：「批准」（2026-10-11 18:15，回应主包AI 的「b5 设计链完成、请批准开工」请求）。
- **批准对象**：本档 **§2**（范围与覆盖 · 第 0 步探针 P1/P2 与 6 项待实测归属 · T1–T4 条目表 · 对草案的 8 处复核 · 机制设计（会话单元 / 判定顺序 / 写回 / 日志）· 受影响文件与测试面（含 `task-runner.mjs` 越档拆分链）· 验收 J1–J9 · 决策 D1–D10 · 边界 10 条 · 上抛 U1–U6）+ **§1 的父侧裁定**（U1–U6 · D1 方案 A · D7 条件项）+ **评审轮 1 的 14 条处置**与**轮 2 pass**（旧 14 条全部 Fixed；残留 🟡 已清）。
- **U2 行为变更确认（用户点头即生效）**：`session.reuse` **默认 `true`** ⇒ 升级后连续派单自动复用同一会话；本批**无设置界面入口**（手改 `config.json`），界面开关并入台账 **#27**。
- **实施范围**：T1 探针（P1 DeepSeek 复用直验 · P2 Kimi 复用读数）→ T2 引擎侧（新增 `session-policy.mjs` + `task-runner.mjs` 接线）→ T3 主进程侧（`config-schema.mjs` 的 `session` 块 + `execution.mjs` 透传）→ T4 测试面（批内单元 + `engine-helpers.mjs` 抽件 + `engine.session.test.mjs`）。
- **成本路线（用户 2026-10-11 16:12 口径）**：能给免费外包的一律给免费外包（**DeepSeek ∥ Kimi 双工位并行**）；付费只做**探针**（外包跑不了浏览器）与**落档验收**（压到最小）。

## §5 实施记录（eng-coder）

**状态行**：实施完成（T1 第 0 步探针 P1/P2 真机取数 —— D7 结论：不触发（两平台 URL 面均不变）；内部审计 acceptable · 代码评审 pass）

### T1 交付摘要（第 0 步探针）

**交付物（工程工具面；未触 `src/**` · `test/**` · `docs/**` · MCP/协议面；未提交任何产物）**

- `probe/probe19-b5-session-reuse.mjs`（P1 DeepSeek 复用直验，259 行）+ 产物 `probe/out19/{run.log,result.json}`
- `probe/probe20-b5-kimi-session-reuse.mjs`（P2 Kimi 复用读数，252 行）+ 产物 `probe/out20/{run.log,result.json}`
- 两探针只读复用 `.browser-profile` 登录态；答复取值 = 引擎同款纯函数（`parseSSE` / `parseChatStream`，自 `src/` 只读 import）

**真机运行（命令 + 读数）**

- `node probe/probe19-b5-session-reuse.mjs`（2026-10-11 18:18，84.4s，exit 0）：新会话 → 同会话连发 8 单（S1–S8）→ idle 60s → 第 9 单（S9-idle60s）。9/9 请求 URL 全量 = `https://chat.deepseek.com/api/v0/chat/completion`（现状匹配面 `matchStreamUrl` 逐单命中）；`chat_session_id` 9/9 同值 `d3de68c2-f1ee-4e51-a47b-2683023c90b1`（首单即带 id、`parent_message_id` 依次 2/4/…/16 ⇒ 同会话续聊）；9/9 `finished=true`；无 429/风控线索。
- `node probe/probe20-b5-kimi-session-reuse.mjs`（同日 18:19，12.3s，exit 0）：同会话连发 2 单。2/2 命中 `/kimi.gateway.chat.v1.ChatService/Chat`、`finished=true`；id 级证据 = 第 1 单请求 `chat_id=null`（新会话由该单建立）→ 响应 `chat.id=1a12a79f-0c72-8381-8000-09bda6e609f9` → 第 2 单请求 `chat_id` 同值。

**判定行（D7 逐平台）**

- **P1**：URL 面 **不变**（逐字一致 ∧ 逐单命中现状匹配面）⇒ **D7 不触发**（`deepseek-stream.mjs` 的 `matchStreamUrl` 0 行改动）；② 上下文上限：N=8 全绿 ⇒ **上限未探到**（默认维持 5）；⑧ idle 60s 后同会话再发仍可用（`finished=true`）。
- **P2**：URL 面 **不变**（命中 `/kimi.gateway.chat.v1.ChatService/Chat`）⇒ **Kimi 侧匹配面不动**；两单 `finished=true`。
- 对 §1 父侧免费证据的核对：结论一致（URL 不变）；本次为 **id 级直验**（逐单 `chat_session_id` / `chat_id` 比对），补上 b1 期方法级推断缺的那一层。

### 决策透明表（T1 内；逐条给理由与被否方案）

| # | 决策 | 理由 | 被否方案 |
|---|---|---|---|
| 1 | P1 = N=8 连发 + idle 60s + 第 9 单 | §2 第 0 步探针 P1 判据（① URL 面 / ② 上限 / ⑧ idle 下界一次取齐） | 只发 2 单（缺 ②/⑧ 读数） |
| 2 | 答复取值 = 引擎同款纯函数（只读 import `src/`） | 与产品主通道逐字同源，判定不外推 | 自写解析（与引擎口径可能漂移） |
| 3 | 文件名按父侧派单（`probe19-b5-session-reuse.mjs` / `probe20-b5-kimi-session-reuse.mjs`） | 父侧本轮指令优先于 §2 文件计划旧名（`:82/:83/:157` 记 `probe19-b5-deepseek-reuse.mjs` / `probe20-b5-kimi-reuse.mjs`）⇒ **该三处待父侧回调** | 按 §2 计划旧名（与父侧验收命令不符） |
| 4 | P2 不另点「新建会话」 | 首单请求 `chat_id=null` ⇒ 新会话由该单天然建立，另点反而不便判「复用」 | 与 P1 同形加该步（打断「首单 = 会话第一条」判据链） |
| 5 | 风控停止判据 = 页面文案线索 ∪ 匹配面主通道 HTTP ≥400 | 429/额度类响应体不进页面文本，只按文案会漏（§2 :84 要求「立即停止重试」） | 只扫页面文本 |

### 审计与代码评审（本会话内，轮次与终态）

- **内部背离审计**（explore·只读，对设计/验收逐条对照）：**acceptable** —— 0 🔴；报告 2 项（`idConsistent` 偏松 / P2 死状态 `chatReqs`）+ 命名行数差异 1 项。
- **内部代码评审**（advisor·code，对象 = 两探针 + 两份产物）：**pass** —— 🟡 5 · 🔵 7，全部不阻塞。
- **fix round 1（审计项）**：P2 `idConsistent` 取严（第 2 单请求 `chat_id` 必须等于第 1 单响应 `chat.id`）。
- **fix round 2（评审项，全部已落）**：① 判定行拆分（「URL 逐字一致」∥「是否命中现状匹配面」，D7 只键在命中面）；② ② 判据只把「取到读数且 finished≠true」计为首次失败、未捕获单另行披露；③ 停止判据并入 HTTP ≥400；④ `posts` 全量随产物落盘（`finally`）+ 词表「额度已满」修正；⑤ 补记 `thinkingLen` 与请求载荷开关实值；⑥ 删死状态、登录态读数改「等信号出现（≤8s）再落」。
- **修订后核验（离线重算，不触平台）**：`.thincoder/tmp/check-b5-probe-judgments.mjs` 对两份真机产物重算修订后公式 ⇒ P1/P2 结论与产物原判定**一致**（`[P1 结论一致] true` / `[P2 结论一致] true`）。

### 已知差异与残留（照实）

1. 两份产物由「`posts` 全量落盘」修订之前产出 ⇒ `"posts": []`；POST 全量读数以 `run.log` 为准（P1 23 笔 / P2 66 笔，URL 全量在册）。非验收依赖，复跑可重生成。
2. P1 产物 `answer`/`answerLen`（SSE 正文通道，71–111 字）呈思维链样式，而同单 `domLen=2`（DOM 末块 =「收到」）⇒ 该字段**不宣作「答复长度/内容」证据**（完成判定用 `finished`）。是否平台改版、是否影响引擎答复纯度 = **范围外**，建议父侧另跑一次真机核对。
3. 交付名/行数与 §2 文件计划不一致（决策表 #3；计划 `~150/~90` ⇒ 实测 259/252 行）。
4. 上抛项承 §2 U1–U6 不变；U5 默认值上界仍无读数（本次只给下界旁证：8 连发未触上限、idle 60s 仍可用）。

**进程与端口**：两次真机运行均 `finally` 关上下文（run.log 尾行 `browser closed, exit`）；复核 = 带 `.browser-profile` 的 msedge 进程计数 **0**、无新增监听端口（Playwright 走 `--remote-debugging-pipe`）、临时件仅 `.thincoder/tmp/` 1 件（离线核验脚本）。

## §6 验证与收口（父代理）
