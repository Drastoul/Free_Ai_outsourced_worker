/**
 * 自定义外包工的「输入区访问 + 写入轴机械」（`docs/design/modules/adapters.md` §6.4；b8）——
 * `custom-page.mjs` 越 300 行档位后按其既定拆分点拆出：**本件 = 写入轴全部机械**，`custom-page.mjs` 只留登录态与装配。
 *   · 输入区扫描 / 定位：三个候选取**文档序最靠后的可见者**；`inputSelector` 非空 ⇒ 只用它——**不打属性标**
 *     （Slate 类站点在聚焦期间重渲染元素，标记定位必败，b8 删除）；
 *   · 写入轴：定位 → **遮挡处置**（定位完成后、聚焦前、清空前）→ 聚焦（页内 `focus()` + 插入点，坐标点击兜底；
 *     取几何前先判矩形——宽高全 0（句柄已脱离）⇒ 不点击、重新定位并消耗一次尝试）→ 清空 → **逐行 `insertText`（行间 `Shift+Enter`；
 *     换行绝不作按键事件下发 = #37 根因处置）** → 读回（空白归一含期望前 64 字）⇒ 读回不过则**重新定位整体重试 ≤3 次**；
 *     耗尽 ⇒ `E_SEND_FAILED`（输入区未找到沿用 `E_SELECTOR_MISSING`，定位类不改）。
 * 空白归一（#7）与遮挡处置的单一来源 = `custom-overlay.mjs`；DOM 采集 / 诊断 = `custom-dom.mjs`。
 */
import { EngineError } from './base.mjs';
import { diagnoseCustomDom } from './custom-dom.mjs';
import { OVERLAY_BUDGET_MS, dismissOverlay, foldText } from './custom-overlay.mjs';

const WRITE_ATTEMPTS = 3; // 写入轴尝试上限（§6.4 第 5 步：读回不过 / 元素重建 ⇒ 重新定位整体重试）
const READBACK_HEAD = 64; // 读回校验期望前缀（§6.4 第 6 步：空白归一后含期望文本前 64 字）

