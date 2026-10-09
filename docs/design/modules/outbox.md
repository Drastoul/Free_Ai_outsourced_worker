# 模块设计 · 取件与交付（outbox）

> 职责：outbox 目录结构、任务清单 manifest、产物命名与净化、重名与大文件、编码、交付原子性。
> 不在本文：怎么从网页拿到内容（`docs/design/modules/adapters.md`）、文本内联上限的工具契约（`docs/design/modules/mcp-server.md`）。

## 1. 边界

- 只管「产物如何命名、落盘、成册、被取回」；不管内容质量与格式改写（原文原文件）。
- outbox 是交付物：工具**不主动删除、不自动清理**。

## 2. 目录结构与实际路径

```
<outboxDir>/<taskId>/
  manifest.json     任务清单（唯一权威状态文件）
  answer.md         回复全文（取件三层之③）
  files/            产出文件（下载捕获 / 代码块提取）
  inbox/            送件副本（附件原件拷贝，留证）
  screenshots/      失败截图（页面结构异常 / 风控 / 超时）
```

- `taskId` = `YYYYMMDD-HHmmss-<4位随机>`；同名（撞目录）⇒ 重新生成随机段。
- `<outboxDir>` = 配置 `outboxDir`（出厂 `D:\免费外包\outbox`）——**实际路径按交付策略解析**（K10；F5.7）：解析时点 = 启动（供界面显示） / 目录配置改动时 / 每单建任务时（决定该单实际目录，写初始 manifest 前）；判定 = 存在或可创建 ∧ 可写；不可用 ⇒ 回落 `%USERPROFILE%\免费外包\outbox`（创建之），托盘、日志与设置界面（b2）明示**实际路径与回落原因**（不静默）。
- **落点唯一性（F5.7）**：网页端下载的文件与答复文本都落于交付目录内每单子目录——下载文件 → `files/`、答复文本 → `answer.md`（中间落点与归属见 §4）。
- 解析与复核由主进程执行；传给引擎的 `outboxDir` = 该单实际目录（接口见 `docs/design/modules/scheduler.md`「与引擎子进程的接口」）。

## 3. manifest.json 与交付原子性

- **单一写者 = 主进程**；引擎子进程只写 `files/`、`inbox/`、`screenshots/`、`answer.md` 并回报清单，不回写 manifest。
- 交付完成判据：`manifest.state ∈ 终态` 且 `files/` 就绪；**manifest 最后写**（先产物后清单）。
- 写盘方式：同目录临时文件 + `rename` 替换（原子）。

```json
{
  "taskId": "20261008-231501-ab12",
  "state": "done",
  "worker": { "id": "w-1", "name": "DeepSeek", "platform": "deepseek" },
  "selection": { "mode": "priority", "reason": "优先级第 1；健康" },
  "attempts": [{ "worker": "w-1", "result": "done", "at": "2026-10-08T15:15:22Z" }],
  "request": { "task": "……任务原文……", "files": ["D:\\projects\\a.md"] },
  "delivery": {
    "transport": "sse",
    "textPath": "answer.md",
    "files": [{ "name": "greet.py", "relPath": "files/greet.py", "bytes": 42, "sha256": "……", "source": "code_block" }],
    "partial": false
  },
  "skippedFiles": [],
  "toggles": { "configured": { "thinking": true, "search": false }, "payload": { "thinking_enabled": true, "search_enabled": false }, "ok": true },
  "timings": { "createdAt": "…", "startedAt": "…", "finishedAt": "…" },
  "error": null
}
```

- `delivery.transport ∈ sse | dom`（主通道 / 兜底通道，见 `docs/design/modules/adapters.md`）。
- `toggles`（R8）：开关应用与核对——`configured` = 外包工配置值；`payload` = 捕获到的 `chat/completion` 请求载荷两键（任务未发送或未捕获 ⇒ `null`）；`ok` = `payload` 与 `configured` 一致。规则见 `docs/design/modules/adapters.md`「外包工开关的应用与核对」。
- 非终态 manifest（应用重启后扫描到）⇒ 主进程写入独立标记字段 `interrupted`（`{ at, previousState }`，不进 `state` 枚举；缺省不出现）；不自动重跑，产物与 manifest 原样保留供人工取用。

