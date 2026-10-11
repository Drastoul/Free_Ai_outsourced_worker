# 免费外包 · 架构设计

> **职责**：回答「怎么实现」——全项目架构与跨模块决策。模块细节见 `docs/design/modules/` 下各文档；需求内容见 `docs/requirements/overview.md`。
> **依据**：需求档 R1–R9；批次档 `docs/batches/b1-core-loop.md` §1（决策 A–H、第 0 步探针实测结论；R8 追加证据 = 探针 4–6，见 §1「追加验证记录」；R9 / F5.7 见 §1「追加需求与裁定（2026-10-09，用户提出）」）。
> **变更记录**：
> - 2026-10-08 初稿（含 b1 实施面与 b2–b4 规划）。
> - 2026-10-08 补「接入说明的形态与内容」一节（R7 追加需求）。
> - 2026-10-08 轮次 1 评审修复（14 条发现逐条处置）。
> - 2026-10-09 R8 追加落位：外包工开关（配置 schema / 应用与核对 / 错误归口 / 验收落点）；下载落盘改 CDP 自动落盘（探针 4–6 实测）；新增 K13。
> - 2026-10-09 R9 与 R5·F5.7 追加落位：端点与发布面（期望 / 实际端口、`runtime.json` 字段清单、两形态接入片段与一键导出、说明文档 R9 两节、`verify:runtime`）与交付目录设置（实际路径解析 / 落点唯一性 / 不可用回落）。
> - 2026-10-09 轮次 3 评审修复（P1–P10）：F9.6 / ③ 批次口径同源（生成 / 一键复制 / 一键导出随 b2）；期望端口写入通道（文件手改）与 ①「本工具端点配置」节；R8 引擎侧数据面（`task.run` 入参 `toggles` / 请求载荷捕获 / 回报形状）；端口顺延耗尽终局（MCP 服务不启动，不引入错误码）；`runtime.json` 生命周期（写 / 覆写 / 退出尽力删除）与 `pid` 判活；`verify:mcp` 文档断言对象写实 + 字段形状；AC-R8-2 日志落点；AC-R5-6 两段复现步骤。
> - 2026-10-09 b2 落位：§2.1 二实例启动 ⇒ 唤起已运行实例（打开并聚焦设置窗口；2026-10-09 主包AI 裁定）。

## 1. 目标与范围

「免费外包」是一个本机常驻工具：主包AI（支持 MCP 的 AI 工具，首发 ThinCoder）通过 MCP 派单，
本工具在本地打开网页版 AI（首发 DeepSeek）执行任务，并把答复与产出文件取回本机 outbox 目录交付。

- **b1 实施面（本批）**：MCP 服务面 + 浏览器引擎 + DeepSeek 适配器 + 任务调度 + 取件交付（需求 R1 / R2 / R3 / R4a / R4b / R7①④ / R8 配置与应用 / R9 端点与发布面——R8·R9 的界面呈现随 b2）。
- **b2**：设置界面（外包工增删改序 / 自定义名 / 登录状态与登录引导 / 接入指引页 R9 呈现 / 交付目录 F5.7）。
- **b3**：Kimi 等平台适配器（加平台＝加模块）。
- **b4**：打包 .exe 与换机安装验收（随包文档与浏览器运行时；AC-R6-*、AC-R9-3 换机操作）。
- 本文不覆盖：需求条目本身（见需求档）、后续批次的模块细设（随批补）。

## 2. 进程形态与 MCP 接入（设计点①）

### 2.1 进程模型

应用为**单实例 Electron 应用**：托盘常驻；设置窗口按需打开（b2）。**二实例启动 ⇒ 唤起已运行实例：打开并聚焦设置窗口**（b2；2026-10-09 主包AI 裁定）。

| 进程角色 | 承载内容 | 生命周期 |
|---|---|---|
| 主进程（Electron main） | 配置、日志、托盘、MCP 服务（端点 + 工具面）、调度器、任务台账、引擎客户端 | 常驻 |
| 引擎子进程（engine host） | Playwright、浏览器引擎、平台适配器、取答复与取件落盘 | 随主进程启停；崩溃可重启 |
| 渲染进程（设置窗口，b2） | 设置界面；只经 IPC 读写配置与查询状态，不直接触达浏览器 | 按需 |

引擎子进程启动方式：`spawn(process.execPath, [engineHostScript], { env: { ELECTRON_RUN_AS_NODE: '1' } })`。
开发期 `process.execPath` 即 electron.exe，打包期即应用 exe——同一代码路径，终端用户机器无需另装 Node。

