/**
 * DeepSeek 适配器（`docs/design/modules/adapters.md` §2 接口 + §3 首实现）。
 * 本模块 = **适配器接口实现 + 纯函数**（流解析 / 载荷读键 / 代码块抽取）；
 * 页面操作机械（元素台账、开关五级兜底、输入 / 发送、DOM 兜底、下载按钮）在
 * `src/engine/adapters/deepseek-page.mjs`；SSE 解析纯函数在 `src/engine/adapters/deepseek-stream.mjs`。
 */
import { defineAdapter, EngineError } from './base.mjs';
import { parseSSE, matchStreamUrl } from './deepseek-stream.mjs';
import {
  SELECTORS,
  TOGGLE_LABELS,
  TOGGLE_WAIT_MS,
  checkLoginState,
  openNewSession,
  readToggles,
  sendText,
  setToggle,
  settleAnswerDom,
  uploadFilesViaInput,
  waitForToggleElement,
} from './deepseek-page.mjs';
import { clickDownloadButtons, collectDomAnswer } from './deepseek-dom.mjs';

export default defineAdapter({
  id: 'deepseek',
  platformName: 'DeepSeek',
  url: 'https://chat.deepseek.com/',

  capabilities: {
    newChat: true,
    upload: true,
    downloadCapture: true,
    codeBlockExtract: true,
    streamCapture: true,
    toggles: true,
    requestPayloadCapture: true,
  },

  selectors: SELECTORS,

  /** 登录 / 风控检测（`§3.6`）：`'ready' | 'login_required' | 'captcha'` */
  async checkLogin(page) {
    return await checkLoginState(page);
  },

  /** 新会话：每单一条独立会话 */
  async openSession(page) {
    return await openNewSession(page, this.url);
  },

  /**
   * 开关对齐（R8 / `§3.8`）：五级点击兜底 + 逐步 aria 复核 + 发送前复核。
   * 失败（元素缺失 / 状态不符）⇒ `E_SELECTOR_MISSING`，由调用方中止（不发送）。
   * 幂等：已对齐 ⇒ 只做复核，不点击。
   */
  async applyToggles(page, toggles, ctx = {}) {
    const { log } = ctx;
    const wanted = { thinking: !!(toggles?.thinking), search: !!(toggles?.search) };
    const readings = {};
    for (const [key, label] of Object.entries(TOGGLE_LABELS)) {
      if (!(await waitForToggleElement(page, label, TOGGLE_WAIT_MS))) {
        throw new EngineError('E_SELECTOR_MISSING', `开关元素缺失（div.ds-toggle-button：「${label}」）`);
      }
      const r = await setToggle(page, label, wanted[key], log);
      if (!r.ok) {
        throw new EngineError('E_SELECTOR_MISSING', `开关「${label}」未对齐：目标=${wanted[key]} 实际=${r.aria ?? '未知'}`);
      }
      readings[key] = { label, want: wanted[key], aria: r.aria, via: r.via };
    }
    const after = await readToggles(page);
    const mismatched = Object.entries(wanted)
      .filter(([key, want]) => after[key] !== want)
      .map(([key]) => TOGGLE_LABELS[key]);
    if (mismatched.length) {
      throw new EngineError('E_SELECTOR_MISSING', `发送前复核不一致：${mismatched.join('、')}`);
    }
    return { ok: true, configured: wanted, page: after, readings };
  },

  /** 请求载荷捕获（R8 核对）：从 chat/completion 请求体读出两个开关键；未捕获 / 键缺失 ⇒ null */
  requestPayload: {
    toggles(payload) {
      let obj = payload;
      if (typeof payload === 'string') {
        try {
          obj = JSON.parse(payload);
        } catch {
          return null;
        }
      }
      if (!obj || typeof obj !== 'object') return null;
      const thinking = obj.thinking_enabled;
      const search = obj.search_enabled;
      if (typeof thinking !== 'boolean' || typeof search !== 'boolean') return null;
      return { thinking_enabled: thinking, search_enabled: search };
    },
  },

  /** 送件（决策 H）：`setInputFiles` 后等界面出现文件名 */
  async uploadFiles(page, files, ctx = {}) {
    return await uploadFilesViaInput(page, files, ctx);
  },

  /** 发送：聚焦输入框 → insertText →（落地失败兜底逐字 type）→ Enter */
  async send(page, text, ctx = {}) {
    return await sendText(page, text, ctx);
  },

  /** 答复流：命中判定 + 纯函数解析（协议权威见 `docs/design/modules/adapters.md`「收答复主通道」） */
  stream: {
    match: matchStreamUrl,
    parse: parseSSE,
  },

  /** DOM 兜底：拼接最后一个助手回合内的全部 markdown 块（探针 2 只取最后一块会漏内容） */
  dom: {
    async collect(page) {
      return await collectDomAnswer(page);
    },
  },

  /** 取件层②：代码块 → 文件清单（纯函数；命名净化在落盘处执行，见 `docs/design/modules/outbox.md`） */
  extract: {
    filesFromText(text) {
      const out = [];
      const fence = /```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)```/g;
      let m;
      while ((m = fence.exec(String(text ?? '')))) {
        const lang = m[1] || 'txt';
        const content = m[2];
        const named = content.match(/^(?:#|\/\/|<!--)\s*file:\s*([^\s>]+)/i);
        const name = named ? named[1].trim() : `code_block_${out.length + 1}.${lang || 'txt'}`;
        out.push({ name, lang, content });
      }
      return out;
    },
  },

  /**
   * 取件层①：点击代码块「下载」按钮触发真实浏览器下载（落盘由引擎的 CDP 自动落盘承担）。
   * 先等 DOM 稳定再点（探针 6 流程）；失败不抛错（下载只是三层之一）。
   */
  downloads: {
    async trigger(page, ctx = {}) {
      const { log } = ctx;
      await settleAnswerDom(page, { log });
      return await clickDownloadButtons(page, { log });
    },
  },
});