## 4. 取件三层的落盘规则

| 层 | 来源 | 落点 | 命名 |
|---|---|---|---|
| ① 下载捕获（CDP 自动落盘） | 浏览器下载（经下载暂存区归属，见 `docs/design/modules/browser-engine.md`「下载捕获」） | `files/` | 用下载建议名（净化后） |
| ② 代码块提取 | 回复全文中的 ``` 围栏 | `files/` | 首行 `# file: <名>` / `// file: <名>` / `<!-- file: <名> -->`；无名 ⇒ `code_block_N.<lang>`（lang 缺省 `txt`） |
| ③ 全文落盘 | 回复纯文本 | `answer.md` | 固定名（UTF-8） |

- 下载归属：CDP 下载暂存区 = `<userData>/downloads-staging/<workerId>/`（每外包工一份的**机器中间落点**，非交付落点；CDP 机制见 `docs/design/modules/browser-engine.md`「下载捕获」）；下载事件归属「该外包工当前正在执行的任务」⇒ 任务收尾时移入 `<outboxDir>/<taskId>/files/`；空闲期下载留在暂存区并记日志（不误入任务）。
- 下载文件不再别处默认落点（F5.7）：浏览器默认下载目录（如系统「下载」文件夹）不出现本工具的下载文件——交付落点唯一（§2）。
- 同一文件同时来自下载与代码块 ⇒ 都保留（各自命名，重名加序号）。

## 5. 命名净化（防路径穿越）

净化函数规则（对全部产物名生效，含附件副本）：

1. 只取 basename（丢弃任何目录成分）；
2. `\ / : * ? " < > |` 与不可见控制字符 ⇒ `_`；
3. 去掉首尾空白与结尾的 `.`（Windows 约束）；
4. `.` / `..` / 空串 ⇒ `unnamed`；
5. Windows 保留名（CON / PRN / AUX / NUL / COM1-9 / LPT1-9，含带扩展名形态）⇒ 前缀 `_`；
6. 长度 ≤ 120 字符（超长保留扩展名截断）。

落盘前校验：解析后的绝对路径必须位于该任务目录内；越界 ⇒ 拒绝写入、记日志与 manifest。

## 6. 重名与大文件

- 同目录重名 ⇒ 追加 `-2`、`-3`…（保留扩展名）。
- 单文件 > `limits.maxFileBytes`（默认 50MB）⇒ 不落 `files/`，记入 `manifest.skippedFiles`（name / size / reason），不静默丢弃。
- 二进制原样写；文本以 UTF-8 写。

## 7. 文本内联上限（取回端）

- `fetch_result` 内联文本 ≤ `limits.maxInlineTextChars`（默认 100000），超出截断并置 `textTruncated: true`，全文始终可在 `answer.md` 取。
- 文件清单只回相对路径与尺寸（不回本机绝对路径以外的新信息；`outboxDir` 供人查看）。

## 8. 验收判据

- 单元（随批归档）：净化规则（穿越 / 保留名 / 长度 / 重名）、skippedFiles 记录、manifest 原子写。
- 集成：`npm run verify:loop` 断言 `<outbox>/<taskId>/` 下 manifest.json 终态、answer.md 非空、files/ ≥1；
  `npm run verify:engine` 断言下载捕获落盘（CDP 自动落盘，本地 blob 页）。
- AC-R5-6（运行期侧）复现步骤：**先配置一个可用目录，再令其不可写（撤权 / 拔盘）** → 派单 ⇒ 新单按 §2 解析时点回落 + 托盘 / 日志 / 界面明示**实际落点与回落原因**（不静默丢产物）；写时失败 ⇒ `E_OUTBOX_WRITE`（产物保留、不删）——单元 / 集成；界面侧（选不可写目录被拒、不落配置）随 b2（`docs/design/modules/settings-app.md` §8）。
- 对应需求验收：AC-R3-1、AC-R3-3、AC-R3-4、AC-R8-1（`manifest.toggles`）、AC-R5-6（运行期侧）。
