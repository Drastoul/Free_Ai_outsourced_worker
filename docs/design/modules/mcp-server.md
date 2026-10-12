# 模块设计 · MCP 服务面

> 职责：MCP 传输、工具注册与参数校验、错误信封（对外契约的唯一权威处）。
> 不在本文：调度与选人（`docs/design/modules/scheduler.md`）、浏览器与平台（`docs/design/modules/adapters.md`）、产物结构（`docs/design/modules/outbox.md`）、进程与端点总览（`docs/design/overview.md`「进程形态与 MCP 接入」）。

## 1. 边界

- 只管协议面与契约；不改动浏览器、不解析平台页面。
- 工具名与入参一经发布即兼容承诺：改名 / 删参属破坏性变更，须走需求流程。

## 2. 传输与端点

| 路径 | 方法 | 传输 | 说明 |
|---|---|---|---|
| `/mcp` | POST | Streamable HTTP（规范态） | 主推接入路径 |
| `/mcp` | GET | HTTP + SSE 流 | 规范态的可选下行流 |
| `/sse` | GET | 旧式 SSE | 兼容兜底；配套 `POST /messages` |
| `/healthz` | GET | HTTP | 探活，开放（仅本机可达） |

- 能力声明：仅 `tools`（不做 resources / prompts —— 本工具是动作面，不是知识源）。
- 授权：配置 `mcp.token` 非空时，除 `/healthz` 外均要求 `Authorization: Bearer <token>`；默认空（仅 127.0.0.1 可达）。
- 实际端点发布：`<userData>/runtime.json`（主包AI / 操作者据它取得**实际**端口与 URL；字段清单权威 = `docs/design/overview.md`「端口策略与告知宿主」）——`/healthz` 的 `port` 与该文件一致（`npm run verify:runtime` 守门，见 `docs/design/overview.md` §13）。

`GET /healthz` 载荷（200；无需 token）：

```json
{
  "ok": true, "version": "0.1.0", "port": 17873,
  "workers": [{ "id": "w-1", "name": "DeepSeek", "platform": "deepseek", "enabled": true, "status": "ready" }]
}
```

- `ok` / `version` = 服务自述；`port` = 实际监听端口（可能顺延，见 `docs/design/overview.md`「端口策略与告知宿主」）。
- `workers` = 外包工概览（每外包工一条；`status` 词表与 `list_workers` 一致）。

## 3. 工具契约（六件套）

统一返回信封：单个 text 内容块，内容为 JSON；失败时置 `isError: true`，JSON 内含 `code / message / hint`。
各工具的 `description` 用中文书写、面向主包AI（说明用途 + 何时用 + 关键约束）。

**任务视图（TaskView，下文各处引用）**

```
{ taskId, state, phase, worker: {id, name, platform}, selection: {mode, reason},
  attempts: [{worker, result, at}], error: {code, message, hint, needsHuman} | null,
  timings: {createdAt, startedAt, finishedAt}, delivery: {transport, textPath, files: [{name, relPath, bytes, sha256}]} | null }
```

### 3.1 `list_workers`

- 用途：列出外包工与状态（主包AI 据此挑选 `worker` 名）。
- 入参：无。
- 返回：`{ ok, workers: [{ id, name, platform, enabled, status, detail?, lastCheckedAt }] }`；
  `status ∈ ready | login_required | busy | unavailable | disabled`（对外词表；界面徽标同源）。
- 冷却映射：调度内部态 `captcha_cooling` 对外一律映射为 `unavailable`，冷却原因写入 `detail`（如「冷却中：验证码 / 风控」）——不新增枚举值。
- 自定义外包工（b7，`platform = 'custom'`）与内置平台同列；对主包AI 而言仍是「一个外包工」（契约零变化）。
- 错误：无（读操作）。

### 3.2 `dispatch_task`（派单）

- 用途：把任务文本（可选附件）交给外包工执行。
- 入参：

| 参数 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `task` | string | 是 | 非空，长度 ≤ `limits.maxTaskChars` |
| `worker` | string | 否 | 自定义名或条目 id；缺省 = 按优先级（见调度档） |
| `files` | string[] | 否 | 本机绝对路径；数量 ≤ `limits.maxAttachFiles`，单文件 ≤ `limits.maxFileBytes` |
| `waitSeconds` | number | 否 | 0–600，默认 0（立即返回任务号） |

- 返回：`{ ok, task: TaskView }`（`waitSeconds > 0` 时等到终态或到点返回当前态，任务继续跑）。
- 错误（派单期**同步拒绝、不创建任务**）：`E_BAD_ARGS`、`E_BAD_FILE`、`E_WORKER_UNKNOWN`、`E_WORKER_DISABLED`、`E_LOGIN_REQUIRED`、`E_WORKER_UNAVAILABLE`、`E_NO_WORKER`。

