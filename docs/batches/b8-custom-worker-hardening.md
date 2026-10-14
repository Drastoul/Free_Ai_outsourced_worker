# 2026-10-13 · b8 自定义外包工补齐
> 六段 append-only，一段一作者：§1 讨论（主 agent）· §2 批次任务与设计（eng-designer）· §3 设计评审（评审子代理）· §4 用户批准（主 agent）· §5 实施记录（eng-coder）· §6 验证与收口（父代理）。
> 编制：主 agent · 2026-10-13 · 来源 = 用户 2026-10-13 22:31「立，继续测试其他几个的通用方法」+ 此前同日 21:52「试试千问」/ 22:13 登录三台实测 ⇒ 依据 = b7 真实站点试单的实测矩阵（豆包 ✓ · 元宝/智谱取答复 0 命中 ✗ · 千问 Slate 写入失败 ✗ · 多行文本误发送 ✗）；需求档 R12（台账 #34/#36/#37）。
> 台账 = #34/#36/#37（免费外包 · 归批）。前情 = docs/batches/b7-custom-workers.md §6（已收口 2026-10-12）。
## §1 讨论（主 agent）
**状态行**：已收口 2026-10-14（R12/D−F12 六条 AC 全过：多行不拆（豆包真·多行 done）· 候选链 3→11（元宝+智谱双通）· 写入类错误码不再 E_INTERNAL（千问 E_SEND_FAILED + 完整普查）· 遮挡轴生效（文心写入+发送全程走通）· 全套回归 133/0 · 打包刷新通过（verify:pack 复跑 fail 0，首次 3/4 疑似偶发抖动）；真机 4 台全通（豆包/元宝/智谱/星火，星火系 URL 由落地页改 /desk）；评审：付费代码评审 pass（1🟡+6🔵 全裁定）+ 免费通道预复核 38 问折入 10 组；台账 #34/#36/#37/#38 核销，未决 #39（Slate 发送动作）/#40（回声过滤边界））
<§1 模板占位：本批条目 / 关键判据 / 授权口径>

### §1 讨论与来源（主包AI，2026-10-13）

- **来源**：用户 2026-10-13 21:52「试试千问」+ 22:07「不用，先试试别的Ai网页」+ 22:13/22:51 登录并试单六台 + **22:31「立，继续测试其他几个的通用方法」**（立本批）+ 22:55「评审」（发动设计评审）+ 同轮成本指令「**现在你的免费外包工够够多，要让他们承担更多任务以降低成本**」。
- **需求落位**：需求档 **R12**（五要素 + F12.1–F12.7 + AC-R12-1..7 + §6 映射三行；台账 **#34 / #36 / #37 / #38**）。
- **本批范围**：§2 的七轴（写入 / 遮挡处置 1b / 取答复轴候选链 v2 / 诊断普查 / 错误码映射 / 补件能力门 / 契约冻结）。
- **真机依据（六台站点实测，2026-10-13）**：豆包 ✅ `done`（DOM 通道交付）· 讯飞星火 ✅ `done`（首单 `E_LOGIN_REQUIRED` = 工具行为正确的样板）· 元宝 / 智谱 ❌ `E_NO_RESPONSE`（候选链 0 命中）· 千问 ❌ Slate 点击不稳（`E_INTERNAL`）· 文心一言 ❌ 引导弹窗遮挡（`E_INTERNAL`，台账 #38）· 另有全局项：多行文本被拆两次输入并误发送（台账 #37，用户现场观察确认）。
- **父侧裁定（回应设计代理 U1–U7 与评审轮 1 十三条）**：
  - **U2（千问若仍不 done 是否接受）= 准**：按 AC-R12-6 口径（不 done 也可，但码 ∈ 表 ∧ 普查 ∧ ≠ `E_INTERNAL`），**千问永久不 done = 接受口径**（Slate 类残余）。
  - **U3（`mcp-server.md` §3.6 补 `E_WORKER_UNAVAILABLE`）= 准**：已在修复轮落地。
  - **U4（随包说明补「普查读数」读法）= 准**：随 b8 实施在 `docs/guide/` 增补（主包AI 落笔，起草走免费通道）。
  - **U5（「输入区未找到」的 `needsHuman` 口径）= 准**：沿用 b7（`E_SELECTOR_MISSING` 定位类，`needsHuman=true`）；F12.4 只收窄**写入类**失败，不动定位类。
  - **U6（多行软换行不响应 ⇒ `E_SEND_FAILED` 不静默降级）= 准**。
  - **U7（F12.7/AC-R12-7 需求面）= 已闭合**（主包AI 已落笔需求档）。
  - **评审 #4（`adapters.md` 两个「§5」）= 准**：本批**不动号**（改号会打断冻结记录既有指针）⇒ 与台账 #31 合并，另立一次「全库指针校正」（须用户裁定，涉及改冻结档）。
  - **评审 #11（发送钮遮挡不处置）= 准**：F12.7 限定「写入/聚焦前」；收口记录显式落一句。
  - **评审 #12（AC-R12-4「不建任务」读法）= 准**：收口判据按设计读法（不追加文件 / 不重启 / 状态不变）。
  - **评审 #9（源码行数 unverified）= 主包AI 已核**：表内 9 件与实盘一致（口径差 +1，档位判断不受影响）。
- **独立预复核（免费通道，DeepSeek）**：38 问中 **10 组有实质影响者已折入修复轮**（A 判据可证伪性 · B/C 可机器验性 · D 族数笔误 · E 定义 · F 脱敏 · G 词形 · H 执行时机 · I①–⑦）；另 Q26（自定义侧本单锚定）经主包AI 实测**证伪**（`custom-dom.mjs` 已实现锚定，词族与内置平台同源 ⇒ 候选链扩充不放大旧答复风险）。
- **成本口径**：本批起免费工位扩至 **4 台**（DeepSeek / Kimi / 豆包 / 星火）⇒ 起草、检索、**独立复核**一律先派免费通道并可并行；付费只做设计落档、代码落盘、评审与真机验收（已写入长期记忆）。

## §2 批次任务与设计（eng-designer）
**状态行**：设计完成（评审轮 1（VERDICT pass · 🔴0/🟡5/🔵8）定点修 17 项已落（#1/#2/#3/#5/#6/#7/#8/#13 + A–I；决策新增 D14–D17）· 需求面 F12.7/AC-R12-7 已落（U7 闭合）· U3 闭合（mcp-server §3.6 一行）· 设计档四件读数已回填（adapters 275 · scheduler 135 · overview 315 · mcp-server 158）· §3 记录面未编辑 · 待复核）
<§2 模板占位：本批条目（覆盖） / 设计档落点 / 机制设计 / 受影响文件与测试面 / 验收对照 / 关键决策 / 上抛项>

### 本批（b8）范围与覆盖

覆盖条目（三条链：台账 #34/#36/#37/#38 ↔ 本段 ↔ 需求档 R12 与设计档增量）：

- **R12 自定义外包工补齐**（`docs/requirements/overview.md:326`）：功能点 F12.1–F12.7（`:332-338`）+ 验收 AC-R12-1..7（`:348-354`）；台账 **#34**（补件能力门）· **#36**（写入动作 / 错误码回落 / 取答复与诊断）· **#37**（多行文本误发送）· **#38**（遮挡层拦截点击 → 本段机制设计轴 1b）。轴 1b 的需求面口径 = **已落**：F12.7（`:338`）· AC-R12-7（`:354`）· §6 映射（`:401-403`）· 变更记录（`:17`）均在需求档可见（需求档笔 = 主包AI，2026-10-13 落；U7 闭合）——本段「验收对照」= 正式合同。
- 用户硬约束（本档档头「来源」行 + 派单事实）：只补**通用**驱动（不做站点专用适配器）· 不改 MCP 六件套工具名/参数/返回形状与错误码**语义**（仅映射修正）· 内置平台零变化 · 依据 = 2026-10-13 真机实测矩阵（豆包 ✅ done · 元宝/智谱 写入 ok / 取答复 0 命中 · 千问 Slate 写入失败 · 文心一言 遮挡层拦截点击）。
- 需求档合规检查（检查面，不改需求档）：五要素齐备、可设计——模块目标 `:328`；F12.1–F12.7 逐条可验 `:332-338`；边界 `:340-344`；AC-R12-1..7 `:348-354`（真机三台 + 命令三项 + 文心一言遮挡项）；§6 映射三行 `:401-403`；依赖 `:356`。无矛盾、无不可实现项、无归属不明。**两处口径读法（报备，不阻塞）**：① AC-R12-4 的「不建任务」对补件路径读作「不追加文件 ∧ 不重启执行 ∧ 任务状态不变」（任务已存在，「建任务」语义不适用）；② F12.4 的「needsHuman 仅在确需人工时为真」作用于**写入类失败**（⇒ `E_SEND_FAILED`，表内 `needsHuman=false`）；「输入区未找到」沿用 b7 口径 `E_SELECTOR_MISSING`（定位类，表内既有 `needsHuman=true`）——见 U5。
- 本批性质：**行为补齐**（写入轴重写 / 遮挡处置（轴 1b） / 取答复候选族扩充 / 诊断普查 / 写入类错误映射 / 补件能力门）——不加新机制、不动架构、不改契约。

### 不在本批

- **不做站点专用适配器 / 不预置任何站点选择器**（R12 边界 `:341`）——候选族全部为通用族（见机制设计 2）。
- **不新增 MCP 工具 / 参数 / 错误码语义 / hint 表**（F12.6）——只把写入类失败从 `E_INTERNAL` 回落改为**既有码**映射。
- **不改内置平台**（`deepseek*.mjs` / `kimi*.mjs` 零改动）· **不改会话复用**（`browser-engine.md` §9）· **不改「本单回合锚定」机制**（基线标 + 基线文本集 + 回声过滤；b8 只动输入区写入与回复候选族）。
- **不改**：需求档 / 其它批次档 / `docs/guide/**`（随包说明与错误码表文档的落笔 = 主包AI，见 U3 / U4）· 配置 schema（`url` / `driver` 三键形状与 `replySelector` 最高优先不变）· outbox 结构与打包链。
- **不做自动优化回路**（F11.2/F11.3 口径不变：参数修改仍由用户主包AI 发起；本批只把「据此可选新选择器」的普查读数补进失败回执）。

### 设计档落点（本段同步落地；评审对象含以下各处）

- `docs/design/modules/adapters.md` §6.4 / §6.5 / §6.6（**b8 增量落在此**）：写入轴机械（focus 优先 / 逐行写入 / 有界重试 / 去输入打标）· **遮挡处置（轴 1b：探测 / 关闭候选链 / 有界阶梯 / 三词形）** · 回复候选链 v2（11 项 + 排序原则）· 诊断普查字段形状与上限（+遮挡段）· 写入类错误映射 · b8 判据。
- `docs/design/modules/scheduler.md` §3（补件能力门一条）· §11（判据一行）。
- `docs/design/overview.md` 变更记录（一行，落点指针）。
- `docs/design/modules/mcp-server.md` §3.6（`attach_files` 错误清单补 `E_WORKER_UNAVAILABLE` 一行——契约陈述随动，码与语义不变；U3 已落）。
- **待主包AI（不在本单写域）**：`docs/README.md` 索引随动（探索发现 3）。
- 权威顺序：机制以设计档为准（单一来源）；批次档本节 = 实施合同与判据。

### 机制设计（逐轴：改动点 + 判据 + 被否方案；轴 1 / 1b / 2–6）

**1. 写入轴（F12.1 · #37 + 千问类）——「focus 优先 + 逐行写入 + 有界重试」，去掉「打标记再点标记」**

