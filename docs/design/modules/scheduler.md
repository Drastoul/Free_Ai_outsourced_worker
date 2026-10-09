# 模块设计 · 任务调度

> 职责：任务生命周期（状态机）、选人、并发与排队、重试与降级、超时、取消。
> 不在本文：工具契约与错误码表（`docs/design/modules/mcp-server.md`）、浏览器与平台细节（`docs/design/modules/adapters.md`、`browser-engine.md`）、产物结构（`docs/design/modules/outbox.md`）。

## 1. 边界

- 只管「从派单到交付」的任务编排；不碰协议面，不碰页面元素。
- 一单只在一个外包工执行（不做拼单、不做结果合并）。

## 2. 任务模型

| 字段 | 说明 |
|---|---|
| `taskId` | `YYYYMMDD-HHmmss-<4位随机>`（本地时间，人可读） |
| `state` | `queued / running / done / failed / canceled / needs_human` |
| `phase` | running 内部阶段：`opening → uploading → sending → streaming → extracting → finalizing`（opening 内部：打开页面 → 新会话 → 应用外包工开关） |
| `worker` | `{id, name, platform}`（实际执行者；与指定 / 选人结果一致） |
| `selection` | `{mode: "priority" | "explicit", reason}`（为何选到它；降级时记录轨迹） |
| `attempts` | 每次尝试 `{worker, result, at}`（失败原因、降级过程） |
| `request` | `{task, files: [原始路径]}`（原文与附件，随 manifest 落盘） |
| `error` | `{code, message, hint, needsHuman}`（终态为 done / canceled 时为 null） |
| `timings` | `{createdAt, startedAt, finishedAt}` |
| `delivery` | `{transport, textPath, files[...]}`（见 outbox 档） |

## 3. 状态机

```
queued ──选人成功、引擎接单──▶ running(phase 链) ──▶ done
  │                              │
  │                              ├─▶ failed          （瞬时错误重试耗尽 / 产物落盘失败等）
  │                              ├─▶ needs_human     （登录失效 / 验证码风控 / 页面改版 / 降级耗尽）
  │                              └─▶ canceled        （取消）
  └─取消────────────────────────▶ canceled
```

- 终态：`done / failed / canceled / needs_human`（其余为过程态）。
- `needs_human` 与 `failed` 的分界：**需要人去处理才能继续**（登录 / 风控 / 页面改版（`E_SELECTOR_MISSING`）/ 降级耗尽）⇒ needs_human；纯机器原因（超时重试耗尽等）⇒ failed。
- **派单期拒绝 vs 任务期终态**：派单时不可选（指定不健康 / 无任何可用外包工）⇒ **同步拒绝、不建任务**；`needs_human` 只发生在任务已创建之后（规则与错误码全集见 `docs/design/modules/mcp-server.md` §3.2）。
- 重试 = **新会话重发整单**（不复用被中断的会话，避免半截上下文）。

## 4. 选人算法

```
入口：pick(task)
  if task.worker 指定：
      w = 按自定义名 trim 精确匹配，未中再按条目 id 匹配
      未命中        ⇒ 拒绝：E_WORKER_UNKNOWN（附可用名单）
      w 已停用      ⇒ 拒绝：E_WORKER_DISABLED
      w 不健康      ⇒ 拒绝：E_LOGIN_REQUIRED / E_WORKER_UNAVAILABLE（硬绑定，不降级；不建任务）
      return w
  else：
      for w in workers（按数组顺序）：
          if !w.enabled                  → 记录跳过(disabled)，继续
          if w 冷却中 / 不健康            → 记录跳过(reason)，继续
          return w        // 第一个健康者；即使它正忙也选它（任务在其队列排队）
      全部跳过 ⇒ 拒绝（不建任务）：E_NO_WORKER
```

- **忙 ≠ 不可用**：高优先级外包工忙碌时任务**排队等待**，不换人（K6）。理由：「按优先级使用」的直读；避免静默换平台。
- 上列「拒绝」= **同步拒绝、不建任务**；建任务 / 不建任务的边界与派单期错误码全集见 `docs/design/modules/mcp-server.md` §3.2。
- 健康判据：最近一次健康检查 / 任务结果；`login_required`、`captcha_cooling`、`unavailable` 均视为不健康。

## 5. 并发与排队

- 每外包工并发 = `scheduler.perWorkerConcurrency`（默认 1）：同一浏览器配置目录为单写者。
- 全局并发 = `scheduler.globalConcurrency`（默认 2）：允许多外包工并行（b1 实际只有一个外包工时等效 1）。
- 排队顺序：FIFO（按 `createdAt`）。
- **选人结果在派单时写入** `worker` / `selection`，并随初始 manifest 落盘（排队期即可查得 `manifest.worker`——AC-R4a-3 判据）；出队时只**复核**该外包工仍可用：可用 ⇒ 原样执行（不重新选人，避免排队期换人漂移）；不可用 ⇒ 按降级规则处理（§6）。

## 6. 重试与降级