**建任务 / 不建任务的边界（与 AC-R4b-2 / AC-R4b-3 对齐）**

- 派单期：入参校验失败 / 指定未登记 / 指定被停用 / 指定对象**缓存态即知不健康** / 优先级路径无任何可用外包工 ⇒ 错误经 MCP 错误信封同步返回，**不建任务**。
- 派单期同步拒绝另含（b7）：带 `files` 且目标外包工平台不支持送件（`upload !== true`，如自定义外包工）⇒ `E_WORKER_UNAVAILABLE`（不建任务、不置冷却）；优先级路径跳过该类外包工。能力位判定取自适配器注册表并归一化（缺项 / 未知平台 ⇒ 按「不支持送件」）——单一来源，见 `docs/design/modules/scheduler.md` §10。
  - **该拒绝的 message 词形**：`该外包工平台不支持送件（附件）：<worker 名>（平台 <platform>）；请去掉附件后重派，或改派支持送件的平台`——明示可用方向（去附件 / 改派）。
  - **hint 不适配说明**：§5 错误码表中 `E_WORKER_UNAVAILABLE` 的 hint 固定为「人工处理后重派」，对「附件不被支持」这一情形会把主包AI 引向无效动作；本情形以 message 的可用方向为准（hint 表不改——错误码表封闭，b7 边界）。
- 任务期：派单时缓存态健康、执行中才发现的错误（opening 登录检查、验证码 / 风控、页面改版、外包工启动失败、引擎故障等）⇒ 任务已创建，按调度规则走终态（默认路径降级；降级耗尽或硬绑定 ⇒ needs_human，见 `docs/design/modules/scheduler.md`）。
- AC-R4b-3 两条复现路径：① 指定对象缓存态即未登录 ⇒ 同步拒绝、不建任务；② 缓存态健康、opening 检查发现登录失效 ⇒ 任务落 needs_human / `E_LOGIN_REQUIRED`。

### 3.3 `get_task`（查单）

- 入参：`{ taskId, waitSeconds? (0–600，默认 0) }`。
- 返回：`{ ok, task: TaskView }`。
- 错误：`E_TASK_UNKNOWN`。

### 3.4 `fetch_result`（取件）

- 入参：`{ taskId, includeText? (默认 true) }`。
- 返回：`{ ok, task, text?, textTruncated?, files: [{name, relPath, bytes, sha256}], outboxDir }`；
  文本超过 `limits.maxInlineTextChars` 时截断并置 `textTruncated: true`（全文在 `answer.md`）。
  `outboxDir` = 该单**实际**交付目录（交付目录不可用时为回落目录，见 `docs/design/modules/outbox.md`「目录结构与实际路径」）。
- 错误：`E_TASK_UNKNOWN`；任务未达终态时返回当前 `task` 且不附 `text`（`hint` 提示继续轮询）。

### 3.5 `cancel_task`（取消）

- 入参：`{ taskId }`。
- 语义：排队中 ⇒ 立即 canceled；执行中 ⇒ 尽力停止（停止收流 / 停止等待下载），状态置 canceled；不关闭浏览器页面；已写出的部分产物保留。
- 错误：`E_TASK_UNKNOWN`。

### 3.6 `attach_files`（附件补送）

- 入参：`{ taskId, files: string[] }`（约束同 `dispatch_task.files`）。
- 语义：仅当任务**尚未发送**（状态 queued 或 running 的 opening / uploading 阶段）时有效——把文件追加进该任务并立即上传。
- 错误：`E_TASK_ALREADY_SENT`、`E_BAD_FILE`、`E_TASK_UNKNOWN`。

## 4. 异步模型与长轮询

- 派单是异步的：平台一条小任务端到端约 8–22 秒（探针基线），宿主不适合阻塞调用。
- 完成靠 `get_task` / `fetch_result` 轮询；`waitSeconds` 提供长轮询以减少往返，上限 600 秒（宿主工具超时未知，取保守值）。
- 进度粒度：`task.phase ∈ opening | uploading | sending | streaming | extracting | finalizing`。

## 5. 错误码（权威表）

