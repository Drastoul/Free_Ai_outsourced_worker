/**
 * Kimi 适配器（`docs/design/modules/adapters.md` §2 接口；平台读数 = `docs/batches/b3-kimi-adapter.md` §5 切分 A）。
 * 本模块 = **适配器接口实现**；页面机械（选择器台账 / 登录 / 新会话 / 发送 / 附件）在 `kimi-page.mjs`；
 * 分帧 JSON 行流解析（纯函数）在 `kimi-stream.mjs`；DOM 兜底在 `kimi-dom.mjs`；代码块提取引共享实现 `text-files.mjs`（D5）。
 */
import { defineAdapter } from './base.mjs';
import { matchStreamUrl, parseChatStream } from './kimi-stream.mjs';
import { SELECTORS, checkLoginState, openNewSession, sendText, uploadFilesViaInput } from './kimi-page.mjs';
import { collectDomAnswer } from './kimi-dom.mjs';
import { filesFromText } from './text-files.mjs';

export default defineAdapter({
  id: 'kimi',
  platformName: 'Kimi',
  url: 'https://www.kimi.com/',

  /**
   * 能力位（如实声明；未声明 = 不具备——`src/engine/adapters/base.mjs` 默认值）：
   *   `newChat` = K4（点「新建会话」+ 会话区判据）· `upload` = K5（`setInputFiles` + 词干 / upload 请求确认）；
   *   `downloadCapture` = **false**（K7：代码块头仅「复制」，无「下载」按钮 ⇒ 取件走层②③）；
   *   `codeBlockExtract` = K6 样本（答复含围栏代码块）· `streamCapture` = K6（分帧 JSON 行流）；
   *   `toggles` = **false**（父侧裁定 K8：thinking 键无控件且 `options.thinking` 恒 true ⇒ 落 true 会让
   *   `manifest.toggles.ok` 对默认配置恒判 false；search 键虽随动，单布尔能力位下按保守口径）；
   *   `requestPayloadCapture` = **false**（同口径：`toggles=false` ⇒ 应用与复核子步整体跳过，不回报 payload。
   *   读键映射已由探针 17 取证——`options.thinking` ↔ thinking、`tools` 含 `TOOL_TYPE_SEARCH` ↔ search；
   *   待「按子键的能力位」新协议面语义另立需求后启用）。
   */
  capabilities: {
    newChat: true,
    upload: true,
    downloadCapture: false,
    codeBlockExtract: true,
    streamCapture: true,
    toggles: false,
    requestPayloadCapture: false,
  },

  selectors: SELECTORS,

  /** 登录 / 风控检测（K1 两态互斥判据）：`'ready' | 'login_required' | 'captcha'` */
  async checkLogin(page) {
    return await checkLoginState(page);
  },

  /** 新会话（K4）：每单一条独立会话；判据 = 会话区清空，兜底导航首页 */
  async openSession(page, ctx = {}) {
    return await openNewSession(page, this.url, ctx);
  },

  /** 送件（K5）：`setInputFiles` 后等界面词干或 upload 请求（不得按全名——界面只显词干） */
  async uploadFiles(page, files, ctx = {}) {
    return await uploadFilesViaInput(page, files, ctx);
  },

  /** 发送（K3 / D2）：清空 + `insertText` + 落地校验 → 点 `div.send-button-container`；点击失败 ⇒ Enter 兜底 */
  async send(page, text, ctx = {}) {
    return await sendText(page, text, ctx);
  },

  /** 答复流（K6）：命中判定精确到 `ChatService/Chat` 结尾 + 纯函数解析（SET 快照 + append 增量） */
  stream: {
    match: matchStreamUrl,
    parse: parseChatStream,
  },

  /** DOM 兜底（K9）：最后一个助手回合的正文块（排除思考区，按 DOM 序） */
  dom: {
    async collect(page) {
      return await collectDomAnswer(page);
    },
  },

  /** 取件层②：代码块 → 文件清单（共享纯函数 `text-files.mjs`；规则权威 `docs/design/modules/outbox.md` §4） */
  extract: { filesFromText },
});