/** 单行短串（日志 / message 里的用户自填值与异常摘要） */
export const oneLine = (v, max = 140) =>
  String(v ?? '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim()
    .slice(0, max);

/** 页面内：输入区扫描（三个候选取文档序最靠后的可见者；`inputSelector` 非空 ⇒ 只用它；b8 起不打标） */
export const INPUT_SCAN = ({ selector, candidates }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  try {
    const hits = selector ? [...document.querySelectorAll(selector)] : [...document.querySelectorAll(candidates.join(', '))];
    return { found: !!hits.filter(vis).pop(), badSelector: false };
  } catch {
    return { found: false, badSelector: true };
  }
};

/**
 * 页面内：聚焦（§6.4 第 2 步）——定位 ⇒ 取几何（**先判矩形**：宽高全 0 = 句柄已脱离 ⇒ `stale`，不产生点击）
 * ⇒ `focus()` + 置插入点（`textarea` / `input` ⇒ 选区到末尾；`contenteditable` ⇒ Range 收拢到内容末尾）
 * ⇒ 复核 `document.activeElement` 属该输入区元素族（本身 / 祖先 / 后代）。节点在聚焦期间被重建 ⇒ 以重建后的节点复核。
 */
const FOCUS_FN = ({ selector, candidates }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const pick = () => {
    try {
      const hits = selector ? [...document.querySelectorAll(selector)] : [...document.querySelectorAll(candidates.join(', '))];
      return hits.filter(vis).pop() ?? null;
    } catch {
      return null;
    }
  };
  const el = pick();
  if (!el) return { found: false, stale: false, focused: false, x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  // 防御性分支：正常不可达——`pick()` 已按可见性（宽高 > 0）过滤，被选中者矩形必非全 0；保留为防御
  if (rect.width === 0 && rect.height === 0) return { found: true, stale: true, focused: false, x: 0, y: 0 };
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  try {
    el.focus();
  } catch {
    /* 忽略 */
  }
  const cur = pick() ?? el; // 聚焦后重取：节点可能已被重建（Slate 类站点）
  try {
    if ('value' in cur && typeof cur.setSelectionRange === 'function') {
      const end = String(cur.value ?? '').length;
      cur.setSelectionRange(end, end);
    } else if (cur.isContentEditable) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(cur);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch {
    /* 忽略 */
  }
  const active = document.activeElement;
  // 「聚焦达」= activeElement 本身可编辑 ∧ 属该输入区元素族（节点被重建后 activeElement 回落 body ⇒ 不达）
  const editable = !!active && ('value' in active || active.isContentEditable === true);
  const focused = editable && (active === cur || cur.contains(active) || active.contains(cur));
  return { found: true, stale: false, focused, x, y };
};

/** 页面内：输入区当前文本与「已清空」判定（输入区消失也视作已清空） */
const INPUT_VALUE_SCAN = ({ selector, candidates }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  let hits = [];
  try {
    hits = [...document.querySelectorAll(selector || candidates.join(', '))].filter(vis);
  } catch {
    hits = [];
  }
  const el = hits[hits.length - 1] ?? null;
  if (!el) return { present: false, empty: true, text: '' };
  const text = 'value' in el ? String(el.value ?? '') : String(el.innerText ?? el.textContent ?? '');
  return { present: true, empty: !text.trim(), text };
};

/** 输入区命中快照（登录态判定与写入定位共用；页面上下文异常 ⇒ null） */
export async function inputSnapshot(page, cfg) {
  return await page.evaluate(INPUT_SCAN, { selector: cfg.driver.inputSelector, candidates: cfg.inputCandidates }).catch(() => null);
}

/** 输入区未找到的定位信息（§6.5：阶段 + 项名 + 实际值 / 候选链；`reason` = 'bad-selector' ⇒ 明示选择器不合法） */
export function inputMissingMessage(cfg, stage, reason = 'not-found') {
  const specified = cfg.driver.inputSelector;
  const shown = oneLine(specified, 120) || '自动';
  const detail =
    reason === 'bad-selector'
      ? `inputSelector=${shown} 选择器不合法（querySelectorAll 抛错）`
      : specified
        ? `inputSelector=${shown} 未命中可见元素`
        : `候选 ${cfg.inputCandidates.join('/')} 均未命中可见元素`;
  return `${stage}：输入区未找到（inputSelector=${shown}；${detail}）；若站点需要登录请先在窗口登录`;
}

/** 定位输入区（§6.4 第 1 步；只回命中与否与原因——写入全程走页内 / 坐标，不持元素句柄） */
export async function locateInput(page, cfg) {
  const snap = await inputSnapshot(page, cfg);
  if (!snap?.found) return { found: false, reason: snap?.badSelector ? 'bad-selector' : 'not-found' };
  return { found: true, reason: 'ok' };
}

/** 输入区当前文本（读回校验与发送确认共用；页面上下文异常 ⇒ 按「已清空」的保守值） */
export function readInputState(page, cfg) {
  return page
    .evaluate(INPUT_VALUE_SCAN, { selector: cfg.driver.inputSelector, candidates: cfg.inputCandidates })
    .catch(() => ({ present: false, empty: true, text: '' }));
}

/** 写入计划（§6.4 第 4 步；批内单元冻结）：按 `\n` 拆行（**空行保留** ⇒ 行数一致）+ 读回期望前缀（空白归一后 ≤64 字） */
export function planWrite(text) {
  return { lines: String(text ?? '').split('\n'), head: foldText(text, READBACK_HEAD) };
}

/** 落地判定（§6.4 第 6 步；批内单元冻结）：实际文本空白归一后含期望前缀（多行 / 空白差异不误判；两种输入元素同判） */
export function readbackOk(actual, head) {
  return !!head && foldText(actual, Number.MAX_SAFE_INTEGER).includes(head);
}

/** 聚焦（§6.4 第 2 步）：页内 `focus()` + 插入点 ⇒ 复核 activeElement；未达 ⇒ 坐标点击兜底（不走可操作性检查）⇒ 再复核 */
export async function focusInput(page, cfg) {
  const payload = { selector: cfg.driver.inputSelector, candidates: cfg.inputCandidates };
  let snap = await page.evaluate(FOCUS_FN, payload).catch(() => null);
  if (!snap?.found) return { found: false, stale: false, focused: false, via: null };
  if (snap.stale) return { found: true, stale: true, focused: false, via: null }; // #6：取几何即全 0 ⇒ 不点击、重定位
  if (snap.focused) return { found: true, stale: false, focused: true, via: 'focus' };
  await page.mouse.click(snap.x, snap.y).catch(() => {}); // 坐标点击兜底（元素句柄可能在点击中被替换）
  snap = await page.evaluate(FOCUS_FN, payload).catch(() => null);
  if (!snap?.found || snap.stale) return { found: !!snap?.found, stale: true, focused: false, via: null };
  return { found: true, stale: false, focused: !!snap.focused, via: 'click' };
}

/** 清空（§6.4 第 3 步）：`Control+A` + `Backspace`（保持聚焦态） */
async function clearInput(page) {
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
}

/** 逐行写入（§6.4 第 4 步）：逐行 `insertText`、行间 `Shift+Enter`；换行绝不作按键事件下发（#37 根因处置） */
async function typeLines(page, lines) {
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) await page.keyboard.press('Shift+Enter');
    if (lines[i]) await page.keyboard.insertText(lines[i]);
  }
}

/** 写入失败 message（§6.5：阶段 + 环节 + 尝试数 + 输入区 / 候选链 + 普查诊断；非 EngineError 异常附单行摘要 ≤200 字） */
async function writeFailure(page, cfg, stage, lastError) {
  const input = oneLine(cfg.driver.inputSelector, 120) || '自动';
  const reason = lastError ? ` 原因=${oneLine(lastError?.message ?? lastError, 200)}` : '';
  const census = await diagnoseCustomDom(page, cfg);
  return new EngineError(
    'E_SEND_FAILED',
    `sending：写入失败（环节=${stage} 尝试=${WRITE_ATTEMPTS}/${WRITE_ATTEMPTS}；输入区=${input}）${reason}+ 采集诊断：${census}`,
  );
}

/**
 * 写入（§6.4 b8 重写）：定位 → 遮挡处置 → 聚焦 → 清空 → 逐行写入 → 读回；≤3 次尝试（读回不过 / 元素重建 ⇒ 重新定位整体重试）。
 * 错误映射（§6.5）：输入区未找到 ⇒ `E_SELECTOR_MISSING`（定位类，不改）；聚焦 / 清空 / 落字 / 读回 / 重试耗尽及任何非
 * `EngineError` 异常 ⇒ `E_SEND_FAILED`（**不得回落 `E_INTERNAL` / `E_UNKNOWN`**）。
 */
export async function writeIntoInput(page, cfg, text, { log, overlayDeadline } = {}) {
  const { lines, head } = planWrite(text);
  let stage = '定位';
  let lastError = null;
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    stage = '定位';
    lastError = null;
    try {
      const located = await locateInput(page, cfg);
      if (!located.found) throw new EngineError('E_SELECTOR_MISSING', inputMissingMessage(cfg, 'sending', located.reason));
      // 遮挡处置（轴 1b）：定位完成后、聚焦前、清空前（仅在探测到遮挡时动作；预算全调用共享；不抛、不阻断）
      await dismissOverlay(page, cfg, { log, deadline: overlayDeadline });
      stage = '聚焦';
      const focus = await focusInput(page, cfg);
      if (focus.stale || !focus.focused) continue; // 句柄脱离 / 聚焦未达 ⇒ 消耗一次尝试、重新定位重跑
      stage = '清空';
      await clearInput(page);
      stage = '写入';
      await typeLines(page, lines);
      stage = '读回';
      const read = await readInputState(page, cfg);
      if (readbackOk(read.text, head)) {
        log?.(`自定义写入：尝试=${attempt}/${WRITE_ATTEMPTS} 聚焦=${focus.via} 行数=${lines.length} 读回=通过`);
        return { attempt, focus: focus.via };
      }
    } catch (e) {
      if (e instanceof EngineError && e.code === 'E_SELECTOR_MISSING') throw e; // 定位类沿用 b7 口径（不改）
      lastError = e;
    }
  }
  log?.(`自定义写入失败：尝试=${WRITE_ATTEMPTS}/${WRITE_ATTEMPTS} 环节=${stage} 输入区=${oneLine(cfg.driver.inputSelector, 120) || '自动'}`);
  throw await writeFailure(page, cfg, stage, lastError);
}

/** 遮挡处置预算（调用级共享；`sendCustom` 建一次，各次写入尝试共用） */
export function overlayBudget() {
  return Date.now() + OVERLAY_BUDGET_MS;
}
