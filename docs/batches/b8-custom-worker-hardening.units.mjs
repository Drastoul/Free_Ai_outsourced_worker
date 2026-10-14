/**
 * b8 单元测试（随批归档；`node --test docs/batches/b8-custom-worker-hardening.units.mjs` 直跑）
 * 判据权威 = `docs/batches/b8-custom-worker-hardening.md` §2「验收对照」；机制权威 = `docs/design/modules/adapters.md` §6.4 / §6.5。
 * 覆盖：候选链 v2 冻结（11 项）· 写入计划 / 落地判定 · 写入路径按键序列（换行绝不作按键事件下发）· 写入错误码映射（读回恒不过 /
 * 非 EngineError 异常 ⇒ `E_SEND_FAILED` ∧ `needsHuman=false`；输入区未找到 ⇒ `E_SELECTOR_MISSING`）· 普查族冻结 + 空白归一 + 脱敏 ·
 * 遮挡阶梯顺序与有界（注入 now / wait）· 补件能力门（AC-R12-4）。注入缝隙 = 只假页面（页面怎么回答）；生产逻辑全走真实模块。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EngineError } from '../../src/engine/adapters/base.mjs';
import { REPLY_CANDIDATES } from '../../src/engine/adapters/custom.mjs';
import { adapterFor } from '../../src/engine/adapters/registry.mjs';
import { planWrite, readbackOk } from '../../src/engine/adapters/custom-write.mjs';
import { CLOSE_SELECTORS, CLOSE_WORDS, CONTAINER_SELECTORS, dismissOverlay, foldText, redactText } from '../../src/engine/adapters/custom-overlay.mjs';
import { CENSUS_PROBES } from '../../src/engine/adapters/custom-census.mjs';
import { ERROR_CODES, ERROR_TABLE } from '../../src/main/mcp/errors.mjs';
import { Scheduler } from '../../src/main/scheduler/scheduler.mjs';
import { Task } from '../../src/main/scheduler/task.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(HERE, '..', '..', '.thincoder', 'tmp', 'units-b8-custom-worker-hardening');
const quietLog = { debug() {}, info() {}, warn() {}, error() {} };
/** 单元站 worker 载荷（url / driver 由主进程透传的口径；本件不落盘、不联网） */
const WORKER = { platform: 'custom', id: 'w-units', name: '单元站', url: 'http://127.0.0.1:1/x', driver: {} };
const cfgOf = () => ({ driver: { inputSelector: '', sendButtonSelector: '', replySelector: '' }, inputCandidates: ['textarea'], replyCandidates: ['[data-message-author-role]'] });

/**
 * 假页面：按页函数名给应答 + 记录键鼠动作序列。
 * `readback(value)` = 输入区读回（缺省 = 原样回显 ⇒ 读回通过）；`insertThrows` ⇒ Playwright 形异常；`missingInput` ⇒ 输入区不存在。
 */
function fakePage({ readback = (v) => v, focusSnap = () => ({ found: true, stale: false, focused: true, x: 10, y: 20 }), probe = () => ({ inputFound: true, blocked: false }), insertThrows = false, missingInput = false } = {}) {
  const ops = [];
  let value = '';
  const stats = { candidates: 0, fresh: 0, baselineFiltered: 0, echoFiltered: 0, via: '自动', chainCounts: REPLY_CANDIDATES.map((sel) => [sel, 0]), source: 'none' };
  return {
    ops,
    evaluate: async (fn) => {
      switch (fn.name) {
        case 'BASELINE_FN':
          return { marked: 0 };
        case 'INPUT_SCAN':
          return { found: !missingInput, badSelector: false };
        case 'OVERLAY_PROBE_FN':
          return probe();
        case 'FOCUS_FN':
          return focusSnap();
        case 'INPUT_VALUE_SCAN':
          return { present: true, empty: !value, text: readback(value) };
        case 'COLLECT_FN':
          return { text: '', stats };
        case 'CENSUS_FN':
          return { families: [], texts: [], classes: [] };
        default:
          throw new Error(`假页面未预期页函数：${fn.name}`);
      }
    },
    keyboard: {
      press: async (key) => {
        ops.push({ type: 'press', key });
        if (key === 'Shift+Enter') value += '\n';
        else if (key === 'Backspace') value = '';
        else if (key === 'Enter') value = ''; // 发送 ⇒ 输入区清空 ⇒ 发送确认立即通过（不空等 6s）
      },
      insertText: async (text) => {
        ops.push({ type: 'insertText', text });
        if (insertThrows) throw new Error('page.keyboard.insertText: Target page, context or browser has been closed');
        value += text;
      },
    },
    mouse: { click: async (x, y) => ops.push({ type: 'click', x, y }) },
    locator: () => ({ first: () => ({ click: async () => {} }) }),
  };
}

