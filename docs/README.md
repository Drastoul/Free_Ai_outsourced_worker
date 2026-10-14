# 免费外包 · 文档地图
把网页版 AI 变成你的 AI 助手可以调用的外包工 —— 你在界面登记网页版 AI 的名字和链接，支持 MCP 的智能体（Claude Code / Cursor 等）就能派活给它：自动开浏览器、发送、取回答复与文件。
# Free outsourcing · Document map
Turn the web-based AI into an outsourced worker that your AI assistant can call upon - you register the name and link of the web-based AI on the interface, and intelligent agents supporting MCP (such as Claude Code / Cursor) can assign tasks to it: automatically opening browsers, sending and retrieving responses and files.

## 感谢：使用ThinCoder完成，用的DeepSeek的token和各种免费网页平台

## 卖点：
> 省的是"来回折腾"，不是那几分钱：读资料、写初稿、做复核这类"耗过程"的活交给网页版 AI —— 用的是你已经付过费的订阅，过程成本 0（同样一篇 5 KB 草案，走 API token 价约 ¥0.02，走付费代理要 ¥1–5，差 50–250 倍）。
> 可加任意网页版 AI：填名称 + 链接即可接进来，不限于内置的 DeepSeek / Kimi（已在豆包、元宝、智谱、讯飞星火上实测通过）。
> 本机运行、不上云：只监听 127.0.0.1，登录态只存本机，不代持账号、不绕验证码。
> 失败会告诉你为什么：回执附页面"普查"（实际存在的元素/类名/可见文本，已脱敏）⇒ 交给你的 AI 助手就能改好驱动参数。

> 本仓文档自成体系：**需求档（做什么）→ 设计档（怎么做）→ 批次档（本轮怎么落）**。
> 新建文档必须先在本表登记再落文件；文件名与路径用 ASCII，正文中文。
> 目录职责按 `PROJECT-MANIFEST.json` 的 docRoot：`requirements/` `requirements/specs/` `design/` `design/modules/` `batches/`。

## 1. 文档索引

| 文档 | 路径 | 职责 | 状态 |
|---|---|---|---|
| 项目需求 | `docs/requirements/overview.md` | R1–R10 五要素与验收条目 | 已确认 |
| 架构设计 | `docs/design/overview.md` | 全项目架构、进程与 MCP 接入、配置、安全、打包、接入说明四载体、关键决策 K1–K13、b1 文件计划、验收体系 | 已批准（b1 已实施） |
| 模块 · MCP 服务面 | `docs/design/modules/mcp-server.md` | 传输、六件套工具契约、错误码权威表 | 已批准（b1 已实施） |
| 模块 · 调度 | `docs/design/modules/scheduler.md` | 状态机、选人、并发、重试降级、超时、取消 | 已批准（b1 已实施） |
| 模块 · 适配器 | `docs/design/modules/adapters.md` | 适配器接口 + DeepSeek / **Kimi** 实现（各平台流协议权威） | 已批准（b1 · b3 已实施） |
| 模块 · 浏览器引擎 | `docs/design/modules/browser-engine.md` | 配置目录、启动参数、下载捕获、崩溃重启 | 已批准（b1 已实施） |
| 模块 · 交付 | `docs/design/modules/outbox.md` | 目录结构、manifest、命名净化、上限 | 已批准（b1 已实施） |
| 模块 · 设置界面 | `docs/design/modules/settings-app.md` | b2 设置窗口页面与交互 | 已批准（b2 已实施） |
| 接入说明（随包） | `docs/guide/agent-onboarding.md` | R7① 面向操作者的接入长文 | 已交付（b1） |
| AI 说明（随包） | `docs/guide/agent-brief.md` | R7④ 给 AI-Agent 的服务自述 | 已交付（b1） |
| 批次档 b1 | `docs/batches/b1-core-loop.md` | 本批讨论 / 任务与设计 / 评审 / 批准 / 实施 / 收口记录（六段一作者） | 已收口 2026-10-09 |
| 批次档 b2 | `docs/batches/b2-settings-ui.md` | 同上（b2 设置界面） | 已收口 2026-10-10 |
| 批次档 b3 | `docs/batches/b3-kimi-adapter.md` | 同上（b3 接入第二个平台 Kimi） | 已收口 2026-10-11 |
| 批次档 b4 | `docs/batches/b4-package-ship.md` | 同上（b4 打包与换机自适配） | 已收口 2026-10-11 |
| 批次档 b5 | `docs/batches/b5-session-reuse.md` | 同上（b5 会话复用：连续派单复用同一聊天会话） | 已收口 2026-10-11 |
| 批次档 b6 | `docs/batches/b6-small-items-and-repack.md` | 同上（b6 小项清理 + 打包刷新：#17/#23/#26/#28 + #25/#27） | 已收口 2026-10-11 |
| 批次档 b7 | `docs/batches/b7-custom-workers.md` | 同上（b7 自定义外包工：自由填名称+链接接入任意网页版 AI；台账 #30） | 已收口 2026-10-12 |
| 批次档 b8 | `docs/batches/b8-custom-worker-hardening.md` | 同上（b8 自定义外包工补齐：写入轴 / 遮挡轴 / 取答复候选链 11 项 / 诊断普查 / 错误码映射 / 补件门；台账 #34/#36/#37/#38） | 已收口 2026-10-14 |
| 随批清单 b4 | `docs/batches/b4-package-ship.checklist.md` | 装机自检清单（换机验收执行件；含构建环境坑与失败读数栏） | 已交付（b4） |

