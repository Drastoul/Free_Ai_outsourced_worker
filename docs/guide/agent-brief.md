# 「免费外包」服务自述（给 AI-Agent）

> **这份文档是什么**：本工具面向 AI-Agent（主包AI）的服务自述，五个问题分别回答。
> 读者 = 通过 MCP 调用本工具的 AI-Agent；面向操作者的接入长文见 `docs/guide/agent-onboarding.md`。
> 本工具是**本机常驻服务**：只绑 `127.0.0.1`，无云、无账号体系。

## 我是谁

「免费外包」是一个运行在用户电脑上的 MCP 服务（首发宿主：ThinCoder 桌面版）。你把任务交给它，
它在用户本机打开网页版 AI（首发 DeepSeek）执行，并把答复与产出文件取回本机交付目录。

- 端点：`http://127.0.0.1:<实际端口>/mcp`（Streamable HTTP；另有兼容端点 `/sse`）。
- **实际端口从哪里读**：文件 `%APPDATA%\free-outsource\runtime.json` 的 `url` 字段（默认端口 17873，被占会顺延）。
- 能力声明：仅 `tools`（不做 resources / prompts）。
- 服务只绑本机：`127.0.0.1` 之外不可达；不提供公网 / 局域网访问。

## 我提供什么

异步任务面：派单 → 轮询 → 取件，外加外包工清单、取消与附件补送。

## 工具清单

| 工具 | 用途 | 关键入参 |
|---|---|---|
| `list_workers` | 列出外包工与状态（派单前取可指定名单） | 无 |
| `dispatch_task` | 派单（异步）：按优先级或指定外包工；可带附件；立即返回任务号 | `task` 必填；`worker` / `files` / `waitSeconds` 可选 |
| `get_task` | 查任务状态与阶段（支持长轮询） | `taskId`；`waitSeconds` 可选（0–600） |
| `fetch_result` | 取回答复文本与文件清单（未达终态时只回状态与提示） | `taskId`；`includeText` 可选 |
| `cancel_task` | 取消任务（排队中立即取消；执行中尽力停止，页面不关闭、部分产物保留） | `taskId` |
| `attach_files` | 给尚未发送的任务补送附件（已发送则改用新派单） | `taskId`、`files` |

## 怎么调用

调用范式（主包AI 侧）：

1. `list_workers` 取外包工名单与状态（`ready` / `busy` 可派单；`login_required` / `unavailable` / `disabled` 指定会被拒绝）。
2. `dispatch_task` 派单：`task` 为任务文本；缺省按优先级选人，`worker` 传自定义名或条目 id ⇒ 硬绑定、不降级；
   附件给本机绝对路径数组；`waitSeconds > 0` 会等到终态或到点（任务不会因等待中断）。
3. `get_task` 轮询：`state` 终态 = `done` / `failed` / `canceled` / `needs_human`；过程态 `phase ∈ opening | uploading | sending | streaming | extracting | finalizing`。
4. 终态后 `fetch_result` 取答复文本与文件清单（长文在交付目录的 `answer.md`，超出内联上限会截断并置 `textTruncated: true`）；返回的 `outboxDir` = 该单实际交付目录。

示例（派单）：

```json
{ "task": "给出一个 python 代码块：首行注释 # file: hello.py，内容为 print(\"hello\")。", "waitSeconds": 60 }
```

要点：

- 任务失败不抛协议错误：工具返回 `isError: true`，内容为 JSON `{ code, message, hint }`（业务 / 任务失败）或 `result.error`（任务视图内）。
- `waitSeconds` 上限 600；到点未完成只返回当时状态，任务继续执行。
- 附件只接受派单显式给出的本机绝对路径（存在、普通文件、大小与数量受配置上限约束）；本工具不提供「读任意文件」能力。
- 产物是原文原文件，不做内容改写；同一任务号可重复 `fetch_result`。

派单体量与稳定性（2026-10-11 实测，供主包AI 参考）：

- **附件 ≤ 8 个 / 合计 ≈ 110 KB、任务文本 ≤ 约 600 字：稳定**（四轮全过：1 附件 6 KB → 8 附件 108 KB + 中长文本，耗时 6–12s）。
- **答复长度到 ≈ 4.7 千字未见截断**（实测要求 1500 字、实回 4715 字，22s）。
- **真正的风险不在体积，而在「连续高频」**：同一账户短时间内连发多单后，后续派单可能连续失败（实测：9 连发探针之后紧接的派单连续 3 次失败，`E_SEND_FAILED` → `E_STREAM_PARSE`）——**建议单次派单之间留开间隔，批量任务逐单串行**。
- 超大附件（单个 ≥ 数 MB）未实测；需要时可从 `get_task` 的 `phase = uploading` 观察上传阶段。

## 出错怎么办

失败信封 = `isError: true` + 单个 text 内容块，JSON 形如 `{ "code": "...", "message": "...", "hint": "..." }`。
分流规则：`needsHuman = false` ⇒ 机器原因，可重派或修正后重试；`needsHuman = true` ⇒ **需要人来处理**（见下节）。