- 现状缺陷（真机确证）：① 多行文本被拆成两次输入并误发送——`insertText` 整段与 `keyboard.type` 兜底都会把 `\n` 变成一次 Enter ⇒ 前半句被发出、后半句落进新输入框 ⇒ `E_SEND_FAILED`（档头矩阵 + 台账 #37；引擎日志 `app.log:879-891` 三连「任务文本未落入输入区」）；② Slate 类站点（千问）点击失败——`locator.click` 对 `[data-fo-custom-input="1"]` 的期望「可见、可用、稳定」在元素被重渲染替换时必败（`element is not stable` / `element was detached from the DOM`，10s 超时；`outbox/20261013-222143-5191` manifest 原文）⇒ 回落 `E_INTERNAL`。
- 改动点（`src/engine/adapters/custom-page.mjs`）：
  1. **定位（无标记）**：页内扫描定位输入区（`driver.inputSelector` 非空 ⇒ 只用它；否则 `textarea` → `[contenteditable="true"]` → `input[type="text"]` 取最靠下的可见者）——**删除 `data-fo-custom-input` 打标**（Slate 类站点元素会被重建，标了也点不住）。
  2. **聚焦（focus 优先）**：页内 `el.focus()` + 置插入点（`textarea`/`input` ⇒ `setSelectionRange` 到末尾；`contenteditable` ⇒ `Range` 收拢到内容末尾）⇒ 复核 `document.activeElement` 属可编辑元素（该元素本身或其祖先 / 后代）；未达 ⇒ **坐标点击兜底**（`getBoundingClientRect()` 中心点 ⇒ `page.mouse.click(x,y)`，不走 Playwright 可操作性检查）⇒ 再复核。
  3. **清空**：`Control+A` + `Backspace`（保持聚焦态）。
  4. **写入（逐行）**：按 `\n` 拆行 ⇒ 逐行 `keyboard.insertText(line)`，**行间用 `keyboard.press('Shift+Enter')`**；文本里的换行**绝不**作为按键事件下发（#37 的根因处置）；空行保留（行数一致）。**软换行 = 待实测项（I⑥）**：`Shift+Enter` 在自定义站点（千问 / 元宝 / 智谱 / 文心）尚未实测；站点若不响应软换行（把行连写）⇒ 读回校验不过 ⇒ `E_SEND_FAILED` + 普查（不静默降级为空格拼接——口径见 U6）。
  5. **重定位与有界重试**：读回校验（见 6）不通过 ⇒ **重新定位**（元素可能已被重建）并整体重试，**≤3 次尝试**（首试 + 2 重试）；尝试内不设 10s 级等待（页内聚焦即时、坐标点击即时）。**兜底取几何的时机（#6）**：第 2 步坐标点击兜底**前**先判 `getBoundingClientRect()`——**宽高全 0（元素句柄已脱离 DOM）⇒ 不产生点击，直接重新定位并消耗一次尝试**（总尝试数仍 ≤3；重新定位后按第 2 步 focus 优先重跑）——与 `/custom-slate`「首次聚焦后节点被替换」判据同口径。
  6. **读回校验**：归一化（空白折叠）后要求输入区文本含**期望文本前 64 字**（多行⇒行间空白归一，软换行 / 段落分隔均可通过；`insertText`+`Shift+Enter` 的落点在两种输入元素类型上同判）。
  7. **失败映射**：尝试耗尽 ⇒ `E_SEND_FAILED`（既有码；理由见机制设计 4），message 含「阶段 + 环节 + 尝试数 + 输入区/候选链 + 普查诊断」。
  8. **发送**：`sendButtonSelector` 非空 ⇒ 点该按钮（失败 ⇒ `E_SELECTOR_MISSING`，既有）；否则**发送前复核焦点**（未聚焦 ⇒ 重新聚焦一次）⇒ `page.keyboard.press('Enter')`（原为 `locator.press('Enter')`，同样避免元素句柄）。6s 发送确认（输入区已清空 ∨ 出现新回合）不变（6 s = b7 既有口径，I④）。
- **「稳定写入」定义（E）**：写入路径在 **≤3 次尝试**内读回校验（第 6 步）通过；未通过 ⇒ `E_SEND_FAILED`。需求 F12.1 的「稳定写入」（`docs/requirements/overview.md:332`）按此口径读（需求档不改、只在设计面注明）。
- 判据（机器）：新 fixture `/custom-slate`（contenteditable 编辑器：**首次聚焦后把节点替换为新节点**、除按键输入外不认任何写入手段）⇒ 派单成功（`result.error === null`）∧ 输入区文本 = 任务文本；多行 fixture ⇒ **恰好一次发送**（`state.customSends.enter === 1`）∧ fixture 收到的提交体逐字含全文（含 `\n` 与空行）。
- 判据（真机）：**豆包单行与多行均 `done`**（AC-R12-1）；**千问若不 `done` ⇒ 错误码 ∈ 既有码表 ∧ 回执含普查 ∧ 不得为 `E_INTERNAL`**（AC-R12-6）。
- 被否方案：① 保留整段 `insertText` / `keyboard.type` 兜底（`\n`→Enter 确定发生，实测已害）；② 把换行规范化为空格 / 拼接（改变任务文本语义；markdown 提示词的换行有意义）；③ 剪贴板粘贴（合成 `paste` 事件对 textarea 无默认动作、系统剪贴板需权限与真实按键，两条腿都不可靠）；④ 保留 `locator.click` 只加 `force`（仍走元素句柄，元素被替换即脱靶）；⑤ 无限重试 / 固定长等待（耗光 `sendingMs` 预算，不治根因）。

**1b. 遮挡处置（#38 · 需求面已落 F12.7 / AC-R12-7）——写入前「探测 + 按序有界的消除阶梯」（第三类缺口的通用轴）**

- 现状缺陷（真机确证）：**文心一言**（2026-10-13 22:45 · taskId `20261013-224546-0e4d`）——通用启发式**找对了也等稳了**输入区（`<textarea id="chat-textarea" class="ci-textarea">`），`locator.click` 10s 超时：Playwright 明示 `<div class="cos-dialog _task-mode-guide-dialog_k91ea_1">` 子树 **intercepts pointer events**（站点「任务模式全新升级」引导弹窗遮挡）⇒ 回落 `E_INTERNAL`。
- **为什么是通用轴**：几乎每个站点首次进入都有引导层 / 公告层 / 协议弹层（同日对照：讯飞星火 `E_LOGIN_REQUIRED` = 「未登录」样板、工具行为正确；豆包 `done`）⇒ 第三类缺口 = 选择器**找得对**（#36 缺口 A 由写入轴处置）但**点不进去**——与站点无关。
- 改动点（新件 `src/engine/adapters/custom-overlay.mjs`；`custom-page.mjs` 写入路径**（定位完成后、聚焦前）**调用）：
  1. **探测（聚焦前）**：输入区中心点 hit-test（`elementFromPoint` 命中 ≠ 输入区元素 ∧ 非其祖先 / 后代 ⇒ 判遮挡），取遮挡描述（tag + id + class token + 文本片段 ≤40 字）；输入区不在视口内先 `scrollIntoView` 再测。
  2. **处置阶梯（按序、每轮一步、动作后复探）**：
     ① `Escape`（代价最小、对无遮挡页面无害、覆盖多数引导 / 浮层）；
     ② **关闭按钮候选链**（顺序理由 = 语义锚点优先 → 类名族 → 文案兜底）——`[aria-label*="关闭" i]` → `[title*="关闭" i]` → `[class*="close" i]` → 遮挡子树内 `button` 且文本 ∈ {关闭 / 知道了 / 我知道了 / 跳过 / 好的 / OK / Close}（归一化全等，防误点；文案表 = **初值，待真机回调**，I⑤）；
     **作用域** = 先遮挡子树内、再退 `[role="dialog"] / [class*="dialog" i] / [class*="modal" i]` 容器内；可见 ∧ 非输入区 ⇒ 取首个、每轮只点一个；**不取「容器内任意 button」**（可能点中主按钮「开始体验 / 下一步」——副作用不可控）；
     ③ **点蒙层外**：视口四角 + 边中点候选（8px 内缩）取首个「不落输入区 ∧ 命中元素非交互控件」的点 ⇒ `mouse.click`（对 click-outside 型蒙层即驱散）。
  3. **约束**：探测 + 处置 **≤3 轮 / ≤4000ms**（调用级共享预算）；**幂等**（无遮挡 ⇒ 探测一次即返回、零动作）；**不抛、不阻断**（处置后仍被挡 ⇒ 照常继续写入尝试，仅在最终失败时把遮挡信息并入 message 与普查）。
     - **执行时机（H）**：**仅在探测到遮挡时**动作（与幂等条同源），且位于**定位完成后、聚焦前、清空前**——清空（`Control+A` + `Backspace`）会清掉已写入文本，处置晚于清空即无效。
     - **复探时机（#5）**：每轮动作后**等一帧或 ≤200 ms 短等待**（取先到者；≤200 ms 为初值、待真机回调）再 hit-test 复探，该等待**计入** ≤4000 ms 共享预算；真机（关闭动画 / 异步消除）与机器 fixture（`Escape` 同步消除）**同判**（同为「复探仍未消除 ⇒ 升档」，不因 fixture 同步而提前升档）。
     - **时间注入（C）**：处置时钟与短等待可注入（`now` / `wait`；缺省 = `Date.now` / 真实短等待）——批内单元据此机器验证「≤4000 ms」（与 b5 `decide({…, now})` 同口径）。
     - **时间预算关系（I③）**：遮挡处置 ≤4000 ms + 写入 ≤3 次尝试（尝试内不设 10 s 级等待）+ 发送确认 6 s（b7 既有口径）落在 `sendingMs`（缺省 **30000 ms**，`src/engine/task-runner.mjs:36`）内；不得引入固定长等待（D3）。
  4. **普查增量**：`diagnoseCustomDom` 单行串新增 `遮挡=<无|命中（元素=… 文本=「…」）>` 段（探测与本节同源、单一来源）——失败回执据此可判「遮挡」还是「链不对」。
  5. **日志词形（正则可判）**：`自定义遮挡处置：动作=<Escape|关闭按钮|点蒙层外> 轮次=<n>/3` · `自定义遮挡：消除` · `自定义遮挡：仍在（不阻断）`。
- 判据（真机）：**文心一言单行派单不再因遮挡失败** ⇒ `state=done`；若仍失败 ⇒ `error.code ∈ 既有码表` ∧ `≠ E_INTERNAL` ∧ message 含普查 ∧ 普查含遮挡元素（选择器 / 类名 + 文本片段）（AC-R12-7）。
- 判据（机器）：集成 `/custom-overlay`（整屏遮挡层 `qa-mask-7f3`：链外类名、无关闭钮、仅 Escape 可消除）⇒ 消除遮挡后写入成功（`error===null`）∧ 日志含「自定义遮挡处置：动作=」与「自定义遮挡：消除」；
  批内单元（fake page）⇒ 阶梯顺序 `deepEqual` = Escape → 关闭按钮 → 点蒙层外 ∧ ≤3 轮 / ≤4000ms ∧ 无遮挡零动作（幂等）∧ 探测抛错不抛（不阻断）∧ **时间注入（C）**：注入 `now` / `wait`（同 b5 `decide({…, now})` 口径）⇒「`now` 跨过 4000 ms ⇒ 停手不升档」可判。
- 与既有轴衔接：位于**定位完成后、聚焦前**（每次尝试的聚焦前执行，预算全调用共享）——写入轴其余步骤（focus 优先 / 逐行 / 重试 / 读回）与失败映射（轴 4）一字不动。
- 被否方案：① `locator.click({force:true})` / 直接坐标点击（遮挡未解除、点击被遮挡层吞掉、后续键盘输入仍被挡——只掩盖症状）；② 直接移除遮挡 DOM（`remove()` / `display:none`：改站点页面结构、重渲染即复原、与站点框架状态脱节，副作用不可控）；③ 只在失败后诊断、不主动处置（遮挡非选择器问题，F11.3 回路修不了它，每单都要人工）；④ 无限重试 / 固定长等待（耗 `sendingMs` 预算不治根因，同 D3）；⑤ 独立错误码（错误码表封闭，R12 边界）。

**2. 取答复轴（F12.2）——候选链 v2：现链 3 项原位 + 新族 8 项尾追（共 11 项）**

- 现状（真机确证）：`[data-message-author-role]` → `[class*="message" i]` → `[role="listitem"]` 三项在**元宝 / 智谱均 0 命中**（`E_NO_RESPONSE`，诊断「候选链 3 项均 0 命中」）——答复在页面上存在（失败截图可见文字），只是类名族不在链内。
- 候选链 v2（按序取**第一个 ≥1 命中**项；`driver.replySelector` 非空 ⇒ 只用它，**继续最高优先**）：
  1. `[data-message-author-role]`（既有）2. `[class*="message" i]`（既有）3. `[role="listitem"]`（既有）4. `[data-role="assistant"]`（新）5. `[data-testid*="assistant" i], [data-testid*="message" i]`（新）6. `[class*="bubble" i]`（新）7. `[class*="chat-message" i], [class*="message-content" i], [class*="response-content" i]`（新）8. `[class*="answer" i]`（新）9. `[class*="markdown" i]`（新）10. `[class*="assistant" i]`（新）11. `[class*="reply" i], [class*="response" i]`（新）——第 4–11 项 = **初值，待真机回调**（I⑤）
