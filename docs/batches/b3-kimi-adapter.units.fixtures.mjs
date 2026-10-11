/**
 * b3 随批单元 · 共用件 —— fixture 读取 / 期望值提取 / 模块装载（无断言、无副作用；由各分件 import）
 *
 * fixture（版本化基线，随批归档）：
 *   · `b3-kimi-adapter.fixtures/chat-resp.txt`    —— K6 全量样本逐字节副本（含前导长度前缀与替换字符）
 *   · `b3-kimi-adapter.fixtures/answer-stream.expected.md` —— 期望正文/思考；**独立推导**（路径与读数见其文件头）
 * 期望值提取规则：三个哨兵行（`===TEXT===` / `===THINKING===` / `===END===`，整行）之间的内容 = 期望值逐字节；
 * 提取前对行尾做 LF 归一（版本化基线防检出规范化）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(REPO, 'docs', 'batches', 'b3-kimi-adapter.fixtures');

/** Windows 盘符路径不能直接 import —— 一律转 file:// URL */
export const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

export function readRaw() {
  return fs.readFileSync(path.join(FIXTURES, 'chat-resp.txt'), 'utf8');
}

export function readExpected() {
  // 行尾归一（LF）：期望文件是版本化基线——若检出时被文本规范化（LF→CRLF）仍可解析；
  // `chat-resp.txt` 含 NUL 字节（git 按二进制处理），不受行尾规范化影响。
  const md = fs.readFileSync(path.join(FIXTURES, 'answer-stream.expected.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = md.match(/\n===TEXT===\n([\s\S]*?)\n===THINKING===\n([\s\S]*?)\n===END===\n?$/);
  if (!m) throw new Error('answer-stream.expected.md 哨兵结构不完整（期望值提取失败）');
  return { text: m[1], thinking: m[2] };
}
