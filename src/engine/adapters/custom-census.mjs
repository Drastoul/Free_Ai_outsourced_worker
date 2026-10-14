/**
 * 自定义外包工的失败普查（`docs/design/modules/adapters.md` §6.5 D7/D11；b8）——「页面上实际有什么」：
 *   · `collectCensus`：页内**一次** `evaluate` 采集（族计数 / 可见文本 / 类名 Top；扫描 ≤2000 可见元素；排除输入区子树，
 *     **不读** cookie / storage / 表单值 / 输入区文本）；原始值回传，归一 / 脱敏 / 截断在 `custom-overlay.mjs` 的单一来源里做；
 *   · `describeDomStats`：把既有采集字段与普查三段 + 遮挡段组装成**单行**诊断串（≤900 字；逐级让位但保底遮挡段）。
 * 由 `custom-dom.mjs` 的 `diagnoseCustomDom` 调用（失败回执的拼接点不变，零接口变更）；本模块不抛错。
 */
import { overlaySegment, redactText, foldText } from './custom-overlay.mjs';

/**
 * 普查探测族（§6.5，固定 **11 项** = 8 类名族 + `[role=listitem|log]` + `[data-message-author-role]` + `[data-testid]`；仅列 n≥1）。
 * 批内单元冻结本表（防后续漂移）；导出仅供诊断与测试，不进适配器接口面。
 */
export const CENSUS_PROBES = Object.freeze([
  { label: 'message', selector: '[class*="message" i]' },
  { label: 'bubble', selector: '[class*="bubble" i]' },
  { label: 'markdown', selector: '[class*="markdown" i]' },
  { label: 'answer', selector: '[class*="answer" i]' },
  { label: 'assistant', selector: '[class*="assistant" i]' },
  { label: 'chat', selector: '[class*="chat" i]' },
  { label: 'reply', selector: '[class*="reply" i]' },
  { label: 'response', selector: '[class*="response" i]' },
  { label: '[role=listitem|log]', selector: '[role="listitem"], [role="log"]' },
  { label: '[data-message-author-role]', selector: '[data-message-author-role]' },
  { label: '[data-testid]', selector: '[data-testid]' },
]);
/** 普查上限（§6.5，D11；元素上限为初值、待真机回调 I⑤）+ 诊断整串上限（适配器侧自限） */
export const CENSUS_MAX_ELEMENTS = 2000;
export const CENSUS_MAX_TEXTS = 5;
export const CENSUS_TEXT_MAX = 60;
export const CENSUS_MAX_CLASSES = 10;
export const CENSUS_CLASS_MAX = 40;
export const DIAG_MAX = 900;
/** 页内文本原始窗口（归一 / 脱敏 / 截断前的取值窗口；归一不膨胀长度 ⇒ 足够覆盖 ≤60 字片段） */
const CENSUS_RAW_MAX = 400;

/**
 * 页面内：普查采集（单次 evaluate）——族计数（限可见集内 matches）+ 可见叶子文本块（末 5 条）+ 类名 token 频次（Top 10）。
 * 可见元素上限 = `maxElements`（封顶后不再扫描）。
 */
const CENSUS_FN = ({ inputSelector, inputCandidates, probes, maxElements, maxTexts, maxClasses, rawMax }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  let inputEl = null;
  try {
    inputEl = (inputSelector ? [...document.querySelectorAll(inputSelector)] : [...document.querySelectorAll(inputCandidates.join(', '))]).filter(vis).pop() ?? null;
  } catch {
    inputEl = null;
  }
  const inInput = (el) => !!inputEl && (el === inputEl || inputEl.contains(el) || el.contains(inputEl));
  const visible = [];
  const nodes = document.querySelectorAll('*');
  for (let i = 0; i < nodes.length && visible.length < maxElements; i += 1) {
    const el = nodes[i];
    if (!vis(el)) continue;
    if (inInput(el)) continue; // 排除输入区子树（不读输入区文本）
    visible.push(el);
  }
  const families = [];
  for (const probe of probes) {
    let n = 0;
    for (const el of visible) {
      try {
        if (el.matches(probe.selector)) n += 1;
      } catch {
        /* 忽略非法选择器 */
      }
    }
    if (n > 0) families.push([probe.label, n]);
  }
  const leaves = [];
  for (const el of visible) {
    const own = el.textContent;
    if (!own || !own.trim()) continue;
    let childText = false;
    for (const child of el.children) {
      const t = child.textContent;
      if (t && t.trim()) {
        childText = true;
        break;
      }
    }
    if (childText) continue; // 非叶子文本块（子元素含文本）
    leaves.push(own.trim().slice(0, rawMax));
  }
  const count = new Map();
  for (const el of visible) {
    for (const token of el.classList) count.set(token, (count.get(token) ?? 0) + 1);
  }
  const classes = [...count.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, maxClasses)
    .map(([token, n]) => [token, n]);
  return { families, texts: leaves.slice(-maxTexts), classes, scanned: visible.length };
};

