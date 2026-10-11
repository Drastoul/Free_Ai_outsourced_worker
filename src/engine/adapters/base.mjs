/**
 * 适配器接口与能力声明（`docs/design/modules/adapters.md` §2）。
 *
 * 适配器 = 一个默认导出的对象；新增平台 = 新增一个模块 + 注册，不改调度与协议面。
 * 本模块提供：接口校验器 `defineAdapter`、能力默认值 `DEFAULT_CAPABILITIES`、引擎错误类型 `EngineError`。
 */
/**
 * 引擎内部错误：`code` 与 `docs/design/modules/mcp-server.md` 错误码表同源；
 * `E_CANCELED` 等引擎自用码不进错误码表（仅供引擎 ↔ 主进程的收尾口径说明）。
 */
export class EngineError extends Error {
  constructor(code, message, data = undefined) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

/**
 * 能力声明默认值（未声明 = 不具备）——调度与取件据此分支。
 * `toggles` 按子键声明（b6 起；接口见 `docs/design/modules/adapters.md` §2），归一化见 `normalizeToggles`。
 */
export const DEFAULT_CAPABILITIES = Object.freeze({
  newChat: false,
  upload: false,
  downloadCapture: false,
  codeBlockExtract: false,
  streamCapture: false,
  toggles: Object.freeze({ thinking: false, search: false }),
  requestPayloadCapture: false,
});

/**
 * 开关能力位归一化（能力声明唯一权威处的一次转换——引擎 / 界面 / 测试三面同源）。
 * 兼容旧值：`true` ⇒ 两子键均支持；`false` / 缺省 / 非法（非布尔非对象）⇒ 两子键均不支持；对象 ⇒ 逐键取真。
 */
export function normalizeToggles(value) {
  if (value === true) return { thinking: true, search: true };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { thinking: !!value.thinking, search: !!value.search };
  }
  return { thinking: false, search: false };
}

const REQUIRED_FUNCTIONS = [
  ['checkLogin', 'checkLogin(page)'],
  ['openSession', 'openSession(page)'],
  ['send', 'send(page, text)'],
];

/**
 * 校验并规整适配器定义（能力项按默认值补齐；`capabilities.toggles` 归一化为子键对象）。
 * @param {object} spec 适配器对象
 * @returns {object} 规整后的适配器对象
 */
export function defineAdapter(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object') {
    throw new Error('适配器定义非法：不是对象');
  }
  for (const key of ['id', 'platformName', 'url']) {
    if (typeof spec[key] !== 'string' || !spec[key]) problems.push(`缺 ${key}`);
  }
  for (const [key, shape] of REQUIRED_FUNCTIONS) {
    if (typeof spec[key] !== 'function') problems.push(`缺方法 ${shape}`);
  }
  if (!spec.stream || typeof spec.stream.match !== 'function' || typeof spec.stream.parse !== 'function') {
    problems.push('缺 stream.match / stream.parse');
  }
  if (!spec.dom || typeof spec.dom.collect !== 'function') problems.push('缺 dom.collect');
  if (!spec.extract || typeof spec.extract.filesFromText !== 'function') {
    problems.push('缺 extract.filesFromText');
  }
  if (problems.length) {
    throw new Error(`适配器定义非法（${spec.id ?? '未知平台'}）：${problems.join('；')}`);
  }
  const capabilities = { ...DEFAULT_CAPABILITIES, ...(spec.capabilities ?? {}) };
  capabilities.toggles = normalizeToggles(capabilities.toggles);
  return {
    ...spec,
    capabilities,
    selectors: { ...(spec.selectors ?? {}) },
  };
}
