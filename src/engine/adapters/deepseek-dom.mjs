/**
 * DeepSeek 的 DOM 侧取件辅助（`docs/design/modules/adapters.md` §3.4 DOM 兜底、§3.5 取件层① 触发）：
 *   · `markAssistantBaseline`：`send()` 前记「助手回合基线」（b5 本单锚定——复用会话时页面留存上一单回合）；
 *   · `collectDomAnswer`：兜底通道——只拼接**基线之后新回合**内的全部 markdown 块（探针 2 只取最后一块会漏内容）；
 *   · `clickDownloadButtons`：取件层① 的触发——点最后一个助手回合里代码块的「下载」按钮（落盘由 CDP 自动落盘承担）。
 * 三者都不抛错（DOM 只是兜底、下载只是三层之一）；`markAssistantBaseline` 失败记一行日志（b6「基线打标失败不静默」——仍返回 0）。
 */
const DOM_TAG = 'data-fo';
const BASELINE_ATTR = 'data-fo-dom-baseline';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 发送前记「助手回合基线」：给当前全部 markdown 块及其回合容器打标（b5 起 `collect` 只认未打标的新回合）；失败 ⇒ 记一行日志、仍返回 0（b6） */
export async function markAssistantBaseline(page, { log } = {}) {
  return await page
    .evaluate((attr) => {
      const blocks = [...document.querySelectorAll('[class*="ds-markdown"]')];
      for (const b of blocks) {
        b.setAttribute(attr, '1');
        const scope = b.closest('[class*="message"]') || b.parentElement?.parentElement?.parentElement;
        scope?.setAttribute(attr, '1');
      }
      return blocks.length;
    }, BASELINE_ATTR)
    .catch((e) => {
      // 打标失败不静默（b6）：DOM 兜底可能把上一单回合计入，日志为事后取证线索；不升级为任务失败（仍返回 0）
      log?.(`助手回合基线打标失败：${String(e?.message ?? e).slice(0, 120)}`);
      return 0;
    });
}

/** DOM 兜底：拼接基线之后新回合内的全部 markdown 块（无新回合 ⇒ 空串；上层据此判 `E_NO_RESPONSE`，不静默交付旧答复） */
export async function collectDomAnswer(page) {
  return await page
    .evaluate((attr) => {
      const fresh = [...document.querySelectorAll('[class*="ds-markdown"]')].filter((b) => !b.closest(`[${attr}]`));
      if (!fresh.length) return '';
      const lastBlock = fresh[fresh.length - 1];
      const scope =
        lastBlock.closest('[class*="message"]') || lastBlock.parentElement?.parentElement?.parentElement || document.body;
      const inScope = fresh.filter((b) => scope.contains(b));
      const picked = inScope.length ? inScope : fresh.slice(-1);
      return picked
        .map((b) => (b.innerText || '').trim())
        .filter(Boolean)
        .join('\n\n');
    }, BASELINE_ATTR)
    .catch(() => '');
}

/** 点击最后一个助手回合里的代码块「下载」按钮；作用域受限，避免误点页面其他「下载」文案 */
export async function clickDownloadButtons(page, { log } = {}) {
  const targets = await page
    .evaluate((tag) => {
      const blocks = [...document.querySelectorAll('[class*="ds-markdown"]')];
      const lastBlock = blocks[blocks.length - 1];
      // 作用域限在最后一个助手回合：取不到回合容器就不点（不回落 document.body，避免误点页面其他「下载」文案）
      const scope =
        (lastBlock && (lastBlock.closest('[class*="message"]') || lastBlock.parentElement?.parentElement?.parentElement)) || null;
      if (!scope) return [];
      const els = [...scope.querySelectorAll('span,div,button,a')].filter(
        (el) => (el.innerText || '').trim() === '下载' && el.getBoundingClientRect().width > 0,
      );
      const clickable = [];
      for (const el of els) {
        const c = el.closest('[role="button"],button') ?? el;
        if (!clickable.includes(c)) clickable.push(c);
      }
      clickable.forEach((el, i) => el.setAttribute(`${tag}-download`, String(i)));
      return clickable.map((el, i) => ({ idx: i, tag: el.tagName.toLowerCase() }));
    }, DOM_TAG)
    .catch(() => []);
  let clicked = 0;
  for (const t of targets) {
    try {
      await page.locator(`[${DOM_TAG}-download="${t.idx}"]`).first().click({ timeout: 6000 });
      clicked++;
      await sleep(1200);
    } catch (e) {
      log?.(`下载按钮点击失败 idx=${t.idx}：${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  return { found: targets.length, clicked };
}