| 码 | 触发 | 建议 | needsHuman |
|---|---|---|---|
| `E_BAD_ARGS` | 入参不合法 | 修正参数后重试 | 否 |
| `E_TASK_UNKNOWN` | 任务号不存在（含应用重启前） | 核对任务号；产物仍留在交付目录 | 否 |
| `E_TASK_ALREADY_SENT` | 任务已发送后补附件 | 改为新派单并携带附件 | 否 |
| `E_WORKER_UNKNOWN` | 指定名不在已登记列表 | 用 `list_workers` 取可用名单 | 否 |
| `E_WORKER_DISABLED` | 指定外包工被停用 | 启用或改派 | 否 |
| `E_WORKER_UNAVAILABLE` | 外包工当前不可用（指定 = 硬绑定不降级） | 人工处理后（必要时点托盘「我已处理」清除冷却）再重派 | 是 |
| `E_NO_WORKER` | 派单时无任何可用外包工 | 人工检查登录 / 启用状态 | 是 |
| `E_LOGIN_REQUIRED` | 平台需要登录 | 请人在窗口登录，点托盘「我已处理」后重派 | 是 |
| `E_CAPTCHA_OR_RISK` | 出现验证码 / 风控 | 请人在窗口处理，再点托盘「我已处理」后重派（否则冷却 10 分钟） | 是 |
| `E_SELECTOR_MISSING` | 页面结构变化或外包工开关应用失败 | 该外包工暂不可用，需适配（附截图） | 是 |
| `E_SEND_FAILED` | 发送动作失败 | 已自动重试；可重派 | 否 |
| `E_NO_RESPONSE` | 发送后无响应流 | 可重派 | 否 |
| `E_TIMEOUT` | 阶段或总时长超时 | 可重派；持续出现请检查平台状态 | 否 |
| `E_STREAM_PARSE` | 流解析与 DOM 兜底均失败 | 可重派 | 否 |
| `E_CANCELED` | 已被取消 | 如需继续请重派 | 否 |
| `E_BAD_FILE` | 附件不存在 / 超限 / 非普通文件 | 修正路径与大小后重试 | 否 |
| `E_OUTBOX_WRITE` | 产物落盘失败 | 检查交付目录权限与磁盘空间 | 是 |
| `E_ENGINE_DOWN` | 引擎不可用（已自动重启） | 进行中任务失败，可重派 | 否 |
| `E_INTERNAL` | 未归类内部错误 | 附日志路径 | 是 |

重试与降级规则（派单方需要知道的边界）：

- 瞬时错误（`E_TIMEOUT` / `E_NO_RESPONSE` / `E_SEND_FAILED` / `E_STREAM_PARSE`）：工具自动同外包工重试（≤2 次，退避 3s / 10s），耗尽 ⇒ 任务 `failed`。
- 外包工不可用类（`E_LOGIN_REQUIRED` / `E_CAPTCHA_OR_RISK` / `E_SELECTOR_MISSING` / `E_WORKER_UNAVAILABLE`）：默认路径**降级到下一优先级**；**指定（硬绑定）不降级**；降级耗尽 ⇒ `needs_human`。
- 派单期同步拒绝（不创建任务）：`E_BAD_ARGS` / `E_BAD_FILE` / `E_WORKER_UNKNOWN` / `E_WORKER_DISABLED` / `E_LOGIN_REQUIRED` / `E_WORKER_UNAVAILABLE` / `E_NO_WORKER`。
- 任务期才发现的失败：任务已创建，按上述规则走终态。
- **「连续失败」的自救顺序（2026-10-11 实测经验）**：① `E_SEND_FAILED` 首次出现 ⇒ 停 30–60s 再重派（多为账户 / 页面瞬时状态，非体积超限）；② 连续 2–3 次失败 ⇒ **重启应用**（托盘退出后重开）——长时间运行的常驻实例其浏览器页面会变旧，重建后恢复；③ `E_STREAM_PARSE` ⇒ 答复流缺结束标记，重派即可；若任务本身要求超长输出，建议拆成多单。

## 何时需要人来操作

当任务 `state = needs_human`，或错误码表 `needsHuman = true` 时：本工具已经尽力，**再派单也不会成功**，
必须先等操作者在浏览器窗口里处理完（登录 / 验证码 / 风控），或由操作者排查交付目录与磁盘。

- 常见路径：`E_LOGIN_REQUIRED` ⇒ 请人在打开的浏览器窗口登录一次（并在托盘点「我已处理」清冷却）；`E_CAPTCHA_OR_RISK` ⇒ 请人完成验证码后点「我已处理」；
  `E_OUTBOX_WRITE` ⇒ 请人检查交付目录；`E_SELECTOR_MISSING` ⇒ 页面可能改版，需开发者适配（已留失败截图）；**若该外包工是「自定义」平台** ⇒ 不要等开发者：把回执里的「阶段 + 未匹配项」交给你的主包AI，由它改这台外包工的驱动参数（输入区 / 发送键 / 回复区选择器，见接入说明第十节）后重派。
- 人工处理入口（工具外）：托盘通知、留着的浏览器窗口、任务目录 `screenshots/` 里的失败截图、日志 `%APPDATA%\free-outsource\logs\app.log`。
- 处理之后：**先点托盘菜单「我已处理（清除外包工冷却）」→ 再重新派单**（工具不自动重跑历史任务；应用重启会标记未完成任务为 `interrupted`）。
