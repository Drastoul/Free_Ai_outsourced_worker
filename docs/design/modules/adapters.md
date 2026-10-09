# 模块设计 · 外包工适配器（接口 + DeepSeek 首实现）

> 职责：适配器接口（capabilities / 发送 / 收流 / 取件 / 健康检查）与 DeepSeek 首实现的页面与协议细节（**DeepSeek 流协议的权威描述**）。
> 不在本文：调度与选人（`docs/design/modules/scheduler.md`）、浏览器实例与配置目录（`browser-engine.md`）、产物落盘规则（`outbox.md`）。

## 1. 边界

- 适配器只回答「这个平台怎么操作页面、怎么收答复、怎么取件」。
- 新增平台 = 新增一个适配器模块 + 注册；不改调度与协议面。

## 2. 适配器接口

```js
// 每个适配器模块默认导出一个对象（在引擎子进程内运行）
export default {
  id: 'deepseek',                 // 平台标识（稳定，用于配置与 manifest）
  platformName: 'DeepSeek',       // 展示名
  url: 'https://chat.deepseek.com/',
  capabilities: {                 // 能力声明（调度与取件据此分支）
    newChat: true, upload: true, downloadCapture: true, codeBlockExtract: true, streamCapture: true,
    toggles: true,                // 外包工开关（R8，见 §3.8）；false ⇒ 引擎跳过开关子步
    requestPayloadCapture: true,  // 请求载荷捕获（R8 核对）：从 chat/completion 请求体读出 thinking_enabled / search_enabled（见 §3.8）
  },
  selectors: { /* 页面元素台账，见 §3.1 */ },
  checkLogin(page),               // → 'ready' | 'login_required' | 'captcha'
  openSession(page),              // 新会话（每单独立，避免上下文污染）
  applyToggles(page, toggles),    // 开关对齐（R8）：失败 ⇒ E_SELECTOR_MISSING、不发送（见 §3.8）
  requestPayload: { toggles(payload) },  // 纯函数（可单测）：从 chat/completion 请求载荷读出 { thinking_enabled, search_enabled }；未捕获 / 键缺失 ⇒ null（R8 核对，见 §3.8）
  uploadFiles(page, files),       // 附件上传
  send(page, text),               // 发送任务文本
  stream: { match(url), parse(body) },   // 答复流：命中判定 + 纯函数解析（可单测）
  dom: { collect(page) },                // 兜底：最后助手回合的全部 markdown 块
  extract: { filesFromText(text) },      // 代码块 → 文件清单（纯函数，可单测）
};
```

## 3. DeepSeek 首实现（依据第 0 步探针实测，全部为真机证据）

### 3.1 页面元素台账

| 元素 | 定位方式 | 证据 |
|---|---|---|
| 输入框 | `textarea`（placeholder「给 DeepSeek 发送消息」），取第一个可见 | `probe/probe-deepseek.mjs:46`、`probe/out/run.log` |
| 发送 | 聚焦输入框 + `insertText` + `Enter`；落地失败兜底逐字 `type` | `probe/probe-deepseek.mjs:107-155` |
| 新会话 | 文案为「开启新对话」的可见 div（探针抓到 `div._7b40dad`；类名易变 ⇒ 按文案找） | `probe/probe2-deepseek-files.mjs:121-137` |
| 附件 | `input[type="file"]`（accept 覆盖 .py/.txt/.pdf/图片等）；`setInputFiles` 后界面显示文件名 | `probe/probe2-deepseek-files.mjs:141-166` |
| 答复块（DOM 兜底） | `[class*="ds-markdown"]`（会夹带「复制 / 下载」按钮文字） | `probe/probe3-deepseek-stream.mjs:150-159` |
| 答复流 | `POST https://chat.deepseek.com/api/v0/chat/completion`（SSE） | `probe/probe3-deepseek-stream.mjs:111-114` |
| 开关（深度思考 / 智能搜索） | 按文案匹配 `div.ds-toggle-button`；状态读 `aria-checked`（`true`/`false`），`--selected` 类为辅；点击策略见 §3.8 | `probe/probe5-deepseek-toggle-click.mjs:40-81`、`probe/out5/run.log:2-5` |
| 下载按钮（代码块「下载」） | 文案「下载」的可见元素（取 `closest('[role="button"],button')`）；点击 ⇒ 真实浏览器下载（另开 `edge://downloads-hub/` 页） | `probe/probe6-deepseek-download-cdp.mjs:104-114`、`probe/out6/run.log:7-10` |

### 3.2 执行流水

1. 新会话（`capabilities.newChat`）——每单一条独立会话。
2. 应用外包工开关（`capabilities.toggles`；细见 §3.8）：把 `toggles.thinking` / `toggles.search` 对齐到页面开关；失败 ⇒ `E_SELECTOR_MISSING`，不进入发送。
3. 有附件 ⇒ `setInputFiles`，等界面出现文件名（送件，决策 H）。
4. 发送：聚焦输入框 + `insertText` + `Enter`（先校验文本已落入输入框，未落则逐字 `type` 兜底）。

