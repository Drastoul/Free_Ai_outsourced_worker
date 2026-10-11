/**
 * Kimi 的 DOM 兜底采集（K9 读数；`docs/batches/b3-kimi-adapter.md` §2「机制设计·DOM 兜底」）：
 * 只在**基线之后的新助手回合**内按 DOM 序拼接正文块（`div.paragraph` + `div.syntax-highlighter.segment-code-content`），
 * 排除**思考区**（`[class*="toolcall-content"]` / `thinking-container`——思考文本同为 `div.paragraph`，朴素口径会混入）。
 * 作用域已限助手回合 ⇒ 天然不含用户消息；**不得按 `toolcall` 粗排除**（答案区同在 `toolcall-rollup` 下）。
 * 代码块只取 `segment-code-content`（嵌套的 `pre.language-python` 不选）⇒ 无重复块。
 * 无新回合 / 取不到 ⇒ 返回 `''`（DOM 只是兜底通道，不抛错——与 DeepSeek 侧同口径；上层据此判 `E_NO_RESPONSE`）。
 */
export const ASSISTANT_TURN_SELECTOR = 'div.chat-content-item.chat-content-item-assistant';
const BODY_BLOCK_SELECTOR = 'div.paragraph, .segment-code-content';
const EXCLUDE_SELECTOR = '[class*="toolcall-content" i], [class*="thinking-container" i]';
const BASELINE_ATTR = 'data-fo-dom-baseline';

/** 发送前记「助手回合基线」（b5 本单锚定）：给当前全部助手回合打标（复用会话时页面留存上一单回合）；失败 ⇒ 记一行日志、仍返回 0（b6） */
export async function markAssistantBaseline(page, { log } = {}) {
  return await page
    .evaluate(
      ({ turnSel, attr }) => {
        const turns = [...document.querySelectorAll(turnSel)];
        for (const t of turns) t.setAttribute(attr, '1');
        return turns.length;
      },
      { turnSel: ASSISTANT_TURN_SELECTOR, attr: BASELINE_ATTR },
    )
    .catch((e) => {
      // 打标失败不静默（b6）：DOM 兜底可能把上一单回合计入，日志为事后取证线索；不升级为任务失败（仍返回 0）
      log?.(`助手回合基线打标失败：${String(e?.message ?? e).slice(0, 120)}`);
      return 0;
    });
}

/** 拼接基线之后最后一个新助手回合内的正文块（按 DOM 序，`\n\n` 分隔；无新回合 ⇒ 空串） */
export async function collectDomAnswer(page) {
  return await page
    .evaluate(
      ({ turnSel, blockSel, excludeSel, attr }) => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const fresh = [...document.querySelectorAll(turnSel)].filter((el) => !el.closest(`[${attr}]`));
        const turn = fresh.filter(vis).pop();
        if (!turn) return '';
        return [...turn.querySelectorAll(blockSel)]
          .filter((el) => vis(el) && !el.closest(excludeSel))
          .map((el) => (el.innerText || '').trim())
          .filter(Boolean)
          .join('\n\n');
      },
      { turnSel: ASSISTANT_TURN_SELECTOR, blockSel: BODY_BLOCK_SELECTOR, excludeSel: EXCLUDE_SELECTOR, attr: BASELINE_ATTR },
    )
    .catch(() => '');
}
