# 模块设计 · 外包工适配器（接口 + DeepSeek 首实现）

> 职责：适配器接口（capabilities / 发送 / 收流 / 取件 / 健康检查）与 DeepSeek 首实现的页面与协议细节（**DeepSeek 流协议的权威描述**）、Kimi 实现（§5）、自定义外包工的通用尽力驱动（§6；R11 / b7）。
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
    toggles: { thinking: true, search: true },  // 外包工开关（R8，见 §3.8）——**按子键**声明（b6 起；旧值 true/false 经归一化展开）；不受支持子键 ⇒ 引擎跳过该子键、设置界面不渲染对应开关
    requestPayloadCapture: true,  // 请求载荷捕获（R8 核对）：从 chat/completion 请求体读出 thinking_enabled / search_enabled（见 §3.8）
  },
  selectors: { /* 页面元素台账，见 §3.1 */ },
  checkLogin(page),               // → 'ready' | 'login_required' | 'captcha'
  openSession(page),              // 新建聊天会话（何时新建由 docs/design/modules/browser-engine.md §9 判定；复用命中 ⇒ 不调用）
  applyToggles(page, toggles),    // 开关对齐（R8）：入参 = 受支持子键的子集（b6 起）；失败 ⇒ E_SELECTOR_MISSING、不发送（见 §3.8）
  requestPayload: { toggles(payload) },  // 纯函数（可单测）：从 chat/completion 请求载荷读出 { thinking_enabled, search_enabled }；未捕获 / 键缺失 ⇒ null（R8 核对，见 §3.8）
  uploadFiles(page, files),       // 附件上传
  send(page, text),               // 发送任务文本
  stream: { match(url), parse(body) },   // 答复流：命中判定 + 纯函数解析（可单测）
  dom: { collect(page) },                // 兜底：本单回合的全部 markdown 块（b5 起锚定本单，见 §3.4）
  extract: { filesFromText(text) },      // 代码块 → 文件清单（纯函数，可单测）
};
```

- **可选钩子（b7）**：`bindWorker(worker)`——按外包工生成派生实例（`custom` 用 `url` / `driver` 覆盖；其余适配器不实现 ⇒ 行为零变化）；`loginFailure(page)`——登录态判定的失败诊断（返回 `{code, message}` 或 `null`；`null` ⇒ 按既有 `ready` / `login_required` / `captcha` 映射）；`dom.diagnose(page)`——DOM 采集失败的诊断单行串（可选；仅拼接、不解析）。
- **`streamCapture: false` 的发送确认口径（b7）**：无答复流可观测 ⇒ 引擎跳过 `waitForSendConfirm`，发送确认由该适配器 `send()` 自担（DOM 信号）；能力为 `true` 的适配器行为不变（仍以「观测到本任务答复流请求」为确认）。

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
- **基线打标失败不静默（b6）**：`send()` 记基线的动作失败（页面异常等极端窗口）⇒ 记一行日志（词形 `助手回合基线打标失败…`）并继续发送——不升级为任务失败（DOM 只是兜底通道）；此时 DOM 兜底可能把上一单回合计入，日志为事后取证线索。

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
- 捕获与回报：引擎按 `stream.match` 命中本任务 `chat/completion` 请求（`page.on('request')`）⇒ 取请求体交 `requestPayload.toggles(payload)`（§2）读出两键；任务收尾时随结果清单回报 `toggles: {configured, payload, ok, checked, unsupported}`——`configured` = 传入配置值回显（全两键）、`payload` 未捕获 ⇒ `null`（形状 = 各适配器映射原形）、`ok` = **受支持子键上** `payload` 与 `configured` 全等（b6 起；`payload` 未捕获 ⇒ `null`）、`checked` = 本次核对范围的受支持子键清单、`unsupported` = 其余子键（清单形状见 `docs/design/overview.md` §3.2 第 7 步）——主进程据此写 `manifest.toggles`（字段语义见 `docs/design/modules/outbox.md`）。
- 日志落点（AC-R8-2 日志侧）：应用 / 复核后记一行「目标值 / 实际值 / 复核结果」——目标值 = `configured`、实际值 = 页面 `aria-checked` 复核读数、复核结果 = `ok` 一致判定；不含敏感值（令牌 / Cookie 不入日志，口径见 `docs/design/overview.md`「安全」）；判据主次 = 载荷随动 + `manifest.toggles` 为主、本日志为辅。
- 已知观察（不影响交付）：深度思考开启后的「思考文本」流分片本轮未观测到（`probe/out5/run.log:9` thinkingLen=0）；开关生效以载荷核对为准；THINK 分片若出现，按 §3.3 帧形态 A 规则入思考区、不混入正文。
- **按子键执行（b6 起）**：应用与复核只对 `capabilities.toggles` 中声明为 `true` 的子键生效；不受支持子键跳过（配置值保留、不报错）；全部子键都不受支持 ⇒ 本子步整体跳过。
  归一化口径（`defineAdapter`）：能力位缺省 / 非法 ⇒ 两子键均不支持；旧值 `true` ⇒ 两子键均支持（兼容展开，不制造行为跳变）。

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
| 联网搜索（R8·search 子键） | 工具面板触发器 `div.icon-button.toolkit-trigger-btn`（`data-testid=toolkit-trigger-btn`）→ 行 `button.toolkit-item[role=menuitem]`（文案「联网搜索」）→ 子面板两行「自动搜索」/「关闭搜索」，状态读 `aria-checked` | `probe/out17`（A1，3 轮一致；选「关闭搜索」⇒ 请求 `tools` 去掉 `TOOL_TYPE_SEARCH`） |

- **空会话判据补充**：会话区容器不存在 ⇒ 按空会话判（首页空态）。
- **复用下的本单锚定（b5）**：同 §3.4——`send` 时记基线、`collect` 只取基线后的新回合（回合容器 = `div.chat-content-item.chat-content-item-assistant`；实现落 `src/engine/adapters/kimi-dom.mjs`）。

### 5.2 收答复主通道（分帧 JSON 行流，非 SSE）

- 响应体为**分帧 JSON 行流**；`stream.parse` 按帧内 JSON 对象扫描（`{"op":…}`）。
- **两类帧形分别处理**：**SET 帧**（`"mask":"block.text"` / `"block.think"`，内容嵌在值内）⇒ **首帧快照必须计入正文与思考区**（丢首字先例见 §3 基线更正）；**append 帧**（`"mask":"block.text.content"` / `"block.think.content"`）⇒ 追加固有序内容。
- **finished 判定顺序**：① `{"done":{}}` 帧出现 ⇒ finished（最高优先）；② 否则**仅助手消息**按 role / id 归并（system / user 消息同样带 `MESSAGE_STATUS_COMPLETED`，**不计**）；③ 无结束标记 ⇒ 抛 `E_STREAM_PARSE`。
- **重复 SET 快照（同 `block.id` 二次快照）**：按追加处理（样本每 block 仅一次快照，未被证伪）。
- 载荷读键：`options.thinking` ↔ thinking；`tools` 含 `TOOL_TYPE_SEARCH` ↔ search。启用由 `capabilities.requestPayloadCapture` 把守（b6 起为 search 核对候选；**C1 取数已命中 ⇒ 落值 `true`**（search = 应用 + 复核），口径见 `docs/batches/b6-small-items-and-repack.md` §2）。
- 版本化 fixture 与期望基线：`docs/batches/b3-kimi-adapter.fixtures/`（`chat-resp.txt` 逐字节副本 + 期望正文/思考，**独立推导、不得用被测解析器生成**）。

### 5.3 能力位（Kimi）

| 位 | 值 | 依据 |
|---|---|---|
| `newChat` / `upload` / `streamCapture` / `codeBlockExtract` | `true` | K4 / K5 / K6 / K6 样本 |
| `downloadCapture` | `false` | K7 无下载按钮 ⇒ 取件走层②③ |
| `toggles` | `{ thinking: false, search: true }` | b6 子键化：search 可对齐（`probe/out17` A1，3 轮一致）；thinking 无控件且 `options.thinking` 恒 true ⇒ 如实声明为不支持（不再拖 `manifest.toggles.ok`） |
| `requestPayloadCapture` | `true`（**b6 取数命中**） | 已实测：引擎 `request.postData()` 路径可读出分帧请求体 ⇒ Kimi 的 search 子键**既应用亦复核**；`payload` 键形 = `{thinking_enabled, search_enabled}`（与 `answer.mjs` 的 `ok` 比对读键同源）；未捕获 ⇒ `ok` 为 `null`（合法路径，不伪装绿） |

- **无受支持子键的平台** ⇒ 引擎跳过应用与复核子步、配置值保留不报错（§3.8 末行口径）；该平台 AC-R8-1/2/3 不适用（需求档同口径）；**部分子键受支持**的平台按受支持子键执行。
- **界面呈现（b6 起）**：按子键渲染——不受支持的子键不渲染开关、行内明示（口径 = `docs/design/modules/settings-app.md` §2；能力源 = `capabilities.toggles` 子键对象，经快照 `platforms[].toggles` 与引擎分支条件同源）。
- **Kimi 的 search 应用机械（b6）**：面板触发器 + 子面板两行的操作与复核落 `src/engine/adapters/kimi-toggles.mjs`（`kimi.mjs` 的 `applyToggles` 只收 search 子键）；失败（元素缺失 / 状态不符）⇒ `E_SELECTOR_MISSING`，不发送（§3.8 同口径）。

## 6. 自定义外包工（custom；b7 落地）

> 本节 = **自定义外包工的机制权威**（与 §3 DeepSeek / §5 Kimi 同层级）；接口与通用规则见 §2。需求 = R11 / **R12**；实施合同与判据 = `docs/batches/b7-custom-workers.md` §2（b7 面）· `docs/batches/b8-custom-worker-hardening.md` §2（b8 面）。
> **b8 增量（写入轴 / 遮挡处置 / 取答复候选族 / 诊断普查 / 错误映射）= 本节 §6.4 / §6.5 / §6.6 现行文**；本单锚定机制（基线标 + 基线文本集 + 回声过滤）不动。

### 6.1 形态与绑定

- 配置形态：`platform: 'custom'` + 每工人 `url`（http/https 绝对地址，必填）+ `driver` 三键（空串 = 通用启发式）；字段与校验见 `docs/design/overview.md`「配置存储」。
- 绑定：注册表 `adapterFor(worker)`——`custom` 实现 `bindWorker(worker)` 生成派生实例（覆盖 `url` / `driver`，其余引用不变）；**引擎不读配置**，url / driver 由主进程经 `task.run` / `worker.check` 的 `worker` 载荷透传（`docs/design/modules/scheduler.md` §10）。
  调用点 = 引擎 task-runner 与 worker-check（两处都由「按 `worker.platform` 取适配器」改为 `adapterFor(worker)`）。
- **必需函数占位**：`defineAdapter` 要求 `checkLogin` / `openSession` / `send`（`base.mjs:46-50`）与 `stream.match|parse`、`dom.collect`、`extract.filesFromText`（`:68-74`）；custom 全部提供，其中 `openSession` 为占位（`newChat:false` ⇒ 不应被调用）、`stream` 为 `match:()=>false` + 显式「不应被调用」的 parse。
- 登录态：每外包工独立配置目录（既有机制，见 `browser-engine.md` §2）；登录判据 = 输入区可见 ⇒ `ready`；验证码 / 风控词 ⇒ `captcha`；登录词 / 可见密码框 ⇒ `login_required`；输入区一直不出现 ⇒ 经 `loginFailure` 钩子报 `E_SELECTOR_MISSING`（message 含候选链与「若站点需要登录请先在窗口登录」）。

### 6.2 能力位（取值与依据）

| 位 | 值 | 依据 |
|---|---|---|
| `newChat` | `false` | 无通用「新建会话」判据 ⇒ 不调 `openSession`、不进会话复用记账（`browser-engine.md` §9）；页内旧回合由**本单回合锚定**（§3.4 通用形态）处置 |
| `upload` | `false` | 无通用「上传完成」判据 ⇒ 带附件派单在派单期被拒 / 跳过（`scheduler.md` §10「附件能力门」）；不静默发出丢掉附件的任务。**能力位判定取自适配器注册表并归一化**（缺项 / 未注册 ⇒ 按「不支持送件」），与界面 `platforms[].toggles` 同派生处——单一来源，不另立能力表 |
| `streamCapture` | `false` | 答复流 URL 无法预设（每站协议不同）⇒ 不猜、不匹配；答复走 DOM 通道（§3.4） |
| `downloadCapture` | `false` | 无通用「下载按钮」判据；取件走层②③（`outbox.md`） |
| `codeBlockExtract` | `true` | 命名约定作用在采集文本上、平台无关（`text-files.mjs`）；未命中不报错，层③全文保底 |
| `toggles` | `{ thinking: false, search: false }` | 无通用开关控件判据 ⇒ 引擎跳过应用与复核；界面按子键门控不渲染 + 行内明示（`settings-app.md` §2） |
| `requestPayloadCapture` | `false` | 无载荷读键约定 ⇒ `result.toggles.ok = null`（不伪装绿） |

### 6.3 驱动参数（F11.3 的「二次优化」接口）

- 三键：`driver.inputSelector`（输入区）· `driver.sendButtonSelector`（发送按钮；空 ⇒ Enter 发送）· `driver.replySelector`（回复区回合容器）；空串 = 该键走通用启发式；选择器**语法**不在界面校验——语法错误在派单回执中定位（`E_SELECTOR_MISSING` + 项名 + 值）。
- 写入通道：设置界面「驱动参数」对话框（补丁操作 `worker.setDriver`，即时生效；`settings-app.md` §2）或直接编辑 `config.json`（**先退出应用再改**——运行中界面改动会把内存态整份写回、手改内容可能被覆盖；手改后重启生效，不做文件监听是既有口径）。
- **改参数 ⇒ 立即重派（F11.3 回路，b7 裁定）**：`worker.setDriver`（或 url / driver 任何变更）落盘后，主进程**同步清除该条目健康记录**（`workforce.clearHealth(id)`；与设置服务的 `pruneWorkerHealth` 属同一清除机制、目标不同——后者清已离册的陈旧 id）⇒ 一次驱动不匹配留下的 `E_SELECTOR_MISSING` 冷却（默认 10 分钟）即时失效，不必点托盘「我已处理」。判据 = 批内单元（`clearHealth` ⇒ `statusOf` 回 `ready`）+ 人工场景（改完参数 ⇒ 立即重派成功）。
- **本工具不做自动优化 / 参数推荐**；优化由用户自己的主包AI 完成（F11.2 / F11.3 口径）。

### 6.4 通用启发式判据（v2；b8 重写写入轴与回复候选族）

- **输入区**：`inputSelector` 非空 ⇒ 只用它；否则 `textarea` → `[contenteditable="true"]` → `input[type="text"]`（三候选取**文档序最靠后的可见者**）。
- **写入（b8 重写）**——多行作为同一段内容落入输入区（不触发发送）；Slate 类「元素会被重建」的站点（千问）也能稳定写入：
  0. **遮挡处置（b8 · 轴 1b）——定位完成后、聚焦前、清空前（仅在探测到遮挡时动作）**：输入区中心点 hit-test（`elementFromPoint` 命中 ≠ 输入区 ∧ 非其祖先 / 后代 ⇒ 判遮挡；输入区不在视口内先 `scrollIntoView`）⇒ 按序有界的消除阶梯：
     ① `Escape`；② 关闭按钮候选链（顺序 = 语义锚点 → 类名族 → 文案兜底：`[aria-label*="关闭" i]` → `[title*="关闭" i]` → `[class*="close" i]` → 遮挡子树内 `button` 且文本 ∈ {关闭 / 知道了 / 我知道了 / 跳过 / 好的 / OK / Close}；作用域先遮挡子树、再退 `[role="dialog"] / [class*="dialog" i] / [class*="modal" i]` 容器内；可见 ∧ 非输入区，取首个、每轮只点一个；**不取「容器内任意 button」**——可能点中主按钮「开始体验 / 下一步」，副作用不可控）；③ 点蒙层外（视口四角 + 边中点候选、8px 内缩，取首个「不落输入区 ∧ 命中元素非交互控件」的点 ⇒ `mouse.click`）。
     约束 = **≤3 轮 / ≤4000ms**（调用级共享）；幂等（无遮挡 ⇒ 探测一次即返回、零动作）；**执行时机（H）** = 仅在探测到遮挡时动作，且必须在定位完成后、聚焦前、清空前；不抛、不阻断（处置后仍被挡 ⇒ 照常写入，仅失败时并入诊断）。机制与探测函数落 `src/engine/adapters/custom-overlay.mjs`（§6.5 诊断遮挡段同源）。
     **复探时机（#5）** = 每轮动作后等一帧或 **≤200 ms** 短等待（取先到者；初值待真机回调）再 hit-test，该等待计入共享预算——真机（关闭动画 / 异步消除）与机器 fixture（`Escape` 同步消除）**同判**；**时间注入（C）** = 时钟与等待可注入（`now` / `wait`，缺省 `Date.now` / 真实短等待——批内单元据此验证 ≤4000 ms，同 b5 `decide({…, now})` 口径）。
  1. **定位（无标记）**：页内扫描取输入元素——**不打属性标**（原 `data-fo-custom-input` 机制删除；Slate 类站点在点击期间重渲染元素，标记定位必败）。
  2. **聚焦（focus 优先）**：页内 `focus()` + 置插入点（`textarea` / `input` ⇒ 选区到末尾；`contenteditable` ⇒ `Range` 收拢到内容末尾）⇒ 复核 `document.activeElement` 属可编辑元素；
     未达 ⇒ **坐标点击兜底**（`getBoundingClientRect()` 中心点 ⇒ `mouse.click`，不走 Playwright 可操作性检查）⇒ 再复核。**兜底取几何的时机（#6）**：取几何**前**先判矩形——**宽高全 0（元素句柄已脱离 DOM）⇒ 不点击，直接重新定位并消耗一次尝试**（总尝试数仍 ≤3；重新定位后回到第 2 步 focus 优先重跑）——与 `/custom-slate`「首次聚焦后节点被替换」的判据同口径。
  3. **清空**：`Control+A` + `Backspace`。
  4. **逐行写入**：按 `\n` 拆行 ⇒ 逐行 `insertText(line)`、行间 `Shift+Enter`；**换行绝不作按键事件下发**（`insertText` 整段与 `keyboard.type` 兜底都会把 `\n` 变成 Enter ⇒ 误发送；2026-10-13 真机实测，b8 根因处置）。**待实测（I⑥）**：`Shift+Enter` 在自定义站点未实测（未响应软换行 ⇒ 写入失败 `E_SEND_FAILED` + 普查，不静默降级）。
  5. **重定位与有界重试**：读回校验不过 ⇒ 重新定位（元素可能已被重建）并整体重试，**≤3 次尝试**。
  6. **读回校验**：空白归一化后要求输入区文本含**期望文本前 64 字**（多行与空白差异不误判；`textarea` 与 `contenteditable` 同判）；
     尝试耗尽 ⇒ `E_SEND_FAILED`（message = 阶段 + 环节 + 尝试数 + 输入区/候选链 + 普查诊断，见 §6.5）。
  **「稳定写入」定义（E）**：读回校验在 **≤3 次尝试**内通过；未通过 ⇒ `E_SEND_FAILED`——需求 F12.1 的「稳定写入」（`docs/requirements/overview.md:332`）按此口径读。
- **发送**：`sendButtonSelector` 非空 ⇒ 点击该按钮（失败 ⇒ `E_SELECTOR_MISSING`）；否则**发送前复核焦点**（未聚焦 ⇒ 重新聚焦一次）⇒ `keyboard.press('Enter')`；
  发送后 6s 内确认「输入区已清空 ∨ 出现新回合元素」（6 s = b7 既有口径，I④），未确认 ⇒ `E_SEND_FAILED`（message 增普查诊断；无流平台的发送确认由本适配器自担，见 §2）。
- **回复锚定（§3.4「本单回合锚定」的通用形态）**：`send()` 打基线 = ① 命中回合元素及其两代祖先打属性标；② 页内记「基线文本集」+「本单发送文本」。`dom.collect()` 只接受基线之后的候选元素：可见 ∧ 非空 ∧ 不含输入区 ∧ 文本不在基线文本集 ∧ 非回声（归一化文本 == 发送文本，或以其前 40 字开头）⇒ 取最后一个（最新一条助手回复）；无 ⇒ 空串（上层按 `E_NO_RESPONSE` 处置，不静默交付旧答复）。
- **回复区候选链 v2（b8）**（`driver.replySelector` 非空 ⇒ 只用它，**继续最高优先**；否则按序取**第一个 ≥1 命中**项）：
  1. `[data-message-author-role]`（既有）
  2. `[class*="message" i]`（既有）
  3. `[role="listitem"]`（既有）
  4. `[data-role="assistant"]`
  5. `[data-testid*="assistant" i], [data-testid*="message" i]`
  6. `[class*="bubble" i]`
  7. `[class*="chat-message" i], [class*="message-content" i], [class*="response-content" i]`
  8. `[class*="answer" i]`
  9. `[class*="markdown" i]`
  10. `[class*="assistant" i]`
  11. `[class*="reply" i], [class*="response" i]`（第 4–11 项 = **初值，待真机回调**）
  - 排序原则：① **回归安全**——现链三项原位不动（已通过站点候选集不变）、新族**尾追**（原三项 0 命中时才生效）；
    ② **粒度从粗到细**——角色属性（每回合一个元素，取最后一条语义最准）→ 回合容器 → 回复正文块（正文块级由「容器拼接」路径兜底，诊断以 `拼接=容器` 如实标注）；
    ③ **证据** = 2026-10-13 真机矩阵（元宝 / 智谱原三项 0 命中）+ 开源客户端对同站点实际使用的选择器口径（元宝 `agent-chat__bubble--ai` / `hyc-content-md` · 智谱 `[data-role="assistant"]` / `markdown` · 千问 `answer-common-card` / `qk-markdown-react` · 豆包 `[data-role="assistant"]` / `message_content`）；
    外部口径只作候选族设计依据——**不预置站点专用选择器**（R12 边界）。

### 6.5 失败映射与诊断

| 阶段 | 情形 | 错误码（既有） | message 含 |
|---|---|---|---|
| opening | 输入区未找到 | `E_SELECTOR_MISSING` | 阶段 + 候选链 / `inputSelector` 值 |
| opening | 登录墙 / 风控 | `E_LOGIN_REQUIRED` / `E_CAPTCHA_OR_RISK` | 既有口径 |
| sending | **写入失败（聚焦 / 清空 / 落字 / 读回 / 重试耗尽；b8）** | `E_SEND_FAILED` | 阶段 + 环节 + 尝试数 + 输入区 / 候选链 + 普查诊断 |
| sending | 发送未确认 | `E_SEND_FAILED` | 阶段 + 发送方式 + 输入区选择器 + 普查诊断 |
| streaming | 从未取到非空文本 | `E_NO_RESPONSE` | 等待时长 + `dom.diagnose` 采集诊断 |
| streaming | 取到但未稳定 | `E_TIMEOUT` | 既有文案 + 采集诊断 |

- **写入类失败码口径（b8）**：写入路径内任何非 `EngineError` 异常（Playwright 超时 / 元素脱离 / 元素重建等）一律包装为 `EngineError('E_SEND_FAILED', …)`——**不得回落 `E_INTERNAL` / `E_UNKNOWN`**
  （`E_INTERNAL` 的 `needsHuman=true` 会把主包AI 引向「人工处理」，实际非登录非验证码；2026-10-13 千问单实测）；该码属瞬时类（`docs/design/modules/scheduler.md` §6）⇒ 同外包工重试、**不置冷却**。
  「输入区未找到」与「发送钮不可用」沿用 `E_SELECTOR_MISSING`（定位类，不改）。
- `dom.diagnose(page)`（b8 扩）：DOM 采集诊断**单行串**——既有字段（候选数 / 新回合数 / 基线过滤 / 回声过滤 / 生效选择器 / 容器拼接标记）+ **普查三段 + 遮挡段**：
  `族计数 <probe=n、…>`（固定探测族 **11 项**：8 类名族 `message / bubble / markdown / answer / assistant / chat / reply / response`、`[role=listitem|log]`、`[data-message-author-role]`、`[data-testid]`；仅列 n≥1）·
  `可见文本[「≤60 字」×≤5]`（可见叶子文本块取文档序**末 5 条**——最新内容即回复区；排除输入区子树**及其祖先链**（避免把整页容器计入））· `类名 Top≤10（token×n）`（可见元素 class token 频次，token ≤40 字）· `遮挡=<无|命中（元素=… 文本=「≤40 字」）>`（轴 1b 探测同源；输入区未找到 ⇒ 无）。
  **空白归一（#7）= 文本片段（含遮挡文本片段）先折叠空白：`\s+` → 单空格、去换行（含全角空白 `\u3000`），截断在归一之后**——「诊断单行无换行」可机器判定的前提。
  **脱敏（F）= 类名 token 与文本片段命中 `[a-z0-9]{16,}` ⇒ 替换为 `<hash>`**；**已知残余**：可见文本片段（末 5 条 ×≤60 字）仍可能含页面既有内容（非本单数据），不承诺完全脱敏。
  上限与脱敏：普查段页内**一次** `evaluate`（遮挡段复用轴 1b 一次轻量 hit-test `evaluate`）；扫描 ≤2000 可见元素（**初值，待真机回调**）；各段各自截断（遮挡描述 ≤100 字）；诊断整串 ≤900 字；**不读** cookie / storage / 表单值 / 输入区文本。
  引擎侧拼接截断上限 240 → **1200**（`src/engine/answer.mjs`）。
- 无信号判定：`streamCapture:false` 的 DOM 分支「从未取到非空文本」到 `streamFirstByteMs` 判 `E_NO_RESPONSE`（有流平台入 DOM 兜底的既有行为不变）。
- 日志：一行 `自定义驱动诊断：…`（词形不动）+ 写入两行新增词形（正则可判）——成功 `自定义写入：尝试=<n>/3 聚焦=<focus|click> 行数=<m> 读回=通过`；失败 `自定义写入失败：尝试=<n>/3 环节=<定位|聚焦|清空|写入|读回> 输入区=<…>`；遮挡三词形（轴 1b）：`自定义遮挡处置：动作=<Escape|关闭按钮|点蒙层外> 轮次=<n>/3` · `自定义遮挡：消除` · `自定义遮挡：仍在（不阻断）`；失败截图沿用既有码集。

### 6.6 验收判据（b7 面 · b8 面）

- 集成（b7）：`npm run verify:engine`（含 `test/integration/engine.custom.test.mjs`）——happy path + 本单锚定 / 驱动缺失与不匹配的定位回执 / 驱动参数生效 / 发送未确认；判据与读数口径见 `docs/batches/b7-custom-workers.md` §2「验收对照」。
- 集成（b8）：`npm run verify:engine`（含 `test/integration/engine.custom.b8.test.mjs`）——多行任务恰好一次发送且提交体含全文 / Slate 重建站写入成功 / 写入失败 ⇒ `E_SEND_FAILED` + 普查 / 普查三段字段形状 / 回复候选新族命中（无 `replySelector`）/ **遮挡层处置（`/custom-overlay`：链外类名整屏遮挡 ⇒ 处置后写入成功，日志词形可判）**；判据与读数口径见 `docs/batches/b8-custom-worker-hardening.md` §2「验收对照」。
- 批内单元（b8）：`node --test docs/batches/b8-custom-worker-hardening.units.mjs`——写入计划 / 落地判定 / 写入失败码映射 / 普查串形状 / 候选链顺序冻结 / `attach_files` 补件能力门 / **遮挡阶梯顺序与有界（fake page）**。
- 对应需求验收：AC-R11-2（b7 面）· AC-R12-1 / R12-2 / R12-3 / R12-6（b8 面，机器判据）· AC-R12-7（b8 面，真机 + 机器；需求档 R12 **F12.7 / AC-R12-7 已可见**——判据与读数口径见 `docs/batches/b8-custom-worker-hardening.md` §2「验收对照」）。

