/**
 * b3 随批单元 · 代码块抽取（取件层②，共享实现 `src/engine/adapters/text-files.mjs`；D5 单源，不复制规则）
 *
 * 判据：Kimi 样本正文 ⇒ `kimi_dl.py`（`# file:` 命名与内容逐字）· b1 基线两例（greet.py / README.md）复跑一致；
 * 两平台 `extract.filesFromText` = 同一函数引用（命名净化与上限在落盘处执行，规则权威 `docs/design/modules/outbox.md` §4）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, load, readExpected } from './b3-kimi-adapter.units.fixtures.mjs';

const kimi = (await load('src/engine/adapters/kimi.mjs')).default;
const deepseek = (await load('src/engine/adapters/deepseek.mjs')).default;
const { filesFromText } = await load('src/engine/adapters/text-files.mjs');

test('代码块抽取：Kimi 期望正文 ⇒ kimi_dl.py（`# file:` 命名 + 语言 + 内容逐字）', () => {
  const files = kimi.extract.filesFromText(readExpected().text);

  assert.deepEqual(files.map((f) => f.name), ['kimi_dl.py'], '命名 = 围栏首行 `# file: kimi_dl.py`');
  assert.equal(files[0].lang, 'python');
  assert.equal(files[0].content, '# file: kimi_dl.py\nprint("kimi")\n');
});

test('代码块抽取：b1 基线两例复跑一致（D5 等价重构守门）+ 两平台同一函数引用', () => {
  const b1 = fs.readFileSync(
    path.join(REPO, 'docs', 'batches', 'b1-core-loop.fixtures', 'answer-sse.expected.md'),
    'utf8',
  );
  const files = deepseek.extract.filesFromText(b1);

  assert.deepEqual(files.map((f) => f.name), ['greet.py', 'README.md']);
  assert.equal(files.find((f) => f.name === 'greet.py').content, '# file: greet.py\nprint("hello-outsource")\n');
  assert.equal(kimi.extract.filesFromText, filesFromText, 'kimi 引共享实现（D5 单源）');
  assert.equal(deepseek.extract.filesFromText, filesFromText, 'deepseek 引共享实现（D5 单源）');
});