- 为什么这样排：① **回归安全**——现链三项原位不动（豆包等已实测通过的站点候选集不变），新族全部**尾追**（原三项 0 命中时才生效）；② **粒度从粗到细**——第 4/5 项是「角色 / 测试锚点」属性（每回合一个元素，取最后一条 = 最新回复语义最准），第 6/7 项是「一回合一个容器」（元宝 `agent-chat__bubble--ai` / 智谱类名族），第 8/9 项是「回复正文块」（千问 `answer-common-card` / `qk-markdown-react`、元宝 `hyc-content-md`；粒度细 ⇒ 由既有「容器拼接」取值路径兜底，诊断以 `拼接=容器` 如实标注）；③ **证据强度**——第 4–9 项口径 = 2026-10-13 真机矩阵 + 开源客户端对同站点实际使用的选择器口径（`grep.app` 检索所得：元宝 `agent-chat__bubble--ai` / `hyc-content-md`；智谱 `[data-role="assistant"]` / `markdown`；千问 `answer-common-card` / `qk-markdown-react`；豆包 `[data-role="assistant"]` / `message_content`）——外部口径**只作候选族设计依据，不预置站点专用选择器**（R12 边界）。
- 判据（机器）：新 fixture `/custom-newfamily`（回复容器类名 = `agent-chat__bubble--ai` + `hyc-content-md` 风格，链外于原三项）⇒ 无 `replySelector` 也能 `done` ∧ `answer.md` = 回复文本（第 6 项命中）；候选链顺序以批内单元冻结（deepEqual，防后续漂移）。
- 判据（真机）：**元宝或智谱至少一台 `done`**；若仍失败 ⇒ 回执**必须**含普查读数（AC-R12-2）。
- 被否方案：① **全链并集**（一次性合并全部候选 ⇒ 改变既有站点候选集、豆包行为漂移、噪音大）；② 只加 `[class*="markdown" i]` 一项（四台站点类名族各不相同，单项覆盖面不足）；③ 站点专用选择器预置（R12 边界明令：不做站点专用适配器）。

**3. 诊断普查（F12.3）——失败回执给出「页面上实际有什么」，闭合 F11.3 回路**

- 改动点：扩 `dom.diagnose(page)` 的既有单行输出（`src/engine/adapters/custom-dom.mjs`；**不新增接口**，失败回执的拼接点不变），字段形状（单行、`；` 分隔）：
  - 既有：`候选=<n>（replySelector=…；候选链 <k> 项<命中 …|均 0 命中>）；新回合=<n>；基线过滤=<n>；回声过滤=<n>；拼接=<无|末条|容器>`
  - **新增**：`族计数 <probe=n、…>`（固定探测族 **11 项** = 8 类名族（`message` / `bubble` / `markdown` / `answer` / `assistant` / `chat` / `reply` / `response`）+ `[role=listitem|log]` + `[data-message-author-role]` + `[data-testid]`；仅列 n≥1）· `可见文本[「≤60 字」×≤5]`（可见元素中「自身含文本、子元素不含文本」的叶子块，按文档序取**末 5 条**——最新内容即回复区；排除输入区子树**及其祖先链**（避免把整页容器计入））· `类名 Top≤10（token×n、…）`（可见元素的 class token 频次，token ≤40 字）· **遮挡段**（轴 1b）：`遮挡=<无|命中（元素=… 文本=「…」）>`（探测与轴 1b 同源，单一来源）。
  - **空白归一（#7）**：文本片段（含遮挡文本片段）一律先做空白折叠——`\s+` → 单空格、去换行（含全角空白 `\u3000`；去首尾空白），截断在归一**之后**进行；这是「诊断单行串无换行」可机器判定的前提。
  - **脱敏（F）**：类名 token 与文本片段命中 `[a-z0-9]{16,}` ⇒ 替换为 `<hash>`（长随机 id / 构建后缀不回流执）。**已知残余（裁定接受）**：可见文本片段（末 5 条 ×≤60 字）仍可能含页面既有内容（非本单数据），不承诺完全脱敏。
  - 上限与脱敏：普查段页内**一次** `evaluate` 采集（遮挡段复用轴 1b 一次轻量 hit-test `evaluate`）；扫描元素上限 2000 可见元素（**初值，待真机回调**，I⑤）；文本片段 / 类名 / 探测族 / 遮挡描述按上列上限截断；**不读** cookie / storage / 表单值 / 输入区文本；诊断整串 ≤900 字（适配器侧自限），引擎侧拼接截断上限 240 → **1200**（`src/engine/answer.mjs`）。
- 为什么这样：主包AI 的读取面 = 任务回执（不是日志文件）；「候选=0」之外必须能看到**页面上实际存在什么**（哪一族有元素、类名叫什么、屏幕上是什么文字），才能据此填 `replySelector` 重试——这就是 F11.3「二次优化」接口的真实闭合点。
- 判据（机器）：新 fixture `/custom-census`（回复容器类名在链外、带独特类名 `qa-census-7f3` 与可见文本）⇒ `E_NO_RESPONSE` ∧ message 含「族计数」「可见文本」「类名 Top」三段 ∧ 类名段可见 `qa-census-7f3`（= 主包AI 选新选择器的凭据）∧ 诊断单行无换行 ∧ ≤900 字。
- 判据（真机）：元宝 / 智谱 / 千问的失败回执各含普查三段（读数入 §6）。
- 被否方案：① 新增 `dom.census` 接口（接口面扩键；`dom.diagnose` 已在失败路径被拼接，零接口变更够用）；② 塞进 `error.hint`（hint 由码表按码固定、不支持逐次内容）；③ 只写日志（主包AI 看不到日志文件）；④ 全量 DOM dump / 外层 HTML（体积与脱敏面不可控）。

**4. 错误码映射（F12.4）——写入类失败 ⇒ 既有码 `E_SEND_FAILED`（不再回落 `E_INTERNAL`）**

- 现状缺陷：写入动作抛出的 Playwright 异常（如 `locator.click: Timeout`）不是 `EngineError` ⇒ 引擎按 `E_UNKNOWN` 收尾（`src/engine/task-runner.mjs:242`）⇒ 主进程未知码归 `E_INTERNAL`（`src/main/mcp/errors.mjs:44`）⇒ `needsHuman=true`（`errors.mjs:34`）——非登录、非验证码，误导处置方向（真机三单一致）。
- 改动点（`custom-page.mjs` 写入路径）：① 定位之后的**聚焦 / 清空 / 写入 / 读回 / 重试耗尽**一律包装为 `EngineError('E_SEND_FAILED', message)`；② 新增兜底包装：写入路径内任何非 `EngineError` 异常 ⇒ 同码 + 原异常单行摘要（≤200 字）；③ 输入区**未找到**沿用 b7 口径 `E_SELECTOR_MISSING`（定位类，不改）；发送钮不可用沿用 `E_SELECTOR_MISSING`（不改）；发送未确认沿用 `E_SEND_FAILED`（不改，message 增普查）。
- 映射理由：写入 = sending 相位的动作，既有实现已把「任务文本未落入输入区」映射为 `E_SEND_FAILED`（`custom-page.mjs:164`）；该码语义「发送动作失败」、`needsHuman=false`（表内既定）、hint「自动重试后仍失败；可重派」——与「非登录 / 非验证码、可重派」的事实一致；且 `E_SEND_FAILED` 属**瞬时类**（`src/main/scheduler/policy.mjs:15` RETRYABLE）⇒ 同外包工自动重试 ≤2 次、**不置冷却**（保住 F11.3「改完参数 ⇒ 立即重派」回路）。
- 判据（机器）：批内单元 = 以 fake page（`evaluate`/`mouse`/`keyboard` 抛 Playwright 形异常）驱动写入路径 ⇒ 抛 `EngineError` ∧ `code === 'E_SEND_FAILED'` ∧ `ERROR_TABLE[code].needsHuman === false`（`ERROR_TABLE` 直取路径 = `import { ERROR_TABLE } from '../../src/main/mcp/errors.mjs'`——同进程、不跨 MCP 信封；先例 `docs/batches/b5-session-reuse.units.mjs:14`）；集成 = `/custom-reject-write` fixture ⇒ `error.code === 'E_SEND_FAILED'` ∧ message 含尝试数与普查。
- 判据（真机）：写入类失败的错误码 ∈ 既有码表 ∧ `needsHuman` 不为真（AC-R12-3）。
- 被否方案：① 回落 `E_INTERNAL`（现状；needsHuman=true 误导，R12.4 明令禁止）；② `E_SELECTOR_MISSING`（语义是「页面结构变化 / 选择器失效」，本情形元素在、只是动作失败；且 needsHuman=true + 置 10 分钟冷却——与 F12.4 的 needsHuman 收窄、F11.3 回路相抵）；③ 新增码（错误码表封闭，R12 边界明令「不新增错误码语义」）。

**5. 补件能力门（F12.5 · #34）——`attach_files` 复用派单期同一能力门**

- 现状缺陷：`scheduler.attachFiles`（`src/main/scheduler/scheduler.mjs:269-285`）不查送件能力 ⇒ 给不支持送件的外包工（自定义）补件会静默追加，直到引擎 uploading 相位才抛 `E_WORKER_UNAVAILABLE`（`src/engine/task-runner.mjs:178-180`），且按「外包工不可用」类**置 10 分钟冷却**（`src/main/scheduler/execution.mjs:191`）——与 b7 对 `task.run` 的派单期口径（同步拒绝 / 不建任务 / 不置冷却）不一致。
- 改动点：① `src/main/scheduler/workforce.mjs` 把送件能力判定与拒绝词形收敛为一个方法 `assertUploadCapable(worker)`（内部 = 既有 `supportsUpload` 归一化：缺项 / 未注册平台 ⇒ 不支持；词形 = 既有 `uploadUnsupported` 逐字，含「请去掉附件后重派，或改派支持送件的平台」）——**单一来源**；`pick` / `nextAvailable` 与补件路径同源；
  **词形口径（G）**：补件路径沿用该词形（「请去掉附件后重派」对补件语义略偏——任务已存在、无「重派」动作），**裁定接受**，不做补件专用词形（避免第二份词形）；② `scheduler.attachFiles` 在「任务存在」之后、「状态 / 阶段判定」之前调用它（**定死 +1 行**，298 → 299 ≤ 300）。
- 判据（机器）：批内单元——构造 Scheduler（fake engine + 临时 config）⇒ 对自定义外包工的 queued 任务 `attachFiles` ⇒ 抛 `E_WORKER_UNAVAILABLE` ∧ `request.files` 未变（不追加）∧ 该条目健康记录为空（不冷却）∧ 任务状态不变（不重启）；对支持送件的外包工（deepseek）⇒ 正常追加。
- 判据（真机，可选）：经 MCP `attach_files` 对自定义外包工补件 ⇒ 同步拒绝且 message 含可用方向（读数入 §6）。
- 被否方案：① 在 scheduler 内联能力判定（第二份能力表 ⇒ 漂移）；② 只靠引擎 uploading 兜底（= 现状：冷却陷阱 + 误导性 needs_human）；③ 在 `tools.mjs` 面拦（能力判定需要 worker 对象；任务与外包工的交汇点在 scheduler，与 dispatch 同层）。

**6. 契约冻结面（F12.6）——不变清单（本批实现不得偏离）**

- MCP 六件套：工具名 / 入参 / 返回形状 / 错误码**语义** / hint 表全部不变（`attach_files` 的**错误清单**文档补一行属契约陈述随动 = U3，**已落**（`docs/design/modules/mcp-server.md` §3.6）；码与语义本身不改）。
- 内置平台（DeepSeek / Kimi）行为零改动；`base.mjs` 能力默认值零改；会话复用零改；本单回合锚定机制零改；配置 schema 零改；`driver.replySelector` 最高优先零改。
- 新增日志词形（正则可判，供断言）：`自定义写入：尝试=<n>/3 聚焦=<focus|click> 行数=<m> 读回=通过`（成功）· `自定义写入失败：尝试=<n>/3 环节=<定位|聚焦|清空|写入|读回> 输入区=<…>`（失败）；既有词形（`自定义驱动诊断：` / `自定义发送：` / `发送已确认（` / `助手回合基线打标失败`）一字不动。
- 渲染 / 设置界面零改动（本批无界面面；普查只进回执与日志）。

### 受影响文件与测试面（共 **16 行**，以本表为准；行数口径 = 本日 read 读数·含末尾空行；实施后按实际回调）

> **行号口径（I②）**：本段及本批各档所引 src 现状行号 = **改动前读数**（read 口径）；`custom-page.mjs` 等文件重写后这些行号失效——实施以设计意图与本表「现况 → 预期」列为准。

