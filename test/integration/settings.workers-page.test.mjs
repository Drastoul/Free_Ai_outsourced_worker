/**
 * `verify:settings` 场景组 · 窗口与外包工页（a–g、h）+ 窗口关闭存活
 *
 * a 窗口与四页签（含关闭窗口后应用仍存活—/healthz 200）· b 新增 ⇒ config + `list_workers` / `/healthz` 双读（AC-R5-1）·
 * c 删除 + 二次确认（取消保留 / 确认移除；AC-R5-2）· d 调序 ⇒ config 与 `/healthz` 顺序随动（AC-R5-3）·
 * e 改名 + 旧名 `E_WORKER_UNKNOWN` 且不建任务（AC-R5-4）· f 开关 ⇒ config 与快照双读 + DOM 回显（AC-R8-2 界面侧，
 * 快照读面 = service.mjs 曾出缺陷处）· f3 会话复用块（b6/T7）：快照三键 / 控件四锚点 / 非法回滚 / 合法写双读 ·
 * g 交付目录两段：非法拒绝且不落配置 / 合法落盘且界面显示实际路径（AC-R5-6 界面侧）·
 * h Kimi 可选且经 `worker.add` 落盘（b3 T3；平台行已可选，不再灰显）· h·b6（T3）Kimi 行按子键门控（恰 1 个
 * `[data-toggle]` = search、「深度思考」行内提示、快照 `platforms[].toggles` 子键对象）；b 的平台清单断言随 b7 为三项
 * （deepseek / kimi / custom；自定义的完整流程在 `settings.custom.test.mjs`）。
 *
 * 驱动 = `settings.session.mjs`（`_electron` 主路径，CDP 备选）；读数工具 = `settings.driver.mjs`。
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  freePort,
  freshUserData,
  healthz,
  makeMcpClient,
  readConfig,
  sleep,
  waitConfig,
  waitFor,
  writeConfig,
} from './settings.driver.mjs';
import { killAll, startSettingsApp } from './settings.session.mjs';

after(killAll);

test('a–g：窗口/新增/删除/调序/改名/开关双读/交付目录 + Kimi 落盘（AC-R5-1..4 · AC-R8-2 · AC-R5-6）', { timeout: 300000 }, async () => {
  const userData = freshUserData('workers');
  const port = await freePort();
  const outboxDir = path.join(userData, 'outbox');
  writeConfig(userData, {
    port,
    outboxDir,
    workers: [
      { id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: true, search: false } },
      { id: 'w-2', platform: 'deepseek', name: '备用机', enabled: true, toggles: { thinking: false, search: false } },
    ],
  });
  const session = await startSettingsApp({ userData });
  try {
    const rt = await waitFor(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
      } catch {
        return null;
      }
    }, 90000);
    assert.ok(rt, '应用未在预算内写 runtime.json');
    assert.equal(rt.port, port, '期望端口可用时应按之启动');
    const mcp = await makeMcpClient(rt.port);

    // ---- a：窗口与四页签 ----
    const tabs = await session.evalJson(
      `Array.from(document.querySelectorAll('[data-page]')).map(t => ({ p: t.getAttribute('data-page'), visible: t.getBoundingClientRect().width > 0 }))`,
    );
    assert.deepEqual(tabs.map((t) => t.p), ['workers', 'guide', 'outbox', 'about'], '四页签 = 外包工/接入指引/交付目录/关于');
    assert.ok(tabs.every((t) => t.visible), '四页签应可见');
    for (const p of ['guide', 'outbox', 'about', 'workers']) {
      await session.click(`[data-page="${p}"]`);
      const state = await session.evalJson(`({
        visible: Array.from(document.querySelectorAll('[data-page-panel]')).filter(el => !el.hidden).map(el => el.getAttribute('data-page-panel')),
        active: Array.from(document.querySelectorAll('[data-page]')).filter(el => el.classList.contains('is-active')).map(el => el.getAttribute('data-page')),
      })`);
      assert.deepEqual(state.visible, [p], `面板随页签切换（${p}）`);
      assert.deepEqual(state.active, [p], `is-active 同步（${p}）`);
    }

    // ---- b：新增 ⇒ config.json + list_workers / /healthz 双读可见（AC-R5-1）----
    await session.click('[data-action="add-worker"]');
    const dlg = await session.evalJson(`({
      open: !document.querySelector('[data-add-dialog]').hidden,
      platforms: Array.from(document.querySelectorAll('[data-platform-list] [data-platform]')).map(b => ({ id: b.getAttribute('data-platform'), disabled: b.disabled, text: b.textContent })),
    })`);
    assert.ok(dlg.open, '新增对话框应打开');
    assert.deepEqual(dlg.platforms.map((p) => p.id), ['deepseek', 'kimi', 'custom'], '平台清单 = 快照 platforms（b7 随动为三项）');
    assert.equal(dlg.platforms[0].disabled, false, 'DeepSeek 可选');
    assert.equal(dlg.platforms[1].disabled, false, 'Kimi 可选（b3 适配器已注册，不灰显）');
    assert.ok(!dlg.platforms[1].text.includes('待支持'), 'Kimi 不标「待支持」');
    assert.equal(dlg.platforms[2].disabled, false, '自定义可选（b7 适配器已注册，不灰显）');
    assert.ok(dlg.platforms[2].text.startsWith('自定义'), `自定义行标签只写「自定义」：${dlg.platforms[2].text}`);
    await session.click('[data-platform="deepseek"]');
    const added = await waitConfig(userData, (c) => c.workers.length === 3);
    assert.ok(added, '新增后 config.json 未出现新条目');
    const newWorker = added.workers[2];
    assert.equal(newWorker.name, 'DeepSeek 2', '默认名 = 平台名（已占 ⇒ 唯一化）');
    assert.equal(newWorker.enabled, true);
    assert.deepEqual(newWorker.toggles, { thinking: false, search: false }, 'toggles 默认关');
    const lw1 = await mcp.call('list_workers', {});
    assert.ok(!lw1.isError && lw1.data.workers.some((w) => w.id === newWorker.id), 'list_workers 应可见新条目');
    const hz1 = await healthz(rt.port);
    assert.ok(hz1.workers.some((w) => w.id === newWorker.id), '/healthz 应可见新条目');
    // 对话框关闭在 IPC 回值之后 ⇒ 用有界等待（不与其他断言抢窗口）
    assert.equal(await session.waitDom(`document.querySelector('[data-add-dialog]').hidden === true ? 'y' : null`), 'y', '提交后对话框关闭');
    console.log(`[verify:settings·b 读数] 新条目=${newWorker.id}/${newWorker.name} enabled=${newWorker.enabled} toggles=${JSON.stringify(newWorker.toggles)} · list_workers=可见 · /healthz=可见`);

    // ---- c：删除 + 二次确认（取消保留 / 确认移除；AC-R5-2）----
    await session.click(`[data-worker-id="${newWorker.id}"] [data-action="delete"]`);
    const confirmView = await session.evalJson(
      `({ open: !document.querySelector('[data-confirm]').hidden, text: document.querySelector('[data-field="confirm-text"]').textContent })`,
    );
    assert.ok(confirmView.open, '确认框应出现');
    assert.ok(confirmView.text.includes('浏览器配置目录保留'), `确认框文案应含「浏览器配置目录保留」：${confirmView.text}`);
    assert.ok(confirmView.text.includes('已排队的任务会改派或转人工'), `确认框文案应含排队任务处置：${confirmView.text}`);
    await session.click('[data-action="confirm-no"]');
    await sleep(400);
    const keptAfterCancel = readConfig(userData).workers.length;
    assert.equal(keptAfterCancel, 3, '取消后条目应保留');
    assert.equal(await session.eval(`document.querySelector('[data-confirm]').hidden`), true, '取消后确认框关闭');
    await session.click(`[data-worker-id="${newWorker.id}"] [data-action="delete"]`);
    await session.click('[data-action="confirm-yes"]');
    const afterDel = await waitConfig(userData, (c) => c.workers.length === 2);
    assert.ok(afterDel && !afterDel.workers.some((w) => w.id === newWorker.id), '确认后 config.json 不再出现');
    const lw2 = await mcp.call('list_workers', {});
    assert.ok(!lw2.data.workers.some((w) => w.id === newWorker.id), 'list_workers 不再出现');
    const hz2 = await healthz(rt.port);
    assert.ok(!hz2.workers.some((w) => w.id === newWorker.id), '/healthz 不再出现');
    assert.ok(await session.waitDom(`document.querySelectorAll('[data-worker-id]').length === 2 ? 'y' : null`), 'DOM 行应随动');
    console.log(`[verify:settings·c 读数] 确认框文案含两边界 · 取消⇒保留 ${keptAfterCancel} 条 · 确认⇒config/list_workers=/healthz 均移除 · DOM 行=2`);

    // ---- d：调序 ⇒ config 与 /healthz 顺序随动（AC-R5-3）----
    await session.click('[data-worker-id="w-2"] [data-action="up"]');
    const moved = await waitConfig(userData, (c) => c.workers[0].id === 'w-2');
    assert.ok(moved, '上移后 config 顺序未随动');
    const hz3 = await healthz(rt.port);
    assert.equal(hz3.workers[0].id, 'w-2', '/healthz 顺序应随动');
    const domOrderUp = await session.waitDom(`(() => { const ids = Array.from(document.querySelectorAll('[data-worker-id]')).map(r => r.getAttribute('data-worker-id')).join(','); return ids === 'w-2,w-1' ? ids : null; })()`);
    assert.equal(domOrderUp, 'w-2,w-1', 'DOM 顺序应随动');
    const btnEdges = await session.evalJson(`({
      upFirst: document.querySelector('[data-worker-id="w-2"] [data-action="up"]').disabled,
      downLast: document.querySelector('[data-worker-id="w-1"] [data-action="down"]').disabled,
    })`);
    assert.equal(btnEdges.upFirst, true, '首行「上移」应禁用');
    assert.equal(btnEdges.downLast, true, '末行「下移」应禁用');
    await session.click('[data-worker-id="w-2"] [data-action="down"]');
    assert.ok(await waitConfig(userData, (c) => c.workers[0].id === 'w-1'), '下移应复位顺序');
    console.log(`[verify:settings·d 读数] 上移后顺序 config=[w-2,w-1] / /healthz=${hz3.workers.map((w) => w.id).join(',')} / DOM=${domOrderUp} · 首/末按钮禁用=${btnEdges.upFirst}/${btnEdges.downLast} · 下移复位`);

    // ---- e：改名 + 旧名 E_WORKER_UNKNOWN 且不建任务（AC-R5-4）----
    const rename = async (value) =>
      session.eval(
        `(() => { const i = document.querySelector('[data-worker-id="w-2"] [data-field="name"]'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('blur')); })()`,
      );
    await rename('备用机二号');
    assert.ok(await waitConfig(userData, (c) => c.workers[1].name === '备用机二号'), '改名应落盘');
    const lw3 = await mcp.call('list_workers', {});
    assert.ok(lw3.data.workers.some((w) => w.name === '备用机二号'), 'list_workers 应见新名');
    await rename('备用机三号');
    assert.ok(await waitConfig(userData, (c) => c.workers[1].name === '备用机三号'), '二次改名应落盘');
    const dirsBefore = fs.readdirSync(outboxDir).length;
    const bad = await mcp.call('dispatch_task', { task: '旧名派单不应建任务', worker: '备用机二号', waitSeconds: 0 });
    assert.equal(bad.isError, true, `旧名派单应被拒：${bad.raw}`);
    assert.equal(bad.data?.code, 'E_WORKER_UNKNOWN', `错误码应为 E_WORKER_UNKNOWN：${bad.raw}`);
    await sleep(600);
    assert.equal(fs.readdirSync(outboxDir).length, dirsBefore, '旧名派单不得建任务（outbox 无新目录）');
    console.log(`[verify:settings·e 读数] 新名=${readConfig(userData).workers[1].name} · 旧名派单 code=${bad.data?.code}（isError=${bad.isError}） · outbox 目录数=${dirsBefore}→${fs.readdirSync(outboxDir).length}`);

    // ---- f：开关 ⇒ config + 快照双读（+DOM 回显；AC-R8-2 界面侧）----
    const snapToggles = (id) =>
      session.evalJson(`window.fo.getSnapshot().then(s => s.workers.find(w => w.id === ${JSON.stringify(id)}).toggles)`);
    const domToggles = (id) =>
      session.evalJson(`Array.from(document.querySelectorAll('[data-worker-id="${id}"] [data-toggle]')).map(b => ({ k: b.getAttribute('data-toggle'), v: b.checked }))`);
    assert.deepEqual(await snapToggles('w-1'), { thinking: true, search: false }, '初始：快照 toggles == 配置值（读面回归）');
    await session.click('[data-worker-id="w-1"] [data-toggle="search"]');
    const c1 = await waitConfig(userData, (c) => c.workers[0].toggles.search === true);
    assert.ok(c1, '开关改动应落盘');
    assert.equal(c1.workers[0].toggles.thinking, true, '不得覆盖另一键');
    const snap1 = await snapToggles('w-1');
    assert.deepEqual(snap1, c1.workers[0].toggles, '快照读面 toggles 应 == config.json 值（双读）');
    assert.deepEqual(snap1, { thinking: true, search: true });
    assert.deepEqual(await domToggles('w-1'), [{ k: 'thinking', v: true }, { k: 'search', v: true }], 'DOM 勾选态应随动');
    await session.click('[data-worker-id="w-1"] [data-toggle="thinking"]');
    assert.ok(await waitConfig(userData, (c) => c.workers[0].toggles.thinking === false));
    assert.deepEqual(await snapToggles('w-1'), { thinking: false, search: true }, '反方向同样双读一致');
    assert.deepEqual(await domToggles('w-2'), [{ k: 'thinking', v: false }, { k: 'search', v: false }], '另一行不受影响');
    console.log(
      `[verify:settings·f 读数] config=${JSON.stringify((await waitConfig(userData, (c) => c.workers[0].toggles.search === true && c.workers[0].toggles.thinking === false)).workers[0].toggles)} · 快照=${JSON.stringify(await snapToggles('w-1'))} · DOM=${JSON.stringify(await domToggles('w-1'))}`,
    );

    // ---- f2：启用开关 ⇒ config + 徽标随动（T6 界面接线守门）----
    await session.click('[data-worker-id="w-1"] [data-field="enabled"]');
    assert.ok(await waitConfig(userData, (c) => c.workers[0].enabled === false), '停用应落盘');
    assert.equal(
      await session.waitDom(`document.querySelector('[data-worker-id="w-1"] [data-field="status"]').getAttribute('data-state') === 'disabled' ? 'y' : null`),
      'y',
      '停用 ⇒ 徽标应随动',
    );
    await session.click('[data-worker-id="w-1"] [data-field="enabled"]');
    assert.ok(await waitConfig(userData, (c) => c.workers[0].enabled === true), '再启用应落盘');
    assert.equal(
      await session.waitDom(`document.querySelector('[data-worker-id="w-1"] [data-field="status"]').getAttribute('data-state') === 'ready' ? 'y' : null`),
      'y',
      '再启用 ⇒ 徽标回 ready',
    );
    console.log('[verify:settings·f2 读数] enabled 停用/启用 ⇒ config=false/true + 徽标=disabled/ready');

    // ---- f3：会话复用块（b6/T7）—— 快照三键 / 控件四锚点 / 非法回滚 / 合法写双读 ----
    const snapSession = await session.evalJson(`window.fo.getSnapshot().then(s => s.session)`);
    assert.deepEqual(snapSession, { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 }, '快照 session 三键 == 配置默认值');
    const sessCtrl = await session.evalJson(`({ policy: !!document.querySelector('[data-field="session-policy"]'),
      reuse: document.querySelector('[data-field="session-reuse"]').checked,
      ttl: document.querySelector('[data-field="session-ttl-ms"]').value, maxTasks: document.querySelector('[data-field="session-max-tasks"]').value,
      innerToggles: document.querySelectorAll('[data-field="session-policy"] [data-toggle]').length })`);
    assert.equal(sessCtrl.policy, true, '会话块容器锚点存在（冻结接口五锚点之一）');
    assert.equal(sessCtrl.reuse, true, '复用开关勾选 == 快照');
    assert.equal(sessCtrl.ttl, '600000', '空闲 TTL 值 == 快照');
    assert.equal(sessCtrl.maxTasks, '5', '单会话任务上限值 == 快照');
    assert.equal(sessCtrl.innerToggles, 0, '会话块内不得出现行级 [data-toggle] 锚点（与行级隔离）');
    await session.eval(`(() => { const i = document.querySelector('[data-field="session-ttl-ms"]'); i.value = '-1'; i.dispatchEvent(new Event('change')); })()`);
    assert.equal(await session.waitDom(`document.querySelector('[data-field="session-ttl-ms"]').value === '600000' ? 'y' : null`), 'y', '非法输入应回滚为快照值');
    assert.equal(await session.eval(`document.querySelector('[data-field="session-error"]').hidden`), false, '非法输入应出现行内提示');
    assert.equal((readConfig(userData).session || {}).ttlMs ?? 600000, 600000, '非法输入不得落盘');
    const sessPatched = await session.evalJson(`window.fo.patch({ op: 'session.set', reuse: false })`);
    assert.deepEqual(sessPatched, { ok: true }, '合法写应被接受');
    assert.ok(await waitConfig(userData, (c) => c.session && c.session.reuse === false), '合法写应落盘');
    const reuseAfter = await session.evalJson(`window.fo.getSnapshot().then(s => s.session.reuse)`);
    assert.equal(reuseAfter, false, '快照双读一致（config 与快照同值）');
    const badSessionOp = await session.evalJson(`window.fo.patch({ op: 'session.set', ttlMs: -1 })`);
    assert.equal(badSessionOp.ok, false, '直调非法 op 应被拒');
    assert.match(badSessionOp.error, /ttlMs/, `拒绝原因应明示：${JSON.stringify(badSessionOp)}`);
    assert.equal((readConfig(userData).session || {}).ttlMs ?? 600000, 600000, '非法 op 不得落盘');
    console.log(`[verify:settings·f3 读数] 快照=${JSON.stringify(snapSession)} · 控件=${JSON.stringify(sessCtrl)} · 非法输入⇒值回滚+错误行可见+未落盘 · 合法写⇒config.reuse=${readConfig(userData).session.reuse} 快照.reuse=${reuseAfter} · 直调非法⇒ok=${badSessionOp.ok}（${badSessionOp.error}）`);

    // ---- g：交付目录两段（AC-R5-6 界面侧）----
    fs.writeFileSync(path.join(userData, 'blocker'), 'file', 'utf8'); // 父路径是文件 ⇒ 该目录不可用
    const badDir = path.join(userData, 'blocker', 'sub');
    const rejected = await session.evalJson(`window.fo.patch({ op: 'outbox.set', dir: ${JSON.stringify(badDir)} })`);
    assert.equal(rejected.ok, false, '非法目录应被拒');
    assert.match(rejected.error, /不可用/, `拒绝原因应明示：${JSON.stringify(rejected)}`);
    assert.equal(readConfig(userData).outboxDir, outboxDir, '非法目录不得落配置');
    await session.eval('window.FOUI.refresh()'); // refresh() 返回 Promise（eval 会等它；渲染在 resolve 前已完成）
    assert.equal(
      await session.waitDom(`document.querySelector('[data-field="outbox-actual"]').textContent === ${JSON.stringify(path.resolve(outboxDir))} ? 'y' : null`),
      'y',
      '被拒后界面应仍显示原实际目录（不静默接受）',
    );
    const goodDir = path.join(userData, 'new-outbox');
    const accepted = await session.evalJson(`window.fo.patch({ op: 'outbox.set', dir: ${JSON.stringify(goodDir)} })`);
    assert.deepEqual(accepted, { ok: true }, '合法目录应接受');
    assert.ok(await waitConfig(userData, (c) => c.outboxDir === goodDir), '合法目录应落盘');
    await session.eval('window.FOUI.refresh()');
    assert.equal(
      await session.waitDom(`document.querySelector('[data-field="outbox-actual"]').textContent === ${JSON.stringify(path.resolve(goodDir))} ? 'y' : null`),
      'y',
      '界面应显示新的实际交付目录',
    );
    console.log(`[verify:settings·g 读数] 非法⇒ok=${rejected.ok}（${rejected.error}）且 config.outboxDir 未变 · 合法⇒落盘=${goodDir} 界面显示=${path.resolve(goodDir)}`);

    // ---- h：Kimi 经 worker.add 落盘（b3 T3 验收「Kimi 经 worker.add 落盘（设置面单测）」；平台行已可选）----
    await session.click('[data-action="add-worker"]');
    assert.equal(await session.waitDom(`document.querySelector('[data-add-dialog]').hidden === false ? 'y' : null`), 'y', '新增对话框应再次打开');
    await session.click('[data-platform="kimi"]');
    const withKimi = await waitConfig(userData, (c) => c.workers.some((w) => w.platform === 'kimi'));
    assert.ok(withKimi, 'Kimi 新增未落盘');
    const kimiWorker = withKimi.workers.find((w) => w.platform === 'kimi');
    assert.equal(kimiWorker.name, 'Kimi', '默认名 = 平台名');
    assert.equal(kimiWorker.enabled, true);
    assert.deepEqual(kimiWorker.toggles, { thinking: false, search: false }, 'toggles 默认关');
    const lwK = await mcp.call('list_workers', {});
    assert.ok(!lwK.isError && lwK.data.workers.some((w) => w.id === kimiWorker.id), 'list_workers 应可见 Kimi 条目');
    const hzK = await healthz(rt.port);
    assert.ok(hzK.workers.some((w) => w.id === kimiWorker.id), '/healthz 应可见 Kimi 条目');
    console.log(`[verify:settings·h 读数] Kimi 落盘=${kimiWorker.id}/${kimiWorker.name} platform=${kimiWorker.platform} toggles=${JSON.stringify(kimiWorker.toggles)} · list_workers=可见 · /healthz=可见`);
    // ---- h·b6（T3）：Kimi 行按子键门控 —— 恰 1 个 [data-toggle]（search）+ 不受支持子键行内提示 + 快照子键对象 ----
    const kimiGated = await session.waitDom(`(() => { const row = document.querySelector('[data-worker-id="${kimiWorker.id}"]'); if (!row) return null; const t = row.querySelectorAll('[data-toggle]'); return t.length === 1 && t[0].getAttribute('data-toggle') === 'search' ? 'y' : null; })()`);
    assert.equal(kimiGated, 'y', 'Kimi 行应恰 1 个开关（search；thinking 无控件）');
    const kimiUnsupported = await session.evalJson(`(() => { const n = document.querySelector('[data-worker-id="${kimiWorker.id}"] [data-field="toggles-unsupported"]'); return n ? n.textContent : null; })()`);
    assert.ok(kimiUnsupported && kimiUnsupported.includes('深度思考'), `不受支持子键应有行内提示：${kimiUnsupported}`);
    const platToggles = await session.evalJson(`window.fo.getSnapshot().then(s => Object.fromEntries(s.platforms.map(p => [p.id, p.toggles])))`);
    assert.deepEqual(platToggles.deepseek, { thinking: true, search: true }, '快照 platforms[].toggles：DeepSeek 两子键支持');
    assert.deepEqual(platToggles.kimi, { thinking: false, search: true }, '快照 platforms[].toggles：Kimi 仅 search');
    console.log(`[verify:settings·h·b6 读数] Kimi 行 [data-toggle] 恰 1=[search] · 提示行=${kimiUnsupported} · platforms.toggles=${JSON.stringify(platToggles)}`);
    // 清理：删除该条目（保持与既有断言无耦合）
    await session.click(`[data-worker-id="${kimiWorker.id}"] [data-action="delete"]`);
    await session.click('[data-action="confirm-yes"]');
    assert.ok(await waitConfig(userData, (c) => !c.workers.some((w) => w.id === kimiWorker.id)), '清理：Kimi 条目应可删');

    // ---- a 尾：关闭设置窗口 ⇒ 应用仍存活（/healthz 仍 200）----
    await session.closeWindow();
    const alive = await waitFor(async () => {
      const h = await healthz(rt.port);
      return h && h.ok === true ? h : null;
    }, 15000);
    assert.ok(alive, '关闭设置窗口后应用应仍存活（/healthz 仍可探活）');
    console.log(`[verify:settings·a 读数] 四页签=${tabs.map((t) => t.p).join('/')} 全可见=${tabs.every((t) => t.visible)} · 面板+is-active 四页逐一切换 · 关窗后 /healthz ok=${alive.ok}`);

    assert.ok(await session.quit(), '应用应能优雅退出');
  } finally {
    session.kill();
  }
});
