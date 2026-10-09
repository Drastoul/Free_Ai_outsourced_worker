/**
 * `verify:settings` 场景组 · 退出重启后改动保留（l；AC-R5-5）
 *
 * 改动（开关 / 改名 / 交付目录）⇒ 优雅退出 ⇒ 重启同一 userData ⇒ config.json 与界面（行名 / 开关勾选态 /
 * 交付目录实际路径）均保留；`/healthz` 同步。退出侧顺带核对 b1 契约：优雅退出删除 runtime.json。
 *
 * 驱动 = `settings.session.mjs`；读数工具 = `settings.driver.mjs`。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { freePort, freshUserData, healthz, readConfig, waitFor, writeConfig } from './settings.driver.mjs';
import { killAll, startSettingsApp } from './settings.session.mjs';

after(killAll);

test('l：退出重启后改动保留（AC-R5-5）', { timeout: 300000 }, async () => {
  const userData = freshUserData('persist');
  const port = await freePort();
  const newOutbox = path.join(userData, 'persist-outbox');
  writeConfig(userData, {
    port,
    outboxDir: path.join(userData, 'outbox'),
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  });

  // ---- 第一次运行：改开关 / 改名 / 改交付目录 ----
  const app1 = await startSettingsApp({ userData });
  try {
    const rt1 = await waitFor(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
      } catch {
        return null;
      }
    }, 90000, 250);
    assert.ok(rt1, '第一次启动应写 runtime.json');

    await app1.click('[data-worker-id="w-1"] [data-toggle="thinking"]');
    await app1.click('[data-worker-id="w-1"] [data-toggle="search"]');
    await app1.eval(
      `(() => { const i = document.querySelector('[data-worker-id="w-1"] [data-field="name"]'); i.value = '深索一号'; i.dispatchEvent(new Event('blur')); })()`,
    );
    const patched = await app1.evalJson(`window.fo.patch({ op: 'outbox.set', dir: ${JSON.stringify(newOutbox)} })`);
    assert.deepEqual(patched, { ok: true }, '交付目录改动应成功');
    const changed = await waitFor(() => {
      const c = readConfig(userData);
      return c && c.workers[0].name === '深索一号' && c.workers[0].toggles.thinking === true && c.workers[0].toggles.search === true && c.outboxDir === newOutbox
        ? c
        : null;
    }, 10000, 200);
    assert.ok(changed, '三项改动（改名 / 两开关 / 交付目录）应全部落盘');

    assert.ok(await app1.quit(), '第一次运行应能优雅退出');
    const removed = await waitFor(() => (fs.existsSync(path.join(userData, 'runtime.json')) ? null : true), 10000, 200);
    assert.ok(removed, '优雅退出应删除 runtime.json（b1 契约）');
  } finally {
    app1.kill();
  }

  // ---- 第二次运行（同一 userData）：全部保留 ----
  const app2 = await startSettingsApp({ userData });
  try {
    const rt2 = await waitFor(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
      } catch {
        return null;
      }
    }, 90000, 250);
    assert.ok(rt2, '重启后应写 runtime.json');
    assert.equal(rt2.port, port, '重启后仍按配置端口服务');

    const ui = await app2.evalJson(`({
      name: document.querySelector('[data-worker-id="w-1"] [data-field="name"]').value,
      toggles: Array.from(document.querySelectorAll('[data-worker-id="w-1"] [data-toggle]')).map(b => ({ k: b.getAttribute('data-toggle'), v: b.checked })),
    })`);
    assert.equal(ui.name, '深索一号', '重启后行名应保留（config.json 载入）');
    assert.deepEqual(
      ui.toggles,
      [{ k: 'thinking', v: true }, { k: 'search', v: true }],
      '重启后开关勾选态应保留',
    );
    await app2.click('[data-page="outbox"]');
    assert.equal(
      await app2.eval(`document.querySelector('[data-field="outbox-actual"]').textContent`),
      path.resolve(newOutbox),
      '重启后交付目录应显示改动后的实际路径',
    );
    assert.equal(readConfig(userData).outboxDir, newOutbox, 'config.json 的交付目录改动应保留');
    const hz = await healthz(rt2.port);
    assert.equal(hz.workers[0].name, '深索一号', '/healthz 应见改动后的名字');
    console.log(
      `[verify:settings·l 读数] 重启后 name=${ui.name} toggles=${JSON.stringify(ui.toggles)} outbox=${readConfig(userData).outboxDir} · /healthz name=${hz.workers[0].name} · 退出即删 runtime.json=true`,
    );

    assert.ok(await app2.quit(), '第二次运行应能优雅退出');
  } finally {
    app2.kill();
  }
});