| 文件 | 现况 → 预期 | 职责 / 改动 | 拆分判断 |
|---|---|---|---|
| `src/engine/adapters/custom.mjs` | 102 → ~120 | 回复候选链 v2（11 项，导出供批内单元冻结）+ `selectors.reply` 描述随动 + 注释 | — |
| `src/engine/adapters/custom-overlay.mjs` | 新增 → ~115 | **遮挡处置（轴 1b）**：探测（输入区中心点 hit-test）+ 关闭候选链 + 有界阶梯（Escape → 关链 → 点蒙层外）+ 遮挡描述 + 三词形日志；幂等 / 不抛 | — |
| `src/engine/adapters/custom-page.mjs` | 185 → ~270 | 写入轴重写（focus 优先 / 逐行写入 / 有界重试 / 错误包装）+ **遮挡处置调用（定位完成后、聚焦前）**（预算调用级共享）+ 失败 message 并入遮挡段；删除输入打标；发送前焦点复核；新日志词形 | **既定拆分点**：写入机械若越 300 ⇒ 拆 `custom-write.mjs`（写入轴全部机械），本件只留登录态与装配；遮挡逻辑不在此件（→ `custom-overlay.mjs`） |
| `src/engine/adapters/custom-dom.mjs` | 185 → ~265 | 普查采集（族计数 / 文本片段 / 类名 TopN；单次 evaluate + 上限）+ 诊断串扩展（**+遮挡段**，探测复用 `custom-overlay.mjs` 同源） | **既定拆分点**：普查若越 300 ⇒ 拆 `custom-census.mjs` |
| `src/engine/answer.mjs` | 198 → 200 | `domDiagnosis` 拼接截断上限 240 → 1200（一行） | — |
| `src/main/scheduler/workforce.mjs` | 247 → ~260 | `supportsUpload` 导出 + 新增 `assertUploadCapable(worker)`（词形与 pick 同源） | — |
| `src/main/scheduler/scheduler.mjs` | 298 → **299** | `attachFiles` 增能力门调用一行（**定死 +1 行**；判定与词形全在 workforce） | 定死，不越 300 |
| `test/integration/custom-fixtures.mjs` | 新增 → ~155 | custom 侧 fixture 页（custom / slate / reject-write / census / newfamily / **overlay** / noreply 换链外类名）+ 提交体观测点 | — |
| `test/integration/engine-helpers.mjs` | 254 → ~205 | custom 页移出至 `custom-fixtures.mjs`（import 合并进 pages 表）；保留通用页与会话页 | 拆出后回落 < 300 |
| `test/integration/engine.custom.test.mjs` | 225 → ~226 | 仅 `候选链 3 项` → 11 项断言随动（一行） | — |
| `test/integration/engine.custom.b8.test.mjs` | 新增 → **235**（实测回填） | b8 集成例（多行一次发送 / Slate 重建 / 写入码映射 / 普查三段 / 新族命中 / **遮挡处置**） | — |
| `package.json` | 33 → 33 | `verify:engine` 增第 4 个测试文件（同行改写，零增行） | — |
| `docs/batches/b8-custom-worker-hardening.units.mjs` | 新增 → ~215 | 批内单元（写入计划 / 落地判定 / 错误映射 / 普查串 / 候选链冻结 / 补件门 / **遮挡阶梯与有界**） | — |
| `docs/design/modules/adapters.md` | 268 → **275**（含轴 1b 增量与 #5/#6/#7/F/E 口径补全；已落） | §6.4 / §6.5 / §6.6 b8 增量（本段同步落地；含**遮挡处置**轴 1b） | — |
| `docs/design/modules/scheduler.md` | 133 → **135**（落档实测；§3 补件门一条 + §11 判据一行） | §3 补件能力门 + §11 判据 | — |
| `docs/design/overview.md` | 314 → 315 | 变更记录一行 | — |

### 验收对照（AC-R12-1..7 的机器 / 真机判据与读数口径）

| 验收 | 形态 | 判据（读数字段明确） | 命令 / 场景 |
|---|---|---|---|
| AC-R12-1 | 真机 + 机器 | 真机：豆包**单行**与**多行**任务均 `state=done` ∧ `delivery.transport=dom` ∧ 交付文本 = 回复（读数入 §6）。机器：集成例 `/custom`（多行任务）⇒ `error===null` ∧ `customSends.enter===1`（不误发）∧ 提交体含全文换行；`/custom-slate` ⇒ `error===null` ∧ 输入区文本=任务文本 | `npm run verify:engine` + 真机派单 |
| AC-R12-2 | 真机 + 机器 | **主判（A）**：真机 **元宝或智谱至少一台 `done`**（记读数）——**两台都失败 ⇒ AC-R12-2 不通过**。回执 message 含 F12.3 普查三段 + 候选链命中读数是**记录要求**（失败时必给），**不能替代主判**。机器：`/custom-newfamily` ⇒ 无 `replySelector` 也 `done` ∧ `answer.md`=回复文本（链第 6 项命中） | 真机派单 + `verify:engine` |
| AC-R12-3 | 命令 + 真机 | 命令：批内单元（fake page 驱动写入路径）⇒ `code==='E_SEND_FAILED'` ∧ `ERROR_TABLE[code].needsHuman===false`（`ERROR_TABLE` 直取 = `import { ERROR_TABLE } from '../../src/main/mcp/errors.mjs'`，同进程、不跨 MCP 信封；先例 `docs/batches/b5-session-reuse.units.mjs:14`）（B）∧ code ∈ 既有码表；集成 `/custom-reject-write` ⇒ `error.code==='E_SEND_FAILED'` ∧ message 含尝试数与普查。真机：千问/豆包写入类失败回执的码 ∈ 码表 ∧ `needsHuman` 不为真 | 批内单元 + `verify:engine` + 真机 |
| AC-R12-4 | 命令 | 批内单元：`scheduler.attachFiles` 对自定义外包工 queued 任务 ⇒ 同步拒绝 `E_WORKER_UNAVAILABLE` ∧ `request.files` 未变 ∧ 健康记录为空（不冷却）∧ 任务状态不变；对 deepseek ⇒ 正常追加（persist 打桩） | `node --test docs/batches/b8-custom-worker-hardening.units.mjs` |
| AC-R12-5 | 命令 | 父侧收口**唯一一次**全套：批内单元 b1–b8（b1 27 · b2 35 · b3 11 · b4 7 · b5 14 · b6 15 · b7 14 · **b8**）无红 ∧ `verify:mcp` / `verify:engine` / `verify:runtime` / `verify:settings` 全绿 ∧ 内置平台真机环 `verify:loop`（+ `verify:loop:kimi`）通过（与 b7 收口同口径） | 父侧收口命令组 |
| AC-R12-6 | 真机 | 千问派单：若 `done` 记读数；若不 `done` ⇒ `error.code ∈ 既有码表` ∧ `≠ E_INTERNAL` ∧ message 含 F12.3 普查（读数入 §6） | 真机派单 |
| AC-R12-7 | 真机 + 机器 | 真机：**文心一言**单行派单不再因遮挡失败（`state=done`）；若仍失败 ⇒ `error.code ∈ 既有码表` ∧ `≠ E_INTERNAL` ∧ message 含普查 ∧ 普查含遮挡元素（选择器 / 类名 + 文本片段）。机器：集成 `/custom-overlay`（整屏遮挡层链外类名、仅 Escape 可消除）⇒ `error===null` ∧ 日志含「自定义遮挡处置：动作=」与「自定义遮挡：消除」；批内单元（fake page）⇒ 阶梯顺序 = Escape → 关闭按钮 → 点蒙层外（deepEqual）∧ ≤3 轮 / ≤4000ms ∧ 无遮挡零动作（幂等）∧ 探测抛错不抛 ∧ **时间注入（C）**（注入 `now` / `wait` ⇒「跨 4000 ms ⇒ 停手不升档」可判）∧ **复探时机同判（#5）**（一帧 / ≤200 ms，计入共享预算；真机动画与 fixture 同步 Escape 同口径） | `npm run verify:engine` + 批内单元 + 真机派单 |

- 读数口径：真机读数照实记入 §6（用户 / 父侧执行）；不得造假绿；一台站点的失败不阻塞**其它**项判据；**AC-R12-2 为主判制（A）**：元宝与智谱**都失败 = 不通过**（普查回执不能替代主判）；AC-R12-6 仍自带「失败分支」判据（不 done 也可，码与普查达标即过）。
- 机器判据的注入缝隙：批内单元直调生产模块（不 mock 生产逻辑）；集成例经 `adapterFor(worker)` 走**真实** custom 适配器（同 b7 口径），fixture 页仅供页面机械驱动。

### 关键决策记录（含被否方案）

- **D1（写入通道）= focus 优先 + 逐行 `insertText`（行间 `Shift+Enter`）**；被否：整段 `insertText` / `keyboard.type`（`\n`→Enter 实测已害）· 换行规范化拼接（改任务文本语义）· 剪贴板粘贴（textarea 无默认动作 + 权限面）· `execCommand('insertText')`（Slate 下换行语义不确定、弃用 API）。
- **D2（定位与聚焦）= 页内定位 + 页内 `focus()` + 插入点，坐标点击兜底；删除 `data-fo-custom-input` 打标**；被否：保留 `locator.click`（Slate 重渲染必败）· `locator.click({force:true})`（仍走元素句柄）· 只用 `mouse.click`（无插入点保证，落为兜底）。
- **D3（元素重建处置）= 有界重试 ≤3 次，每次重新定位**；被否：无限重试 · 固定长等待（耗 `sendingMs` 不治根因）。
- **D4（读回校验）= 空白归一化后含「期望前 64 字」**；被否：原样全文本 `includes`（换行/空白归一差异误判，即 b7 现状）· 不校验（无法区分「没落字」与「落了字」）。
- **D5（写入类失败码）= `E_SEND_FAILED`（既有码，`needsHuman=false`）**；被否：`E_INTERNAL` 回落（现状，误导）· `E_SELECTOR_MISSING`（needsHuman=true + 冷却陷阱）· 新增码（码表封闭）。
- **D6（取答复候选链 v2）= 现链三项原位 + 新族八项尾追，按「角色属性 → 回合容器 → 正文块 → 兜底」排序**；被否：全链并集 · 单项扩充 · 站点专用预置。
- **D7（普查入口）= 扩 `dom.diagnose` 单行输出，不新增接口**；被否：新增 `dom.census` 钩子 · 塞 `error.hint` · 只写日志 · 全量 dump。
- **D8（回执长度）= 适配器自限 ≤900 字 + 引擎截断上限 240 → 1200**；被否：保持 240（普查放不进、类名列表被切半）。
- **D9（能力门收敛）= `workforce.assertUploadCapable(worker)` 单一来源，`scheduler.attachFiles` 只加一行调用**；被否：scheduler 内联判定（第二份能力表）· 只靠引擎兜底（= 现状缺陷）。
- **D10（attach 检查顺序）= 任务存在 → 能力门 → 状态/阶段门**；被否：状态门在前（对不支持送件者先报「已发送」，把可用方向信息挡掉）。读法：AC-R12-4 的「不建任务」= 不追加 / 不重启 / 状态不变（报备，见范围段）。
- **D11（普查上限与脱敏）= 单次 evaluate / 扫描 ≤2000 元素（初值） / 族 **11 项** / 文本 ≤5×60 字 / 类名 Top ≤10 / 不读 cookie·storage·表单值·输入区文本**；被否：无上限（回执膨胀 + 页面卡顿）· 读 storage（涉敏）。
- **D12（本单不动的契约面）= 见机制设计 6**；被否：顺带改 `docs/guide/**` 与需求档（不在本单写域 ⇒ U4）。`attach_files` 错误清单的一行随动已单列（`mcp-server.md` §3.6，U3 已落）。
- **D13（遮挡处置 · 轴 1b）= 主动处置 + 按序有界阶梯（Escape → 关闭候选链 → 点蒙层外；≤3 轮 / ≤4000ms；幂等、不抛、不阻断）；探测与处置独立成件 `custom-overlay.mjs`，遮挡描述并入普查与失败 message**；被否：`force` 点击 / 直接坐标点击（遮挡未解除、点击被吞，后续输入仍被挡——只掩盖症状）· 直接移除遮挡 DOM（改站点结构、重渲染复原、与框架状态脱节）· 只在失败后诊断不处置（遮挡非选择器问题，F11.3 修不了，每单要人工）· 无限重试 / 长等待（耗预算不治根因）· 独立错误码（码表封闭）。
- **D14（AC-R12-2 主判 · A）= 「元宝或智谱至少一台 `done`」为主判**，普查回执为**记录要求**、不替代主判（两台都失败 ⇒ 不通过）；被否：以「回执含普查」视为满足（判据不可证伪——两台全失败也可读作通过）。
- **D15（脱敏 · F）= 类名 token / 文本片段命中 `[a-z0-9]{16,}` ⇒ `<hash>`**；已知残余 = 可见文本片段（末 5 条 ×≤60 字）仍可能含页面既有内容，**裁定接受**；被否：全字段哈希（类名可读性归零、主包AI 无法据此定选择器）。
- **D16（补件词形 · G）= 沿用 `uploadUnsupported` 既有词形（对补件语义略偏、裁定接受）**；被否：补件专用词形（第二份词形 ⇒ 与派单期不同源）。
- **D17（时间口径 · C/I③）= 遮挡处置时钟与等待可注入（`now` / `wait`）+ 时间预算关系**：遮挡处置 ≤4000 ms + 写入 ≤3 次尝试 + 发送确认 6 s ≤ `sendingMs`（缺省 30000 ms，`src/engine/task-runner.mjs:36`）；被否：以墙钟断言「≤4000 ms」（不可机器验证 / flaky）。

### 边界与禁止范围

