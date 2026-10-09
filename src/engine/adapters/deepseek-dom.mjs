/**
 * DeepSeek 的 DOM 侧取件辅助（`docs/design/modules/adapters.md` §3.4 DOM 兜底、§3.5 取件层① 触发）：
 *   · `collectDomAnswer`：兜底通道——拼接最后一个助手回合内的全部 markdown 块（探针 2 只取最后一块会漏内容）；
 *   · `clickDownloadButtons`：取件层① 的触发——点最后一个助手回合里代码块的「下载」按钮（落盘由 CDP 自动落盘承担）。
 * 两者都不抛错（DOM 只是兜底、下载只是三层之一）。
 */
const DOM_TAG = 'data-fo';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** DOM 兜底：拼接最后一个助手回合内的全部 markdown 块 */
export async function collectDomAnswer(page) {
  return await page
    .evaluate(() => {
      const blocks = [...document.querySelectorAll('[class*="ds-markdown"]')];
      if (!blocks.length) return '';
      const lastBlock = blocks[blocks.length - 1];
      const scope =
        lastBlock.closest('[class*="message"]') || lastBlock.parentElement?.parentElement?.parentElement || document.body;
      const inScope = blocks.filter((b) => scope.contains(b));
      const picked = inScope.length ? inScope : blocks.slice(-1);
      return picked
        .map((b) => (b.innerText || '').trim())
        .filter(Boolean)
        .join('\n\n');
    })
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