// —— 候选链 v2 / 写入计划 / 落地判定 ————————————————————————————————————————————

test('候选链 v2 冻结：11 项 ∧ 现链 3 项原位 + 新族 8 项尾追（回归安全）', () => {
  assert.equal(REPLY_CANDIDATES.length, 11, `候选链应为 11 项（实际 ${REPLY_CANDIDATES.length}）`);
  assert.deepEqual([...REPLY_CANDIDATES].slice(0, 3), ['[data-message-author-role]', '[class*="message" i]', '[role="listitem"]'], '现链 3 项原位不动');
  assert.deepEqual([...REPLY_CANDIDATES].slice(3), [
    '[data-role="assistant"]',
    '[data-testid*="assistant" i], [data-testid*="message" i]',
    '[class*="bubble" i]',
    '[class*="chat-message" i], [class*="message-content" i], [class*="response-content" i]',
    '[class*="answer" i]',
    '[class*="markdown" i]',
    '[class*="assistant" i]',
    '[class*="reply" i], [class*="response" i]',
  ]);
  assert.ok(Object.isFrozen(REPLY_CANDIDATES));
  const adapter = adapterFor(WORKER);
  for (const sel of REPLY_CANDIDATES) assert.ok(adapter.selectors.reply.includes(sel), `selectors.reply 应含 ${sel}`);
});

test('写入计划 / 落地判定：空行保留（行数一致）∧ 空白归一后含期望前 64 字', () => {
  const plan = planWrite('甲\n\n乙');
  assert.deepEqual(plan.lines, ['甲', '', '乙'], '空行保留（行数一致）');
  assert.equal(plan.head, '甲 乙', '期望前缀 = 空白归一后的前 64 字');
  assert.equal(planWrite('x'.repeat(100)).head.length, 64, '前缀封顶 64 字');
  assert.equal(readbackOk('甲\n\n乙', plan.head), true);
  assert.equal(readbackOk('  甲\t乙  ', '甲 乙'), true, '空白差异不误判（textarea / contenteditable 同判）');
  assert.equal(readbackOk('甲 乙 丙', '甲 乙'), true);
  assert.equal(readbackOk('别的文本', '甲 乙'), false);
  assert.equal(readbackOk('', '甲 乙'), false);
});

// —— 写入路径（fake page）：按键序列 / 错误码映射 ————————————————————————————————

test('写入路径（fake page）：逐行 insertText + 行间 Shift+Enter ∧ 换行绝不作按键事件下发 ∧ 非 Shift Enter 仅发送一次', async () => {
  const page = fakePage();
  const logs = [];
  await adapterFor(WORKER).send(page, '第一行\n\n第二行', { log: (m) => logs.push(m) });
  assert.deepEqual(page.ops.filter((o) => o.type === 'insertText').map((o) => o.text), ['第一行', '第二行'], '逐行 insertText（空行不发空载荷）');
  assert.deepEqual(page.ops.filter((o) => o.type === 'press').map((o) => o.key), ['Control+A', 'Backspace', 'Shift+Enter', 'Shift+Enter', 'Enter'], '清空 → 逐行写入（行间 Shift+Enter）→ Enter 发送');
  assert.ok(page.ops.filter((o) => o.type === 'insertText').every((o) => !o.text.includes('\n')), '换行绝不作 insertText 载荷（#37 根因）');
  assert.equal(page.ops.filter((o) => o.type === 'press' && o.key === 'Enter').length, 1, '非 Shift 的 Enter 只应出现一次（发送）');
  assert.match(logs.join('\n'), /自定义写入：尝试=1\/3 聚焦=focus 行数=3 读回=通过/, '成功日志词形（§6.5 冻结）');
  assert.match(logs.join('\n'), /发送已确认（input-cleared）/, '发送确认沿用既有词形');
});