引擎子进程的**理由**：① 浏览器是长生命周期、易崩的重资源，隔离后主进程（MCP 端点）不被拖垮；
② Playwright 在标准 Node 语义下运行（探针实测环境），避开 Electron 主进程运行时的兼容不确定性；
③ 后续多浏览器实例扩展不需要重构主进程。
**被否方案**：Playwright 直跑主进程内（少一层 IPC，但崩溃与兼容风险全部集中在唯一进程）。

### 2.2 MCP 服务端

- 实现：`@modelcontextprotocol/sdk`（npm 镜像实测可得 1.32.1）。
- 端点（仅绑 127.0.0.1）：

| 路径 | 传输 | 用途 |
|---|---|---|
| `POST /mcp`（同端点 GET 支持 SSE 流） | Streamable HTTP（规范态） | 主推接入路径 |
| `GET /sse` + `POST /messages` | 旧式 SSE（兼容） | 宿主旧客户端兜底 |
| `GET /healthz` | HTTP | 探活：ok / 版本 / 端口 / 外包工概览 |

- 双传输的理由：宿主的 URL 型客户端实现未实测到传输细节，两种都开、成本低（SDK 内置两种传输，共用同一工具注册表）。
- 授权：配置 `mcp.token` 非空时要求 `Authorization: Bearer <token>`（宿主条目支持 `token` / `headers` 字段）；默认空（仅本机可达）。

### 2.3 端口策略与告知宿主

- **期望端口** = 配置 `mcp.port`（默认 **17873**；用户或主包AI 写入即按之启动，重启生效——F9.3）：先按期望端口绑定，被占则 `+1` 顺延（最多 +120）；**+120 内全部被占 ⇒ MCP 服务不启动**（启动期失败，不引入错误码、不进 MCP 错误表）：托盘通知 + 日志（设置界面 b2 同示）明示「端口不可用」与建议（释放占用端口的程序，或改写 `mcp.port` 期望端口后重启）。
- 期望端口的写入通道 = **文件手改**：`%APPDATA%\free-outsource\config.json` 的 `mcp.port` 键（用户或主包AI 经文件工具写入，改后重启生效）——工具面不提供配置读写工具（六件套封闭，见 `docs/design/modules/mcp-server.md`）；主包AI 据此定位与写入的步骤在说明文档 ①（本文 §7「本工具端点配置」节）。
- **实际端口与地址**写入 `<userData>/runtime.json`（即 `%APPDATA%\free-outsource\runtime.json`）——机器可读的发布面，主包AI / 操作者据此取得接入地址；托盘、日志、设置界面（b2）同示**实际**端口，且与 `runtime.json` 一致。**生命周期（本节为权威）**：启动成功即写；实际端口或地址变化时覆写；**退出时尽力删除**（崩溃残留的旧文件 ⇒ 消费方按 `pid` 判活——进程不存在则该文件视为陈旧，以应用实况为准）。字段清单：

| 字段 | 含义 |
|---|---|
| `pid` | 主进程 PID——消费方（主包AI / 操作者）判活依据：进程不存在 ⇒ 该文件视为陈旧，以应用实况为准 |
| `host` | `127.0.0.1`（固定；仅本机可达是产品边界） |
| `port` | **实际**监听端口（可能 ≠ 期望端口） |
| `url` | 实际 MCP 端点 `http://127.0.0.1:<实际端口>/mcp`——接入片段与宿主配置引用它 |
| `version` | 应用版本 |
| `startedAt` | 本次启动时间（ISO 8601） |

- 端口顺延时托盘提示「MCP 地址已变化，请更新宿主配置」——**漂移必须可见**（宿主保存的是固定 URL，静默漂移会让宿主失联）；修复步骤 = 说明文档「端点 / 端口变化后如何更新宿主配置」（§7 ①）。
- 设置界面（b2）显示**实际 MCP 地址** + 一键复制两形态片段 + 一键导出为文件（出口与导出路径见 `docs/design/modules/settings-app.md` §3）。

宿主接入片段（两形态，形状权威 = 本节；字段以宿主当前版本为准；样例用默认端口 17873，实际端口以应用显示 / `runtime.json` 为准）：

项目根 `.mcp.json`（第二源；`mcpServers` 对象形）：

```json
{ "mcpServers": { "free-outsource": { "url": "http://127.0.0.1:17873/mcp" } } }
```

宿主 `config.json`（`mcp.servers` 数组形；并入宿主现有数组）：

```json
{ "mcp": { "servers": [ { "name": "free-outsource", "url": "http://127.0.0.1:17873/mcp" } ] } }
```

### 2.4 stdio 命令型 shim（是否提供）