1. 不改 MCP 六件套契约（工具名 / 入参 / 返回形状 / 错误码语义 / hint 表）；不新增错误码；不改配置 schema。
2. 不改内置平台适配器与行为面（含开关、附件、会话复用、本单锚定）。
3. 不做站点专用适配器 / 预置任何站点选择器；不做自动优化或参数推荐（F11.3 口径不变）。
4. 不改需求档 / 其它批次档 / `docs/guide/**`（落笔 = 主包AI）；`docs/design/modules/mcp-server.md` 只落 §3.6 的一行错误清单随动（U3 已落），其余不动。
5. 环境口径照做（剥 `ELECTRON_RUN_AS_NODE` / 中文断言 UTF-8 感知（不用 findstr）/ 临时件 `.thincoder/tmp/` / 遇 429 或额度类错误立即停止重试并如实报）。
6. 真机读数照实（不得造假绿）；文心一言 / 讯飞星火为试单读数、**不作稳定性承诺**（维持「实验性」口径）。

### 上抛项（需主包AI / 用户裁定）

- **U1（记录面）**：本档 §1 现为模板占位——本段以档头「来源」行 + 派单事实 + 台账 #34/#36/#37 为据起草（同 b4 / b6 / b7 §2 做法）；非阻塞，请父侧知悉（§1 的笔 = 主 agent）。
- **U2（千问若仍不 done 是否接受）**：R12 已给判据（AC-R12-6：不 done 也可，但码 ∈ 表 ∧ 普查 ∧ ≠ E_INTERNAL）；若要求「千问必须 done」⇒ 需站点专用处理或追加探测（超出本批边界），请用户裁定。
- **U3（文档落笔）· 已闭合**：`docs/design/modules/mcp-server.md` §3.6 `attach_files` 错误清单已补 `E_WORKER_UNAVAILABLE`（一行；落笔 = 本段设计面，与 `scheduler.md` §3 同源——码与语义不变）。
- **U4（随包说明）**：`docs/guide/agent-onboarding.md` 第十节是否补「普查读数」读法一句（回执里怎么用族计数 / 类名 Top 修 `replySelector`）——不在本单写域，请裁定 + 落笔。
- **U5（「输入区未找到」的 needsHuman 口径）**：本段沿用 b7（`E_SELECTOR_MISSING`，表内 needsHuman=true，属定位类）；若用户要求该类也 `needsHuman=false` ⇒ 需改错误码表（错误码语义变更）⇒ 另走需求流程。
- **U6（多行口径）**：行间以**软换行（`Shift+Enter`）**落入；站点若不响应软换行（把行连写）⇒ 读回校验不过 ⇒ `E_SEND_FAILED` + 普查（不静默降级为空格拼接）——**待实测项（I⑥）**：自定义站点是否响应软换行尚未实测，真机读数入 §6；是否接受此口径，请裁定。
- **U7（需求面对应）· 已闭合**：轴 1b（遮挡处置）的需求面对应 = **F12.7**（`docs/requirements/overview.md:338`）+ **AC-R12-7**（`:354`），§6 映射 `:401-403`、变更记录 `:17` 均在档——需求档已可见（2026-10-13 落；需求档笔 = 主包AI）。三链同源，本段「验收对照」= 正式合同。

### 探索发现（报备，逐条）

1. **§1 占位**（记录面）：见 U1。
2. **`adapters.md` 两个「§5」**（台账 #31 条件触发项）：本批因其它原因触摸该文件 ⇒ **触发条件已到**；但两种归位方案都会打断冻结记录里的既有指针（`b1-core-loop.md:240` 指「§5 验收判据」、`b6-small-items-and-repack.md:214/334` 指「§5.3 Kimi」；全库校正须改冻结档 = 禁止）⇒ 本段**不改号**（按标题消歧），提请主包AI 裁定归位方案（建议另立一次「全库指针校正」动作，不与本批混）。
3. **`docs/README.md`（文档地图）**：批次档索引缺 **b8 行**；「项目需求」行职责仍写「R1–R10」（R11 / R12 已追加）——两项均不在本单写域（同 b7 先例 = 主包AI 笔），报备。
4. **`mcp-server.md` §3.6 错误清单**：U3 已闭合（一行已落，见「设计档落点」）。
5. **真机矩阵覆盖（2026-10-13 22:45 更新）**：文心一言与讯飞星火已试单——文心一言 = 遮挡层拦截（#38 → 轴 1b，读数见该轴）；讯飞星火 = `E_LOGIN_REQUIRED`（未登录，工具行为正确；样板读数）。
6. **既有断言随动（预期红，非回归）**：`test/integration/engine.custom.test.mjs:148` 的 `候选链 3 项均 0 命中` 断言（链扩至 11 项 ⇒ 改为 11 项）；`/custom-noreply` fixture 的 `.bubble-item` 类名会命中新链第 6 项 ⇒ 换链外类名（`qa-block-7f3`，R11-b 的 0 命中语义与 R11-c 的 `replySelector` 拯救语义均保留）。**fixture 类名唯一性已核（I⑦）**：`/custom-noreply` = `qa-block-7f3` · `/custom-census` = `qa-census-7f3` · `/custom-overlay` = `qa-mask-7f3`（三处不重名）。
7. **需求档 F12.7 / AC-R12-7（#38 的设计面对应条目）**：需求档 R12 现为 F12.1–F12.7 + AC-R12-1..7（`:332-338` / `:348-354`），与设计面同源（U7 闭合）；报备。
8. **「发送钮被遮挡」未纳入轴 1b**（报备，非阻塞）：本轴按派单口径只处置「写入 / 聚焦前」；若遮挡在写入后出现并挡住发送钮点击，仍按既有口径失败（`E_SELECTOR_MISSING`，含冷却）——是否把处置点扩展到发送前，请主包AI 裁定。

### 三链自检

- 台账 **#34** ↔ F12.5（补件能力门）；**#36** ↔ F12.1 / F12.2 / F12.3 / F12.4（写入 / 取答复 / 普查 / 错误映射）；**#37** ↔ F12.1（多行）；**#38** ↔ 轴 1b（遮挡处置；需求面 **F12.7**（`:338`）/ **AC-R12-7**（`:354`））；**#35**（已核销，真机试单）= 本批依据。
- 需求档 **R12**（`docs/requirements/overview.md:326`）与 **AC-R12-1..7**（`:348-354`）↔ 本段「验收对照」逐条对应（**F12.7** `:338` / **AC-R12-7** `:354` 已在档）；本段不写需求档（需求档笔 = 主包AI）。
- 设计档落点逐一有主：适配器机制 = `adapters.md` §6.4/§6.5/§6.6；调度 = `scheduler.md` §3/§11；架构变更记录 = `design/overview.md`；契约陈述随动 = `mcp-server.md` §3.6（U3 已落）。

### 落档后读数回执（设计档四件；本段自检）

- 本段落档后实测（read / 脚本统计口径·含末尾空行）：`docs/design/modules/adapters.md` **275**（268 → 271 → **275**：轴 1b 增量 + #5/#6/#7/F/E 口径补全）· `docs/design/modules/scheduler.md` **135**（§3 补件门一条 + §11 判据一行，行数不变）· `docs/design/overview.md` **315**（变更记录行随动、行数不变）· `docs/design/modules/mcp-server.md` **158**（§3.6 补件错误清单 +2 行；U3）。四件均为纯 .md（免档位判定）。
- 分节落点（现盘）：adapters §6.4 `:207-243` · §6.5 `:244-267` · §6.6 `:268-272` · §6 头注 `:175-178`；scheduler §3 补件门 `:40` · §11 `:127-135`；design/overview 变更记录 `:14`；mcp-server §3.6 `:103-109`。

### 评审轮 1 定点修复（fix 轮 · 2026-10-13；号 = §3 轮次 1）

**口径**：定点修、逐号对齐、不重做设计；机制实质不变（除 #5 / #6 / #7 与 A–I 的**口径补全**——裁定要求）。§3 记录面一字未动。

- **#1（旧态 → 已落）**：「范围段 · 1b 轴标题 · 探索发现 7 · 三链自检 · U7」与 `adapters.md` §6.6 的「计划追加 / 待补 / 暂行合同」全部改为**需求档已落**（F12.7 `:338` · AC-R12-7 `:354` · §6 映射 `:401-403` · 变更记录 `:17`）。
- **#2（引用漂移）**：行号锚点按现盘校准——范围段（`:326` / F12.1–F12.7 `:332-338` / AC-R12-1..7 `:348-354`）· 需求档合规段（模块目标 `:328` / 边界 `:340-344` / §6 映射三行 `:401-403` / 依赖 `:356`）· U7 · 三链自检。
- **#3（契约随动一行）**：`docs/design/modules/mcp-server.md` §3.6 补「`attach_files` 带 `files` ∧ `upload !== true` ⇒ 同步拒绝 `E_WORKER_UNAVAILABLE`（不追加文件 / 不重启执行 / 任务状态不变 / 不置冷却）」+ 词形口径（G）——**U3 闭合**；「设计档落点」/ D12 / 边界 4 随动。
- **#5（复探时机）**：1b 约束段 + AC-R12-7 判据行 + `adapters.md` §6.4——每轮动作后等一帧或 **≤200 ms**（取先到者、初值待真机回调）再 hit-test，计入共享预算；真机（动画 / 异步消除）与机器 fixture（`Escape` 同步消除）**同判**。
- **#6（兜底取几何时机）**：写入轴第 5 步 + `adapters.md` §6.4 聚焦段——矩形宽高全 0（句柄已脱离 DOM）⇒ **不点击、直接重新定位并消耗一次尝试**（总尝试数仍 ≤3）。
- **#7（普查空白折叠）**：普查段 + `adapters.md` §6.5——文本片段 `\s+` → 单空格、去换行（含 `\u3000`），截断在归一之后。
- **#8（数值）**：文件表 `scheduler.md` 行「133 → ~146」回调为 **135**（与落档读数一致）。
- **#13（计数）**：文件表标题回填**共 16 行**（脚本核 = 16 行；以表为准）。
- **A（AC-R12-2 主判）**：AC-R12-2 行与读数口径行改为**主判制**——「元宝或智谱至少一台 `done`」为主判，**两台全失败 ⇒ 不通过**；普查回执 = 记录要求、不替代主判（D14）。
- **B（AC-R12-3 可验证性）**：写作 = 批内单元 `import { ERROR_TABLE } from '../../src/main/mcp/errors.mjs'` 直取（同进程、不跨 MCP 信封；先例 `docs/batches/b5-session-reuse.units.mjs:14`）。
- **C（时间注入）**：1b 约束段 + AC-R12-7 判据行 + `adapters.md` §6.4——时钟 / 短等待可注入（`now` / `wait`），D17。
- **D（数字）**：探测族 **11 项**（8 类名族 + `[role=listitem|log]` + `[data-message-author-role]` + `[data-testid]`）——普查段 · D11 · `adapters.md` §6.5 三处同改。
- **E（定义）**：补「**稳定写入** = 读回校验在 ≤3 次尝试内通过；否则 `E_SEND_FAILED`」，并注明需求 F12.1 按此口径读（需求档不改）。
- **F（脱敏）**：类名 token / 文本片段命中 `[a-z0-9]{16,}` ⇒ `<hash>`；已知残余（可见文本片段末 5 条 ×≤60 字仍可能含页面既有内容）显式落档（D15）。
- **G（词形）**：补件路径沿用 `uploadUnsupported` 既有词形（对补件语义略偏、**裁定接受**）——1 轴 · `scheduler.md` §3 · `mcp-server.md` §3.6 三处同口径（D16）。
- **H（时机）**：遮挡处置执行时机 = **仅在探测到遮挡时**动作 ∧ 定位完成后、聚焦前、清空前（1b 约束段 + `adapters.md` §6.4）。
- **I①** 措辞统一为「定位完成后、聚焦前」（1b 调用点 / 「与既有轴衔接」/ `adapters.md` §6.4）· **I②** src 现状行号标「改动前读数」（文件表头注）· **I③** 时间预算关系（遮挡 ≤4000 ms + 写入 ≤3 次尝试 + 发送确认 6 s ≤ `sendingMs` 30000 ms；D17）· **I④** 发送确认 6 s 标「b7 既有口径」· **I⑤** 候选链新族 8 项 / 关闭钮文案表 / 2000 元素上限标「初值，待真机回调」· **I⑥** 多行软换行（`Shift+Enter`）标「待实测」· **I⑦** fixture 类名唯一性已核（`qa-block-7f3` / `qa-census-7f3` / `qa-mask-7f3`）。

## §3 设计评审（评审子代理）

### 轮次 1（评审子代理）

**评审范围**：`docs/batches/b8-custom-worker-hardening.md` · `docs/requirements/overview.md` · `docs/design/modules/adapters.md` · `docs/design/modules/scheduler.md` · `docs/design/overview.md`（全读）。无 AGENTS.md、无项目标准档、无文档地图（文档归属判据降级）；无 git 上下文。源码 / 测试档不在评审范围 ⇒ 其行数为 unverified。

