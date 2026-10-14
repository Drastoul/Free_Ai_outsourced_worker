/**
 * 自定义外包工的 DOM 采集（`docs/design/modules/adapters.md` §6.4 本单回合锚定 · §6.5 诊断）：
 *   · `markCustomBaseline`（`send()` 前打基线）：① 命中回合元素及其两代祖先打属性标；② 页内记「基线文本集」与「本单发送文本」；
 *   · `collectCustomAnswer`：只接受**基线之后**的候选（自身不带基线标 ∧ 可见 ∧ 非空 ∧ 不含输入区 ∧ 文本不在基线集 ∧ 非回声）
 *     ⇒ 取最后一条（最新一条助手回复）；无 ⇒ 空串（上层按 `E_NO_RESPONSE` 处置，不静默交付旧答复）；
 *   · `hasFreshTurn`：发送确认信号——出现不带基线标的可见候选（含用户消息气泡；§6.4 6s 口径的一半）；
 *   · `diagnoseCustomDom`（b8 扩）：单行诊断串 —— 既有字段（候选数 / 新回合数 / 基线过滤数 / 回声过滤数 / 生效选择器）
 *     + **普查三段**（族计数 / 可见文本 / 类名 Top≤10，页内**一次** evaluate，扫描 ≤2000 可见元素）+ **遮挡段**（轴 1b 同源探测）；
 *     文本片段先空白归一（#7）再截断；类名 token 与文本片段命中 `[a-z0-9]{16,}` ⇒ `<hash>`（F）；诊断整串 ≤900 字（适配器侧自限）。
 *     普查**不读** cookie / storage / 表单值 / 输入区文本；采集与串组装拆在 `custom-census.mjs`（本件超 300 行档位，既定拆分点）。
 * 「基线之后」判定 = 候选**自身**带基线标 ⇒ 排除（祖先带标不判——新回合常挂在旧列表容器下，按祖先判会误杀本单回复）。
 * 本模块不抛错（DOM 只是兜底通道）：取不到 ⇒ 空串 / false / 诊断串。
 */
import { probeOverlay } from './custom-overlay.mjs';
import { collectCensus, describeDomStats } from './custom-census.mjs';

export const BASELINE_ATTR = 'data-fo-custom-baseline';
export const STATE_KEY = '__foCustomBaseline';

