/**
 * 代码块 → 文件清单纯函数（取件层②；规则权威 = `docs/design/modules/outbox.md` §4「取件三层的落盘规则」）。
 * DeepSeek 与 Kimi 适配器**共用本实现**（`docs/batches/b3-kimi-adapter.md` §2 D5：共享化而非复制，避免规则双源；
 * 也不从任一平台适配器 import——那会造成平台耦合）。
 * 本模块只做解析：命名净化 / 重名序号 / 大小上限在落盘处执行（`src/engine/artifacts.mjs`）。
 */

/** 围栏代码块 → 文件清单：首行 `# file: x.py` / `// file: x.py` / `<!-- file: x.py -->` 命名；未命名 ⇒ `code_block_<n>.<lang>` */
export function filesFromText(text) {
  const out = [];
  const fence = /```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = fence.exec(String(text ?? '')))) {
    const lang = m[1] || 'txt';
    const content = m[2];
    const named = content.match(/^(?:#|\/\/|<!--)\s*file:\s*([^\s>]+)/i);
    const name = named ? named[1].trim() : `code_block_${out.length + 1}.${lang || 'txt'}`;
    out.push({ name, lang, content });
  }
  return out;
}
