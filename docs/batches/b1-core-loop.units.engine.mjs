/**
 * b1 单元测试 · 引擎面（SSE 解析 / 代码块提取 / 请求载荷读键）
 * 由入口 `b1-core-loop.units.mjs` 聚合执行（`node --test docs/batches/b1-core-loop.units.mjs`）。
 *
 * 基线（设计权威：`docs/design/modules/adapters.md`「验收判据」）：
 *   `docs/batches/b1-core-loop.fixtures/raw-sse.txt` ⇒ 与 `answer-sse.expected.md` 逐字一致（108 字符）；
 *   `extract.filesFromText` ⇒ `greet.py` / `README.md`（对照 `probe/out3/artifacts/`）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const FIXTURES = path.join(REPO, 'docs', 'batches', 'b1-core-loop.fixtures');
/** Windows 盘符路径不能直接 import —— 一律转 file:// URL */
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const { parseSSE, matchStreamUrl } = await load('src/engine/adapters/deepseek-stream.mjs');
const { default: deepseek } = await load('src/engine/adapters/deepseek.mjs');

// ---------------------------------------------------------------------------
// SSE 解析
// ---------------------------------------------------------------------------

test('SSE 解析：raw-sse fixture ⇒ 与期望基线逐字一致（108 字符、无尾换行）', () => {
  const raw = fs.readFileSync(path.join(FIXTURES, 'raw-sse.txt'), 'utf8');
  const expected = fs.readFileSync(path.join(FIXTURES, 'answer-sse.expected.md'), 'utf8');
  const parsed = parseSSE(raw);

  assert.equal(parsed.text, expected, '正文与 answer-sse.expected.md 必须逐字一致');
  assert.equal(parsed.text.length, 108, '正确基线 = 首帧快照「完成」2 + APPEND 106');
  assert.equal(parsed.text.endsWith('\n'), false, '无尾换行');
  assert.equal(parsed.finished, true, '流内 FINISHED 结束标记必须被识别');
  assert.equal(parsed.thinking.length, 0, 'THINK 分片不得混入正文');
  assert.equal(parsed.text.startsWith('完成'), true, '帧形态 A 首帧快照必须累积（基线更正点）');
  assert.equal(parsed.text.includes('FINISHED'), false, 'status 帧不得混入正文');
});

test('SSE 解析：帧形态与纪律（状态帧不追加、续写帧只落当前内容路径、[DONE] 跳过）', () => {
  const frameA = JSON.stringify({
    v: { response: { fragments: [{ type: 'RESPONSE', content: '首帧' }] } },
  });
  const frameB = JSON.stringify({ p: 'response/fragments/-1/content', o: 'APPEND', v: '续写' });
  const frameStatus = JSON.stringify({ p: 'response/status', o: 'SET', v: 'FINISHED' });
  const frameMeta = JSON.stringify({ p: 'response/meta', o: 'SET', v: '元数据不该入正文' });
  const frameC = JSON.stringify({ v: '尾续' });

  const parsed = parseSSE(
    [
      'event: message',
      `data: ${frameA}`,
      `data: ${frameB}`,
      `data: ${frameC}`,
      `data: ${frameStatus}`,
      'data: [DONE]',
      'data: {不是 JSON',
      '',
    ].join('\n'),
  );

  assert.equal(parsed.text, '首帧续写尾续');
  assert.equal(parsed.finished, true);
  assert.equal(parsed.events, 4, '[DONE] 与非法 JSON 不计事件（A/B/C/status 四帧）');

  // 非内容路径帧（status / 元数据）只更新指针，不追加；其后续写帧也不入正文
  const metaThenC = parseSSE([`data: ${frameMeta}`, `data: ${frameC}`].join('\n'));
  assert.equal(metaThenC.text, '');
  assert.equal(metaThenC.text.includes('元数据'), false, '非内容路径只更新指针，不追加');
  const statusThenC = parseSSE([`data: ${frameStatus}`, JSON.stringify({ v: '不该出现' })].join('\n'));
  assert.equal(statusThenC.text, '');
});