/** 采集普查（单次 evaluate；页面上下文异常 ⇒ null，不抛） */
export async function collectCensus(page, cfg) {
  return await page
    .evaluate(CENSUS_FN, {
      inputSelector: cfg.driver.inputSelector,
      inputCandidates: cfg.inputCandidates,
      probes: CENSUS_PROBES,
      maxElements: CENSUS_MAX_ELEMENTS,
      maxTexts: CENSUS_MAX_TEXTS,
      maxClasses: CENSUS_MAX_CLASSES,
      rawMax: CENSUS_RAW_MAX,
    })
    .catch(() => null);
}

/**
 * 诊断串组装（§6.5）：既有字段 + `族计数 …；可见文本 …；类名 Top …；遮挡=…`。
 * 各段上限已定（族 11 / 文本 5×60 / 类名 10×40 / 遮挡 ≤100）；整串 ≤900 字 ⇒ 逐级让位（先减类名，再减文本——
 * 文本让位丢**最早**、保**最新**（末 5 条 = 回复区），兜底保底遮挡段——它决定「遮挡」还是「链不对」的判读，
 * 不可被前段挤掉）；末尾再消换行（单行可机器判定）。
 */
export function describeDomStats(stats, census, overlay) {
  const nonzero = stats.chainCounts.filter(([, n]) => n > 0);
  const chain = stats.chainCounts.length
    ? `；候选链 ${stats.chainCounts.length} 项${nonzero.length ? `命中 ${nonzero.map(([sel, n]) => `${sel}×${n}`).join('、')}` : '均 0 命中'}`
    : '';
  const via = stats.via === '自动' ? `replySelector=自动${chain}` : `replySelector=${foldText(stats.via, 120)}`;
  const source = stats.source === 'container' ? '容器' : stats.source === 'last' ? '末条' : '无';
  const head = `候选=${stats.candidates}（${via}）；新回合=${stats.fresh}；基线过滤=${stats.baselineFiltered}；回声过滤=${stats.echoFiltered}；拼接=${source}`;
  const fam = `族计数 ${census?.families?.length ? census.families.map(([k, n]) => `${k}=${n}`).join('、') : '无'}`;
  const texts = (census?.texts ?? []).map((t) => `「${redactText(t, CENSUS_TEXT_MAX)}」`);
  const classes = (census?.classes ?? []).map(([t, n]) => `${redactText(t, CENSUS_CLASS_MAX)}×${n}`);
  const ov = `遮挡=${overlaySegment(overlay)}`;
  const assemble = (nt, nc) =>
    [
      head,
      fam,
      `可见文本 ${texts.length ? texts.slice(texts.length - nt).join('、') : '无'}`, // 让位保尾部（最新块 = 回复区）
      `类名 Top ${classes.length ? classes.slice(0, nc).join('、') : '无'}`,
      ov,
    ].join('；');
  for (let nt = texts.length; nt >= 0; nt -= 1) {
    for (let nc = classes.length; nc >= 0; nc -= 1) {
      const line = assemble(nt, nc);
      if (line.length <= DIAG_MAX) return line.replace(/[\r\n\u2028\u2029]+/g, ' ');
    }
  }
  return assemble(0, 0).slice(0, DIAG_MAX).replace(/[\r\n\u2028\u2029]+/g, ' ');
}
