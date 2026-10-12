/**
 * 自定义外包工适配器（`docs/design/modules/adapters.md` §6；R11 / b7 落地）：
 * 一个适配器承载任意站点——站点身份 = `bindWorker` 覆盖的 `url`，页面机械 = `driver` 三键（空串 = 通用启发式）。
 * 能力位（§6.2）：无流（`streamCapture:false` ⇒ 答复走 DOM 通道）/ 无送件 / 无下载 / 无开关 / 无新建会话 / 无载荷核对。
 * 装配：页面机械在 `custom-page.mjs`，DOM 采集 / 基线 / 诊断在 `custom-dom.mjs`。
 */
import { defineAdapter, EngineError } from './base.mjs';
import { filesFromText } from './text-files.mjs';
import { CONFIRM_MS, checkLoginState, loginFailureInfo, sendCustom } from './custom-page.mjs';
import { collectCustomAnswer, diagnoseCustomDom, markCustomBaseline } from './custom-dom.mjs';

/** 输入区候选链（§6.4；`driver.inputSelector` 非空 ⇒ 只用它） */
const INPUT_CANDIDATES = Object.freeze(['textarea', '[contenteditable="true"]', 'input[type="text"]']);
/** 回复区候选链（§6.4；`driver.replySelector` 非空 ⇒ 只用它；按序取第一个命中者） */
const REPLY_CANDIDATES = Object.freeze(['[data-message-author-role]', '[class*="message" i]', '[role="listitem"]']);
/** 基座 url 占位（每工人实例由 `bindWorker` 覆盖）：未覆盖即派单 = 主进程校验漏网——引擎不会打开该站点（失败回执将落在登录 / 选择器诊断，而非「url 缺失」；缺 url 的 custom 条目由配置层隔离，见 docs/design/modules/scheduler.md §10） */
const PLACEHOLDER_URL = 'about:blank';
const DRIVER_KEYS = ['inputSelector', 'sendButtonSelector', 'replySelector'];

/** driver 归一化（缺键 / 非字符串 ⇒ 空串 = 该键走通用启发式） */
function normalizeDriver(driver) {
  const out = {};
  for (const key of DRIVER_KEYS) out[key] = typeof driver?.[key] === 'string' ? driver[key].trim() : '';
  return out;
}

/** 组装一个实例（基座与 `bindWorker` 派生共用；派生 = 新对象，基座实例不被污染） */
function instantiate({ url, driver }) {
  const cfg = { url, driver: normalizeDriver(driver), inputCandidates: INPUT_CANDIDATES, replyCandidates: REPLY_CANDIDATES };
  return {
    id: 'custom',
    platformName: '自定义',
    url,
    driver: cfg.driver,
    capabilities: {
      newChat: false,
      upload: false,
      downloadCapture: false,
      codeBlockExtract: true,
      streamCapture: false,
      toggles: { thinking: false, search: false },
      requestPayloadCapture: false,
    },
    selectors: {
      input: `${INPUT_CANDIDATES.join(' → ')}（取文档序最靠后的可见者；driver.inputSelector 非空 ⇒ 只用它）`,
      send: 'driver.sendButtonSelector 非空 ⇒ 点该按钮；空 ⇒ 聚焦输入区 + insertText + Enter',
      reply: `${REPLY_CANDIDATES.join(' → ')}（取第一个命中者；driver.replySelector 非空 ⇒ 只用它）`,
      confirm: `发送后 ${CONFIRM_MS / 1000}s：输入区已清空 ∨ 出现新回合元素`,
    },
    /** 登录态（§6.1）：输入区可见 ⇒ ready；风控词 ⇒ captcha；登录词 / 可见密码框 ⇒ login_required */
    checkLogin(page) {
      return checkLoginState(page, cfg);
    },
    /** 失败诊断钩子（§6.1）：输入区未找到且无登录线索 ⇒ E_SELECTOR_MISSING + 候选链；其余 ⇒ null（既有映射） */
    loginFailure(page) {
      return loginFailureInfo(page, cfg);
    },
    /** 占位：`newChat:false` ⇒ 引擎不调本函数（`task-runner` 守卫）；被调用即实现事故 */
    openSession() {
      throw new EngineError('E_UNKNOWN', 'custom 无新建会话判据（newChat:false）——openSession 不应被调用');
    },
    /** 发送（§6.4）：先打该实例的基线（本单回合锚定）→ 填充 + 发送方式 + 6s 发送确认（无流平台由 send 自担） */
    send(page, text, ctx = {}) {
      return sendWithBaseline(page, text, cfg, ctx);
    },
    /** 占位：`streamCapture:false` ⇒ 引擎不解析流；`match` 恒 false（挂监听无害，解析不应被调用） */
    stream: {
      match: () => false,
      parse() {
        throw new EngineError('E_UNKNOWN', 'custom 无答复流（streamCapture:false）——stream.parse 不应被调用');
      },
    },
    dom: {
      collect(page) {
        return collectCustomAnswer(page, cfg);
      },
      diagnose(page) {
        return diagnoseCustomDom(page, cfg);
      },
    },
    extract: { filesFromText },
    /** 按外包工生成派生实例（b7）：覆盖 `url` 与 `driver`，其余引用不变 */
    bindWorker(worker) {
      const url = typeof worker?.url === 'string' && worker.url ? worker.url : PLACEHOLDER_URL;
      return instantiate({ url, driver: worker?.driver });
    },
  };
}

const oneLine = (v, max = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function sendWithBaseline(page, text, cfg, ctx = {}) {
  const marked = await markCustomBaseline(page, cfg, { sentText: text, log: ctx.log });
  // 冻结日志词形（§6.5）：一行驱动快照（用户自填值折成单行短串），供事后取证（随 task 日志进 app.log）
  ctx.log?.(
    `自定义驱动诊断：url=${oneLine(cfg.url)} 基线标记=${marked} 输入区=${oneLine(cfg.driver.inputSelector) || '自动'} 发送键=${oneLine(cfg.driver.sendButtonSelector) || 'Enter'} 回复键=${oneLine(cfg.driver.replySelector) || '自动'}`,
  );
  return await sendCustom(page, text, cfg, ctx);
}

export default defineAdapter(instantiate({ url: PLACEHOLDER_URL, driver: {} }));