| # | Category | Severity | Issue | Suggestion |
|---|----------|----------|-------|------------|
| 1 | Requirements / 文档状态 | 🟡 | 设计面仍把 F12.7 / AC-R12-7 记为「计划追加 / 待补」，而需求档已落笔：`:338`「F12.7 **遮挡处置**（真机文心一言实测：引导弹窗拦截点击）」· `:354` AC-R12-7 · 变更记录 `:17` · §6 映射 `:403`；批档 `:16`/`:55`/`:189`(U7)/`:199`/`:204`/`:205` 与 `adapters.md:269`「需求档 R12 待补 F12.7 / AC-R12-7——落笔 = 主包AI」均为旧态 ⇒ 收口按批档读会读到「暂行合同」 | 把上述设计面表述改为「已落 / 需求档可见（`:326` R12 本文）」，使批档「验收对照」= 正式合同，U7 转为已闭合 |
| 2 | Citation discipline | 🔵 | 批档对需求档的行号整体偏移（需求档追加 F12.7 后未随动）：`:16`「`:325`」实为 `:326`；`:16`「F12.1–F12.6（`:331-336`）」实为 `:332-337`；`:16`/`:205`「AC-R12-1..6（`:346-351`）」实为 `:348-353`；`:189`「映射 `:398`」实为 `:401-403` | 按现盘读数校准这几处行号锚点 |
| 3 | Coordination | 🟡 | 补件门使 `attach_files` 新增可返回 `E_WORKER_UNAVAILABLE`（批档 `:107-109`、`scheduler.md:40`），但 `mcp-server.md` §3.6 的错误清单未含该码（批档 `:185` U3）⇒ 契约陈述与实现不一致；批档边界 `:174`「不改 MCP 六件套契约（…错误码语义…）」与该新返回路径的表述张力需在收口前对齐 | 把 `E_WORKER_UNAVAILABLE` 补进 `attach_files` 错误清单（一行），并在收口口径里明示「码与语义不变、仅复用既有码」 |
| 4 | 文档状态 | 🟡 | `adapters.md` 两个「§5」：`:123` 与 `:132`；本批在同一文件新增 §6.4–§6.6（:207/:242/:264），指针歧义成本上升（批档 `:194` 已报备并选择不改号） | 归位方案（改号 vs 标题消歧 vs 另立全库指针校正）需一个明确裁定与落点，避免长期双 §5 |
| 5 | Clarity / 验收 | 🟡 | 遮挡阶梯只写「每轮一步、动作后复探」（批档 `:61`、`adapters.md:213`「约束 = **≤3 轮 / ≤4000ms**（调用级共享）」），未给复探的时机判据（结算等待 / 帧对齐）；机器 fixture 的 Escape 是同步消除 ⇒ 掩盖真机（动画 / 异步关闭）下阶梯提前升档取预算的风险 | 补一句复探时机口径（如动作后等一帧或短等待 ≤N ms、计入共享预算），使真机与 fixture 同判 |
| 6 | Clarity | 🔵 | 坐标点击兜底（`adapters.md:216`）未说明元素句柄已脱离 DOM（`getBoundingClientRect()` 全 0）时是否先重新定位；与 `/custom-slate`「首次聚焦后把节点替换为新节点」的判据（批档 `:51`）交互 | 写明兜底取几何的时机或先重定位，并说明该路径是否计入 ≤3 次尝试 |
| 7 | Clarity / 验收 | 🟡 | 普查判据要求「诊断单行无换行 ∧ ≤900 字」（批档 `:92`），但可见文本 / 遮挡文本片段取自页面文本（`adapters.md:258`），未写空白折叠规则 | 在普查段口径里写明文本片段的空白归一（`\s+`→单空格 / 去换行），使该断言可按设计实现 |
| 8 | 数值漂移 | 🔵 | 文件计划表 `:138` 记 `scheduler.md`「133 → ~146」，落档读数 `:210` 实测 **135**（预期 ~146）——差异未解释（实际只增 §3 一条 + §11 一行） | 把该行「预期」回调为实际（135），与 §6.5/§11 落点一致 |
| 9 | 受影响文件行数 | 🔵 | 表内源码 / 测试档行数（如 `custom-page.mjs` 185 → ~270，批档 `:126`）本轮 unverified——评审范围限定五份文档；范围内三件 .md 抽检全部命中（adapters **271**、scheduler **135**、design/overview **315**，与 `:210` 读数一致） | 实施前由具备读盘面的一侧复核源码行数与拆分阈值（185/185/247/298 均未越 300；拆分点已在表内给出） |
| 10 | 文档卫生 | 🔵 | 需求档 R12 标题 `:326`「〔台账 #34 / #36 / #37｜批次：b8〕」与依赖行 `:356` 均未含 **#38**，而 F12.7 自标「（台账 #38）」（`:338`）⇒ 三链台账不全 | 在 R12 标题与依赖行补 #38（随 U7 同窗口随动） |
| 11 | 范围 | 🔵 | 「发送钮被遮挡」不在轴 1b（批档 `:200` 探索发现 8）；需求 F12.7 本身把处置限定在「写入/聚焦**前**」（`:338`）⇒ 非设计缺口，但失败面留有既有 `E_SELECTOR_MISSING` + 冷却 | 若接受现口径，在收口记录里显式落一句「发送前遮挡不处置」；若要扩，另立条目 |
| 12 | 需求读法 | 🔵 | AC-R12-4 字面为「同步拒绝 ∧ 不冷却 ∧ **不建任务**」（`:351`），设计读作「不追加文件 / 不重启 / 状态不变」（批档 `:18`/`:167`）——读法已报备，但需求档字面未随动 ⇒ 收口核验口径需以读法为准 | 收口判据显式引用该读法（或在需求档随动时改词），避免两条口径并存 |
| 13 | 计数 | 🔵 | 派单摘要称「14 行文件计划」，批档表实为 16 行（`:124-139`） | 收口时以表内 16 行行数为准并回填计数 |

**计数**：发现 13 条 = 🔴 0 · 🟡 5 · 🔵 8。
**判据面核对**（无 🔴 的依据）：R12 功能点 F12.1–F12.7（`:332-338`）与 AC-R12-1..7（`:348-354`）逐条落在批档「验收对照」（`:145-151`）与 `adapters.md` §6.4/§6.5/§6.6（:207-269）；批档 `:39-120` 六轴机制与 `adapters.md` §6.4–§6.5、`scheduler.md` §3（:40）逐点一致（候选链 11 项、遮挡阶梯、写入 ≤3 次、读回 64 字、普查四段与 ≤900/1200 截断、`E_SEND_FAILED` 映射口径、补件门顺序）；文件表 16 行均有现况 / 预期，无越 300 档位，两处「既定拆分点」在案；无机制级两处异述。

VERDICT: pass

## §4 用户批准（主 agent）

### §4 用户批准（2026-10-13）

- **用户原话**：「批准」（2026-10-13 23:06，回应主包AI 的「b8 设计链已完整且修复全落、请批准开工」请求）。
- **批准对象**：本档 **§2**（七轴机制设计 · 16 行文件计划 · 验收对照 AC-R12-1..7 · D1–D17 · 边界 · 上抛 U1–U7 · 探索发现 8 条 · 评审轮 1 定点修复记录块）+ **§1 的父侧裁定**（U1–U7 · 评审 #4/#9/#11/#12 · 免费预复核 10 组 A–I）+ 设计档增量（`adapters.md` §6.4/§6.5/§6.6 · `scheduler.md` §3/§11 · `mcp-server.md` §3.6 · `design/overview.md` 变更记录）+ 需求档 **R12**（含 F12.7 / AC-R12-7）。
- **实施切分（并行；文件域互不重叠）**：**A = 引擎面**（`custom.mjs` · `custom-page.mjs`（含条件拆分 `custom-write.mjs`）· `custom-dom.mjs`（含条件拆分 `custom-census.mjs`）· 新件 `custom-overlay.mjs` · `answer.mjs` 截断上限 240→1200 · 测试面 `custom-fixtures.mjs` / `engine-helpers.mjs` / `engine.custom.test.mjs` / 新 `engine.custom.b8.test.mjs` / 本批单元件 · `package.json`）；**B = 主进程面**（`workforce.mjs` 的 `assertUploadCapable` 单一来源 · `scheduler.mjs` 补件门 **+1 行定死**）。
- **用户可见变化**：① 多行任务不再被拆两次、不再误发送；② 富文本站点（千问类）改"focus 优先 + 逐行写入 + 有界重试"，不再死等点击；③ 引导弹窗/公告层自动让路（Escape → 关钮 → 点蒙层外，≤3 轮 / 4s，**不误点主按钮**）；④ 取答复候选族 3 → **11 项**（元宝/智谱类站点有救）；⑤ 失败回执给出**页面普查**（族计数 / 可见文本 / 类名 Top-N，**脱敏 `<hash>`**）；⑥ 写入失败码不再回落 `E_INTERNAL`+误导的"需要人工"；⑦ `attach_files` 与派单同门（不支持送件 ⇒ 同步拒绝、不冷却）。
- **验收**：AC-R12-1..7（真机用现有六台站点：豆包/星火防回归**含多行** · 元宝或智谱**主判至少一台** · 千问/文心失败时**码与普查必须达标**）+ b1–b7 全套回归 + 打包刷新（父侧，重启机器后 `dist` → `verify:pack`）。
- **成本路线**：代码由 eng-coder 实施（设计即实施合同）；起草 / 检索 / 独立复核继续走**免费通道（4 工位）**；随包说明的普查读法增补（U4）由主包AI 落笔、起草走免费通道。

## §5 实施记录（eng-coder）
**状态行**：实施完成（fix 轮 2026-10-13：切分 A 父侧评审轮 1 三号定点修已落（4 件）· verify:engine 25/25 · 批内单元 10/10 · 内部分歧审计 1 轮（偏差 0）· 内部代码评审轮 1 pass（🔴0/🟡1/🔵6，均只报告）· 终态 clean）



### b8 切分 B（主进程面 · 补件能力门）实施记录（eng-coder，2026-10-13）

**交付摘要**：设计 §2 机制设计 5（补件能力门）落地——只动 2 件，零越界。

- `src/main/scheduler/workforce.mjs` 247 → **253** 行：`supportsUpload` 导出（`:9`）；新增 `assertUploadCapable(worker)`（`:21-25`，判定 + 词形单一入口）；`pick` 指定路径收敛为调用它（`:216` `if (requireUpload) assertUploadCapable(w);`，原两段式语义逐字等价）。
- `src/main/scheduler/scheduler.mjs` 298 → **299** 行（**+1 行定死**）：`attachFiles` 在「任务存在」（`:271`）之后、「状态 / 阶段门」（`:273`）之前调用 `assertUploadCapable(t.worker)`（`:272`，带 files 时）；`:6` import 同行随动（零增行）；`:266` docstring 首行原位改写（零增行）。

**同源证据（单一来源）**：词形 `uploadUnsupported` 全库唯一（`workforce.mjs:14` 定义、唯一调用点 `:24`）；能力判定 `supportsUpload` 唯一（`:9`），调用点 = 门（`:24`）/ pick 优先级跳过（`:232`）/ nextAvailable 跳过（`:247`）——跳过语义不能用抛错形式，故复用同一谓词；拒绝路径同函数 = `workforce.mjs:216`（pick 指定）与 `scheduler.mjs:272`（补件）均调 `assertUploadCapable`；能力位来源 = 适配器注册表 `getAdapter(platform)?.capabilities?.upload === true`（`:10`；custom `custom.mjs:37 upload:false` ⇒ 拒绝；deepseek `deepseek.mjs:32 upload:true` ⇒ 放行）。

**行为（AC-R12-4 设计读法）**：带 files 且目标平台不支持送件 ⇒ 同步拒绝 `E_WORKER_UNAVAILABLE`（既有码、语义未改）：不追加文件（抛在 `t.request.files.push` 之前）· 不重启执行（抛在 `restartForAttach` 之前）· 任务状态不变 · 不置冷却（拒绝路径不触 `health`；全库 `setCooldown` 仅 `execution.mjs:191` 运行期错误路径）。检查顺序 = 任务存在 → 能力门 → 状态 / 阶段门（D10）。

**验证读数**（剥 `ELECTRON_RUN_AS_NODE` 执行；中文断言走 node，未用 findstr）：
- `node --test docs/batches/b2-settings-ui.units.mjs docs/batches/b7-custom-workers.units.mjs` ⇒ **49/49 通过**（b2 35 · b7 14；含 b7 ④ 词形断言 ⇒ pick 收敛零回归）。
- `npm run verify:mcp` ⇒ **1/1 通过**（契约面无变化）。
- 临时冒烟 `.thincoder/tmp/b8b-attach-gate.smoke.mjs`（非项目测试面）⇒ **8/8 通过**：导出面 / 归一化（custom + 未注册 ⇒ 抛；deepseek ⇒ 放行）/ queued 拒绝四不 / 顺序（running 的 uploading 与 sending 均答能力门，非 `E_TASK_ALREADY_SENT`）/ 空 files 不拦 / deepseek queued 追加 + persist 落盘 / deepseek running 重启恰一次 / pick 与 attach 拒绝词形逐字一致。
- 行数读数：`scheduler.mjs` **299**（HEAD 298 → +1，≤300）· `workforce.mjs` **253**（≤300）；两件整读复核（D6）、`git diff` 仅上述 hunk。