### 3.3 收答复主通道：流协议（与 `probe/out3/raw-sse.txt` 逐条对照）

- 只处理 `data:` 行；`event:` 行仅作事件分类；空载荷与 `[DONE]` 跳过；JSON 解析失败跳过。
- 帧形态 A（首信息帧）：
  `{"v":{"response":{…,"fragments":[{"type":"RESPONSE","content":"…"}…]}}}`
  ⇒ `type=RESPONSE` 的 content 入正文，`type=THINK` 入思考区；「当前路径」置为 `response/fragments/-1/content`。**首帧 content 是快照：必须累积；后续 APPEND 从其后续写、不重复（fixture 实证：`docs/batches/b1-core-loop.fixtures/raw-sse.txt:7` 首帧 `content="完成"`，`:9` 起才 APPEND 续写）。**
- 帧形态 B（带路径帧）：`{"p":"…","o":"APPEND|SET|BATCH","v":…}`
  - p 命中内容路径（`/content` 或 `/thinking_content` 结尾）⇒ 追加 v 到对应区；
  - p 为其他（status / 元数据）⇒ **只更新当前路径指针，不追加**。
- 帧形态 C（续写帧）：`{"v":"…"}`（无 p）⇒ 追加到「当前路径」，且**仅当当前路径是内容路径**。
- 结束标记：`{"p":"response/status","o":"SET","v":"FINISHED"}`（raw-sse.txt 第 79 行）或 BATCH 帧中的 `quasi_status:"FINISHED"`（第 77 行）。
- **纪律（探针教训）**：正文只允许在内容路径上累积；status/元数据帧不得混入正文。
  探针 2 的解析器在此处出过 bug（`{"v":…}` 一律计入正文），探针 3 修正并以真实流验证（`probe/out3/run.log`：42 事件、正文 106 字、思考 0 字）。

### 3.4 DOM 兜底通道

- 取「最后一个助手回合」范围：以最后一个 `[class*="ds-markdown"]` 块向上找容器（`closest('[class*="message"]')` 等），在该容器范围内**拼接全部** markdown 块（探针 2 只取最后一块 ⇒ 漏内容；探针 3 修正）。
- DOM 文本会夹带界面按钮文字（复制 / 下载，见 `probe/out3/run.log` 的 DOM answer）⇒ 只作兜底；`delivery.transport = "dom"` 时在回执与 manifest 中明示。
- 触发条件：网络流未捕获（平台改版 / 拦截失败）且 DOM 文本连续稳定（探针窗口：2s × 3 次稳定）。
- 兜底时同样要等到「结束」——以文本稳定替代流内结束标记。

### 3.5 取件三层与送件

- 落盘规则见 `docs/design/modules/outbox.md`「取件三层的落盘规则」；本适配器提供：代码块抽取纯函数（首行 `# file:` / `// file:` / `<!-- file: -->` 命名）与下载归属约定。
- **取件层①（下载）的真实路径**：代码块「下载」按钮触发**真实浏览器下载**（文件名形如 `deepseek_python_<日期>_<hash>.py`，`probe/out6/run.log:8`），并会另开一个 `edge://downloads-hub/` 页面（`probe/out6/run.log:9`）。
  落盘 = 引擎的 **CDP 自动落盘**（`Browser.setDownloadBehavior`，见 `docs/design/modules/browser-engine.md`「下载捕获」）——**`saveAs` 不作主路径**：探针 5 实测 downloads-hub 场景下 `saveAs` 随上下文关闭失败（`probe/out5/run.log:11-14`）；探针 6 以 CDP 复验落盘成功、内容与代码块一致（`probe/out6/run.log:22-23`）。
- 送件 = `input[type="file"]` + `setInputFiles`（决策 H）。

### 3.6 登录与异常检测

- 未登录：页面出现登录词（探针 1 的 LOGIN_WORDS）或输入框长时间不出现 ⇒ `login_required`。
- 验证码 / 风控：探针未覆盖该场景 ⇒ 采用启发式检测（出现验证码元素 / 风控文案即判 `captcha`），命中即 Tasks 落 needs_human 并留截图。
- 页面改版：发送前关键选择器缺失 ⇒ `E_SELECTOR_MISSING` + 截图（该外包工暂时不可用）。

### 3.7 计时基线

- 小任务端到端约 8–22 秒（批次档 §1）；探针 3 实测：+4.6s 发送 → +12.7s 收齐（约 8.1 秒，`probe/out3/run.log`）；超时默认值见 `docs/design/modules/scheduler.md`「阶段超时表」。

### 3.8 外包工开关的应用与核对（R8；DeepSeek 首实现）