- `docs/requirements/specs/`：功能规格层（暂空，后续批按需建立）。
- `docs/batches/` 下另有随批归档的单元测试文件（开发期工具，不进 `test/` 树）与 fixtures（`b1-core-loop.fixtures/`：SSE fixture 与期望基线）。

## 2. 写作约定

- **单一来源**：同一机制只在一处详述，其余引用。权威落点举例：错误码 = `modules/mcp-server.md`「错误码」；DeepSeek 流协议 = `modules/adapters.md`「收答复主通道」；配置 schema = `design/overview.md`「配置存储」。
- **引用形如** `docs/design/modules/xxx.md`「节名」；不写指向本文上下文的相对说法。
- **验收条目**命名：`AC-R<需求号>-<序号>`（需求档定义，批次档 §2 与设计档引用）。
- 探针产物（`probe/out*`）与浏览器配置目录（`.browser-profile/`）不进版本库，其内容不进文档正文（只引用路径与结论）。
- 批次流程与六段结构见 `docs/batches/b1-core-loop.md` 头部说明。


## Acknowledgements: This project was completed using ThinCoder, utilizing DeepSeek tokens and various free web platforms

## Selling Points:
The saving lies in "avoiding back-and-forth hassles" rather than those few cents: tasks like reading materials, writing drafts, and conducting reviews, which are "time-consuming processes", can be delegated to web-based AI. This is done using the subscription you have already paid for, with a process cost of 0 (for the same 5 KB draft, using an API token costs approximately ¥0.02, while using a paid proxy costs ¥1–5, a difference of 50–250 times).
You can add any web-based AI by filling in the name and link, not limited to the built-in DeepSeek / Kimi (tested and approved on Doubao, Yuanbao, Zhipu, and iFlytek Spark).
This device runs locally and does not access the cloud: it only listens on 127.0.0.1, and the login status is stored locally, without proxying accounts or bypassing verification codes.
The failure will tell you why: the acknowledgment page includes a "census" (actual existing elements/class names/visible text, desensitized) ⇒ just give it to your AI assistant and the driver parameters will be adjusted.

This repository's documentation forms a self-contained system: **requirements document (what to do) → design document (how to do it) → batch document (how to implement this round)**.
New documents must be registered in this table before being saved; the file name and path should use ASCII characters, and the body should be in Chinese.
Directory responsibilities are organized according to the docRoot specified in `PROJECT-MANIFEST.json`: `requirements/`, `requirements/specs/`, `design/`, `design/modules/`, and `batches/`.

## 1. Document Index