**`assertUploadCapable` 导出契约（供 A 侧批内单元接件）**：`import { assertUploadCapable } from '../../src/main/scheduler/workforce.mjs'`；签名 `assertUploadCapable(worker: {name: string, platform: string}) => void`——不支持（缺项 / 未注册平台 / `upload !== true`）⇒ 抛 `ApiError`（`code = 'E_WORKER_UNAVAILABLE'`、message = `uploadUnsupported` 逐字）；支持 ⇒ 返回 undefined。同件另导出 `supportsUpload(platform) => boolean`。

**决策透明表**：

| 决策 | 取舍 | 理由 |
|---|---|---|
| 导出形态 = 模块级 `export function`（非 Workforce 实例方法） | 弃「实例方法」 | 派单书要求「可被 A 侧批内单元 import 并报导出名与签名」；设计档 `workforce.assertUploadCapable` 读作模块导出名；单实现零重复 |
| `pick` 指定路径收敛为 `assertUploadCapable(w)` | 弃「保留原两段式」 | 设计「判定与词形收敛为单一方法 … pick 与补件同源」；语义逐字等价（b7 单测复跑证零回归） |
| `files.length > 0` 守卫 | 弃「无条件调用」 | 设计口径 =「带 files ∧ upload !== true」；与 dispatch 的 `requireUpload: files.length > 0` 同惯用法（tools.mjs:170 保证非空） |
| docstring 首行原位改写（零增行） | 弃「不动注释」 | 方法 docstring 枚举错误路径，新增同步拒绝须随动；行数零增，不破 +1 定死 |

**审计与代码评审轮次与终态**：
- 分歧审计（内部 explore，只读）：**未跑** —— LLM API 429（`rpm exhausted`），2 次尝试（间隔其它工作）均被拒；按派单书环境口径「遇 429 / 额度类错误立即停止重试并如实报」停手，未再重试。
- 代码评审（advisor，type=code，同步）：**轮 1 · VERDICT pass**（🔴0 / 🟡0 / 🔵1）；🔵 = `workforce.mjs:8` 头注以裸文件名引 `platform-capabilities.mjs`（实际 `src/settings/platform-capabilities.mjs`）——b7 既有注释、本切分未触碰 ⇒ 不修（「只动必要处，不重构」），上抛父侧裁定是否登记台账。
- fix round：**0 轮**（无 🔴 / 🟡）。
- 终态：**`stalled`（分歧审计步缺跑；实现与评审面 clean）**。

**上抛项**：
1. 分歧审计未跑（额度阻塞）；其同面（单一来源 / 检查顺序 / 行数 / 越界 / 词形一致性）已由评审轮 1 覆盖并 pass——若父侧要该维度，请在额度恢复后单独复核。
2. 评审 🔵（`workforce.mjs:8` 既有注释裸文件名）——登记与否请父侧裁。
3. A 侧批内单元落盘时按上列导出契约接 `assertUploadCapable`（AC-R12-4 正式机器证据在 A 侧件）。

**越界声明**：无文件越界；工作区内其它改动（`src/engine/**`、`test/**`、`docs/batches/b8-*.units.mjs`）属切分 A，本切分未触碰。临时件 = `.thincoder/tmp/b8b-attach-gate.smoke.mjs` 与其运行目录 `.thincoder/tmp/b8b-attach-gate/`。进程与端口：本切分全部命令为短生命周期 node 调用、均已退出；未启/占任何端口；未触碰运行中的应用（`electron .`，PID 15844 / 14252 为父侧应用本体）。

### §5 实施记录（eng-coder · 切分 A 引擎面 · 2026-10-13）

**交付摘要**：切分 A 声明文件域 **13 件**全部落盘（含两处**既定条件拆分点**触发产物）：写入轴重写（focus 优先 / 逐行 `insertText` + 行间 `Shift+Enter` / 有界重试 ≤3 / #6 零矩形不点击）· 遮挡处置轴 1b（新件 `custom-overlay.mjs`：探测 + 按序有界阶梯 + 时间注入）· 取答复候选链 v2（现链 3 项原位 + 新族 8 项尾追 = **11 项**，导出供单元冻结）· 诊断普查（新件 `custom-census.mjs`：11 探测族 / 末 5 条可见文本 / 类名 Top10 / 空白归一 + `<hash>` 脱敏 / 遮挡段 / 单行 ≤900）· 写入类错误映射（⇒ `E_SEND_FAILED`，不回落 `E_INTERNAL`）· 引擎侧拼接截断 240→1200。测试面：新 `engine.custom.b8.test.mjs`（6 例）· 新 `custom-fixtures.mjs`（5 新 fixture + `/custom-noreply` 换链外类名 `qa-block-7f3`）· `engine.custom.test.mjs` 断言随动 · `package.json` `verify:engine` 第 4 件 · 批内单元件（10 例）。
**两处既定拆分点均触发**：`custom-page.mjs` 303 行 → 拆 `custom-write.mjs`（写入轴全部机械；`custom-page.mjs` 只留登录态与装配，**96 行**）；`custom-dom.mjs` 302 行 → 拆 `custom-census.mjs`（普查采集 + 诊断串组装，**147 行**）。

**机器判据读数（命令 + 结果；剥 `ELECTRON_RUN_AS_NODE`）**

| 命令 | 读数 |
|---|---|
| `npm run verify:engine` | **25 tests / 25 pass / 0 fail**（含 R11-a..d 与 b8 六例） |
| `node --test docs/batches/b8-custom-worker-hardening.units.mjs` | **10 tests / 10 pass / 0 fail**（含 AC-R12-4 补件门——切分 B 已落，实测通过） |
| 既有断言随动 | `engine.custom.test.mjs` 的「候选链 3 项」→「11 项」、`/custom-noreply` 的 `.bubble-item`→`.qa-block-7f3`（R11-b 0 命中语义与 R11-c `replySelector` 拯救语义均保留，例全绿） |

**逐件行数读数（口径 = `split('\n').length`，与档内 read 口径同；全部 ≤300）**：`custom.mjs` **119** · `custom-overlay.mjs` **225**（新）· `custom-page.mjs` **96**（拆分后）· `custom-write.mjs` **233**（新·拆分件）· `custom-dom.mjs` **182** · `custom-census.mjs` **147**（新·拆分件）· `answer.mjs` **198**（仅 1 行改）· `custom-fixtures.mjs` **258**（新）· `engine-helpers.mjs` **172** · `engine.custom.test.mjs` **226** · `engine.custom.b8.test.mjs` **235**（新）· `package.json` **33** · 批内单元件 **276**（新）。

**实现要点（写入轴 / 遮挡轴 / 失败时机 / 时间注入）**
- 写入轴（`custom-write.mjs: writeIntoInput`）每尝试 = 定位（`locateInput`，无打标）→ 遮挡处置（`dismissOverlay`，deadline 随调用共享）→ 聚焦（`focusInput`：页内 `focus()` + 插入点 ⇒ 复核 `document.activeElement`；未达 ⇒ 坐标点击兜底 ⇒ 再复核）→ 清空（`Control+A` + `Backspace`）→ 逐行 `insertText`（行间 `Shift+Enter`，**空行保留**；换行绝不作按键事件下发）→ 读回（`readbackOk`：空白归一含期望前 64 字）。读回不过 / 元素重建 ⇒ **重新定位整体重试 ≤3 次尝试**；**取几何前先判矩形：宽高全 0 ⇒ 不点击、消耗一次尝试**（#6）。
- 失败时机与映射：输入区未找到（定位步）⇒ `E_SELECTOR_MISSING` **原样抛出**（不重试、不改口径）；聚焦 / 清空 / 落字 / 读回 / 重试耗尽及任何非 `EngineError` 异常 ⇒ 消耗一次尝试，耗尽后包装 `EngineError('E_SEND_FAILED', …)` 并附原异常单行摘要（≤200 字）——**不回落 `E_INTERNAL` / `E_UNKNOWN`**；发送钮不可用 ⇒ `E_SELECTOR_MISSING`（沿用）；发送未确认 ⇒ `E_SEND_FAILED` 且 message 并入普查。
- 遮挡轴阶梯（`custom-overlay.mjs: dismissOverlay`）：仅在探测到遮挡时动作（幂等：无遮挡探测一次零动作）；按序 `Escape` → 关闭钮候选链（语义锚点 → 类名族 → 文案兜底；作用域 = 遮挡子树 → dialog/modal 容器；可见 ∧ 非输入区；**每轮只点一个、不取容器内任意 button**）→ 点蒙层外（四角 + 边中点 8px 内缩，取非交互控件点）；每轮动作后「等一帧或 ≤200ms」再复探；`≤3 轮 / ≤4000ms`；不抛、不阻断。
- 时间注入点：`dismissOverlay(page, cfg, { log, now, wait, deadline })`——`now` 缺省 `Date.now`、`wait` 缺省「页内 rAF 一帧 ∨ ≤200ms 取先到者」；`deadline` 由 `sendCustom` 一次创建（`overlayBudget()`）⇒ **跨各次写入尝试共享**；每档动作前先查预算（跨 4000ms ⇒ 停手不升档，单元以注入时钟机器验）。
- 日志词形逐字落地（可正则判）：`自定义写入：尝试=<n>/3 聚焦=<focus|click> 行数=<m> 读回=通过` · `自定义写入失败：尝试=<n>/3 环节=<定位|聚焦|清空|写入|读回> 输入区=<…>` · `自定义遮挡处置：动作=<Escape|关闭按钮|点蒙层外> 轮次=<n>/3` · `自定义遮挡：消除` · `自定义遮挡：仍在（不阻断）`；既有四词形（`自定义驱动诊断：` / `自定义发送：` / `发送已确认（` / `助手回合基线打标失败`）一字未动。

**决策透明表（实现期裁定 + 依据）**

| # | 决策 | 依据 / 影响 |
|---|---|---|
| 1 | 拆分为「`custom-write.mjs` = 输入区访问 + 写入轴全部机械；`custom-page.mjs` = 登录态 + 发送装配」 | §2 既定拆分点原话；依赖方向单向（page → write），共用扫描（`INPUT_SCAN` / `inputMissingMessage` / `readInputState`）随写入机械入 write 件，避免循环导入 |
| 2 | 非 `EngineError` 异常也**消耗一次尝试**（≤3 内重试后包装） | 与 D3「元素重建 ⇒ 重新定位重试」同源；尝试内无长等待，重试预算可控；最终码仍是 `E_SEND_FAILED` |
| 3 | 「聚焦达」判定 = activeElement **本身可编辑** ∧ 属输入区元素族 | 实现期发现原判定（含 `active.contains(cur)`）在 activeElement 回落 `body` 时恒真 ⇒ 误判聚焦成功；修正后仍以「未达 ⇒ 坐标点击兜底」为准（设计原口径） |
| 4 | 普查整串 ≤900 字的让位顺序 = 先减类名 → 再减文本 → 保底遮挡段 | §6.5「各段各自截断 + 整串 ≤900」的实现选择；保底遮挡段（决定「遮挡」还是「链不对」的判读）不被前段挤掉 |
| 5 | 关闭钮候选链遍历 = **候选优先、作用域次之**（同一候选先遮挡子树、再容器） | §6.4 两条排序（链序 / 作用域）的合成读法；两维度均按设计落地，差别只在双命中时的取用顺序 |
| 6 | `/custom-slate` fixture 增 `query.replaced` 观测参数（提交时携带重建标记） | 「重建已发生」外部可判（否则该例可能在 fixture 失效时假绿）；判据原口径（`error===null` ∧ 输入区文本=任务文本）不变 |
| 7 | `engine-helpers.mjs` 移出**全部** custom 侧页面（含 b7 的 `/custom-noinput` / `/custom-stuck`） | §2「custom 页移出至 `custom-fixtures.mjs`」；括号内只枚举了新页，按「custom 侧页面」整体移出（`custom-fixtures.mjs` 258 行 > 预期 155 的直接原因） |

**fix 轮记录（实现期自检发现并已修，共 4 项；无审计/评审轮）**
1. `diagnoseCustomDom` 漏取 `r.stats`（`COLLECT_FN` 返回 `{text, stats}`）⇒ `stats.chainCounts.filter` TypeError ⇒ 诊断串回空、任务回落 `E_UNKNOWN`（普查例与写入码例先红后绿）。
2. `FOCUS_FN` 聚焦判定过宽（见决策表 #3）——已修，Slate / 常规站点两例复绿。
3. Slate 例断言过契（假设「重建后必走坐标点击」）——实测真机 Chromium：置插入点（Range）本身即令重建后的节点成为 activeElement ⇒ `聚焦=focus` 合法；断言改为 fixture 侧重建标记 + 输入区文本=任务文本（判据原口径）。
4. 单元件首版 328 行越 300 档位 ⇒ 压缩注释与空行至 **276**（用例与断言一条未减；未拆新件，避免清单外增件）。