| 错误类 | 码 | 处置 |
|---|---|---|
| 瞬时（可重试） | `E_TIMEOUT` `E_NO_RESPONSE` `E_SEND_FAILED` `E_STREAM_PARSE` | 同一外包工重试 ≤ `retryPerWorker`（默认 2），退避 3s / 10s；耗尽 ⇒ failed |
| 外包工不可用（可降级） | `E_LOGIN_REQUIRED` `E_CAPTCHA_OR_RISK` `E_SELECTOR_MISSING` `E_WORKER_UNAVAILABLE` | 该外包工置冷却（默认 10 分钟，或人工处理后清除）；任务转下一优先级；最多尝试 `maxFailoverWorkers`（默认 3）个外包工 |
| 不可恢复 | `E_BAD_FILE` `E_BAD_ARGS` `E_OUTBOX_WRITE` | 不重试；直接失败（`E_OUTBOX_WRITE` 归 needs_human） |

- 降级只发生在**预热阶段**（打开 / 登录检查 / 发送前）；进入 streaming 后不再换人（避免重复消耗平台额度）。
- **降级耗尽**（无下一可用外包工，或尝试数达 `maxFailoverWorkers` 上限）⇒ 终态 **needs_human**，错误码 = 最后一次尝试的错误码；b1 单外包工配置无下一优先级 ⇒ 直接落 needs_human。
- 指定（硬绑定）任务不降级：终态按 `docs/design/modules/mcp-server.md`「错误码」的 `needsHuman` 列（「是」⇒ needs_human；「否」⇒ failed）。
- 每次尝试写入 `attempts`；`selection.reason` 记「为何是它」（含降级轨迹）。
- 外包工开关应用失败（元素缺失 / 切换后状态不符）⇒ `E_SELECTOR_MISSING`，按上表「外包工不可用（可降级）」行处置；开关子步在发送前（§7 的 opening），失败即**不发送**（细节见 `docs/design/modules/adapters.md`「外包工开关的应用与核对」）。
- 开关应用与复核的**日志口径**（AC-R8-2 日志侧）：引擎在应用 / 复核后记一行「目标值 / 实际值 / 复核结果」（不含敏感值；机制见 `docs/design/modules/adapters.md`「外包工开关的应用与核对」）；判据主次 = 载荷随动 + `manifest.toggles` 为主、该日志为辅。
- `E_ENGINE_DOWN` 属引擎级故障（引擎子进程不可用）：处置 = 主进程重启引擎 + 进行中任务 failed（可重派），见 §10；不按外包工错误类处理。

## 7. 阶段超时表（配置键与默认值；与 `docs/design/overview.md`「配置存储」逐键对应）

| 阶段 | 配置键与默认值 | 超时错误码 |
|---|---|---|
| opening（打开页面 / 新会话 / 应用外包工开关） | `limits.timeouts.openingMs`（60s） | `E_TIMEOUT` |
| uploading（上传附件） | `limits.timeouts.uploadingMs`（60s） | `E_TIMEOUT` |
| sending（发送确认） | `limits.timeouts.sendingMs`（30s） | `E_SEND_FAILED` |
| streaming（首字节） | `limits.timeouts.streamFirstByteMs`（120s） | `E_NO_RESPONSE` |
| streaming（总时长） | `limits.timeouts.taskTimeoutMs`（300s） | `E_TIMEOUT` |
| extracting（落盘） | `limits.timeouts.extractingMs`（60s） | `E_OUTBOX_WRITE` |

## 8. 取消

- `queued` ⇒ 立即置 canceled（出队时跳过）。
- `running` ⇒ 通知引擎停止（停收流 / 停等待下载），置 canceled；页面不关闭；已写出的产物保留、`delivery.partial = true`。

## 9. 持久化与恢复

- 任务表在主进程内存；manifest 随状态更新落 outbox（见 `docs/design/modules/outbox.md`）。
- 应用重启：主进程扫描 outbox 中非终态 manifest ⇒ 写入独立标记字段 `interrupted`（`{ at, previousState }`，不进 `state` 枚举），不自动重跑（是否重来由主包AI 重新派单决定）。
- 重启后任务表为空：`get_task` / `fetch_result` 对内存中不存在的任务一律返回 `E_TASK_UNKNOWN`（不回落读 manifest）；产物与 manifest 原样留在 outbox（人工可取）。

## 10. 与引擎子进程的接口（摘要）

- 逐行 JSON-RPC（stdio）：`engine.health`、`task.run({taskId, worker, prompt, files, outboxDir, toggles})`、`task.cancel({taskId})`；`toggles` = 该外包工配置值（`{thinking, search}`，**主进程传入**——引擎不自行读配置，保持单一事实源；应用与核对见 `docs/design/modules/adapters.md`「外包工开关的应用与核对」）。
- 引擎回报结果清单：`delivery` + `toggles: {configured, payload, ok}`（形状见 `docs/design/overview.md` §3.2 第 7 步）。
- 进度事件：`{event: "task-progress", taskId, phase}`（供 `get_task` 展示）。
- 引擎崩溃：主进程重启引擎并置进行中任务 `E_ENGINE_DOWN`（可重派）。

## 11. 验收判据

- 单元（随批归档）：选人算法（优先级 / 硬绑定 / 忙排队 / 降级轨迹）、状态机转换、重试计数与退避、`E_SELECTOR_MISSING`（含开关应用失败）在 b1 单外包工配置下的降级与终态。
- 集成：`npm run verify:loop`（真机全链）。
- 对应需求验收：AC-R4a-1..3、AC-R4b-1..3、AC-R3-5、AC-R8-3（处置路径）。