test('写入错误码映射（fake page）：读回恒不过 ⇒ E_SEND_FAILED ∧ needsHuman=false ∧ message 含环节 / 尝试数 / 普查', async () => {
  const page = fakePage({ readback: () => '' });
  const logs = [];
  await assert.rejects(
    () => adapterFor(WORKER).send(page, '落不进去', { log: (m) => logs.push(m) }),
    (e) => {
      assert.ok(e instanceof EngineError, '应抛 EngineError');
      assert.equal(e.code, 'E_SEND_FAILED', `应映射为既有码 E_SEND_FAILED（实际 ${e.code}）`);
      assert.ok(ERROR_CODES.includes(e.code), '码必须 ∈ 既有码表');
      assert.match(e.message, /sending：写入失败（环节=读回 尝试=3\/3/);
      assert.match(e.message, /采集诊断/);
      assert.match(e.message, /族计数/);
      return true;
    },
  );
  assert.equal(ERROR_TABLE.E_SEND_FAILED.needsHuman, false, '写入类失败不得需要人工（F12.4）');
  assert.match(logs.join('\n'), /自定义写入失败：尝试=3\/3 环节=读回/, '失败日志词形（§6.5 冻结）');
});

test('写入错误码映射（fake page）：非 EngineError 异常 ⇒ 包装为 E_SEND_FAILED + 原异常单行摘要（不回落 E_INTERNAL / E_UNKNOWN）', async () => {
  const page = fakePage({ insertThrows: true });
  await assert.rejects(
    () => adapterFor(WORKER).send(page, '甲', {}),
    (e) => {
      assert.equal(e.code, 'E_SEND_FAILED', `应包装为 E_SEND_FAILED（实际 ${e.code}）`);
      assert.notEqual(e.code, 'E_INTERNAL');
      assert.match(e.message, /环节=写入/, '环节应记为写入');
      assert.match(e.message, /原因=[^；]*page\.keyboard\.insertText/, '应含原异常单行摘要');
      return true;
    },
  );
});

test('写入错误码映射（fake page）：输入区未找到沿用 E_SELECTOR_MISSING（定位类不改）', async () => {
  const page = fakePage({ missingInput: true });
  await assert.rejects(
    () => adapterFor(WORKER).send(page, '甲', {}),
    (e) => {
      assert.equal(e.code, 'E_SELECTOR_MISSING', `定位类应沿用 b7 口径（实际 ${e.code}）`);
      assert.match(e.message, /sending：输入区未找到/);
      return true;
    },
  );
});

// —— 普查：探测族冻结 / 空白归一 / 脱敏 ——————————————————————————————————————————

test('普查：探测族 11 项冻结（8 类名族 + role + author-role + testid）∧ 空白归一 ∧ 脱敏（⇒ <hash>）', () => {
  assert.equal(CENSUS_PROBES.length, 11, `探测族应为 11 项（实际 ${CENSUS_PROBES.length}）`);
  assert.deepEqual(CENSUS_PROBES.map((p) => p.label), ['message', 'bubble', 'markdown', 'answer', 'assistant', 'chat', 'reply', 'response', '[role=listitem|log]', '[data-message-author-role]', '[data-testid]']);
  assert.ok(Object.isFrozen(CENSUS_PROBES), '冻结以防后续漂移');
  assert.equal(foldText('a\n\tb\u3000c  d'), 'a b c d', '空白折叠含全角空白 / 去换行');
  assert.equal(foldText('ab\ncd', 3), 'ab ', '截断在归一之后（先折叠成单空格再截）');
  assert.equal(redactText('class-2f8a0c4b9d1e6f7a-x'), 'class-<hash>-x', '长随机 id ⇒ <hash>');
  assert.equal(redactText('qa-census-7f3'), 'qa-census-7f3', '短 id 不误伤（主包AI 需据此定选择器）');
});