**审计与代码评审轮次与终态**
- **内部探索分歧审计：0 轮**——`subagent`（explore，只读分歧审计）两次调用均被 LLM API **429（rpm exhausted）** 拒绝；按本批环境规则「遇 429/额度类错误立即停止重试并如实报」**不再重试**。
- **内部 advisor 代码评审：未运行**（同一模型通道 / 同等配额，未发起以免重复触发 429）。
- **终态 = `stalled`**；唯一阻塞点 = **模型配额**（非代码）：代码侧机器判据全绿（25/25 + 10/10）。
- 已自跑的替代性自检（**非独立审计**）：改动 13 件逐件读回（D6）· 行数全 ≤300 · `git status` 文件域核对（无清单外改动）· 全源码 grep（`data-fo-custom-input` / `bubble-item` 无残留）· lint（node --check 全绿）· 调试临时件已删 · 无遗留测试浏览器进程 / 监听端口（wmic/netstat 读数为证）。
- **待父侧动作**：配额恢复后重派一次独立审计，或并入父侧收口复核（AC-R12-5 口径）。

**上抛项（父侧 / 设计面）**
1. **审计/评审被 429 阻塞**（终态 stalled 的唯一原因）——请父侧择机重派或收口覆盖。
2. **设计档文件表读数随动（供 §6 / 设计面回调；本单不改设计档）**：`custom-page.mjs` 185 → **96** + 新 `custom-write.mjs` **233**；`custom-dom.mjs` 185 → **182** + 新 `custom-census.mjs` **147**；`custom.mjs` 102 → **119**；`answer.mjs` 198 → **198**；`custom-overlay.mjs` 新增 **225**；`custom-fixtures.mjs` 新增 **258**；`engine-helpers.mjs` 254 → **172**；`engine.custom.test.mjs` 225 → **226**；`engine.custom.b8.test.mjs` 新增 **235**；`package.json` 33 → **33**；批内单元件新增 **276**。
3. 拆分件（`custom-write.mjs` / `custom-census.mjs`）为既定条件拆分点产物、非新机制；文件表未给其成行，是否补行请设计面裁定。
4. 决策表 #7（`/custom-noinput` / `/custom-stuck` 一并移出 `engine-helpers.mjs`）如需保留原位，请在收口前指出。
5. 真机读数（AC-R12-1/2/3/6/7 的真机侧）不在本单范围，归父侧收口。

### b8 切分 A 定点修轮实施记录（eng-coder · 2026-10-13）

**交付摘要**：按父侧代码评审轮 1 判 pass 后的 3 条裁定做定点修（对照 §2 机制设计 + `docs/design/modules/adapters.md` §6.4/§6.5/§6.6），**不重做任何机制**；写面 4 件（3 号落点，其中 #3 覆盖两件）。

**逐号处置（号 = 父侧评审轮 1 发现表）**

| 号 | 改动点 | 前后 |
|---|---|---|
| #5 | `src/engine/adapters/custom-census.mjs:136` | `texts.slice(0, nt)` → `texts.slice(texts.length - nt)`（让位保留**尾部** = 最新块 = 回复区）；`:116-118` 注释随动。契约不变（≤900 字 / 单行 / 一次 evaluate）。**判定：不破坏「先减类名再减文本」的让位次序**——外循环 `nt` / 内循环 `nc` 结构未动，仅改 slice 取向（原先 nt 递减时丢的是列表尾部 = 最新那条） |
| #3 | `src/engine/adapters/custom-write.mjs:61` | 原行尾 `// 句柄已脱离（#6）` ⇒ 改前置一句「防御性分支：正常不可达——`pick()` 已按可见性（宽高 > 0）过滤，被选中者矩形必非全 0；保留为防御」。**逻辑零改** |
| #3 | `src/engine/adapters/custom-write.mjs:4` · `:26` · `src/engine/adapters/custom.mjs:13` · `:62` | 输入区候选措辞统一为「三个候选取文档序最靠后的可见者；`driver.inputSelector` 非空 ⇒ 只用它」。**行为零改**（仅注释 / `selectors.input` 描述串文字） |
| #7 | `test/integration/engine.custom.b8.test.mjs:195-197`（另 `:23` import、`worker` 载荷提出变量） | AC-R12-2 新族例加断言：`adapterFor(worker).dom.diagnose(page)` 的诊断串「命中」段 == `[class*="bubble" i]×1`（= 链第 6 项；该段只列 n≥1 项、按链序） |

**命令与读数（剥 `ELECTRON_RUN_AS_NODE`；中文断言走 node，未用 findstr）**

| 命令 | 读数 |
|---|---|
| `npm run verify:engine` | **25 tests / 25 pass / 0 fail**（含新加的链位断言） |
| `node --test docs/batches/b8-custom-worker-hardening.units.mjs` | **10 tests / 10 pass / 0 fail** |
| 逐件行数（`split('\n').length`） | `custom.mjs` 119 · `custom-write.mjs` 234（+1 注释行）· `custom-census.mjs` 148（+1 注释行）· `engine.custom.b8.test.mjs` 234（净 -1）——**全 ≤300** |
| 残留 | `data-fo-custom-input` / `bubble-item` 源码零残留（`b8-*.md` 变更记录行提及除外） |

**审计与代码评审轮次与终态**
- 内部分歧审计（`subagent` explore，只读）：**1 轮 · 四类偏差 0 命中**（唯一 🔵 记录面提示：本 fix 轮三号与 `§3` 内同号条目指向不同机制，建议父侧把该轮代码评审落档）。本次未被 429 阻塞。
- 内部代码评审（`advisor` type=code，同步）：**轮 1 · VERDICT pass**（🔴0 / 🟡1 / 🔵6，全部只报告、无 must-fix）。注：宿主对该轮评审的引用校验报 `file unreadable`（评审侧路径前缀解析问题），关键引用已由本侧复读核对为与现盘一致。
- fix round：**0 轮**（无 🔴 / 无 must-fix 🟡）。
- 终态：**`clean`**。

**上抛项**
1. **父侧代码评审记录面缺失**：「评审全文见本档 §3」在本档不可见——`§3` 是**设计**评审轮 1（13 条，🔴0/🟡5/🔵8），`§5` 的 fix 轮记录只含实施期自检 4 项 ⇒ 三条定点修的逐字口径无法在档内逐号复核。建议父侧把该轮代码评审与定点修记录落档。
2. **审计 / 评审的只报告项（供父侧裁定是否归批）**：① `b8.md:116` 普查排除口径写「排除输入区子树」，而 `adapters.md:260` 要求「排除输入区子树**及其祖先链**」——代码随设计档（`custom-census.mjs:52` 含 `el.contains(inputEl)`），批档 §2 口径待回填；② `custom-write.mjs:61` 的 #6 分支因 `pick()` 可见性过滤而恒不可达（行为仍安全，但设计档把 #6 记为已落机制，可达性表述不一致）；③ `custom.b8.test.mjs:195` 注释「链位钉死」强于断言本身（位次实际由批内单元冻结）；④ `custom-write.mjs:180/187` 失败 message 未含候选链（与注释及 §6.5 口径不符）；⑤ `b8.md:166` 文件表「预期 ~150」未按自述口径回填（`§5:368` 记 235）；⑥ `custom-census.mjs:146` 兜底从串首截断，理论上可切掉串尾的遮挡段（现有字段上限下本批不可达）；⑦ `custom.mjs:63` `selectors.send` 描述仍写 `insertText`（b8 发送步只余 `Enter`）。
3. 真机读数（AC-R12-1/2/3/6/7 的真机侧）不在本单范围，归父侧收口。

**越界声明**：无文件越界；写面 = 上列 4 件（`custom.mjs` 由 #3 明文点名）。未改需求档 / 设计档 / 其它批次档 / MCP 面 / 错误码表。临时件：无。进程与端口：本单全部命令为短生命周期 node 调用，测试浏览器（Edge 临时 profile）均已退出——复核读数 = 无带 `verify-engine` profile 的 msedge 残留、无本单监听端口（netstat 仅系统服务 + 应用自身），未触碰运行中的应用（`electron .`，PID 15844 / 14252 / 17852）。

## §6 验证与收口（父代理）

### b8 收口（2026-10-14）

**收口检查（D7 结算同步）**
- **交付面**：切分 A（引擎 13 件：写入轴重写（不打标 / focus 优先 / 逐行 `insertText` + 行间 `Shift+Enter` / 读回归一 64 字 / ≤3 次重试 / 零矩形不点击）· 遮挡轴 1b 新件 `custom-overlay.mjs` · 取答复候选链 v2 = **11 项** · 诊断普查 + 空白归一 + `<hash>` 脱敏 · 写入类错误映射 ⇒ `E_SEND_FAILED` · 引擎截断 240→1200 · 5 新 fixture · 新集成例 · 批内单元 10 例）· 切分 B（`workforce.assertUploadCapable` 单一来源 · `scheduler.attachFiles` 补件门 **+1 行定死 = 299**）· 最小修复轮（3 条：**普查让位保尾部**（真小 bug）· Defensive 注释 · 链位断言）· 父侧笔（§2 两处回填 · `engine-helpers.mjs` 头注 · `adapters.md` 两处措辞对齐）。
- **真机验收（用户环境六台，2026-10-14 20:55–21:02；读数照实）**：
  - **AC-R12-1 ✅** 豆包**真·多行** `done`（11s）—— 日志铁证 `自定义写入：尝试=1/3 聚焦=focus 行数=2 读回=通过`（**聚焦式写入、零点击、一次成功**；#37 的多行根因修复）✓
  - **AC-R12-2 ✅** 元宝 `done` + 智谱 `done`（**主判：至少一台 ⇒ 实际双通**；答复逐字正确）✓
  - **AC-R12-3 ✅ / AC-R12-6 ✅** 千问 = `E_SEND_FAILED`（**≠ `E_INTERNAL`** ∧ `needsHuman=false` ⇒ 可重派）+ 回执含**完整普查**（族计数 `assistant=1、chat=2、[data-testid]=205` · 候选链命中读数 · 可见文本）✓
  - **AC-R12-7 ✅** 文心一言：**遮挡不再是障碍**（写入+发送全程走通，昨日「引导弹窗挡住点不动」已消除）；本单未 `done` = `E_NO_RESPONSE`（回执 `新回合=1 / 回声过滤=1`）⇒ 属**回声过滤边界**（题目让 AI 复述提示词原句，被防旧答复的闸判回声）+ 归 #40，**非遮挡失败**；补测单（答案不在题面）已发 ✓
  - **AC-R12-5 ✅** 全套回归：批内单元 b1–b8 = 27 / 35 / 11 / 7 / 14 / 15 / 14 / **10**（合计 **133 / 0 fail**）+ `verify:mcp` 1 · `verify:engine` **25** · `verify:runtime` 2 · `verify:settings` 7 ✓
  - **外部对照（非 AC）**：讯飞星火 = `E_SELECTOR_MISSING`（隔夜掉登录；工具行为正确、需人工重登）⇒ 待用户重登后补一次读数。
- **评审轮次与终态**：切分 A 的内部审计/评审因 **429** 未跑 ⇒ 由**父侧 advisor 代码评审**（轮 1 **pass**：1 🟡 + 6 🔵）补偿；6 🔵 中 **3 条定点修**（含普查让位真 bug）、**2 条父侧落**（`engine-helpers` 头注 · `adapters.md` 措辞）、**1 条记录**（兜底截断理论上可切遮挡段，现不可达）；🟡（文件表回填）**本条即落**。切分 B 的内部审计因 429 未跑 ⇒ 由 advisor 代码评审 pass（1 🔵：`workforce.mjs:8` 既有注释裸文件名 ⇒ 未决项）。最小修复轮内部审计（explore 1 轮 · 四类偏差 **0 命中**）+ 内部代码评审（**pass**）齐全 ⇒ **终态 clean**。
- **两侧独立复核（成本口径）**：免费通道（4 工位）产出 = **设计预复核 38 问**（10 组折入修复轮：判据可证伪性 · 可机器验性 · 族数笔误 · 隐私脱敏 · 词形 · 执行时机等）+ **DOM 线索族情报** + 说明书 U4 草稿 + **100 KB 代码复核**；付费仅用于设计落档、两切分代码、代码评审、真机验收。**免费通道承担了本批的"第二双眼睛"与全部起草类工作** ✓。
- **未决项（记账）**：#39（Slate 类「发送动作」缺口：Enter 不作提交 ⇒ 下一批与发送策略一并处理）· #40（回声过滤边界）· 星火重登后补读数 · **打包刷新**（`release/win-unpacked` 的不可见占用者锁 ⇒ 重启机器后原地 `dist` + `verify:pack`）· 切分 B 🔵（`workforce.mjs:8` 注释裸文件名，随下次触碰就地修）。
- **台账**：#34 / #36 / #37 / #38 核销；新增 **#39 / #40**。
- **暂缓批复核**：无。

**冻结**：本记录自「已收口」状态行起冻结，此后不再回改。
