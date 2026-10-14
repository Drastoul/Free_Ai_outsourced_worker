/**
 * 自定义外包工的遮挡处置（`docs/design/modules/adapters.md` §6.4 第 0 步 · §6.5 遮挡段；b8 轴 1b / #38）：
 *   · `probeOverlay`：输入区中心点 hit-test（命中 ≠ 输入区 ∧ 非其祖先 / 后代 ⇒ 判遮挡；输入区不在视口内先 `scrollIntoView`）；
 *   · `dismissOverlay`：按序有界的消除阶梯 —— ① `Escape` ② 关闭钮候选链 ③ 点蒙层外；每轮一步、动作后等一帧或 ≤200ms 再复探；
 *     ≤3 轮 / ≤4000ms（调用级共享预算）；幂等（无遮挡 ⇒ 探测一次即返回、零动作）；**不抛、不阻断**（处置后仍被挡照常继续写入，
 *     仅在最终失败时把遮挡信息并入普查与失败 message）；
 *   · `foldText` / `redactText` = 空白归一（#7：`\s+` → 单空格、去换行含全角空白）与脱敏（F：命中 `[a-z0-9]{16,}` ⇒ `<hash>`）的
 *     **单一来源**（读回校验 / 遮挡描述 / 普查文本片段三处共用）。
 */
import { sleep } from '../util.mjs';

/** 处置预算（§6.4：≤4000ms；**调用级共享**——`sendCustom` 建 deadline，各次写入尝试共用） */
export const OVERLAY_BUDGET_MS = 4000;
/** 复探前短等待上限（§6.4 #5：等一帧或 ≤200ms、取先到者；初值，待真机回调 I⑤） */
export const OVERLAY_WAIT_MS = 200;
/** 阶梯步数上限（§6.4：≤3 轮——三条动作各至多一次） */
export const OVERLAY_ROUNDS = 3;
/** 点蒙层外的候选点内缩（px） */
const EDGE_INSET = 8;

/** 关闭钮候选链（顺序 = 语义锚点 → 类名族；批内单元冻结其顺序）；文案兜底 = `CLOSE_WORDS` */
export const CLOSE_SELECTORS = Object.freeze(['[aria-label*="关闭" i]', '[title*="关闭" i]', '[class*="close" i]']);
/** 关闭钮文案兜底（归一化**全等**，防误点主按钮「开始体验 / 下一步」；初值，待真机回调 I⑤） */
export const CLOSE_WORDS = Object.freeze(['关闭', '知道了', '我知道了', '跳过', '好的', 'OK', 'Close']);
/** 关闭钮回退作用域（先遮挡子树内，再退 dialog / modal 容器内） */
export const CONTAINER_SELECTORS = Object.freeze(['[role="dialog"]', '[class*="dialog" i]', '[class*="modal" i]']);

/** 空白归一（#7）：`\s+`（含全角空白 `\u3000`）→ 单空格、去首尾；截断在归一之后 */
export function foldText(value, max = 60) {
  return String(value ?? '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim()
    .slice(0, max);
}

/** 脱敏（F）：文本片段 / 类名 token 命中 `[a-z0-9]{16,}` ⇒ `<hash>`（长随机 id / 构建后缀不回流执；归一在前、截断在后） */
export function redactText(value, max = 60) {
  return foldText(value, Number.MAX_SAFE_INTEGER)
    .replace(/[a-z0-9]{16,}/g, '<hash>')
    .slice(0, max);
}

/** 页面内：输入区中心点 hit-test + 关闭钮候选链 + 点蒙层外候选点（返回原始值；归一 / 脱敏 / 截断在 Node 侧） */
const OVERLAY_PROBE_FN = ({ inputSelector, inputCandidates, closeSelectors, closeWords, containers, inset }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const related = (a, b) => !!a && !!b && (a === b || a.contains(b) || b.contains(a));
  const pickInput = () => {
    try {
      const hits = inputSelector ? [...document.querySelectorAll(inputSelector)] : [...document.querySelectorAll(inputCandidates.join(', '))];
      return hits.filter(vis).pop() ?? null;
    } catch {
      return null;
    }
  };
  const input = pickInput();
  if (!input) return { inputFound: false, blocked: false };
  let rect = input.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
    try {
      input.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch {
      /* 忽略 */
    }
    rect = input.getBoundingClientRect();
  }
  const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
  const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
  const hit = document.elementFromPoint(x, y);
  if (!hit || related(hit, input)) return { inputFound: true, blocked: false };
  const inInput = (el) => related(el, input);
  const centerOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const cls = hit.classList && hit.classList.length ? String(hit.classList[0]) : '';
  const element = `${String(hit.tagName ?? '?').toLowerCase()}${hit.id ? `#${hit.id}` : ''}${cls ? `.${cls}` : ''}`;
  const text = String(hit.innerText ?? hit.textContent ?? '').trim().slice(0, 400);
  // 关闭钮回退作用域：先遮挡子树内、再退 dialog / modal 容器内
  const scopes = [hit];
  for (const sel of containers) {
    try {
      for (const el of document.querySelectorAll(sel)) if (el !== hit && vis(el)) scopes.push(el);
    } catch {
      /* 忽略非法选择器 */
    }
  }
  // 关闭钮候选链：语义锚点 → 类名族（每个候选按作用域先后）；再文案兜底（归一化全等）
  let close = null;
  for (const sel of closeSelectors) {
    for (const scope of scopes) {
      let found = null;
      try {
        found = [...scope.querySelectorAll(sel)].find((el) => vis(el) && !inInput(el));
      } catch {
        found = null;
      }
      if (found) {
        close = centerOf(found);
        break;
      }
    }
    if (close) break;
  }
  if (!close) {
    const words = new Set(closeWords);
    outer: for (const scope of scopes) {
      let buttons = [];
      try {
        buttons = [...scope.querySelectorAll('button, [role="button"]')];
      } catch {
        buttons = [];
      }
      for (const b of buttons) {
        const label = String(b.innerText ?? b.textContent ?? '')
          .replace(/[\s\u3000]+/g, ' ')
          .trim();
        if (words.has(label) && vis(b) && !inInput(b)) {
          close = centerOf(b);
          break outer;
        }
      }
    }
  }
  // 点蒙层外：视口四角 + 边中点（8px 内缩）取首个「不落输入区 ∧ 命中元素非交互控件」的点
  const interactive = (el) => {
    if (!el) return true;
    const tag = String(el.tagName ?? '').toUpperCase();
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION'].includes(tag)) return true;
    if (el.isContentEditable) return true;
    return String(el.getAttribute?.('role') ?? '') === 'button';
  };
  const w = window.innerWidth;
  const h = window.innerHeight;
  const points = [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
    [w / 2, inset],
    [w / 2, h - inset],
    [inset, h / 2],
    [w - inset, h / 2],
  ];
  let outside = null;
  for (const [px, py] of points) {
    const target = document.elementFromPoint(px, py);
    if (!target || inInput(target) || interactive(target)) continue;
    outside = { x: px, y: py };
    break;
  }
  return { inputFound: true, blocked: true, element, text, close, outside };
};

/** 默认短等待：等一帧（页内 rAF）或 ≤`ms`，取先到者（真机动画与 fixture 同步消除同判，§6.4 #5） */
async function waitFrameOrMs(page, ms) {
  const frame = page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true)))).catch(() => {});
  await Promise.race([frame, sleep(ms)]);
}