- **结论：b1 只提供 HTTP 端点，不做 shim**；若自举验收证明宿主 URL 型接不通，则在 b1 修复轮或 b2 前补（工具注册表与传输层解耦，加 shim 不改业务层）。
- 利：不依赖端口与防火墙；宿主 command 型支持最普遍。
- 弊：增加一个入口与分发面（终端用户机器可能无 Node；打包后需应用自身以 Node 语义运行并转发到托盘实例）；与宿主「先探活后落盘」的流程配合也要求实例已运行。

## 3. 模块划分与数据流

### 3.1 组件

| 组件 | 位置 | 职责 |
|---|---|---|
| MCP 服务面 | `src/main/mcp/` | 传输、工具注册与参数校验、错误信封（契约见 `modules/mcp-server.md`） |
| 调度器 | `src/main/scheduler/` | 队列、选人、重试与降级、超时、取消（见 `modules/scheduler.md`） |
| 引擎客户端 | `src/main/engine-client.mjs` | 与引擎子进程的逐行 JSON-RPC（stdio） |
| 浏览器引擎 | `src/engine/browser.mjs` | 配置目录、启动、下载捕获、登录态（见 `modules/browser-engine.md`） |
| 适配器 | `src/engine/adapters/` | 平台适配器接口与 DeepSeek 首实现（见 `modules/adapters.md`） |
| 交付写入 | `src/shared/outbox.mjs` | outbox 目录与实际路径解析、manifest、命名与上限（见 `modules/outbox.md`） |
| 配置与日志 | `src/main/config.mjs` / `log.mjs` | 配置读写与日志（见本文 §4） |
| 托盘与设置 | `src/main/tray.mjs` / `src/settings/`（b2） | 托盘菜单；设置界面（见 `modules/settings-app.md`） |

### 3.2 一次派单的数据流

1. 主包AI 调用 `dispatch_task` → MCP 服务面校验入参并交给调度器。
2. 调度器选人（指定或优先级，见 `modules/scheduler.md`；不可选 ⇒ 同步拒绝、不建任务，见 `modules/mcp-server.md` §3.2）→ 建任务并写 outbox 初始 manifest（含 `worker` / `selection`）→ 经引擎客户端下发 `task.run`（忙碌时排队等待）。
3. 引擎按外包工取浏览器上下文（复用已有则开新会话）→ 检查登录态（不合格 ⇒ 报 `E_LOGIN_REQUIRED`）。
4. 应用该外包工开关（`toggles`；失败 ⇒ `E_SELECTOR_MISSING`，不发送）→ 有附件则上传（`setInputFiles`）→ 发送任务文本（聚焦 + insertText + Enter）。
5. 收答复：主通道拦截平台流式响应体解析全文，以流内结束标记判定完成；DOM 抓取为兜底（协议见 `modules/adapters.md`）。
6. 取件三层：下载捕获（CDP 自动落盘）/ 回复内代码块提取 / 回复全文落盘（规则见 `modules/outbox.md`）。
7. 引擎把产物写入 `<outbox>/<taskId>/`，返回结果清单（`delivery` + `toggles: {configured, payload, ok}`）→ 主进程据此写 manifest 终态（manifest 单一写者；字段语义见 `docs/design/modules/outbox.md`「manifest.json 与交付原子性」，捕获与核对机制见 `docs/design/modules/adapters.md`「外包工开关的应用与核对」）。
8. 主包AI 经 `get_task` / `fetch_result` 取回文本与文件清单。

### 3.3 b1 落地文件计划（受影响文件与测试面）

新建（行数为估算，实施后按实际回调）：