| 码 | 触发 | hint（给主包AI 的建议） | needsHuman |
|---|---|---|---|
| `E_BAD_ARGS` | 入参不合法 | 修正参数后重试 | 否 |
| `E_TASK_UNKNOWN` | 任务号不存在（含应用重启前、内存中已无的任务） | 核对任务号；重启前任务的产物仍留在 outbox 目录 | 否 |
| `E_TASK_ALREADY_SENT` | 任务已发送后补附件 | 改为新派单并携带附件 | 否 |
| `E_WORKER_UNKNOWN` | 指定名不在已登记列表 | 用 `list_workers` 取可用名单 | 否 |
| `E_WORKER_DISABLED` | 指定外包工被停用 | 启用或改派 | 否 |
| `E_WORKER_UNAVAILABLE` | 外包工当前不可用（含该外包工浏览器 / profile 启动失败）；指定时硬绑定不降级 | 人工处理后重派 | 是 |
| `E_NO_WORKER` | 派单时无任何可用外包工（缓存态全跳过） | 人工检查登录 / 启用状态 | 是 |
| `E_LOGIN_REQUIRED` | 平台需要登录 | 请人工在打开的窗口登录后重派 | 是 |
| `E_CAPTCHA_OR_RISK` | 出现验证码 / 风控 | 请人工在窗口处理；该外包工进入冷却 | 是 |
| `E_SELECTOR_MISSING` | 页面结构变化（选择器失效）；外包工开关应用失败（开关元素缺失 / 切换后状态不符） | 该外包工暂不可用；需适配器适配（附截图） | 是 |
| `E_SEND_FAILED` | 发送动作失败 | 自动重试后仍失败；可重派 | 否 |
| `E_NO_RESPONSE` | 发送后无响应流 | 可重派 | 否 |
| `E_TIMEOUT` | 阶段或总时长超时 | 可重派；持续出现请检查平台状态 | 否 |
| `E_STREAM_PARSE` | 流解析与 DOM 兜底均失败 | 可重派 | 否 |
| `E_CANCELED` | 已被取消 | 如需继续请重派 | 否 |
| `E_BAD_FILE` | 附件不存在 / 超限 / 非普通文件 | 修正路径与大小后重试 | 否 |
| `E_OUTBOX_WRITE` | 产物落盘失败 | 检查交付目录权限与磁盘空间 | 是 |
| `E_ENGINE_DOWN` | 引擎子进程不可用（引擎级） | 已自动重启；进行中任务 failed（可重派） | 否 |
| `E_INTERNAL` | 未归类内部错误 | 附日志路径 | 是 |

## 6. 参数校验要点

- `worker` 匹配：先按自定义名（trim 后精确），再按条目 id；两者都不中 ⇒ `E_WORKER_UNKNOWN`（hint 附可用名单）。
- `files`：必须为绝对路径、存在、普通文件；数量与大小上限见 §3.2；校验失败聚合成一条 `E_BAD_FILE`（列出每个不合规项）。
- `waitSeconds`：0–600 的整数，越界 ⇒ `E_BAD_ARGS`。

## 7. 验收判据

- `npm run verify:mcp`（集成）：initialize 成功；`tools/list` 恰好六件套且每个入参 schema 齐全、description 中文非空；`/healthz` 返回 200 且载荷含 `ok` / `version` / `port` / `workers`（§2）；
  错误路径：空 `task` ⇒ `E_BAD_ARGS`；未知任务 ⇒ `E_TASK_UNKNOWN`；未知 `worker` ⇒ `E_WORKER_UNKNOWN`（三者均不建任务）。
- 实际端口发布一致性（`npm run verify:runtime`；见 `docs/design/overview.md` §13）：`runtime.json.port` 与 `/healthz.port` 一致、按该端口可探活（AC-R9-1 / AC-R9-2 b1 侧）。
- 文档断言（同一命令内按对象分列执行）：
  - ① `docs/guide/agent-onboarding.md`：四节结构（接入步骤 / 配置片段 / 工具清单 / 调用示例）+ R9 两节（「换机后首次接入」「端点 / 端口变化后如何更新宿主配置」）+「本工具端点配置」节 + 「自定义外包工」节（b7）；
  - ④ `docs/guide/agent-brief.md`：五要素自述（我是谁 / 我提供什么 / 怎么调用 / 出错怎么办 / 何时需要人来操作）；
  - 两份文档内嵌 JSON 片段可解析 + **字段形状断言**（`.mcp.json` 样例 = `mcpServers` 对象形 + `url` 字段；`config.json` 样例 = `mcp.servers` 数组形；形状权威 = `docs/design/overview.md`「端口策略与告知宿主」）；
  - 工具清单与 `tools/list` 对照（AC-R7-1 / AC-R7-3；R9 两节 = AC-R9-4 文档侧；节结构清单见 `docs/design/overview.md`「接入说明的形态与内容」）。
- 对应需求验收：AC-R1-2、AC-R2-2、AC-R4b-2、AC-R7-1、AC-R7-3、AC-R9-1 / R9-2（b1 侧）、AC-R9-4（文档侧）。
