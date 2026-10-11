// 设置界面的配置变更纯函数与校验（b2；唯一写入口 = patch 清单）。
// 设计权威：docs/design/modules/settings-app.md §2 / §5 / §7；操作清单与形状 = 批次档 b2 §2「冻结接口」
//（b6 增补 session.set，见批次档 b6 §2「冻结接口」）：
//   worker.add {platform} · worker.remove {id} · worker.rename {id, name} · worker.move {id, dir: up|down}
//   · worker.setEnabled {id, enabled} · worker.setToggles {id, toggles} · outbox.set {dir}
//   · session.set {reuse?, ttlMs?, maxTasksPerSession?}（至少一键；部分更新）
// 纯函数：不改传入配置（深拷贝后变更，返回新配置）；目录可用性以注入检查器判定（checkDir ⇒ Promise<boolean>）。
// 校验失败 ⇒ {ok:false, error}（调用方弹错、不落配置）；成功 ⇒ {ok:true, config}（调用方原子写 + 广播）。

/** 八操作清单（冻结；顺序即文档顺序；b6 增 session.set） */
export const PATCH_OPS = [
  'worker.add',
  'worker.remove',
  'worker.rename',
  'worker.move',
  'worker.setEnabled',
  'worker.setToggles',
  'outbox.set',
  'session.set',
];

/** 平台清单：新增入口可见项（加平台 = 加适配器 + 加行；b3 起 DeepSeek / Kimi 均已注册，均可选） */
export const PLATFORM_CHOICES = [
  { id: 'deepseek', label: 'DeepSeek', available: true },
  { id: 'kimi', label: 'Kimi', available: true },
];

const fail = (error) => ({ ok: false, error });
const pass = (config) => ({ ok: true, config });

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 冻结形状守卫：除 `op` 外只接受清单字段（多余字段 ⇒ 明确报错，避免跨切分静默错配） */
function checkKeys(op, allowed) {
  const extra = Object.keys(op).filter((k) => k !== 'op' && !allowed.includes(k));
  if (!extra.length) return null;
  const shape = allowed.length ? `{${allowed.join(', ')}}` : '{}';
  return `操作 ${op.op} 只接受 ${shape}；收到多余字段：${extra.join('、')}`;
}

function findWorker(workers, id) {
  return workers.find((w) => w.id === id) || null;
}

function requireId(op) {
  return typeof op.id === 'string' && op.id.trim() ? op.id.trim() : null;
}

/** 列表内名称唯一：默认名（平台名）被占 ⇒ 追加「 2」「 3」…（schema 对重名条目会隔离，故必须唯一） */
function uniqueName(workers, base) {
  const taken = new Set(workers.map((w) => w.name));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base} ${i}`;
    if (!taken.has(cand)) return cand;
  }
  return `${base} ${Date.now()}`;
}

/** 条目 id 唯一（沿用 `w-<n>` 形态；取最小可用序号） */
function uniqueId(workers) {
  const taken = new Set(workers.map((w) => w.id));
  for (let i = 1; i < 10000; i++) {
    const cand = `w-${i}`;
    if (!taken.has(cand)) return cand;
  }
  return `w-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// 八操作
// ---------------------------------------------------------------------------

function addWorker(next, op) {
  const extra = checkKeys(op, ['platform']);
  if (extra) return fail(extra);
  const platform = typeof op.platform === 'string' ? op.platform.trim() : '';
  const choice = PLATFORM_CHOICES.find((p) => p.id === platform);
  if (!choice) {
    return fail(`未知平台：${JSON.stringify(op.platform)}；可选：${PLATFORM_CHOICES.map((p) => p.id).join(' / ')}`);
  }
  if (!choice.available) return fail(`平台「${choice.label}」${choice.note || '暂不可用'}`);
  next.workers.push({
    id: uniqueId(next.workers),
    platform: choice.id,
    name: uniqueName(next.workers, choice.label),
    enabled: true,
    toggles: { thinking: false, search: false },
  });
  return pass(next);
}

function removeWorker(next, op) {
  const extra = checkKeys(op, ['id']);
  if (extra) return fail(extra);
  const id = requireId(op);
  if (!id) return fail('缺少外包工 id');
  const i = next.workers.findIndex((w) => w.id === id);
  if (i < 0) return fail(`外包工不存在（id=${id}）`);
  next.workers.splice(i, 1);
  return pass(next);
}

function renameWorker(next, op) {
  const extra = checkKeys(op, ['id', 'name']);
  if (extra) return fail(extra);
  const id = requireId(op);
  if (!id) return fail('缺少外包工 id');
  const w = findWorker(next.workers, id);
  if (!w) return fail(`外包工不存在（id=${id}）`);
  const name = typeof op.name === 'string' ? op.name.trim() : '';
  if (!name) return fail('名称不能为空（首尾空白会被去除）');
  if (next.workers.some((x) => x.id !== id && x.name.trim() === name)) {
    return fail(`名称已存在：${name}（列表内名称必须唯一——名字即「主包AI 指定调用」的标识）`);
  }
  w.name = name;
  return pass(next);
}

function moveWorker(next, op) {
  const extra = checkKeys(op, ['id', 'dir']);
  if (extra) return fail(extra);
  const id = requireId(op);
  if (!id) return fail('缺少外包工 id');
  const dir = op.dir;
  if (dir !== 'up' && dir !== 'down') return fail(`dir 非法（应为 up / down）：${JSON.stringify(dir)}`);
  const i = next.workers.findIndex((w) => w.id === id);
  if (i < 0) return fail(`外包工不存在（id=${id}）`);
  if (dir === 'up' && i === 0) return fail('已是首位，无法上移');
  if (dir === 'down' && i === next.workers.length - 1) return fail('已是末位，无法下移');
  const j = dir === 'up' ? i - 1 : i + 1;
  const [w] = next.workers.splice(i, 1);
  next.workers.splice(j, 0, w);
  return pass(next);
}

