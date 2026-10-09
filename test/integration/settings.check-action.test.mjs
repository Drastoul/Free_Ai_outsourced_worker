/**
 * `verify:settings` 场景组 · 「打开并检查」动作（k）
 *
 * k：检查动作 ≤ `limits.timeouts.openingMs` 内返回——状态徽标与最近检查时间更新，或界面明示错误；
 *    不悬挂、不静默（F5.5 / T6）。夹具：引擎侧浏览器快速失败（env 指定不存在的 channel），
 *    确保断言不看真机登录态；`openingMs` 收紧到 20s，让「≤ 预算」有分辨力。
 *
 * 驱动 = `settings.session.mjs`；读数工具 = `settings.driver.mjs`。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { freePort, freshUserData, readRuntime, waitFor, writeConfig } from './settings.driver.mjs';
import { killAll, startSettingsApp } from './settings.session.mjs';

after(killAll);

const OPENING_MS = 20000;

test('k：检查动作 ≤ openingMs 返回（状态更新或界面明示错误；不悬挂不静默）', { timeout: 300000 }, async () => {
  const userData = freshUserData('check');
  const port = await freePort();
  writeConfig(userData, {
    port,
    outboxDir: path.join(userData, 'outbox'),
    limits: { timeouts: { openingMs: OPENING_MS } },
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  });
  const session = await startSettingsApp({
    userData,
    envExtra: {
      FREE_OUTSOURCE_BROWSER_MODE: 'chromium',
      FREE_OUTSOURCE_BROWSER_CHANNEL: 'no-such-browser', // 引擎侧浏览器快速失败（不弹真浏览器、不看真机登录态）
    },
  });
  try {
    const rt = await waitFor(() => readRuntime(userData), 90000, 250);
    assert.ok(rt, '应用未在预算内写 runtime.json');

    await session.click('[data-page="workers"]');
    const before = await session.evalJson(`({
      badgeState: document.querySelector('[data-worker-id="w-1"] [data-field="status"]').getAttribute('data-state'),
      checked: document.querySelector('[data-worker-id="w-1"] [data-field="checked"]').textContent,
      noticeHidden: document.querySelector('[data-field="notice"]').hidden,
      checkBtn: document.querySelector('[data-worker-id="w-1"] [data-action="check"]').textContent,
    })`);
    assert.equal(before.badgeState, 'ready', '初始徽标应为 ready');
    assert.equal(before.checked, '最近检查：从未检查');
    assert.equal(before.checkBtn, '打开并检查');
    assert.equal(before.noticeHidden, true, '初始无提示（判据才可分辨）');

    const t0 = Date.now();
    await session.click('[data-worker-id="w-1"] [data-action="check"]');
    const settled = await session.waitDom(
      `(!document.querySelector('[data-field="notice"]').hidden && document.querySelector('[data-field="notice"]').textContent.length > 0) ? 'y' : null`,
      OPENING_MS + 10000,
    );
    const elapsed = Date.now() - t0;
    assert.equal(settled, 'y', `检查动作未在预算内给出界面反馈（悬挂 ${elapsed}ms）`);

    const after = await session.evalJson(`({
      badgeState: document.querySelector('[data-worker-id="w-1"] [data-field="status"]').getAttribute('data-state'),
      badgeText: document.querySelector('[data-worker-id="w-1"] [data-field="status"]').textContent,
      checked: document.querySelector('[data-worker-id="w-1"] [data-field="checked"]').textContent,
      notice: document.querySelector('[data-field="notice"]').hidden ? null : document.querySelector('[data-field="notice"]').textContent,
      checkBtn: document.querySelector('[data-worker-id="w-1"] [data-action="check"]').textContent,
    })`);
    const statusUpdated = after.badgeState !== 'ready' && after.checked.startsWith('最近检查：20');
    assert.ok(
      statusUpdated || !!after.notice,
      `应收敛到「状态更新」或「界面明示错误」：徽标=${after.badgeState}/${after.checked} 提示=${after.notice}`,
    );
    assert.ok(elapsed <= OPENING_MS + 5000, `动作应 ≤ openingMs(${OPENING_MS}ms) 返回，实际 ${elapsed}ms`);
    assert.notEqual(after.checkBtn, '检查中…', '返回后按钮不应停留在「检查中…」（不悬挂）');
    console.log(
      `[verify:settings·k 读数] elapsed=${elapsed}ms（预算 ${OPENING_MS}ms）· 徽标=${after.badgeText}/${after.badgeState} · ${after.checked} · 提示=${after.notice}`,
    );

    assert.ok(await session.quit(), '应用应能优雅退出');
  } finally {
    session.kill();
  }
});