/** 探测（轴 1b 与普查遮挡段的单一来源）；任何异常 ⇒ 按「输入区未找到 / 无遮挡」返回，不抛、不阻断 */
export async function probeOverlay(page, cfg) {
  try {
    const raw = await page.evaluate(OVERLAY_PROBE_FN, {
      inputSelector: cfg.driver.inputSelector,
      inputCandidates: cfg.inputCandidates,
      closeSelectors: CLOSE_SELECTORS,
      closeWords: CLOSE_WORDS,
      containers: CONTAINER_SELECTORS,
      inset: EDGE_INSET,
    });
    return raw ?? { inputFound: false, blocked: false };
  } catch {
    return { inputFound: false, blocked: false };
  }
}

/** 遮挡段（§6.5）：`<无|命中（元素=… 文本=「…」）>`（描述 ≤100 字；探测与轴 1b 同源） */
export function overlaySegment(raw) {
  if (!raw?.blocked) return '无';
  const element = redactText(raw.element, 44);
  const text = redactText(raw.text, 40);
  return `命中（元素=${element}${text ? ` 文本=「${text}」` : ''}）`;
}

/**
 * 遮挡处置（§6.4 第 0 步）：仅在探测到遮挡时动作；阶梯按序「Escape → 关闭钮候选链 → 点蒙层外」每轮一步、动作后复探；
 * ≤3 轮 / ≤4000ms（`deadline` = 调用级共享预算；缺省用 `now()` 起算一次调用预算）；幂等、不抛、不阻断。
 * @param {{log?:Function, now?:Function, wait?:Function, deadline?:number}} o `now` / `wait` 可注入（时间口径 C / D17）
 * @returns {Promise<{detected:boolean, rounds:number, cleared:boolean, actions:string[]}>}
 */
export async function dismissOverlay(page, cfg, { log, now = Date.now, wait, deadline } = {}) {
  const limit = Number.isFinite(deadline) ? deadline : now() + OVERLAY_BUDGET_MS;
  const actions = [];
  let raw = await probeOverlay(page, cfg);
  if (!raw.blocked) return { detected: false, rounds: 0, cleared: true, actions };
  const waitMs = wait ?? ((ms) => waitFrameOrMs(page, ms));
  let round = 0;
  for (const step of ['Escape', '关闭按钮', '点蒙层外']) {
    if (round >= OVERLAY_ROUNDS) break;
    if (now() >= limit) break; // 预算耗尽 ⇒ 停手不升档（超出 4000ms 的动作一律不做）
    const target = step === 'Escape' ? 'key' : step === '关闭按钮' ? raw.close : raw.outside;
    if (!target) continue; // 该档无目标（如页面无关闭钮）⇒ 不消耗轮次、顺延到下一档
    round += 1;
    actions.push(step);
    log?.(`自定义遮挡处置：动作=${step} 轮次=${round}/${OVERLAY_ROUNDS}`);
    try {
      if (step === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(target.x, target.y);
    } catch {
      /* 动作失败不阻断（下一轮复探决定是否升档） */
    }
    await waitMs(OVERLAY_WAIT_MS);
    raw = await probeOverlay(page, cfg);
    if (!raw.blocked) {
      log?.('自定义遮挡：消除');
      return { detected: true, rounds: round, cleared: true, actions };
    }
  }
  log?.('自定义遮挡：仍在（不阻断）');
  return { detected: true, rounds: round, cleared: false, actions };
}