function setEnabled(next, op) {
  const extra = checkKeys(op, ['id', 'enabled']);
  if (extra) return fail(extra);
  const id = requireId(op);
  if (!id) return fail('缺少外包工 id');
  const w = findWorker(next.workers, id);
  if (!w) return fail(`外包工不存在（id=${id}）`);
  if (typeof op.enabled !== 'boolean') return fail(`enabled 非法（应为布尔）：${JSON.stringify(op.enabled)}`);
  w.enabled = op.enabled;
  return pass(next);
}

function setToggles(next, op) {
  const extra = checkKeys(op, ['id', 'toggles']);
  if (extra) return fail(extra);
  const id = requireId(op);
  if (!id) return fail('缺少外包工 id');
  const w = findWorker(next.workers, id);
  if (!w) return fail(`外包工不存在（id=${id}）`);
  const t = op.toggles;
  if (!isPlainObject(t)) return fail(`toggles 非法（应为对象）：${JSON.stringify(t)}`);
  const keys = Object.keys(t);
  if (!keys.length) return fail('toggles 为空（至少给出 thinking / search 之一）');
  for (const k of keys) {
    if (k !== 'thinking' && k !== 'search') return fail(`toggles 不接受的键：${k}（仅 thinking / search）`);
    if (typeof t[k] !== 'boolean') return fail(`toggles.${k} 非法（应为布尔）：${JSON.stringify(t[k])}`);
  }
  w.toggles = { thinking: w.toggles?.thinking === true, search: w.toggles?.search === true, ...t };
  return pass(next);
}

function pickSessionInt(value, label, min, max) {
  const ok = typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  if (ok) return { ok: true, value };
  return { ok: false, error: `${label} 非法（应为 ${min}..${max} 区间内的整数）：${JSON.stringify(value)}` };
}

async function setOutbox(next, op, checkDir) {
  const extra = checkKeys(op, ['dir']);
  if (extra) return fail(extra);
  const dir = typeof op.dir === 'string' ? op.dir.trim() : '';
  if (!dir) return fail('目录不能为空');
  if (typeof checkDir !== 'function') return fail('内部错误：目录可用性检查器未注入');
  let usable;
  try {
    usable = await checkDir(dir);
  } catch (e) {
    return fail(`目录可用性检查异常：${e?.message || e}`);
  }
  if (!usable) return fail(`目录不可用（不存在且不可创建，或不可写）：${dir}`);
  next.outboxDir = dir;
  return pass(next);
}

/** session.set（b6/T7）：部分更新全局会话复用三键；区间与 config-schema.mjs 归一化同口径（非法 / 越界 ⇒ 拒绝、不落配置） */
function setSession(next, op) {
  const extra = checkKeys(op, ['reuse', 'ttlMs', 'maxTasksPerSession']);
  if (extra) return fail(extra);
  const picked = {};
  if (op.reuse !== undefined) {
    if (typeof op.reuse !== 'boolean') return fail(`reuse 非法（应为布尔）：${JSON.stringify(op.reuse)}`);
    picked.reuse = op.reuse;
  }
  if (op.ttlMs !== undefined) {
    const r = pickSessionInt(op.ttlMs, 'ttlMs', 1, Number.MAX_SAFE_INTEGER);
    if (!r.ok) return fail(r.error);
    picked.ttlMs = r.value;
  }
  if (op.maxTasksPerSession !== undefined) {
    const r = pickSessionInt(op.maxTasksPerSession, 'maxTasksPerSession', 1, 1000);
    if (!r.ok) return fail(r.error);
    picked.maxTasksPerSession = r.value;
  }
  if (!Object.keys(picked).length) {
    return fail('session.set 至少给出 reuse / ttlMs / maxTasksPerSession 之一（部分更新）');
  }
  next.session = { ...(isPlainObject(next.session) ? next.session : {}), ...picked };
  return pass(next);
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 应用一个 patch 操作（纯函数；不写盘、不广播——落盘与广播由设置服务负责）。
 * @param {object} config 当前配置（ConfigStore.current）
 * @param {object} op 形如 `{op: 'worker.add', platform: 'deepseek'}`（操作名与字段见冻结接口）
 * @param {{checkDir?: (dir: string) => Promise<boolean>}} [deps] 目录可用性检查器（注入 = 便于单元验证）
 * @returns {Promise<{ok: true, config: object} | {ok: false, error: string}>}
 */
export async function applyPatch(config, op, { checkDir } = {}) {
  if (!isPlainObject(op)) {
    return fail('patch 操作必须是对象（形如 {"op":"worker.add","platform":"deepseek"}）');
  }
  const name = op.op;
  if (typeof name !== 'string' || !PATCH_OPS.includes(name)) {
    return fail(`未知操作：${JSON.stringify(op.op)}；支持：${PATCH_OPS.join(' · ')}`);
  }
  if (!isPlainObject(config) || !Array.isArray(config.workers)) {
    return fail('当前配置形状异常（workers 不是数组）');
  }
  const next = structuredClone(config);
  switch (name) {
    case 'worker.add':
      return addWorker(next, op);
    case 'worker.remove':
      return removeWorker(next, op);
    case 'worker.rename':
      return renameWorker(next, op);
    case 'worker.move':
      return moveWorker(next, op);
    case 'worker.setEnabled':
      return setEnabled(next, op);
    case 'worker.setToggles':
      return setToggles(next, op);
    case 'outbox.set':
      return setOutbox(next, op, checkDir);
    case 'session.set':
      return setSession(next, op);
    default:
      return fail(`未知操作：${name}`);
  }
}