| 文件 | 预计行数 | 职责 |
|---|---|---|
| `package.json`（改） | 当前 13 行 → ~20 行（+7） | 依赖（electron / @modelcontextprotocol/sdk）；scripts：app / verify:mcp / verify:engine / verify:loop / verify:runtime |
| `src/main/index.mjs` | ~140 | 入口：单实例、托盘、生命周期、引擎客户端接线、`runtime.json` 写入 |
| `src/main/tray.mjs` | ~80 | 托盘菜单与通知 |
| `src/main/config.mjs` | ~120 | 配置载入 / 校验 / 原子写 |
| `src/main/log.mjs` | ~60 | 日志（不记录敏感值） |
| `src/main/mcp/server.mjs` | ~160 | 双传输端点 + /healthz + token + 端口绑定与顺延 |
| `src/main/mcp/tools.mjs` | ~220 | 六件套注册、参数校验、返回信封 |
| `src/main/mcp/errors.mjs` | ~60 | 错误码表（与设计档一致） |
| `src/main/scheduler/scheduler.mjs` | ~200 | 队列 / 选人 / 重试降级 / 超时 / 取消 |
| `src/main/scheduler/task.mjs` | ~120 | 任务模型与状态机 |
| `src/main/engine-client.mjs` | ~120 | stdio JSON-RPC 客户端 |
| `src/engine/host.mjs` | ~160 | 引擎入口：JSON-RPC 服务端 + 任务执行编排 |
| `src/engine/browser.mjs` | ~170 | 浏览器上下文 / CDP 下载捕获 / 登录检测 |
| `src/engine/adapters/base.mjs` | ~80 | 适配器接口与能力声明 |
| `src/engine/adapters/registry.mjs` | ~40 | 适配器注册表 |
| `src/engine/adapters/deepseek.mjs` | ~280 | DeepSeek 适配器（选择器 / 开关应用 / 发送 / 流 / DOM / 提取） |
| `src/engine/adapters/deepseek-stream.mjs` | ~120 | SSE 解析纯函数 |
| `src/shared/outbox.mjs` | ~200 | 交付目录实际路径解析（回落）、落盘、manifest、命名净化、上限 |
| `src/shared/ids.mjs` | ~30 | taskId 生成 |
| `docs/guide/agent-onboarding.md` | ~160 | R7① 面向操作者的接入长文（b1 交付；含 R9 两节） |
| `docs/guide/agent-brief.md` | ~80 | R7④ 给 AI-Agent 的说明文件（b1 交付） |

不在本批：`src/settings/**`（b2）、Kimi 适配器（b3）、打包配置（b4）。

测试面（行数为估算；任一文件实施后超 300 行 ⇒ 按测试对象拆分）：

| 文件 | 预计行数 | 说明 |
|---|---|---|
| `docs/batches/b1-core-loop.units.mjs` | ~250 | 单元测试（随批归档，`node --test` 直跑）：SSE 解析、代码块提取、命名净化、选人、状态机 |
| `test/integration/mcp-face.test.mjs` | ~150 | `npm run verify:mcp`：契约面断言 + 文档断言（① `agent-onboarding.md` 四节 + R9 两节 +「本工具端点配置」节；④ `agent-brief.md` 五要素自述；内嵌 JSON 片段可解析 + 字段形状；工具清单与 `tools/list` 对照） |
| `test/integration/engine.test.mjs` | ~140 | `npm run verify:engine`：浏览器 + 下载捕获（CDP，本地页）+ 开关应用失败场景（AC-R8-3） |
| `test/integration/loop.test.mjs` | ~100 | `npm run verify:loop`：真机端到端（需登录态） |
| `test/integration/runtime.test.mjs` | ~80 | `npm run verify:runtime`：端口占用顺延 / 期望端口固定 / `runtime.json` 与探活（AC-R9-1；AC-R9-2 b1 侧；自控应用启停） |

## 4. 配置存储（设计点⑧）

- 位置：`%APPDATA%\free-outsource\config.json`（Electron `app.getPath('userData')`）；同目录 `runtime.json`、`logs/`。
- 单一写者：主进程。设置界面（b2）经 IPC 提交改动；**文件手改**（用户或主包AI 经文件工具写入 `config.json`）也可被加载（下次启动生效）——即期望端口（`mcp.port`）的写入通道（工具面不提供配置读写工具；见本文 §2.3 与 §7「本工具端点配置」）。
- 原子写：同目录临时文件 + `rename` 替换；保留上一版 `.bak`。
- 优先级单一来源：`workers` 数组顺序即优先级（不另存数字字段，避免双源漂移）。
- 生效规则：外包工增删改序 / 开关 / outbox / limits 立即生效；端口（`mcp.port`）/ 浏览器模式重启生效（界面提示）。
- 校验：加载时做 schema 校验；非法条目隔离并记日志（不静默丢）。

```json
{
  "version": 1,
  "mcp": { "port": 17873, "host": "127.0.0.1", "token": "" },
   "browser": { "mode": "chromium", "channel": "", "headless": false },
  "outboxDir": "D:\\免费外包\\outbox",
  "workers": [
    { "id": "w-1", "platform": "deepseek", "name": "DeepSeek", "enabled": true,
      "toggles": { "thinking": false, "search": false } }
  ],
  "limits": {
    "maxFileBytes": 52428800, "maxInlineTextChars": 100000, "maxTaskChars": 50000, "maxAttachFiles": 10,
    "timeouts": {
      "openingMs": 60000, "uploadingMs": 60000, "sendingMs": 30000,
      "streamFirstByteMs": 120000, "taskTimeoutMs": 300000, "extractingMs": 60000
    }
  },
  "scheduler": { "globalConcurrency": 2, "perWorkerConcurrency": 1, "retryPerWorker": 2, "maxFailoverWorkers": 3 }
}
```

