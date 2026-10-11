/**
 * Kimi 的 DOM 兜底采集（K9 读数；`docs/batches/b3-kimi-adapter.md` §2「机制设计·DOM 兜底」）：
 * 只在**最后一个助手回合**内按 DOM 序拼接正文块（`div.paragraph` + `div.syntax-highlighter.segment-code-content`），
 * 排除**思考区**（`[class*="toolcall-content"]` / `thinking-container`——思考文本同为 `div.paragraph`，朴素口径会混入）。
 * 作用域已限助手回合 ⇒ 天然不含用户消息；**不得按 `toolcall` 粗排除**（答案区同在 `toolcall-rollup` 下）。
 * 代码块只取 `segment-code-content`（嵌套的 `pre.language-python` 不选）⇒ 无重复块。
 * 取不到 ⇒ 返回 `''`（DOM 只是兜底通道，不抛错——与 DeepSeek 侧同口径）。
 */
export const ASSISTANT_TURN_SELECTOR = 'div.chat-content-item.chat-content-item-assistant';
const BODY_BLOCK_SELECTOR = 'div.paragraph, .segment-code-content';
const EXCLUDE_SELECTOR = '[class*="toolcall-content" i], [class*="thinking-container" i]';

/** 拼接最后一个助手回合内的正文块（按 DOM 序，`\n\n` 分隔） */
export async function collectDomAnswer(page) {
  return await page
    .evaluate(
      ({ turnSel, blockSel, excludeSel }) => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const turns = [...document.querySelectorAll(turnSel)].filter(vis);
        const turn = turns[turns.length - 1];
        if (!turn) return '';
        return [...turn.querySelectorAll(blockSel)]
          .filter((el) => vis(el) && !el.closest(excludeSel))
          .map((el) => (el.innerText || '').trim())
          .filter(Boolean)
          .join('\n\n');
      },
      { turnSel: ASSISTANT_TURN_SELECTOR, blockSel: BODY_BLOCK_SELECTOR, excludeSel: EXCLUDE_SELECTOR },
    )
    .catch(() => '');
}