// —— 遮挡阶梯（fake page / 时间注入）————————————————————————————————————————————

test('遮挡阶梯（fake page）：顺序 Escape → 关闭钮 → 点蒙层外 ∧ ≤3 轮 ∧ 每轮动作后复探 ∧ 候选链数据冻结', async () => {
  const mask = { inputFound: true, blocked: true, element: 'div#mask.qa-mask-7f3', text: '任务模式全新升级', close: { x: 30, y: 40 }, outside: { x: 8, y: 8 } };
  const probes = [mask, mask, mask, { inputFound: true, blocked: false }];
  const actions = [];
  let i = 0;
  const page = {
    evaluate: async (fn) => (fn.name === 'OVERLAY_PROBE_FN' ? probes[Math.min(i++, probes.length - 1)] : {}),
    keyboard: { press: async (key) => actions.push(`press:${key}`) },
    mouse: { click: async (x, y) => actions.push(`click:${x},${y}`) },
  };
  const logs = [];
  const r = await dismissOverlay(page, cfgOf(), { log: (m) => logs.push(m), now: () => 0, wait: async () => {} });
  assert.deepEqual(r.actions, ['Escape', '关闭按钮', '点蒙层外'], '阶梯顺序（设计 §6.4 第 0 步）');
  assert.deepEqual(actions, ['press:Escape', 'click:30,40', 'click:8,8'], '每轮一步、每轮只点一个关闭钮');
  assert.equal(r.rounds, 3);
  assert.equal(r.cleared, true);
  assert.match(logs.join('\n'), /自定义遮挡处置：动作=Escape 轮次=1\/3/, '处置日志词形');
  assert.match(logs.join('\n'), /自定义遮挡：消除/, '消除日志词形');
  assert.deepEqual([...CLOSE_SELECTORS], ['[aria-label*="关闭" i]', '[title*="关闭" i]', '[class*="close" i]'], '关闭钮候选链 = 语义锚点 → 类名族');
  assert.deepEqual([...CLOSE_WORDS], ['关闭', '知道了', '我知道了', '跳过', '好的', 'OK', 'Close'], '文案兜底（归一化全等）');
  assert.deepEqual([...CONTAINER_SELECTORS], ['[role="dialog"]', '[class*="dialog" i]', '[class*="modal" i]'], '回退作用域');
});