/** 页面内：打基线（命中元素 + 两代祖先打标；记基线文本集与发送文本） */
const BASELINE_FN = ({ attr, stateKey, replySelector, replyCandidates, sentText }) => {
  const norm = (el) => String(el?.innerText ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  let hits = [];
  if (replySelector) {
    try {
      hits = [...document.querySelectorAll(replySelector)];
    } catch {
      hits = [];
    }
  } else {
    for (const sel of replyCandidates) {
      let found = [];
      try {
        found = [...document.querySelectorAll(sel)];
      } catch {
        found = [];
      }
      if (found.length) {
        hits = found;
        break;
      }
    }
  }
  const texts = new Set();
  for (const el of hits) {
    const t = norm(el);
    if (t) texts.add(t);
    el.setAttribute(attr, '1');
    let p = el.parentElement;
    for (let i = 0; i < 2 && p; i += 1) {
      p.setAttribute(attr, '1');
      p = p.parentElement;
    }
  }
  window[stateKey] = { texts: [...texts], sent: String(sentText ?? '').replace(/\s+/g, ' ').trim() };
  return { marked: hits.length };
};

/** 页面内：采集（候选 → 过滤 → 最后一条的文本 + 统计；同一函数供 collect / confirm / diagnose 复用） */
const COLLECT_FN = ({ attr, stateKey, replySelector, replyCandidates, inputSelector, inputCandidates }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const norm = (el) => String(el?.innerText ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const st = window[stateKey] ?? { texts: [], sent: '' };
  const base = new Set(st.texts ?? []);
  const sent = String(st.sent ?? '');
  const sentHead = sent.slice(0, 40);
  let hits = [];
  let via = replySelector ? replySelector : '自动';
  const chainCounts = [];
  if (replySelector) {
    try {
      hits = [...document.querySelectorAll(replySelector)];
    } catch {
      hits = [];
    }
  } else {
    for (const sel of replyCandidates) {
      let found = [];
      try {
        found = [...document.querySelectorAll(sel)];
      } catch {
        found = [];
      }
      chainCounts.push([sel, found.length]);
      if (!hits.length && found.length) hits = found;
    }
  }
  let inputEl = null;
  try {
    inputEl = (inputSelector ? [...document.querySelectorAll(inputSelector)] : [...document.querySelectorAll(inputCandidates.join(', '))]).filter(vis).pop() ?? null;
  } catch {
    inputEl = null;
  }
  const stats = { candidates: hits.length, fresh: 0, baselineFiltered: 0, echoFiltered: 0, via, chainCounts, source: 'none' };
  const fresh = [];
  for (const el of hits) {
    if (el.hasAttribute(attr)) {
      stats.baselineFiltered += 1;
      continue;
    }
    if (!vis(el)) continue;
    const t = norm(el);
    if (!t) continue;
    if (inputEl && (el === inputEl || el.contains(inputEl))) continue;
    stats.fresh += 1;
    if (base.has(t)) {
      stats.baselineFiltered += 1;
      continue;
    }
    if (sent && (t === sent || (sentHead && t.startsWith(sentHead)))) {
      stats.echoFiltered += 1;
      continue;
    }
    fresh.push(el);
  }
  // 取「最后一条」及其归属容器（容器 = fresh 内最近包含者）：容器拼接防「只取最后一块 ⇒ 漏内容」（探针 2 教训，adapters.md §3.4）；
  // 代价 = 容器内被基线 / 回声过滤的兄弟内容可能随文本带回（b7 §2 风险② 备案类）——诊断以「拼接=容器」标记该取值路径
  const last = fresh[fresh.length - 1] ?? null;
  const container = last ? (fresh.filter((q) => q !== last && q.contains(last)).pop() ?? last) : null;
  stats.source = !container ? 'none' : container === last ? 'last' : 'container';
  const text = container ? String(container.innerText ?? container.textContent ?? '').trim() : '';
  return { text, stats };
};

/**
 * 发送前打基线（§6.4）——命中回合元素及其两代祖先打属性标 + 页内记基线文本集与发送文本。
 * 打标失败不静默（b6 口径）：记一行日志（`助手回合基线打标失败…`，与内置平台同词形）并继续发送，不升级为任务失败。
 */
export async function markCustomBaseline(page, cfg, { sentText = '', log } = {}) {
  const payload = {
    attr: BASELINE_ATTR,
    stateKey: STATE_KEY,
    replySelector: cfg.driver.replySelector,
    replyCandidates: cfg.replyCandidates,
    sentText,
  };
  return await page
    .evaluate(BASELINE_FN, payload)
    .then((r) => r.marked)
    .catch((e) => {
      log?.(`助手回合基线打标失败：${String(e?.message ?? e).slice(0, 140)}`);
      return 0;
    });
}

/** 采集本单回复（基线之后最后一条候选的文本；无 ⇒ 空串） */
export async function collectCustomAnswer(page, cfg) {
  return await page.evaluate(COLLECT_FN, collectPayload(cfg)).then((r) => r.text).catch(() => '');
}

/** 发送确认信号（§6.4）：出现不带基线标的可见候选（含用户消息气泡） */
export async function hasFreshTurn(page, cfg) {
  return await page
    .evaluate(COLLECT_FN, collectPayload(cfg))
    .then((r) => r.stats.fresh > 0)
    .catch(() => false);
}

/** 诊断单行串（§6.5：既有字段 + 普查三段 + 遮挡段；单行 ≤900 字；失败 ⇒ 单行说明，不抛） */
export async function diagnoseCustomDom(page, cfg) {
  const raw = await page.evaluate(COLLECT_FN, collectPayload(cfg)).catch(() => null);
  if (!raw?.stats) return '采集诊断不可用（页面上下文异常）';
  const census = await collectCensus(page, cfg);
  const overlay = await probeOverlay(page, cfg); // 遮挡段与轴 1b 同源（单一来源）
  return describeDomStats(raw.stats, census, overlay);
}

function collectPayload(cfg) {
  return {
    attr: BASELINE_ATTR,
    stateKey: STATE_KEY,
    replySelector: cfg.driver.replySelector,
    replyCandidates: cfg.replyCandidates,
    inputSelector: cfg.driver.inputSelector,
    inputCandidates: cfg.inputCandidates,
  };
}

