/**
 * b1 单元测试 · 交付面（命名净化与上限；outbox.md §5 / §6）
 * 由入口 `b1-core-loop.units.mjs` 聚合执行（`node --test docs/batches/b1-core-loop.units.mjs`）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);

const artifacts = await load('src/engine/artifacts.mjs');
const sharedOutbox = await load('src/shared/outbox.mjs');

const TMP = path.join(REPO, '.thincoder', 'tmp', `units-outbox-${process.pid}`);
function freshTmp(name) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
process.on('exit', () => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const noopLog = { info() {}, warn() {}, error() {}, debug() {} };
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => {
    assert.equal(e?.code, code, `期望错误码 ${code}，实际 ${e?.code}（${e?.message}）`);
    return true;
  });

// ---------------------------------------------------------------------------

test('命名净化：穿越 / 保留名 / 长度 / 空名（引擎侧与主进程侧同一套规则）', () => {
  const longName = `${'x'.repeat(200)}.py`;
  const cases = [
    ['..\\..\\etc\\passwd.py', 'passwd.py'],
    ['a/b:c*.txt', 'b_c_.txt'],
    ['CON.txt', '_CON.txt'],
    ['com1', '_com1'],
    ['..', 'unnamed'],
    ['.', 'unnamed'],
    ['', 'unnamed'],
    ['  尾部点... ', '尾部点'],
    ['.hidden', '.hidden'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(artifacts.sanitizeName(input), expected, `引擎侧 sanitizeName(${JSON.stringify(input)})`);
    assert.equal(sharedOutbox.sanitizeFileName(input), expected, `主进程侧 sanitizeFileName(${JSON.stringify(input)})`);
  }
  const engineLong = artifacts.sanitizeName(longName);
  const sharedLong = sharedOutbox.sanitizeFileName(longName);
  assert.equal(engineLong.length, 120, '超长名截到 ≤120');
  assert.equal(engineLong.endsWith('.py'), true, '超长名保留扩展名');
  assert.equal(sharedLong.length, 120, '主进程侧同口径');
});

test('命名净化：重名加序号（保留扩展名）', () => {
  const dir = freshTmp('unique');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  assert.equal(artifacts.uniqueName(dir, 'a.txt'), 'a-2.txt');
  fs.writeFileSync(path.join(dir, 'a-2.txt'), 'x');
  assert.equal(artifacts.uniqueName(dir, 'a.txt'), 'a-3.txt');
  assert.equal(sharedOutbox.uniqueFileName('a.txt', new Set(['a.txt', 'a-2.txt'])), 'a-3.txt');
});

test('落盘边界：目标越出任务目录 ⇒ 重新校验拒绝（越界名被净化后仍在目录内）', () => {
  const root = freshTmp('inside');
  assert.equal(artifacts.assertInsideDir(root, path.join(root, 'files', 'ok.txt')), path.join(root, 'files', 'ok.txt'));
  throwsCode(() => artifacts.assertInsideDir(root, path.join(root, '..', 'evil.txt')), 'E_OUTBOX_WRITE');
  // 恶意产物名经净化后仍落在任务目录内（basename 化）
  const dest = path.join(root, 'files', artifacts.sanitizeName('..\\..\\evil.txt'));
  assert.equal(path.dirname(dest), path.join(root, 'files'));
});

test('上限：超 maxFileBytes ⇒ 记 skippedFiles（不落盘、不静默丢）', () => {
  const outbox = freshTmp('limits');
  const written = artifacts.writeExtractedFile(
    outbox,
    { name: 'big.txt', content: 'x'.repeat(100) },
    { maxFileBytes: 10, log: () => {} },
  );
  assert.ok(written.skipped, '超限应记 skipped');
  assert.equal(written.file, undefined);
  assert.equal(fs.existsSync(path.join(outbox, 'files', 'big.txt')), false);
  assert.equal(written.skipped.name, 'big.txt');
  assert.equal(written.skipped.size, 100, '文本按 UTF-8 字节计');

  const okWrite = artifacts.writeExtractedFile(outbox, { name: 'small.txt', content: 'ok' }, { log: () => {} });
  assert.equal(okWrite.file.relPath, 'files/small.txt');
  assert.equal(fs.readFileSync(path.join(outbox, 'files', 'small.txt'), 'utf8'), 'ok');

  // 下载归属移入：超限 ⇒ skipped + 源文件留在暂存区
  const staging = freshTmp('staging');
  const staged = path.join(staging, 'dl.bin');
  fs.writeFileSync(staged, Buffer.alloc(20, 1));
  const imported = artifacts.importDownloads({
    outboxDir: outbox,
    records: [{ name: 'dl.bin', path: staged }],
    maxFileBytes: 10,
    log: () => {},
  });
  assert.equal(imported.files.length, 0);
  assert.equal(imported.skipped.length, 1);
  assert.equal(fs.existsSync(staged), true, '超限文件不移动（留在暂存区）');
});

test('交付目录解析：可用配置目录 ⇒ 原样返回（不回落）', async () => {
  const dir = freshTmp('outbox-resolve');
  const resolved = await sharedOutbox.resolveOutboxDir(dir, { log: noopLog });
  assert.equal(resolved.dir, path.resolve(dir));
  assert.equal(resolved.fallback, false);
  assert.equal(resolved.reason, null);
});

test('manifest 原子写：write/read 往返、覆写生效、不留 .tmp 残留', async () => {
  const dir = freshTmp('manifest-atomic');
  const taskDir = path.join(dir, '20261009-120000-aaaa');
  fs.mkdirSync(taskDir, { recursive: true });

  const first = { taskId: '20261009-120000-aaaa', state: 'running', worker: { id: 'w-1', name: 'A', platform: 'deepseek' } };
  await sharedOutbox.writeManifest(taskDir, first);
  assert.deepEqual(await sharedOutbox.readManifest(taskDir), first);

  // 覆写（同目录临时文件 + rename 替换）⇒ 读到的是完整新 JSON，且不留临时文件
  const second = { ...first, state: 'done', delivery: { transport: 'sse', textPath: 'answer.md', files: [] } };
  await sharedOutbox.writeManifest(taskDir, second);
  const back = await sharedOutbox.readManifest(taskDir);
  assert.equal(back.state, 'done');
  assert.deepEqual(back.delivery, second.delivery);
  assert.deepEqual(
    fs.readdirSync(taskDir).filter((n) => n.includes('.tmp')),
    [],
    '原子写不得留下临时文件'
  );
  assert.doesNotThrow(
    () => JSON.parse(fs.readFileSync(sharedOutbox.manifestPath(taskDir), 'utf8')),
    'manifest.json 任何时刻都应为完整 JSON（无半写）'
  );
});

test('重启扫描：非终态 manifest 打 interrupted（独立标记、幂等），终态不动', async () => {
  const dir = freshTmp('restart-scan');
  const mk = async (taskId, state) => {
    const taskDir = path.join(dir, taskId);
    fs.mkdirSync(taskDir, { recursive: true });
    await sharedOutbox.writeManifest(taskDir, { taskId, state, worker: null, delivery: null, error: null });
    return taskDir;
  };
  const running = await mk('20261009-120000-bbbb', 'running');
  const done = await mk('20261009-120000-cccc', 'done');

  const marked = await sharedOutbox.markInterruptedManifests(dir, {
    log: noopLog,
    now: new Date('2026-10-09T12:00:00.000Z'),
  });
  assert.deepEqual(marked, [{ taskId: '20261009-120000-bbbb', previousState: 'running' }]);

  const m1 = await sharedOutbox.readManifest(running);
  assert.equal(m1.state, 'running', 'interrupted 不进 state 枚举');
  assert.equal(m1.interrupted.previousState, 'running');
  assert.equal(m1.interrupted.at, '2026-10-09T12:00:00.000Z');
  assert.equal((await sharedOutbox.readManifest(done)).interrupted, undefined, '终态 manifest 不动');

  assert.deepEqual(await sharedOutbox.markInterruptedManifests(dir, { log: noopLog }), [], '再扫不重复标记（幂等）');
});