test('遮挡：无遮挡 ⇒ 探测一次零动作（幂等）∧ 跨 4000ms 停手不升档（注入 now / wait）∧ 探测抛错不抛', async () => {
  const cfg = cfgOf();
  let probes = 0; // ① 幂等：无遮挡 ⇒ 探测一次、零动作
  const idle = {
    evaluate: async (fn) => {
      probes += 1;
      assert.equal(fn.name, 'OVERLAY_PROBE_FN');
      return { inputFound: true, blocked: false };
    },
    keyboard: { press: async () => assert.fail('无遮挡不得有键盘动作') },
    mouse: { click: async () => assert.fail('无遮挡不得有点击动作') },
  };
  const r1 = await dismissOverlay(idle, cfg, { now: () => 0, wait: async () => {} });
  assert.deepEqual(r1, { detected: false, rounds: 0, cleared: true, actions: [] });
  assert.equal(probes, 1, '无遮挡 ⇒ 只探测一次即返回');
  let clock = 0; // ② 时间注入：一次动作 + 一次等待即跨过 4000ms ⇒ 停手不升档（C / D17）
  const acted = [];
  const stuck = {
    evaluate: async (fn) => (fn.name === 'OVERLAY_PROBE_FN' ? { inputFound: true, blocked: true, element: 'div#m.x', text: '', close: { x: 1, y: 1 }, outside: { x: 2, y: 2 } } : {}),
    keyboard: { press: async (key) => acted.push(key) },
    mouse: { click: async () => acted.push('click') },
  };
  const logs = [];
  const r2 = await dismissOverlay(stuck, cfg, { log: (m) => logs.push(m), now: () => clock, wait: async (ms) => { clock += ms + 4000; } });
  assert.deepEqual(r2.actions, ['Escape'], '跨 4000ms ⇒ 停手不升档（不再试关闭钮 / 点蒙层外）');
  assert.deepEqual(acted, ['Escape']);
  assert.equal(r2.cleared, false);
  assert.match(logs.join('\n'), /自定义遮挡：仍在（不阻断）/, '仍在日志词形（不阻断）');
  const boom = { evaluate: async () => { throw new Error('页面上下文异常'); }, keyboard: { press: async () => assert.fail('不应有动作') }, mouse: { click: async () => assert.fail('不应有动作') } };
  const r3 = await dismissOverlay(boom, cfg, { now: () => 0, wait: async () => {} }); // ③ 探测抛错 ⇒ 不抛、不阻断
  assert.equal(r3.detected, false);
  assert.deepEqual(r3.actions, []);
});

// —— 补件能力门（AC-R12-4；判定与词形 = workforce 单一来源，此处只驱动 scheduler.attachFiles）—————————————

test('AC-R12-4 补件能力门：不支持送件者同步拒绝（不追加 / 不冷却 / 状态不变）∧ 支持送件者正常追加', async () => {
  const outbox = path.join(TMP, 'outbox');
  const customWorker = { id: 'w-custom', name: '自定义站', platform: 'custom', enabled: true, url: 'http://127.0.0.1:1/x', driver: {} };
  const dsWorker = { id: 'w-ds', name: 'DeepSeek', platform: 'deepseek', enabled: true, url: 'https://chat.deepseek.com/' };
  const config = { current: { outboxDir: outbox, workers: [customWorker, dsWorker], scheduler: { globalConcurrency: 2, perWorkerConcurrency: 1 } } };
  const engine = { on() {}, isAlive: () => false, isReady: () => false, call: async () => ({}) };
  const sched = new Scheduler({ config, engine, log: quietLog, notify: () => {} });
  sched.persist = async () => {}; // 落盘打桩（本件不落盘）
  const mkTask = (taskId, worker) => {
    const t = new Task({ taskId, taskDir: path.join(outbox, taskId), request: { task: '甲', files: [] }, worker, selection: { mode: 'priority', reason: '单元' } });
    sched.tasks.set(taskId, t);
    return t;
  };
  try {
    const t1 = mkTask('t-custom', customWorker);
    await assert.rejects(
      () => sched.attachFiles('t-custom', ['D:\\a\\1.txt']),
      (e) => {
        assert.equal(e.code, 'E_WORKER_UNAVAILABLE', `应同步拒绝（实际 ${e.code}）`);
        assert.match(e.message, /不支持送件（附件）/, '词形与派单期同源');
        assert.match(e.message, /请去掉附件后重派/, '应明示可用方向');
        return true;
      },
    );
    assert.deepEqual(t1.request.files, [], '不追加文件');
    assert.equal(t1.state, 'queued', '任务状态不变（不重启执行）');
    assert.equal(sched.workforce.health.size, 0, '不置冷却（无冷却陷阱）');
    const t2 = mkTask('t-ds', dsWorker);
    await sched.attachFiles('t-ds', ['D:\\a\\1.txt', 'D:\\a\\2.txt']);
    assert.deepEqual(t2.request.files, ['D:\\a\\1.txt', 'D:\\a\\2.txt'], '支持送件者正常追加');
  } finally {
    sched.stop();
  }
});
