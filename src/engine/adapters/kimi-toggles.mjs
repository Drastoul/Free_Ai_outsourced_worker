/**
 * Kimi「联网搜索」开关的面板应用机械（b6；接口与口径 = `docs/design/modules/adapters.md` §5.1 台账行 / §5.3）。
 * 链路（锚点证据 = `probe/probe17-kimi-toggles.mjs:155-164` 开面板 / `:243-269` 行点击 / `probe/out17/result.json:53-79` 子面板两行 + aria-checked；
 * 复核时序（b6 实施期真机读数）：点击选项后面板 ≈200–900ms 自行收起，收起前面板 aria 停留旧值：
 *   工具面板触发器（`.toolkit-trigger-btn`）开面板 → 行「联网搜索」→ 子面板两行「自动搜索 / 关闭搜索」（`aria-checked` 为权威）
 *   → 未对齐则点目标行 → **等应用收起面板后重开复核** → Escape 关面板。
 * 失败（元素缺失 / 状态不可读 / 状态未对齐）⇒ `E_SELECTOR_MISSING`（调用方中止，不发送）；幂等：已对齐 ⇒ 只复核。
 */
import { EngineError } from './base.mjs';

const TRIGGER_SELECTOR = '.toolkit-trigger-btn';
const TRIGGER_FALLBACK = '[class*="toolkit-trigger"]';
const PANEL_SELECTOR = '[class*="toolkit-panel" i]';
const ITEM_SELECTOR = '[class*="toolkit-item"]';
const ENTRY_TEXT = '联网搜索';
const OPTION_LABELS = { true: '自动搜索', false: '关闭搜索' };
const MARK = 'data-fo-kt';
const WAIT_MS = 8000;
const POLL_MS = 400;
const CLOSE_WAIT_MS = 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const missing = (msg) => new EngineError('E_SELECTOR_MISSING', msg);

/** 可见面板是否已在（`[class*="toolkit-panel"]` 任一可见） */
async function panelVisible(page) {
  return await page
    .evaluate((sel) => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return [...document.querySelectorAll(sel)].some(vis);
    }, PANEL_SELECTOR)
    .catch(() => false);
}

/** 确保工具面板打开（未开 ⇒ 点触发器；触发器缺失 / 面板不出现 ⇒ E_SELECTOR_MISSING） */
async function ensurePanelOpen(page) {
  if (await panelVisible(page)) return;
  const marked = await page
    .evaluate(
      ({ first, fallback, mark }) => {
        document.querySelectorAll(`[${mark}]`).forEach((el) => el.removeAttribute(mark)); // 清旧标记（跨任务复用页面时不命中陈旧元素）
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const el = [...document.querySelectorAll(first)].find(vis) ?? [...document.querySelectorAll(fallback)].find(vis) ?? null;
        if (!el) return false;
        el.setAttribute(mark, '1');
        return true;
      },
      { first: TRIGGER_SELECTOR, fallback: TRIGGER_FALLBACK, mark: `${MARK}-trigger` },
    )
    .catch(() => false);
  if (!marked) throw missing(`工具面板触发器缺失（${TRIGGER_SELECTOR}）`);
  await page.locator(`[${MARK}-trigger="1"]`).first().click({ timeout: 5000 }).catch(() => {});
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (await panelVisible(page)) return;
    await sleep(POLL_MS);
  }
  throw missing('工具面板未出现（toolkit-panel）');
}

/** 关面板（两次 Escape：子面板 / 主面板各一次；面板未开时无害） */
async function closePanel(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(150);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(150);
}

/** 在可见面板里按文案找行并打标（命中 ⇒ true；取最小高度行避开子行包装——probe17 口径） */
async function markPanelRow(page, text, mark) {
  return await page
    .evaluate(
      ({ panelSel, itemSel, text, mark }) => {
        document.querySelectorAll(`[${mark}]`).forEach((el) => el.removeAttribute(mark)); // 清旧标记（跨任务复用页面时不命中陈旧元素）
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const rows = [...document.querySelectorAll(panelSel)]
          .filter(vis)
          .flatMap((p) => [...p.querySelectorAll(itemSel)])
          .filter((row) => vis(row) && (row.innerText || '').includes(text));
        if (!rows.length) return false;
        rows.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0].setAttribute(mark, '1');
        return true;
      },
      { panelSel: PANEL_SELECTOR, itemSel: ITEM_SELECTOR, text, mark },
    )
    .catch(() => false);
}

