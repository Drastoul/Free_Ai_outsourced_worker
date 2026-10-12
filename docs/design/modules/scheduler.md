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
| `phase` | running 内部阶段：`opening → uploading → sending → streaming → extracting → finalizing`（opening 内部：打开页面 → 会话复用判断（未复用则新会话）→ 应用外包工开关；复用策略见 `modules/browser-engine.md` §9） |
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
      带附件 ∧ w 平台能力 upload !== true ⇒ 拒绝：E_WORKER_UNAVAILABLE（不建任务、不置冷却）
      return w
  else：
      for w in workers（按数组顺序）：
          if !w.enabled                  → 记录跳过(disabled)，继续
          if w 冷却中 / 不健康            → 记录跳过(reason)，继续
          if 带附件 ∧ 平台能力 upload !== true → 记录跳过(no-upload)，继续
          return w        // 第一个健康者；即使它正忙也选它（任务在其队列排队）
      全部跳过 ⇒ 拒绝（不建任务）：E_NO_WORKER
```

- **忙 ≠ 不可用**：高优先级外包工忙碌时任务**排队等待**，不换人（K6）。理由：「按优先级使用」的直读；避免静默换平台。
- 上列「拒绝」= **同步拒绝、不建任务**；建任务 / 不建任务的边界与派单期错误码全集见 `docs/design/modules/mcp-server.md` §3.2。
- 健康判据：最近一次健康检查 / 任务结果；`login_required`、`captcha_cooling`、`unavailable` 均视为不健康。
- **附件能力门（b7）**：带 `files` 派单时，显式指定无送件能力者 ⇒ 同步拒绝；优先级 / 降级路径跳过该类候选（`requireUpload`）。判定口径见 §10（能力位取自适配器注册表归一化）——本节为选人算法本体，不复制口径。

## 5. 并发与排队

- 每外包工并发 = `scheduler.perWorkerConcurrency`（默认 1）：同一浏览器配置目录为单写者。
- 全局并发 = `scheduler.globalConcurrency`（默认 2）：允许多外包工并行（b1 实际只有一个外包工时等效 1）。
- 排队顺序：FIFO（按 `createdAt`）。
- **选人结果在派单时写入** `worker` / `selection`，并随初始 manifest 落盘（排队期即可查得 `manifest.worker`——AC-R4a-3 判据）；出队时只**复核**该外包工仍可用：可用 ⇒ 原样执行（不重新选人，避免排队期换人漂移）；不可用 ⇒ 按降级规则处理（§6）。

## 6. 重试与降级

| 错误类 | 码 | 处置 |
|---|---|---|
| 瞬时（可重试） | `E_TIMEOUT` `E_NO_RESPONSE` `E_SEND_FAILED` `E_STREAM_PARSE` | 同一外包工重试 ≤ `retryPerWorker`（默认 2），退避 3s / 10s；耗尽 ⇒ failed |
| 外包工不可用（可降级） | `E_LOGIN_REQUIRED` `E_CAPTCHA_OR_RISK` `E_SELECTOR_MISSING` `E_WORKER_UNAVAILABLE` | 该外包工置冷却（默认 10 分钟，或人工处理后清除——**载体 = 托盘菜单「我已处理（清除外包工冷却）」，粒度 = 全部外包工**）；任务转下一优先级；最多尝试 `maxFailoverWorkers`（默认 3）个外包工 |
| 不可恢复 | `E_BAD_FILE` `E_BAD_ARGS` `E_OUTBOX_WRITE` | 不重试；直接失败（`E_OUTBOX_WRITE` 归 needs_human） |

- **自定义外包工改驱动参数 ⇒ 清该条目冷却（b7）**：主进程应用 `worker.setDriver`（或 url / driver 任何变更）后**同步清除该条目健康记录**（`workforce.clearHealth(id)`；与设置服务的 `pruneWorkerHealth` 同一清除机制、目标不同——后者清已离册的陈旧 id）。理由：驱动参数不匹配属「预期首次失败」（F11.3 二次优化回路），照常置 10 分钟冷却会挡住「改完参数 ⇒ 立即重派」；清除后该条目即时回 `ready`。判据 = §11 单元 + 批次档 b7 §2 人工场景。

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
| opening（打开页面 / 会话复用判断（未复用则新会话） / 应用外包工开关） | `limits.timeouts.openingMs`（60s） | `E_TIMEOUT` |
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

- 逐行 JSON-RPC（stdio）：`engine.health`、`task.run({taskId, worker, prompt, files, outboxDir, toggles})`、`task.cancel({taskId})`；**`worker` = 对象 `{id, name, platform}`**（与 manifest / TaskView 同形：`id` 定位 `<userData>/profiles/<workerId>/`、`platform` 选适配器）；`toggles` = 该外包工配置值（`{thinking, search}`，**主进程传入**——引擎不自行读配置，保持单一事实源；应用与核对见 `docs/design/modules/adapters.md`「外包工开关的应用与核对」）；`session` = 会话复用策略值（`{reuse, ttlMs, maxTasksPerSession}`，同样**主进程传入**——缺省时引擎用同一套设计默认值；机制见 `modules/browser-engine.md` §9）。
- **自定义平台的载荷与附件能力门（b7）**：`platform = 'custom'` 的 `worker` 另带 `url` / `driver`（逐键；由主进程 `workforce.toEngineWorker` 生成、缺省不出现；绑定见 `docs/design/modules/adapters.md` §6）；`worker.check` 的 `worker` 同形。
  **附件能力门**：带 `files` 派单时，显式指定「平台能力 `upload !== true`」的外包工 ⇒ **同步拒绝** `E_WORKER_UNAVAILABLE`（不建任务、不置冷却）；优先级 / 降级候选跳过该类（`workforce.pick` / `nextAvailable` 的 `requireUpload`）——引擎 uploading 相位的既有拒绝仍是兜底。**能力位判定取自适配器注册表并归一化**（缺项 / 未注册平台 ⇒ 按「不支持送件」），与界面 `platforms[].toggles` 同派生处——**单一来源，不另立能力表**。
- 引擎回报结果清单：`delivery` + `toggles: {configured, payload, ok, checked, unsupported}`（b6 起后两键；形状见 `docs/design/overview.md` §3.2 第 7 步）；**失败 = result 内 `error: {code, message, hint?} | null`**（与 manifest 的 `error` 同形；**JSON-RPC error 仅用于协议级 / 内部异常**，不承载业务失败）；失败时 `delivery` / `toggles` 可缺席（缺席 ⇒ 视为未产出，不得为凑字段造值）。
- 进度事件：`{event: "task-progress", taskId, phase}`（供 `get_task` 展示）。
- 引擎崩溃：主进程重启引擎并置进行中任务 `E_ENGINE_DOWN`（可重派）。
- **设置界面「打开并检查」的增量方法**（b2；2026-10-09 主包AI 裁定）：`worker.check({worker: {id, name, platform}})` ⇒ `result = {status, detail?}`（`status ∈ ready | login_required | captcha | unavailable`，与引擎 `opening` 词表同源；失败走既有 `result.error` 口径）。语义 = 打开 / 复用该外包工浏览器会话并刷新登录态（**不发送消息、不关窗口**）；该外包工有在途任务时直接拒绝。既有四方法（`engine.health` / `task.run` / `task.cancel` / `engine.shutdown`）契约不变。
- **残余风险（b2 已知并接受，2026-10-09 主包AI 裁定）**：上条是「**检查发起时**」的时点判定——检查在途期间新到达的派单会与该次检查**复用同一会话页**（页面复用见 `src/engine/browser.mjs` 的 `sessionPage`）。冻接口「有在途任务 ⇒ 拒绝」已满足，反方向未拦。影响 = 该任务可能落到 `E_LOGIN_REQUIRED` / 选择器类错误（**可重派**）；窗口 = 单次检查时长（≤ `openingMs`）。**消除它需把检查纳入每外包工串行（属新机制，须另立设计）**——已记技术待办，收口时裁定是否补。
- **调用预算（deadline）来源 = 主进程**（不给引擎加预算入参）：设置服务按 `limits.timeouts.openingMs` 设本次调用**显式超时**（`EngineClient.call` 的 `timeoutMs` 选项——引擎不读配置，单一事实源口径同本节首条 `toggles`）；超时 ⇒ 该次检查结果丢弃（晚到响应按既有「无对应在途请求」语义忽略）、界面按超时示错，下一次检查可重取。

## 11. 验收判据

- 单元（随批归档）：选人算法（优先级 / 硬绑定 / 忙排队 / 降级轨迹）、状态机转换、重试计数与退避、`E_SELECTOR_MISSING`（含开关应用失败）在 b1 单外包工配置下的降级与终态；b7 增：`requireUpload` 过滤与同步拒绝、`clearHealth` 健康清除语义（置冷却 ⇒ `statusOf` 回 `ready`）。
- 集成：`npm run verify:loop`（真机全链）。
- 集成（b5）：`npm run verify:engine` 含会话复用场景（连续两单复用 / TTL 到期换新 / 出错即换新 / 上限换新 / 禁用回退 / 取消即换新 / 复用 × DOM 兜底；见 `modules/browser-engine.md` §9）。
- 集成（b7）：`npm run verify:engine` 含自定义外包工场景（happy path + 本单锚定 / 驱动缺失与不匹配的定位回执 / 驱动参数生效；见 `docs/batches/b7-custom-workers.md` §2）。
- 对应需求验收：AC-R4a-1..3、AC-R4b-1..3、AC-R3-5、AC-R8-3（处置路径）。