| Document | Path | Responsibility | Status |
|---|---|---|---|
| Project Requirements | `docs/requirements/overview.md` | R1–R10 Five Elements and Acceptance Items | Confirmed |
| Architecture Design | `docs/design/overview.md` | Overall project architecture, process and MCP integration, configuration, security, packaging, integration instructions, key decisions K1–K13, b1 document plan, acceptance system | Approved (b1 has been implemented) |
| Module · MCP Server | `docs/design/modules/mcp-server.md` | Transport, Six-Tool Kit Contract, Error Code Authority Table | Approved (b1 Implemented) |
| Module · Scheduler | `docs/design/modules/scheduler.md` | State machine, selection, concurrency, retry fallback, timeout, cancellation | Approved (b1 implemented) |
| Module · Adapter | `docs/design/modules/adapters.md` | Adapter Interface + DeepSeek / **Kimi** Implementation (Authoritative Streaming Protocol for Various Platforms) | Approved (b1 · b3 Implemented) |
| Module · Browser Engine | `docs/design/modules/browser-engine.md` | Configuration directory, startup parameters, download capture, crash restart | Approved (b1 implemented) |
| Module · Delivery | `docs/design/modules/outbox.md` | Directory structure, manifest, naming cleanup, upper limit | Approved (b1 implemented) |
| Module · Settings Interface | `docs/design/modules/settings-app.md` | b2 Settings Window Page and Interaction | Approved (b2 Implemented) |
| Access Instructions (Included in Package) | `docs/guide/agent-onboarding.md` | R7① Operator-oriented Long Access Document | Delivered (b1) |
| AI Description (Included in Package) | `docs/guide/agent-brief.md` | R7④ Service Description for AI-Agent | Delivered (b1) |
| Batch File b1 | `docs/batches/b1-core-loop.md` | Discussion / Task and Design / Review / Approval / Implementation / Closure Record (Six Sections, One Author) | Closed 2026-10-09 |
| Batch File b2 | `docs/batches/b2-settings-ui.md` | Ditto (b2 Settings UI) | Closed on 2026-10-10 |
| Batch File b3 | `docs/batches/b3-kimi-adapter.md` | Ditto (b3 integrates with the second platform, Kimi) | Closed on 2026-10-11 |
| Batch File b4 | `docs/batches/b4-package-ship.md` | Ditto (b4 Packaging and Machine Adaptation) | Closed on 2026-10-11 |
| Batch File b5 | `docs/batches/b5-session-reuse.md` | Ditto (b5 Session Reuse: Reusing the same chat session for continuous dispatch) | Closed 2026-10-11 |
| Batch File b6 | `docs/batches/b6-small-items-and-repack.md` | Ditto (b6 small items cleanup + repack refresh: #17/#23/#26/#28 + #25/#27) | Closed 2026-10-11 |
| Batch File b7 | `docs/batches/b7-custom-workers.md` | Ditto (b7 Custom Outsourced Workers: Free to fill in name + link to any web-based AI; Account #30) | Closed 2026-10-12 |
| Batch File b8 | `docs/batches/b8-custom-worker-hardening.md` | Ditto (b8 custom outsourced worker supplementation: write-in axis / occlusion axis / retrieval of response candidate chain 11 items / diagnostic survey / error code mapping / spare parts gate; ledger #34/#36/#37/#38) | Closed 2026-10-14 |
| Batch List b4 | `docs/batches/b4-package-ship.checklist.md` | Installation Self-Checklist (for replacement acceptance; includes build environment pitfalls and failure readings column) | Delivered (b4) |

- `docs/requirements/specs/`: Functional specification layer (currently empty, to be established as needed in subsequent batches).
- There are also unit test files (development tools, not included in the `test/` tree) and fixtures (`b1-core-loop.fixtures/`: SSE fixture and expected baseline) archived with each batch under `docs/batches/`.

## 2.  Writing convention

- **Single source**: The same mechanism is detailed in only one place, with the rest being referenced. Examples of authoritative landing points: Error codes = `modules/mcp-server.md` "Error Codes"; DeepSeek stream protocol = `modules/adapters.md` "Receiving and Replying Main Channel"; Configuration schema = `design/overview.md` "Configuration Storage".
- **References are in the format of** `docs/design/modules/xxx.md` `Section Name`; do not include relative references pointing to the context of this document.
- **Acceptance Check Entry** naming: `AC-R<Requirement Number>-<Sequence Number>` (defined in the requirement document, referenced in batch document §2 and design document).
- The probe output (`probe/out*`) and the browser configuration directory (`browser-profile/`) are not included in the version control repository, and their contents are not included in the main body of the document (only the reference paths and conclusions are cited).
- For the batch process and six-stage structure, see the header description in `docs/batches/b1-core-loop.md`.