- `limits.timeouts`：阶段超时（毫秒）——与 `docs/design/modules/scheduler.md`「阶段超时表」逐键对应；随 `limits` 立即生效。
- `workers[].toggles`：外包工级开关（`thinking` / `search`，默认 `false`）——派单时应用与核对见 `docs/design/modules/adapters.md`「外包工开关的应用与核对」；界面呈现随 b2（`modules/settings-app.md`）。
- `mcp.port` / `mcp.host`：`port` = **期望端口**（重启生效；写入通道 = 文件手改、工具面无配置读写工具，实际监听端口与发布口径均见本文 §2.3）；`host` 固定 `127.0.0.1`（不提供跳网访问——R9 边界；非该值按非法配置处理：回退默认并记日志）。
- `outboxDir`：交付目录——**实际路径**按交付策略解析（配置值不可用 ⇒ 回落），解析时点与落点唯一性见 `docs/design/modules/outbox.md`；界面显示实际路径（b2）。

## 5. 错误与人工接管（设计点⑨）

错误码权威表见 `docs/design/modules/mcp-server.md`「错误码」；本节定义分类与处置口径。

| 类别 | 典型错误码 | 处置 |
|---|---|---|
| 登录失效 | `E_LOGIN_REQUIRED` | 任务终态 needs_human；打开该平台窗口等人工登录；托盘通知；随后重新派单 |
| 验证码 / 风控 | `E_CAPTCHA_OR_RISK` | 同上；浏览器窗口留给人工处理；该外包工进入冷却 |
| 页面结构变化 / 开关应用失败 | `E_SELECTOR_MISSING` | 归「外包工不可用（可降级）」类：该外包工置冷却，任务转下一优先级；降级耗尽（b1 单外包工配置直接落）⇒ needs_human；保存失败截图；托盘通知（提示可能需适配器适配） |
| 网络 / 超时 | `E_TIMEOUT` / `E_NO_RESPONSE` | 同外包工重试（≤2 次，退避 3s / 10s）；仍失败 ⇒ failed |
| 发送失败 | `E_SEND_FAILED` | 同上重试 |
| 附件问题 | `E_BAD_FILE` | 任务不启动，直接 returned 错误与原因 |
| 引擎崩溃 | `E_ENGINE_DOWN` | 重启引擎子进程；进行中任务 failed 并标记可重派 |
| 端口冲突 | —（启动期） | 顺延端口 + 托盘提示「地址已变」；顺延上限（+120）内全被占 ⇒ MCP 服务不启动 + 托盘 / 日志明示「端口不可用」与建议（口径见本文 §2.3；不引入错误码） |

人工接管入口：托盘通知 + 已打开的浏览器窗口（登录 / 验证码在窗口内完成）+ 任务状态 needs_human + **托盘菜单「我已处理（清除外包工冷却）」（人工登录 / 过验证码后据此立即重派，不必等满默认 10 分钟冷却）**；失败任务在 `screenshots/` 留证（见 `modules/outbox.md`）。

## 6. 安全（设计点⑪）

- 网络面：只绑 127.0.0.1；可选 `mcp.token`；不提供公网服务。
- 路径面：产物名净化 + 落盘前校验目标在任务目录内（规则见 `modules/outbox.md`）；附件只接受派单显式给出的绝对路径（存在、普通文件、大小 / 数量上限），不提供「读任意文件」工具。
- 上限面：`limits` 统一约束附件大小 / 附件数量 / 任务文本长度 / 内联返回文本长度。
- 日志面：不记录令牌、Cookie、Authorization 头与完整响应体（截断）；登录态只存在浏览器配置目录。
- 仓库面：含登录态的目录不进版本库（`.gitignore` 已含 `.browser-profile/`；运行期配置在 userData，不在仓库内）。

## 7. 接入说明的形态与内容（R7；四载体分工）

四种载体，**同一内容的完整副本只存在于一个权威处**，其余载体引用或按运行态生成：

