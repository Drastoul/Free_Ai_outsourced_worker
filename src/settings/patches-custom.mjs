// 自定义外包工（b7）的补丁细节：新增（名称 + 链接）与驱动参数写入——URL / driver 校验的唯一实现处。
// 设计权威：docs/design/modules/settings-app.md §2（自定义外包工）；冻结接口（批次档 b7 §2）：
//   worker.add {platform:'custom', name, url}（新增时不给 driver）· worker.setDriver {id, driver:{≥1 键}}（部分更新、空串合法）。
// 通用小工具（fail / pass / checkKeys / findWorker / requireId / uniqueId）由 patches.mjs 经 kit 参数注入，避免两文件循环引用。

/** 驱动三键（= F11.3「二次优化」接口；空串 = 通用启发式，非空 = 该键覆盖） */
export const DRIVER_KEYS = ['inputSelector', 'sendButtonSelector', 'replySelector'];

/** 新建自定义条目的驱动默认值（三键空串 = 全部走通用启发式） */
export const DEFAULT_DRIVER = { inputSelector: '', sendButtonSelector: '', replySelector: '' };

/** 单键长度上限（与界面表单同口径；选择器语法不在此校验——语法错误在派单回执中定位） */
const MAX_SELECTOR_CHARS = 200;

/** URL 校验：new URL() 可解析 ∧ 协议 ∈ {http, https}（服务端校验；界面不做本地猜测、错误一律回显 patch 结果） */
function pickCustomUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return { ok: false, error: '链接不能为空（自定义外包工需填写链接）' };
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: `链接协议不支持（仅 http / https）：${url}` };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, error: `链接非法（应为 http / https 绝对地址）：${JSON.stringify(value)}` };
  }
}

/** driver 校验：对象 ∧ 键 ∈ 三键 ∧ 全字符串 ∧ 单键 ≤ 200；通过 ⇒ 原样返回所给键 */
function pickDriver(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: `driver 非法（应为对象）：${JSON.stringify(value)}` };
  }
  const keys = Object.keys(value);
  if (!keys.length) {
    return { ok: false, error: 'driver 为空（至少给出 inputSelector / sendButtonSelector / replySelector 之一）' };
  }
  for (const k of keys) {
    if (!DRIVER_KEYS.includes(k)) {
      return { ok: false, error: `driver 不接受的键：${k}（仅 ${DRIVER_KEYS.join(' / ')}）` };
    }
    const v = value[k];
    if (typeof v !== 'string') return { ok: false, error: `driver.${k} 非法（应为字符串）：${JSON.stringify(v)}` };
    if (v.length > MAX_SELECTOR_CHARS) {
      return { ok: false, error: `driver.${k} 过长（≤ ${MAX_SELECTOR_CHARS} 字符）：当前 ${v.length}` };
    }
  }
  return { ok: true, driver: value };
}

/**
 * worker.add（custom 分支）：{platform:'custom', name, url}。名称由用户自填（非空 ∧ 列表内唯一，冲突回显错误、不提交）；
 * 新增时不接受 driver 键（统一走 worker.setDriver —— 「只留可自主填写的接口」口径）。
 */
export function addCustomWorker(next, op, kit) {
  const { fail, pass, checkKeys, uniqueId } = kit;
  const extra = checkKeys(op, ['platform', 'name', 'url']);
  if (extra) return fail(extra);
  const name = typeof op.name === 'string' ? op.name.trim() : '';
  if (!name) return fail('名称不能为空（自定义外包工需填写名称）');
  if (next.workers.some((x) => x.name.trim() === name)) {
    return fail(`名称已存在：${name}（列表内名称必须唯一——名字即「主包AI 指定调用」的标识）`);
  }
  const u = pickCustomUrl(op.url);
  if (!u.ok) return fail(u.error);
  next.workers.push({
    id: uniqueId(next.workers),
    platform: 'custom',
    name,
    enabled: true,
    url: u.url,
    driver: { ...DEFAULT_DRIVER },
    toggles: { thinking: false, search: false },
  });
  return pass(next);
}

/** worker.setDriver：部分更新（≥1 键）；空串 = 恢复通用启发式；非 custom 条目拒绝（内置平台无驱动参数概念） */
export function setDriver(next, op, kit) {
  const { fail, pass, checkKeys, findWorker, requireId } = kit;
  const extra = checkKeys(op, ['id', 'driver']);
  if (extra) return fail(extra);
  const id = requireId(op);
  if (!id) return fail('缺少外包工 id');
  const w = findWorker(next.workers, id);
  if (!w) return fail(`外包工不存在（id=${id}）`);
  if (w.platform !== 'custom') {
    return fail(`外包工「${w.name}」不是自定义平台（platform=${w.platform}），不支持驱动参数`);
  }
  const picked = pickDriver(op.driver);
  if (!picked.ok) return fail(picked.error);
  w.driver = { ...DEFAULT_DRIVER, ...(w.driver || {}), ...picked.driver };
  return pass(next);
}