test('SSE 解析：BATCH 帧内 quasi_status=FINISHED 也算结束标记（fixture 同形帧）', () => {
  const batch = JSON.stringify({
    p: 'response',
    o: 'BATCH',
    v: [
      { p: 'accumulated_token_usage', v: 149 },
      { p: 'quasi_status', v: 'FINISHED' },
    ],
  });
  const parsed = parseSSE(`data: ${batch}`);
  assert.equal(parsed.finished, true);
  assert.equal(parsed.text, '', 'BATCH 帧不得把状态值当正文');
});

test('答复流命中判定：chat/completion 命中、其他不命中', () => {
  assert.equal(matchStreamUrl('https://chat.deepseek.com/api/v0/chat/completion'), true);
  assert.equal(matchStreamUrl('https://chat.deepseek.com/api/v0/chat/completion?x=1'), true);
  assert.equal(matchStreamUrl('https://chat.deepseek.com/api/v0/chat/other'), false);
  assert.equal(matchStreamUrl(null), false);
});

test('请求载荷读键（R8 核对）：两键齐 ⇒ 读出；缺键 / 非 JSON ⇒ null', () => {
  const read = deepseek.requestPayload.toggles;
  assert.deepEqual(read({ thinking_enabled: true, search_enabled: false }), {
    thinking_enabled: true,
    search_enabled: false,
  });
  assert.deepEqual(read(JSON.stringify({ thinking_enabled: false, search_enabled: true })), {
    thinking_enabled: false,
    search_enabled: true,
  });
  assert.equal(read({ thinking_enabled: true }), null);
  assert.equal(read({ thinking_enabled: 'yes', search_enabled: false }), null);
  assert.equal(read('不是 JSON'), null);
  assert.equal(read(null), null);
});

// ---------------------------------------------------------------------------
// 代码块提取
// ---------------------------------------------------------------------------

test('代码块提取：从基线正文抽出 greet.py / README.md（内容与探针产物一致）', () => {
  const expected = fs.readFileSync(path.join(FIXTURES, 'answer-sse.expected.md'), 'utf8');
  const files = deepseek.extract.filesFromText(expected);

  assert.equal(files.length, 2, `应抽出 2 个文件，实际：${files.map((f) => f.name).join('、')}`);
  assert.deepEqual(
    files.map((f) => f.name),
    ['greet.py', 'README.md'],
  );

  // 基线判据（committed）：抽出内容 = 基线正文内对应围栏块的内容
  const greet = files.find((f) => f.name === 'greet.py');
  const readme = files.find((f) => f.name === 'README.md');
  assert.equal(greet.content, '# file: greet.py\nprint("hello-outsource")\n');
  assert.equal(readme.content, '<!-- file: README.md -->\n# 外包测试\n');

  // 对照 `probe/out3/artifacts/`（设计判据；探针产物目录不在版本库，缺失时退到基线块对照）
  const artifactDir = path.join(REPO, 'probe', 'out3', 'artifacts');
  if (fs.existsSync(artifactDir)) {
    for (const name of ['greet.py', 'README.md']) {
      const artifact = fs.readFileSync(path.join(artifactDir, name), 'utf8');
      const got = files.find((f) => f.name === name);
      assert.equal(got.content, artifact, `${name} 应与 probe/out3/artifacts/${name} 逐字节一致`);
    }
  } else {
    console.error('[诊断] probe/out3/artifacts/ 不存在（探针产物不入版本库）——本用例以批次档基线的围栏块为对照');
  }
});

test('代码块提取：无名块 ⇒ code_block_N.<lang>；lang 缺省 txt；多块顺序稳定', () => {
  const text = ['```python', 'print(1)', '```', '', '```', '无语言', '```'].join('\n');
  const files = deepseek.extract.filesFromText(text);
  assert.deepEqual(
    files.map((f) => f.name),
    ['code_block_1.python', 'code_block_2.txt'],
  );

  // 首行 `// file:` 与 `# file:` 命名
  const js = deepseek.extract.filesFromText('```js\n// file: a.js\nconsole.log(1)\n```');
  assert.deepEqual(
    js.map((f) => f.name),
    ['a.js'],
  );
});
