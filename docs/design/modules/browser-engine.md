# 模块设计 · 浏览器引擎

> 职责：浏览器实例、持久化配置目录（登录态）、启动参数、下载捕获、崩溃重启、人工接管窗口。
> 不在本文：平台页面细节（`docs/design/modules/adapters.md`）、产物命名（`docs/design/modules/outbox.md`）、托管进程拓扑（`docs/design/overview.md`「进程形态与 MCP 接入」）。

## 1. 边界

- 只管「浏览器怎么起来、登录态放哪、下载怎么接住、崩了怎么办」；不解析任何平台内容。
- 有头模式是硬约束：登录 / 验证码 / 风控必须留出人工操作的窗口（设计点⑨）。

## 2. 配置目录与登录态隔离

- 每个外包工一个持久化配置目录：`<userData>/profiles/<workerId>/`（登录态互相隔离；删除外包工后目录保留，人工可删）。
- 仓库内 `.browser-profile/` 是**探针专用**目录（已进 `.gitignore`）；应用运行期一律用 userData 下的目录，保证登录态永不进版本库。

## 3. 启动参数（与探针实测一致）

```js
chromium.launchPersistentContext(profileDir, {
  channel: mode === 'edge' ? 'msedge' : undefined,   // 系统 Edge；否则随包 Chromium
  headless: false,
  viewport: null,
  acceptDownloads: true,                             // 下载事件照常触发（落盘走 CDP，见 §4）
  args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
});
// 上下文启动后设置 CDP 下载行为（§4）：Browser.setDownloadBehavior
```

- 浏览器选择（决策 C）：出厂 `browser.mode = chromium`（随包 Chromium，b4 打包携带）；可切 `edge`（本机实测通道，零浏览器下载——探针 1–3 即此路径）。
- b1 开发期若本机未安装 Playwright 的 Chromium，可把 `browser.mode` 置 `edge`；打包姿态以随包 Chromium 为准。
- 单写者：每个外包工同一时刻只有一个持久化上下文；该外包工的任务串行执行（与调度并发设置一致）。

## 4. 下载捕获（CDP 自动落盘）

- 机制：上下文启动时（引擎初始化）经 CDP 设置 `Browser.setDownloadBehavior`：`{ behavior: 'allow', downloadPath: 下载暂存区, eventsEnabled: true }`——浏览器把下载**直接落盘**到暂存区。
  **不用 `saveAs` 接下载**：探针 5 实测真实平台下载会另开 `edge://downloads-hub/` 页面、`saveAs` 随上下文关闭失败（`probe/out5/run.log:11-14`）；探针 6 以 CDP 自动落盘成功、内容与代码块一致、浏览器全程存活（`probe/out6/run.log:22-23`）。
- 下载暂存区 = `<userData>/downloads-staging/<workerId>/`（每外包工一份，并发下载归属无歧义）。
- 归属与落点：下载事件（`page.on('download')`）归属「该外包工当前正在执行的任务」⇒ 任务收尾时把本次下载的文件从暂存区移入 `<outbox>/<taskId>/files/`（净化命名见 outbox 档）。
- `edge://downloads-hub/` 页面：点平台下载按钮会另开该页面（`probe/out6/run.log:9`，页面数 1→2、浏览器存活）——**不计入会话页面**（不参与「当前会话页」判定）；任务收尾时关闭它（取不到则忽略）。
- 空闲期下载：留在暂存区并记日志（不误入任务）。
- 保存失败：记日志、不中断任务（下载只是取件三层之一）。

## 5. 首次登录引导与登录态失效

- 首次使用（该外包工无 profile 或无登录态）：打开平台页 → 判 `login_required` ⇒ 托盘通知「请在打开的浏览器窗口完成登录」；任务落 needs_human，窗口留给人工。
- 登录态检查时机：任务 opening 阶段逐单检查；`list_workers` 的 status 取自缓存 + 手动「打开并检查」（b2 设置界面提供按钮）。
- 换机口径（R9·F9.4）：登录态不跨机迁移——每台新 PC 上每个平台需人工登录一次（登录态落在该机 `<userData>/profiles/<workerId>/`）；界面引导见 `docs/design/modules/settings-app.md` §2。

## 6. 崩溃与重启

- 引擎子进程崩溃 ⇒ 主进程重启（指数退避，10 分钟内最多 3 次）；进行中任务置 `E_ENGINE_DOWN`（可重派）。
- 浏览器上下文意外关闭 ⇒ 下一个任务重新 launch（配置目录复用，登录态保留）。
- 退出清理：主进程退出前先发 `engine.shutdown`（关上下文）；超时 5 秒强杀子进程。

## 7. 空闲资源策略（open）

- 未定项：任务结束后是否自动关闭浏览器上下文省内存（现默认**保持常驻**——登录态与页面状态更稳、下次任务更快）。
- 若实测内存占用成为问题，再启用「空闲 N 分钟后关闭」；本项不阻塞 b1。