/** 子面板两行 `aria-checked` 读态：自动搜索=true ⇒ true；关闭搜索=true ⇒ false；读不到 ⇒ null */
async function readSubState(page) {
  return await page
    .evaluate(
      ({ panelSel, itemSel, on, off }) => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const rows = [...document.querySelectorAll(panelSel)].filter(vis).flatMap((p) => [...p.querySelectorAll(itemSel)]).filter(vis);
        const onRow = rows.find((row) => (row.innerText || '').includes(on)) ?? null;
        const offRow = rows.find((row) => (row.innerText || '').includes(off)) ?? null;
        if (!onRow || !offRow) return null;
        if (onRow.getAttribute('aria-checked') === 'true') return true;
        if (offRow.getAttribute('aria-checked') === 'true') return false;
        return null;
      },
      { panelSel: PANEL_SELECTOR, itemSel: ITEM_SELECTOR, on: OPTION_LABELS.true, off: OPTION_LABELS.false },
    )
    .catch(() => null);
}

/** 读子面板状态（有界等待渲染）；超时仍读不到 ⇒ null */
async function readSubStateUntil(page, timeoutMs = WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await readSubState(page);
    if (state !== null) return state;
    if (Date.now() > deadline) return null;
    await sleep(POLL_MS);
  }
}

/** 读当前态：先收起面板再全新打开（面板打开期间、点击后的读数会停留旧值——实测 ≈200–900ms 后应用自行收起面板） */
async function readSearchState(page) {
  await closePanel(page);
  await ensurePanelOpen(page);
  let state = await readSubState(page);
  if (state === null) {
    const opened = await markPanelRow(page, ENTRY_TEXT, `${MARK}-row`);
    if (!opened) throw missing(`工具面板行缺失（「${ENTRY_TEXT}」）`);
    await page.locator(`[${MARK}-row="1"]`).first().click({ timeout: 5000 }).catch(() => {});
    state = await readSubStateUntil(page);
    if (state === null) throw missing(`联网搜索子面板不可读（「${OPTION_LABELS.true} / ${OPTION_LABELS.false}」）`);
  }
  return state;
}

/** 有界等待面板自行关闭（点选项后应用会收起面板；实测 ≈200–900ms。超时 ⇒ false，由 Escape 兜底） */
async function waitPanelClosed(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await panelVisible(page))) return true;
    await sleep(POLL_MS);
  }
  return false;
}

/**
 * 把「联网搜索」对齐到目标值（幂等：已对齐 ⇒ 只复核）。
 * @param {object} page 页面
 * @param {boolean} wanted true = 自动搜索 / false = 关闭搜索
 * @param {Function} [log] 日志回调（实际点击时记一行，形态同 DeepSeek 侧「开关点击 …」）
 * @returns {Promise<boolean>} 复核后的实际值（与目标一致；不一致 ⇒ E_SELECTOR_MISSING）
 */
export async function applySearchToggle(page, wanted, log = () => {}) {
  const want = wanted === true;
  try {
    const before = await readSearchState(page);
    if (before === want) return before;
    const clicked = await markPanelRow(page, OPTION_LABELS[want], `${MARK}-pick`);
    if (!clicked) throw missing(`子面板行缺失（「${OPTION_LABELS[want]}」）`);
    await page.locator(`[${MARK}-pick="1"]`).first().click({ timeout: 5000 }).catch(() => {});
    // 点击后面板由应用自行收起（实测 ≈200–900ms）；收起前不得重读面板（其 aria 短暂停留旧值）
    if (!(await waitPanelClosed(page, CLOSE_WAIT_MS))) await closePanel(page); // 应用未自行收起 ⇒ Escape 兜底
    if (!(await waitPanelClosed(page, CLOSE_WAIT_MS))) throw missing('工具面板未收起，无法可靠复核「联网搜索」状态');
    const after = await readSearchState(page);
    log(`开关点击「${ENTRY_TEXT}」→${want} 策略=面板 复核后=${after}`);
    if (after !== want) throw missing(`开关「${ENTRY_TEXT}」未对齐（面板复核）：目标=${want} 实际=${after}`);
    return after;
  } finally {
    await closePanel(page);
  }
}