| 载体 | 受众 | 内容 | 权威性 | 归属批次 |
|---|---|---|---|---|
| ① 随包接入说明文档 `docs/guide/agent-onboarding.md` | 操作者（AI 亦可读） | 长文：接入步骤、配置样例、工具清单、调用示例、排障与人工接管；R9 两节：「换机后首次接入」「端点 / 端口变化后如何更新宿主配置」 | 静态内容的唯一权威 | 文本 b1；随包 b4 |
| ② 应用内「接入指引」页 | 操作者 | 运行时事实：**实际**地址 / 端口 / 服务状态 / 外包工登录态、一键复制、一键导出、打开文档 | 动态信息的唯一权威 | b2 |
| ③ 可复制的 MCP 配置片段 | 操作者 | 按实际端口生成的 JSON 片段（两形态各一份：`.mcp.json` 的 `mcpServers` 对象形 / `config.json` 的 `mcp.servers` 数组形）；可一键复制、可一键导出为文件 | 生成器（应用）为权威；① 只放样例并标注「以应用显示为准」 | 生成 / 一键复制 / 一键导出随 b2；静态样例随 b1 |
| ④ 给 AI-Agent 的说明文件 `docs/guide/agent-brief.md` | AI-Agent | 服务自述五要素：我是谁 / 我提供什么 / 怎么调用 / 出错怎么办 / 何时需要人来操作 | AI 视角的唯一权威 | 文本 b1；随包 b4 |

- 内容分工细则：安装与配置步骤只在 ①；错误码面向 AI 的说明在 ④（① 只讲「遇到 X 怎么办」的操作步骤）；工具清单在两个载体各出现一次（① 面向人、④ 面向 AI），**同步责任**：清单或错误码变更时同步更新对应小节，由 AC-R7-3（与 `tools/list` 对照）守门。
- ① 的节结构（`npm run verify:mcp` 文档断言对象）：AC-R7-1 四节（接入步骤 / 配置片段 / 工具清单 / 调用示例）+ R9 两节（「换机后首次接入」「端点 / 端口变化后如何更新宿主配置」）+「本工具端点配置」节（本工具 `config.json`（`%APPDATA%\free-outsource\config.json`）的 `mcp.port` 键，改后重启生效——主包AI 写期望端口的入口；口径见本文 §2.3 / §4）。
- R9 两节与 R7 同源：只写「到哪里看**实际值**」（设置界面 / `runtime.json` / 导出目录）与更新步骤，不复制动态值（动态信息权威 = ②）；「换机后首次接入」「端点 / 端口变化后如何更新宿主配置」两节含**按 `pid` 判活**步骤（`pid` 进程不存在 ⇒ `runtime.json` 陈旧，以应用实况为准；生命周期权威 = 本文 §2.3）；口径含「目标机无需 Node、浏览器随包（可切系统 Edge）」「登录态不跨机、每平台首次登录一次」。
- 随包方式：b4 打包把 ①④ 放进安装目录 `guide/`，设置界面「接入指引」页可打开。
- ③ 的动态性：端口可能顺延（§2.3），故配置片段以应用内生成 / 显示为准；文档样例使用默认端口 17873；一键复制的两形态与一键导出（R9·F9.6）由设置界面提供（导出出口与路径见 `docs/design/modules/settings-app.md` §3）。

## 8. 设置界面（设计点⑦，架构级）

- 形态：独立设置窗口（决策 D），托盘菜单可打开；页面：外包工列表 / 接入指引 / 交付目录 / 关于。
- 数据同步：渲染进程只经 IPC 读写主进程配置与状态；改动即时落盘（§4）。
- 「按主包AI 要求指定调用」的界面体现：列表条目的**自定义名即指定标识**；界面明示「仅列表内已启用的外包工可被指定」。
- 细节见 `docs/design/modules/settings-app.md`。

## 9. 打包方案（设计点⑩）

- 工具：electron-builder（npm 镜像实测可得 26.15.3）→ NSIS 安装包（x64），输出 `release/`。
- 浏览器：**Chromium 随包**（`extraResources` 携带 Playwright 浏览器目录，运行时 `PLAYWRIGHT_BROWSERS_PATH` 指向之）；设置中可切「用系统 Edge」。
  - 被否方案：首启下载浏览器（安装包小，但国内网络 / 镜像失败面大，装机即失败）。
- 构建期镜像：npm 走 `registry.npmmirror.com`（项目 `.npmrc` 已配）；Electron 二进制与 Playwright 浏览器二进制走镜像变量（`ELECTRON_MIRROR` / `PLAYWRIGHT_DOWNLOAD_HOST`），具体域名 b4 批实测确认。
- 已知项：不做代码签名 ⇒ 未签名安装包可能触发 SmartScreen 提示（R6 边界已记）。
- 随包文档：`guide/`（§7）。

## 10. 关键决策记录（含被否方案）

