/**
 * Kimi 适配器（`docs/design/modules/adapters.md` §2 接口；平台读数 = `docs/batches/b3-kimi-adapter.md` §5 切分 A）。
 * 本模块 = **适配器接口实现**；页面机械（选择器台账 / 登录 / 新会话 / 发送 / 附件）在 `kimi-page.mjs`；
 * 分帧 JSON 行流解析（纯函数）在 `kimi-stream.mjs`；DOM 兜底在 `kimi-dom.mjs`；联网搜索开关的面板机械在 `kimi-toggles.mjs`（b6）；
 * 代码块提取引共享实现 `text-files.mjs`（D5）。
 */
import { defineAdapter, EngineError } from './base.mjs';
import { matchStreamUrl, parseChatStream } from './kimi-stream.mjs';
import { SELECTORS, checkLoginState, openNewSession, sendText, uploadFilesViaInput } from './kimi-page.mjs';
import { collectDomAnswer, markAssistantBaseline } from './kimi-dom.mjs';
import { applySearchToggle } from './kimi-toggles.mjs';
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
   *   `toggles` = **按子键**（b6）：search = true（`probe/out17` A1，3 轮一致：面板子行「自动搜索 / 关闭搜索」
   *   `aria-checked` 可读、选择后请求 `tools` 随动）；thinking = false（无控件且 `options.thinking` 恒 true
   *   ⇒ 如实声明为不支持，不再把 `manifest.toggles.ok` 拖成恒 false）；
   *   `requestPayloadCapture` = **true**（C1 取数命中：引擎捕获路径 `request.postData()` 可读出含 `tools` 的分帧请求体——
   *   实读入 `docs/batches/b6-small-items-and-repack.md` §5）；读键映射见 `requestPayload.toggles`）。
   */
  capabilities: {
    newChat: true,
    upload: true,
    downloadCapture: false,
    codeBlockExtract: true,
    streamCapture: true,
    toggles: { thinking: false, search: true },
    requestPayloadCapture: true,
  },

  selectors: SELECTORS,

  /** 登录 / 风控检测（K1 两态互斥判据）：`'ready' | 'login_required' | 'captcha'` */
  async checkLogin(page) {
    return await checkLoginState(page);
  },

  /** 新会话（K4）：判据 = 会话区清空，兜底导航首页；何时新建由引擎按会话复用判定（复用命中 ⇒ 不调用本函数） */
  async openSession(page, ctx = {}) {
    return await openNewSession(page, this.url, ctx);
  },

  /**
   * 开关对齐（R8 / `docs/design/modules/adapters.md` §3.8·§5.3）：只收**受支持子键的子集**（b6 起引擎已按子键过滤；Kimi 仅 search）。
   * 失败（元素缺失 / 状态不符）⇒ `E_SELECTOR_MISSING`，由调用方中止（不发送）；幂等：已对齐 ⇒ 只复核。
   */
  async applyToggles(page, toggles, ctx = {}) {
    const wanted = { search: !!toggles?.search };
    const actual = await applySearchToggle(page, wanted.search, ctx.log);
    if (actual !== wanted.search) {
      throw new EngineError('E_SELECTOR_MISSING', `开关「联网搜索」未对齐：目标=${wanted.search} 实际=${actual}`);
    }
    return { ok: true, configured: wanted, page: { search: actual }, readings: { search: { label: '联网搜索', want: wanted.search } } };
  },

  /**
   * 请求载荷捕获（R8 核对·C1 取数）：从分帧请求体读出两键——`options.thinking` ↔ thinking、
   * `tools` 含 `TOOL_TYPE_SEARCH` ↔ search（b3 探针 17 已取证）；产出键形 = `{thinking_enabled, search_enabled}`（与引擎比对读键同源）。
   * 分帧前缀含非 UTF-8 字节 ⇒ 定位首个 `{` / `[` 起 JSON 解析（容忍尾部分帧残字节）；未捕获 / 键缺失 ⇒ null。
   */
  requestPayload: {
    toggles(payload) {
      const text = String(payload ?? '');
      const iObj = text.indexOf('{');
      const iArr = text.indexOf('[');
      const start = iObj < 0 ? iArr : iArr >= 0 && iArr < iObj ? iArr : iObj;
      if (start < 0) return null;
      const raw = text.slice(start);
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
        if (end < 0) return null;
        try {
          parsed = JSON.parse(raw.slice(0, end + 1));
        } catch {
          return null;
        }
      }
      const body = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!body || typeof body !== 'object') return null;
      const thinking = body.options?.thinking;
      if (typeof thinking !== 'boolean' || !Array.isArray(body.tools)) return null;
      const search = body.tools.some((t) => (typeof t === 'string' ? t : t?.type) === 'TOOL_TYPE_SEARCH');
      return { thinking_enabled: thinking, search_enabled: search };
    },
  },

  /** 送件（K5）：`setInputFiles` 后等界面词干或 upload 请求（不得按全名——界面只显词干） */
  async uploadFiles(page, files, ctx = {}) {
    return await uploadFilesViaInput(page, files, ctx);
  },

  /** 发送（K3 / D2）：先记「助手回合基线」（b5 本单锚定）→ 清空 + `insertText` + 落地校验 → 点 `div.send-button-container`；点击失败 ⇒ Enter 兜底 */
  async send(page, text, ctx = {}) {
    await markAssistantBaseline(page, { log: ctx.log });
    return await sendText(page, text, ctx);
  },

  /** 答复流（K6）：命中判定精确到 `ChatService/Chat` 结尾 + 纯函数解析（SET 快照 + append 增量） */
  stream: {
    match: matchStreamUrl,
    parse: parseChatStream,
  },

  /** DOM 兜底（K9；b5 起本单锚定）：基线之后最后一个新助手回合的正文块（排除思考区，按 DOM 序；无新回合 ⇒ 空串） */
  dom: {
    async collect(page) {
      return await collectDomAnswer(page);
    },
  },

  /** 取件层②：代码块 → 文件清单（共享纯函数 `text-files.mjs`；规则权威 `docs/design/modules/outbox.md` §4） */
  extract: { filesFromText },
});
