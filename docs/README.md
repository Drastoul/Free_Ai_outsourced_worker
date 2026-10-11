# 免费外包 · 文档地图

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
| 随批清单 b4 | `docs/batches/b4-package-ship.checklist.md` | 装机自检清单（换机验收执行件；含构建环境坑与失败读数栏） | 已交付（b4） |

- `docs/requirements/specs/`：功能规格层（暂空，后续批按需建立）。
- `docs/batches/` 下另有随批归档的单元测试文件（开发期工具，不进 `test/` 树）与 fixtures（`b1-core-loop.fixtures/`：SSE fixture 与期望基线）。

## 2. 写作约定

- **单一来源**：同一机制只在一处详述，其余引用。权威落点举例：错误码 = `modules/mcp-server.md`「错误码」；DeepSeek 流协议 = `modules/adapters.md`「收答复主通道」；配置 schema = `design/overview.md`「配置存储」。
- **引用形如** `docs/design/modules/xxx.md`「节名」；不写指向本文上下文的相对说法。
- **验收条目**命名：`AC-R<需求号>-<序号>`（需求档定义，批次档 §2 与设计档引用）。
- 探针产物（`probe/out*`）与浏览器配置目录（`.browser-profile/`）不进版本库，其内容不进文档正文（只引用路径与结论）。
- 批次流程与六段结构见 `docs/batches/b1-core-loop.md` 头部说明。