| # | 决策 | 理由 | 被否方案 |
|---|---|---|---|
| K1 | 引擎跑独立子进程 | 崩溃隔离；Playwright 保持标准 Node 语义 | 主进程内直跑；独立 Node 依赖 |
| K2 | MCP 双传输（Streamable HTTP + 旧式 SSE） | 宿主客户端实现未实测，双挂成本低 | 只 SSE；只 stdio |
| K3 | 端口固定优先 + 冲突顺延 + runtime.json | 宿主保存固定 URL；漂移必须可见 | 随机端口；静默顺延 |
| K4 | 取答复以网络流为主、DOM 兜底 | 探针 3：流有明确结束标记、不夹带界面文字；DOM 会混入按钮文字且探针 2 会漏内容 | DOM 轮询为主 |
| K5 | 并发：每外包工 1、全局默认 2 | 同一浏览器配置目录单写者；保守并发降低风控 | 更高等并发 |
| K6 | 选人 = 严格优先级 + 忙则排队；不可用才降级 | 「按优先级使用」的直读；避免静默换人 | 忙则顺延到下一外包工 |
| K7 | 指定 = 硬绑定不降级 | 「按主包AI 要求调用」的直读；静默换人属隐性违约 | 指定后仍可降级 |
| K8 | 打包：Chromium 随包为主、Edge 可切 | 决策 C；离线可用 | 首启下载浏览器 |
| K9 | b1 只做 HTTP 接入，无 stdio shim | 单一入口、少分发面；触发条件明确（§2.4） | 同步做 shim |
| K10 | outbox 默认取决策 G 值；非 D 盘机器回落用户目录 | 决策 G + R6 换机可用性 | 强制用户先设置路径 |
| K11 | 附件不做目录白名单 | 本地单机工具、主包AI 即用户自己的 AI；白名单摩擦大 | 目录白名单（如需更严可后续加配置） |
| K12 | 优先级单一来源 = workers 数组顺序 | 避免双源漂移 | 另存 priority 数字字段 |
| K13 | 下载落盘 = CDP 自动落盘（`Browser.setDownloadBehavior`） | 探针 6 真机定论：落盘成功、内容与代码块一致、浏览器全程存活 | `saveAs` 主路径（探针 5：真实平台下载另开 `edge://downloads-hub/`、上下文随之关闭、`saveAs` 失败） |

## 11. 边界（本设计不做什么）

- 不引入账号体系、云端服务、多用户 / 权限模型。
- 不绕过平台限制（验证码 / 风控）——一律转人工接管。
- 不承诺网页版 AI 的输出质量；不解析 / 改写回答内容（原文原文件交付）。
- 不自动改写第三方宿主的私有配置文件（接入修复 = 复制 / 导出片段 + 说明文档指引，由用户或主包AI 执行；宿主内部格式不在承诺范围——R9 边界）。
- 不在本档展开后续批次（b2–b4）的模块细节，随批补齐。

## 12. 后续批次规划

- **b2**：设置窗口（外包工增删改序 / 自定义名 / 登录状态与登录引导 / 开关呈现 R8 / 交付目录 F5.7）+「接入指引」页（②③：实际地址 / 一键复制 / 一键导出）+ 托盘增强。
- **b3**：Kimi 适配器（按 `modules/adapters.md` 的接口与接入清单）。
- **b4**：打包与换机验收（NSIS、Chromium 随包、`guide/` 随包、AC-R6-* / AC-R9-3）。

## 13. 验收体系（设计点⑫）

三级验证，层级与判据如下；命令契约（b1 实施时落地于 `test/integration/`）：

| 级别 | 位置 / 命令 | 覆盖 |
|---|---|---|
| 单元 | 随批归档 `docs/batches/b1-core-loop.units.mjs`（`node --test` 直跑） | 纯逻辑：SSE 解析器、代码块提取、命名净化、选人算法、状态机 |
| 集成 | `npm run verify:mcp` | 契约面：initialize、tools/list 六件套、入参 schema、错误码路径、/healthz；文档断言（① `docs/guide/agent-onboarding.md`：四节 + R9 两节 +「本工具端点配置」节；④ `docs/guide/agent-brief.md`：五要素自述；内嵌 JSON 片段可解析 + 字段形状断言（`mcpServers` 对象形 + `url` 字段 / `config.json` 的 `mcp.servers` 数组形样例）；工具清单与 `tools/list` 对照） |
| 集成 | `npm run verify:engine` | 浏览器引擎 + 下载捕获（CDP 自动落盘，本地 blob 页）+ 开关应用失败场景（本地 fixture 页；AC-R8-3）——不依赖平台登录 |
| 集成 | `npm run verify:loop` | 真机端到端：派单 → 取答复 → 取件 → outbox 判据（含开关载荷核对 `manifest.toggles`；AC-R8-1；需登录态） |
| 集成 | `npm run verify:loop:kimi` | 真机端到端（**第二平台 Kimi**；同一命令以 `FO_LOOP_PLATFORM=kimi` 参数化）：派单 → 取答复 → 取件 → outbox 判据；**按适配器 `capabilities` 条件断言**（下载捕获 / 开关能力位不具备 ⇒ 相应子步跳过）；AC-R3-1 / AC-R3-2 的 Kimi 侧（**AC-R3-4 的 Kimi 侧 = K5 探针读数 + 人工附件派单场景，不由本命令覆盖**） |
| 集成 | `npm run verify:runtime` | 端点与端口：占用顺延 / 期望端口固定 / `runtime.json` 与探活（AC-R9-1；AC-R9-2 b1 侧；自控应用启停） |
| 集成 | `npm run verify:settings` | b2 设置界面：窗口与四页签 / 外包工增删调序改名与启用 / **开关双读（config + 快照回显）** / 交付目录两段 / 实际地址与两形态复制（含未启动态） / 一键导出 / 关于页 / 检查动作预算 / 退出重启保留（AC-R5-1..6 · AC-R8-2 界面侧 · AC-R7-2 · AC-R9-1·2·4 界面侧；自控应用启停） |