## 8. 验收判据

- `npm run verify:engine`（集成）：按配置启动上下文 → 打开本地 blob 页面触发下载 → 断言「下载事件触发 + CDP 自动落盘至暂存区 + 归属移入 files/ + 命名净化」；断言同一 profileDir 可连续两次 launch（复用成功）。
- 会话复用（b5）：`npm run verify:engine` 增含会话复用场景（连续两单复用 / TTL 到期换新 / 出错即换新 / 上限换新 / 禁用回退 / 取消即换新 / 复用 × DOM 兜底；本地 fixture + `openSession` 计数）——判据与读数口径见 `docs/batches/b5-session-reuse.md` §2；机制见 §9。
- 对应需求验收：AC-R3-3（开关应用失败场景见 `docs/design/modules/adapters.md`「验收判据」，AC-R8-3）。

## 9. 会话复用策略（b5）

同一外包工**连续任务复用同一聊天会话**（减少平台风控触发、相邻任务上下文连续）；会话单元为**引擎内存态、按 `workerId` 隔离、不落盘**（实现 `src/engine/session-policy.mjs`）。本节 = 机制权威；落地接线与验收见 `docs/batches/b5-session-reuse.md` §2。

- **会话单元**：`{ pageRef, sessionStartedAt, taskCount, lastTaskEndedAt, lastOutcome }`（`pageRef` 仅作页面身份比对，不调 Playwright API）。**不变量：单元实例锚定引擎进程生命周期**——单实例装配于 `createEngine`（`src/engine/host.mjs:40`）、由引擎级 `TaskRunner`（`:49` 构造一次）持有、跨 `task.run` 复用（不随单重建）；引擎重启 ⇒ 实例消失 ⇒ 首单 `absent`。
- **判断时点**：opening 阶段、`openSession` 之前（`src/engine/task-runner.mjs` opening 内）——`ensureOnPlatform` + `waitForLoginState` 之后；**登录检查每单照做**（§5）。
- **判定顺序（首个命中为准）**：

  | 序 | 条件 | 动作 | reason |
  |---|---|---|---|
  | 1 | `session.reuse === false` | 新会话 | `disabled` |
  | 2 | 无会话单元 | 新会话 | `absent` |
  | 3 | `pageRef` 与当前页不一致（上下文重启过） | 新会话 | `replaced` |
  | 4 | `lastOutcome === 'error'` | 新会话 | `error` |
  | 5 | `lastOutcome === 'canceled'` | 新会话（保守） | `canceled` |
  | 6 | `now > lastTaskEndedAt + ttlMs` | 新会话 | `ttl` |
  | 7 | `taskCount >= maxTasksPerSession` | 新会话 | `count` |
  | 8 | 其余 | 复用（跳过 `openSession`） | `reuse` |

- **写回**：每次引擎 run 的 `finally` 按 result 派生 `done` / `error` / `canceled` 落单元（`done` 才 `taskCount++`；均更新 `lastTaskEndedAt`）；仅 `newChat !== false` 的适配器记账。重试 = 新的引擎 run ⇒ 上一 run 已落 `error` ⇒ **重试天然新会话**（与 `scheduler.md` §3 一致）。
- **写回·result 派生判别**：`result.canceled === true` ⇒ `canceled`；否则 `result.error` 非空 ⇒ `error`；否则 `done`（取数点：`src/engine/task-runner.mjs:95` 初始化 / `:223-225`、`:236-237` 置位；主进程同口径 = `src/main/scheduler/policy.mjs:92-93`）。
- **作废 / 换新场景**：登录失效 / 风控 ⇒ 本单 error ⇒ 下一单新会话；浏览器上下文关闭 ⇒ `pageRef` 比对 ⇒ `replaced`；引擎重启 ⇒ 内存态消失 ⇒ 首单 `absent`；降级换人 ⇒ 每 `workerId` 单元独立；人工「我已处理」不触及会话单元（靠「出错即换新」覆盖）。
- **与 DOM 兜底的关系**：复用 ⇒ 页面留存上一单回合，DOM 兜底不得以「页面最后一个稳定文本」作完成判据——须锚定**本单回合**（约束与判据 = `docs/design/modules/adapters.md` §3.4）。
- **配置**：`session.reuse` / `session.ttlMs` / `session.maxTasksPerSession`（总键面见 `docs/design/overview.md` §4）。取用口径同 `toggles`：**主进程经 `task.run` 透传，引擎不自行读配置**（`docs/design/modules/scheduler.md` §10）；直接驱动引擎时缺省回落同一套设计默认值。
- **日志**：复用 ⇒ `复用会话（taskCount=… idleMs=…）`；新建 ⇒ `新会话（原因=…）`（引擎 task 日志，随 stderr 进 `<userData>/logs/app.log`）。
- **不承诺**（边界见批次档 §2）：不复用跨引擎重启 / 不跨外包工共享 / 不做上下文压缩 / 不做会话预热。