- 配置源：外包工级 `toggles.thinking` / `toggles.search`（schema 见 `docs/design/overview.md`「配置存储」；界面随 b2）——**由主进程经 `task.run` 入参传入**（引擎不自行读配置，保持单一事实源；接口见 `docs/design/modules/scheduler.md` §10）；开关权威 = 外包工设置，不做每单临时覆盖。
- 应用时机：opening 阶段、新会话打开后、发送前（调度侧见 `docs/design/modules/scheduler.md`「重试与降级」「阶段超时表」）。
- 元素与状态读法：按文案「深度思考」/「智能搜索」匹配 `div.ds-toggle-button`；状态以 `aria-checked`（`true` / `false`）为权威，`--selected` 类为辅（`probe/out5/run.log:2`）。
- 点击策略：首选 `page.locator(...).click()`（探针 5 实测一击生效，`probe/out5/run.log:3-4`）；失败逐级兜底 = `force` → JS `click()` → 坐标点击（`mouse.click`）→ 事件派发（pointer / mouse 序列）；**每级策略后均以 `aria-checked` 复核**，生效即止；全部无效 ⇒ 判应用失败（策略对照 `probe/probe5-deepseek-toggle-click.mjs:50-81`）。
- 发送前复核：两开关状态与配置一致才进入发送；元素缺失 / 切换后状态不符 ⇒ `E_SELECTOR_MISSING`（按「外包工不可用（可降级）」处置，见调度档「重试与降级」），**不静默带错发送**。
- 权威核对：以 `chat/completion` 请求载荷的 `thinking_enabled` / `search_enabled` 为最终真相（探针 5 实测 `thinking=true search=false`，`probe/out5/run.log:6`）；核对结果随任务记录（`manifest.toggles`，见 `docs/design/modules/outbox.md`）。
- 捕获与回报：引擎按 `stream.match` 命中本任务 `chat/completion` 请求（`page.on('request')`）⇒ 取请求体交 `requestPayload.toggles(payload)`（§2）读出两键；任务收尾时随结果清单回报 `toggles: {configured, payload, ok}`（`configured` = 传入配置值回显、`payload` 未捕获 ⇒ `null`、`ok` = 两者一致；清单形状见 `docs/design/overview.md` §3.2 第 7 步）——主进程据此写 `manifest.toggles`。
- 日志落点（AC-R8-2 日志侧）：应用 / 复核后记一行「目标值 / 实际值 / 复核结果」——目标值 = `configured`、实际值 = 页面 `aria-checked` 复核读数、复核结果 = `ok` 一致判定；不含敏感值（令牌 / Cookie 不入日志，口径见 `docs/design/overview.md`「安全」）；判据主次 = 载荷随动 + `manifest.toggles` 为主、本日志为辅。
- 已知观察（不影响交付）：深度思考开启后的「思考文本」流分片本轮未观测到（`probe/out5/run.log:9` thinkingLen=0）；开关生效以载荷核对为准；THINK 分片若出现，按 §3.3 帧形态 A 规则入思考区、不混入正文。
- 无此能力的平台（`capabilities.toggles = false`）⇒ 跳过本子步（配置值保留、不报错）。

## 4. 新增平台接入清单（Kimi 等，b3）

1. 先跑探针（登录 / 输入框 / 发送 / 新会话 / 附件 / 答复流 URL 与协议 / 下载），全部取证；
2. 填齐本档 §2 接口：`selectors` / `capabilities` / `stream.parse` / `dom.collect` / 命名约定；
3. 干跑 `npm run verify:engine` 与 `npm run verify:loop`（把任务指向新平台）；
4. 不改调度与协议面——本档 §2 的接口即边界。

## 5. 验收判据

- 单元（随批归档）：`stream.parse` 以 `docs/batches/b1-core-loop.fixtures/raw-sse.txt` 为 fixture ⇒ 输出与 `docs/batches/b1-core-loop.fixtures/answer-sse.expected.md` **逐字一致**（**108 字符** = 首帧快照「完成」2 + 后续 APPEND 106；无尾换行）；
  `extract.filesFromText` 以该正文为输入 ⇒ 抽出 `greet.py` 与 `README.md`（对照 `probe/out3/artifacts/`）。
  **基线更正说明**：`probe/out3/answer-sse.md`（106 字）是探针 3 解析器 bug 的产物（帧形态 A 的首帧快照 content 未被累积）——验收基线以本行为准，旧文件仅作探针考古，**不得作为验收判据**。
- 集成：`npm run verify:loop`（真机，`delivery.transport = "sse"`；`manifest.toggles` 载荷核对 = AC-R8-1）。
- 集成：`npm run verify:engine` 开关失败场景（本地 fixture 页无 `div.ds-toggle-button` ⇒ 判 `E_SELECTOR_MISSING` 且未执行发送 = AC-R8-3）。
- 对应需求验收：AC-R3-2、AC-R3-4、AC-R8-1、AC-R8-3。