- **自举验收（b1 收口，操作）**：写 `.mcp.json` → 宿主「设置 → MCP」探活 → 主包AI 真实派单 → outbox 出现任务目录且 manifest.state = done。若宿主 URL 型接不通 ⇒ 触发 K9（补 stdio shim）。
- **R7 验收**：AC-R7-1 / R7-3 落于 `npm run verify:mcp` 的文档断言（① `docs/guide/agent-onboarding.md` 四节结构 + R9 两节「换机后首次接入」「端点 / 端口变化后如何更新宿主配置」+「本工具端点配置」节；④ `docs/guide/agent-brief.md` 五要素自述；内嵌 JSON 片段可解析 + 字段形状断言（`mcpServers` 对象形 + `url` 字段；`config.json` 的 `mcp.servers` 数组形样例）；工具清单与 `tools/list` 对照）；AC-R7-2 在 b1 收口时执行一次（陌生 AI 只读 ① 完成接入并派单成功）。
- **称谓验收（AC-R2-1）**：检索面 = `docs/**`、`src/**` 与界面词表（UI 文案常量）；判据 = 凡指代调用方一律为「主包AI」，唯一例外 = 术语表已定义的「宿主」（MCP 客户端容器，仅传输 / 进程语境）；执行 = UTF-8 感知检索 + 命中项按术语表复核。
- **开关验收（AC-R8-1..3）**：AC-R8-1 = `npm run verify:loop` 断言 `manifest.toggles`（`payload` 与 `configured` 一致）；AC-R8-2 = 操作（改配置重派复测载荷随动；引擎开关应用日志一行——目标值 / 实际值 / 复核结果，不含敏感值；界面侧随 b2）；AC-R8-3 = 选择器失效复现（`npm run verify:engine` 本地 fixture 页无开关元素 ⇒ 判 `E_SELECTOR_MISSING` 且不发送；b1 单外包工配置下任务落 needs_human）。
- **R9 验收**：AC-R9-1 = `npm run verify:runtime` 场景 1（占住 17873 ⇒ `runtime.json.port ≠ 17873`、日志含同一实际端口、按该端口探活成功；界面显示一致随 b2）；AC-R9-2 = 场景 2（改配置期望端口 + 重启 ⇒ 以新端口服务、`runtime.json` 随动）+ b1 收口操作（按实际端口更新宿主配置 → 探活 + 派单成功）；AC-R9-4 = `verify:mcp` 文档断言（R9 两节存在）+ 人工核对（字段与界面实际显示一致；界面侧随 b2）；AC-R9-3 归 b4（与 AC-R6-2 同批）。
- 命令与需求验收条目的对应：AC-R1-2 / R2-2 / R3-1..4 / R7-1 / R7-3 → `npm run verify:*`；AC-R8-1 → `npm run verify:loop`；AC-R8-3 → `npm run verify:engine`；AC-R9-1 / R9-2 → `npm run verify:runtime`；AC-R1-1 / R1-3 / R4a-* / R4b-* / R7-2 → 操作按判据核验；AC-R2-1 → 称谓检索（上述口径）；AC-R8-2 → 操作 + b2 界面（`npm run verify:settings` 的开关双读断言）；AC-R5-1..6 / AC-R7-2 / AC-R9-4 界面侧 → `npm run verify:settings`；AC-R9-4 → 文档断言 + 人工可检（上述口径）。
- 中文断言一律用 UTF-8 感知方式（node 扫描 / grep 工具），不用 `findstr` 匹配中文。
