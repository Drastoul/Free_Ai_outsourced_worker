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
  openSession(page),              // 新建聊天会话（何时新建由 docs/design/modules/browser-engine.md §9 判定；复用命中 ⇒ 不调用）
  applyToggles(page, toggles),    // 开关对齐（R8）：失败 ⇒ E_SELECTOR_MISSING、不发送（见 §3.8）
  requestPayload: { toggles(payload) },  // 纯函数（可单测）：从 chat/completion 请求载荷读出 { thinking_enabled, search_enabled }；未捕获 / 键缺失 ⇒ null（R8 核对，见 §3.8）
  uploadFiles(page, files),       // 附件上传
  send(page, text),               // 发送任务文本
  stream: { match(url), parse(body) },   // 答复流：命中判定 + 纯函数解析（可单测）
  dom: { collect(page) },                // 兜底：本单回合的全部 markdown 块（b5 起锚定本单，见 §3.4）
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

1. 会话准备（`capabilities.newChat`）：按会话复用判定（`docs/design/modules/browser-engine.md` §9）——复用命中 ⇒ 沿用当前会话（不调 `openSession`）；未复用 ⇒ 调 `openSession` 新建。
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
- **本单回合锚定（b5 起，所有适配器通用）**：会话复用（`modules/browser-engine.md` §9）下页面留存上一单回合 ⇒「页面最后一个稳定文本」不再是完成判据；`send()` 记录**发送前助手回合基线**（回合计数 / 末回合标识，存储形式自由），`dom.collect()` 只接受**基线之后出现的新回合**；无新回合 ⇒ 返回空串（引擎按 `E_NO_RESPONSE` 处置——不静默交付旧答复）。判据 = `npm run verify:engine`「复用 × DOM 兜底」例（交付文本 = 本单回合、不含上一单文本）。

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

## 5. Kimi 第二实现（b3 落地；依据探针 7–13 与 15–18 真机读数）

> 本节 = **Kimi 平台细节的权威落点**（与 §3 的 DeepSeek 同层级）；接口与通用规则仍见 §2。

### 5.1 页面元素台账

| 元素 | 定位方式 | 证据 |
|---|---|---|
| 输入框 | `.chat-input-editor`（contenteditable；输入前先清空） | `probe/out7` · `probe/out13` |
| 发送 | 聚焦 + `insertText` + 发送按钮；**Enter 可作兜底**（实测触发 `ChatService/Chat`） | `probe/out16`（K3，6 轮一致） |
| 新会话 | 文案「新建会话」元素（`div.action-label`，n=1）；**判据须按会话区**（body 级会被侧栏历史项名反证） | `probe/out16`（K4：`mainHas=false` / `bodyHas=true`） |
| 附件 | `input[type="file"]`（multiple）+ `setInputFiles`；**界面只显词干**（全名不出现）且 `input.files` 上传后被清空 ⇒ 等待谓词用**词干**或 **upload 请求**（`/apiv2-files/file/upload`）；请求体走 `file.id` 引用 | `probe/out16`（K5） |
| 登录态（两态互斥） | **ready** = `button.user-profile-trigger` 可见 ∧ 无 exact「登录」/「登录以同步历史会话」；**login_required** = 二者有其一（`button.user-info-container.user-area__main` / `button.next-sidebar-history-list__login`）；**「我的 Kimi」两态共有（各 5 个元素）⇒ 不得作 ready 依据** | `probe/out15`（K1） |
| 下载 | **无下载按钮**（静态 / hover 后均无）⇒ `downloadCapture=false` | `probe/out18`（K7，4 轮一致） |
| 答复容器 | `div.chat-content-item.chat-content-item-assistant` → `div.segment.segment-assistant` → `div.segment-container` → `div.segment-content` → `div.segment-content-box` | `probe/out18`（K9） |
| 正文块 / 思考区 | 正文 = `div.paragraph` + `div.syntax-highlighter.segment-code-content`（嵌套 `pre.language-python` 须**去重**）；**思考区文本同为 `div.paragraph`** ⇒ 须排除 `[class*="toolcall-content"]` / `thinking-container` 并**按 DOM 序**采集；**不可按 `toolcall` 粗排除**（答案区同在 `toolcall-rollup` 下） | `probe/out18`（K9；`naive` 口径混入思考文本已验证） |

- **空会话判据补充**：会话区容器不存在 ⇒ 按空会话判（首页空态）。
- **复用下的本单锚定（b5）**：同 §3.4——`send` 时记基线、`collect` 只取基线后的新回合（回合容器 = `div.chat-content-item.chat-content-item-assistant`；实现落 `src/engine/adapters/kimi-dom.mjs`）。

### 5.2 收答复主通道（分帧 JSON 行流，非 SSE）

- 响应体为**分帧 JSON 行流**；`stream.parse` 按帧内 JSON 对象扫描（`{"op":…}`）。
- **两类帧形分别处理**：**SET 帧**（`"mask":"block.text"` / `"block.think"`，内容嵌在值内）⇒ **首帧快照必须计入正文与思考区**（丢首字先例见 §3 基线更正）；**append 帧**（`"mask":"block.text.content"` / `"block.think.content"`）⇒ 追加固有序内容。
- **finished 判定顺序**：① `{"done":{}}` 帧出现 ⇒ finished（最高优先）；② 否则**仅助手消息**按 role / id 归并（system / user 消息同样带 `MESSAGE_STATUS_COMPLETED`，**不计**）；③ 无结束标记 ⇒ 抛 `E_STREAM_PARSE`。
- **重复 SET 快照（同 `block.id` 二次快照）**：按追加处理（样本每 block 仅一次快照，未被证伪）。
- 载荷读键（**仅供核对，本批未启用**）：`options.thinking` ↔ thinking；`tools` 含 `TOOL_TYPE_SEARCH` ↔ search。
- 版本化 fixture 与期望基线：`docs/batches/b3-kimi-adapter.fixtures/`（`chat-resp.txt` 逐字节副本 + 期望正文/思考，**独立推导、不得用被测解析器生成**）。

### 5.3 能力位（Kimi）

| 位 | 值 | 依据 |
|---|---|---|
| `newChat` / `upload` / `streamCapture` / `codeBlockExtract` | `true` | K4 / K5 / K6 / K6 样本 |
| `downloadCapture` | `false` | K7 无下载按钮 ⇒ 取件走层②③ |
| `toggles` | `false` | K8：search 键可对齐，但 thinking 键无控件且 `options.thinking` 恒 true ⇒ 落 true 会让 `manifest.toggles.ok` 恒判 false（失真）；「按子键能力位」另批议 |
| `requestPayloadCapture` | `false` | 同 `toggles` 口径（载荷不可核对则不假装可核对）⇒ `manifest.toggles.payload` 恒 `null` 属合法路径 |

- **无开关能力的平台** ⇒ 引擎跳过应用与复核子步、配置值保留不报错（§3.8 末行口径）；该平台 AC-R8-1/2/3 不适用（需求档同口径）。
- **已知不符（已记账）**：设置界面仍对 Kimi 渲染「深度思考 / 联网搜索」两开关并标「派单时自动应用」，与该能力位不符 ⇒ 收口/后续项。

