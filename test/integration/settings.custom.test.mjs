/**
 * `verify:settings` 场景组 · 自定义外包工（b7/T2 · R11）
 *
 * 判据来源：批次档 b7 §2「验收对照」3 + 设计档 `docs/design/modules/settings-app.md` §8（自定义外包工行）。
 *   ① 入口：新增对话框内 `[data-platform="custom"]` 存在且可用（清单 = 快照 platforms，b7 起三项）；
 *   ② 非法输入不提交：链接非法 / 名称重复 ⇒ 行内 `[data-field=custom-error]` 报错、config.json 不增条目（界面不做本地猜测）；
 *   ③ 新增（名称 + 链接）⇒ config.json 落盘（url 逐字一致）+ `list_workers` / `/healthz` 双读可见（AC-R11-1）；
 *   ④ 界面如实标注：行内 `[data-field=custom-hint]`（含「实验性」「主包AI」）· `[data-field=custom-limits]`
 *      （含「送件（附件）」「下载」「新建会话」）· `[data-field=toggles-unsupported]`（含「深度思考」「联网搜索」）·
 *      自定义行 0 个 `[data-toggle]`；custom 平台按钮处同文提示（F11.5）；
 *   ⑤ 驱动参数（F11.3 接口面）：`[data-action=driver]` ⇒ `[data-driver-dialog]` 三键保存 ⇒ config.json 落盘、重开回读一致；
 *      另：超长选择器 ⇒ `[data-field=driver-error]` 行内报错 + 不落盘（界面不静默接受）。
 *      反向断言：内置平台行零变化（无自定义行专属元素）——b7 冻结边界。
 *
 * 环境口径：起应用剥 `ELECTRON_RUN_AS_NODE`；`FO_USER_DATA` 隔离到 `.thincoder/tmp/verify-settings/`（与既有件同）；
 * 中文断言一律在渲染层求值（UTF-8 感知，不用 findstr）。驱动 = `settings.session.mjs`；读数工具 = `settings.driver.mjs`。
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
  waitConfig,
  waitFor,
  writeConfig,
} from './settings.driver.mjs';
import { killAll, startSettingsApp } from './settings.session.mjs';

after(killAll);

const CUSTOM_URL = 'https://custom.example.com/chat';
const DRIVER = { inputSelector: '#prompt textarea', sendButtonSelector: 'button.send-btn', replySelector: '.messages .item' };
const DRIVER_VALUES = [DRIVER.inputSelector, DRIVER.sendButtonSelector, DRIVER.replySelector];

test('b7 自定义外包工：入口 / 非法不提交 / 新增双读 / 界面标注 / 驱动参数写读（AC-R11-1 · AC-R11-3 界面侧）', { timeout: 300000 }, async () => {
  const userData = freshUserData('custom');
  const port = await freePort();
  const outboxDir = path.join(userData, 'outbox');
  writeConfig(userData, {
    port,
    outboxDir,
    workers: [{ id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } }],
  });
  const session = await startSettingsApp({ userData });
  try {
    const rt = await waitFor(() => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(userData, 'runtime.json'), 'utf8'));
        return r && r.port ? r : null;
      } catch {
        return null;
      }
    }, 90000);
    assert.ok(rt, '应用未在预算内写 runtime.json');
    const mcp = await makeMcpClient(rt.port);

    const errorText = () =>
      session.eval(
        `(() => { const n = document.querySelector('[data-field="custom-error"]'); return n && !n.hidden ? n.textContent : null; })()`,
      );

    // ---- ① 入口：新增对话框内 [data-platform="custom"] 存在且可用 ----
    await session.click('[data-action="add-worker"]');
    assert.equal(
      await session.waitDom(`document.querySelector('[data-platform-list] [data-platform="custom"]') ? 'y' : null`),
      'y',
      '新增对话框应出现「自定义」入口（快照 platforms 驱动）',
    );
    const platList = await session.evalJson(
      `Array.from(document.querySelectorAll('[data-platform-list] [data-platform]')).map(b => ({ id: b.getAttribute('data-platform'), disabled: b.disabled, text: b.textContent }))`,
    );
    assert.deepEqual(platList.map((p) => p.id), ['deepseek', 'kimi', 'custom'], '平台清单 = 快照 platforms（b7 随动为三项）');
    assert.equal(platList[2].disabled, false, '「自定义」应可选');
    assert.ok(platList[2].text.startsWith('自定义'), `标签只写「自定义」（实验性只在提示文案里）：${platList[2].text}`);
    assert.ok(
      platList[2].text.includes('实验性') && platList[2].text.includes('主包AI'),
      `custom 按钮处应带提示文案（F11.5）：${platList[2].text}`,
    );

    // ---- 表单：同一对话框内展开（不新开对话框）+ 表单内提示 ----
    await session.click('[data-platform="custom"]');
    assert.equal(
      await session.waitDom(`document.querySelector('[data-custom-form]').hidden === false ? 'y' : null`),
      'y',
      '点「自定义」应在同一对话框内展开表单',
    );
    const formView = await session.evalJson(`({
      dialogOpen: !document.querySelector('[data-add-dialog]').hidden,
      listHidden: document.querySelector('[data-platform-list]').hidden,
      name: !!document.querySelector('[data-field="custom-name"]'),
      url: !!document.querySelector('[data-field="custom-url"]'),
      submit: !!document.querySelector('[data-action="custom-submit"]'),
      back: !!document.querySelector('[data-action="custom-back"]'),
      hint: (document.querySelector('[data-custom-form] .custom-hint-text') || {}).textContent || '',
    })`);
    assert.equal(formView.dialogOpen, true, '表单在同一 [data-add-dialog] 内（不新开对话框）');
    assert.equal(formView.listHidden, true, '展开表单时平台清单让位');
    assert.ok(formView.name && formView.url && formView.submit && formView.back, '表单锚点齐备（字段 ×2 + 提交 / 返回）');
    assert.ok(formView.hint.includes('实验性') && formView.hint.includes('主包AI'), `表单内提示文案（F11.5）：${formView.hint}`);

    // ---- ② 非法输入 ⇒ 不提交 + 行内报错（服务端校验，界面不做本地猜测） ----
    const fillForm = (name, url) =>
      session.eval(
        `(() => { document.querySelector('[data-field="custom-name"]').value = ${JSON.stringify(name)}; document.querySelector('[data-field="custom-url"]').value = ${JSON.stringify(url)}; })()`,
      );
    const submitForm = () => session.click('[data-action="custom-submit"]');

    await fillForm('某站点AI', 'not-a-url');
    await submitForm();
    const errUrl = await waitFor(() => errorText(), 10000);
    assert.ok(errUrl, '链接非法应回显行内错误（不静默）');
    assert.equal(readConfig(userData).workers.length, 1, '链接非法不得提交（config.json 不增条目）');
    assert.equal(await session.eval(`document.querySelector('[data-add-dialog]').hidden`), false, '被拒后对话框保持打开');

    await fillForm('DeepSeek', CUSTOM_URL); // 名称与既有条目重复（列表内唯一）
    await submitForm();
    const errDup = await waitFor(async () => {
      const t = await errorText();
      return t && t !== errUrl ? t : null;
    }, 10000);
    assert.ok(errDup, '名称重复应回显行内错误');
    assert.equal(readConfig(userData).workers.length, 1, '名称重复不得提交');

    // ---- ③ 合法提交 ⇒ config.json 落盘 + list_workers / /healthz 双读（AC-R11-1） ----
    await fillForm('某站点AI', CUSTOM_URL);
    await submitForm();
    const added = await waitConfig(userData, (c) => (c.workers.length === 2 ? c : null), 15000);
    assert.ok(added, '合法提交应落盘');
    const w = added.workers.find((x) => x.platform === 'custom');
    assert.ok(w && w.id, '落盘条目应为 platform=custom');
    assert.equal(w.url, CUSTOM_URL, 'url 应逐字一致');
    assert.equal(w.name, '某站点AI', 'name 应落盘');
    assert.equal(w.enabled, true, '默认启用');
    const lw = await mcp.call('list_workers', {});
    assert.ok(!lw.isError && lw.data.workers.some((x) => x.id === w.id), 'list_workers 应可见自定义外包工（AC-R11-1）');
    const hz = await healthz(rt.port);
    assert.ok(hz.workers.some((x) => x.id === w.id), '/healthz 应可见自定义外包工');
    assert.equal(
      await session.waitDom(`document.querySelector('[data-add-dialog]').hidden === true ? 'y' : null`),
      'y',
      '提交成功后对话框关闭',
    );
    console.log(
      `[verify:settings·custom 读数] 非法两例=不提交+行内报错（${errUrl} / ${errDup}） · 落盘=${w.id}/${w.name} platform=${w.platform} url=${w.url} enabled=${w.enabled} · list_workers=可见 · /healthz=可见`,
    );

    // ---- ④ 界面如实标注（R11 边界：四项不支持能力 + 实验性提示） ----
    assert.equal(
      await session.waitDom(`document.querySelector('[data-worker-id="${w.id}"] [data-field="custom-hint"]') ? 'y' : null`),
      'y',
      '自定义行应有常显提示',
    );
    const row = await session.evalJson(`(() => {
      const r = document.querySelector('[data-worker-id="${w.id}"]');
      const text = (sel) => { const n = r.querySelector(sel); return n ? n.textContent : null; };
      return {
        chip: text('.platform-chip'),
        hint: text('[data-field="custom-hint"]'),
        limits: text('[data-field="custom-limits"]'),
        unsupported: text('[data-field="toggles-unsupported"]'),
        toggles: r.querySelectorAll('[data-toggle]').length,
        driver: !!r.querySelector('[data-action="driver"]'),
      };
    })()`);
    assert.equal(row.chip, '自定义', '平台徽标 = 快照 label（只写「自定义」）');
    assert.ok(row.hint && row.hint.includes('实验性') && row.hint.includes('主包AI'), `行内提示应含「实验性」「主包AI」：${row.hint}`);
    assert.ok(
      row.limits && row.limits.includes('送件（附件）') && row.limits.includes('下载') && row.limits.includes('新建会话'),
      `不支持能力应如实标注（送件（附件）/ 下载捕获 / 新建会话）：${row.limits}`,
    );
    assert.ok(
      row.unsupported && row.unsupported.includes('深度思考') && row.unsupported.includes('联网搜索'),
      `平台开关不支持提示（既有锚点承载第 4 项）：${row.unsupported}`,
    );
    assert.equal(row.toggles, 0, '自定义行不渲染 [data-toggle]（能力位两子键均 false）');
    assert.equal(row.driver, true, '自定义行应有「驱动参数」按钮');
    // 反向断言：内置平台行零变化（b7 冻结边界——自定义行专属元素不得溢出到内置行）
    const builtinRow = await session.evalJson(`(() => {
      const r = document.querySelector('[data-worker-id="w-1"]');
      return {
        custom: r.querySelectorAll('[data-field="custom-hint"], [data-field="custom-limits"], [data-action="driver"]').length,
        chip: (r.querySelector('.platform-chip') || {}).textContent,
      };
    })()`);
    assert.equal(builtinRow.custom, 0, '内置平台行不得出现自定义行专属元素（内置平台行零变化）');
    assert.equal(builtinRow.chip, 'DeepSeek', '内置平台行徽标不变');

    // ---- ⑤ 驱动参数：保存 ⇒ 落盘；重开 ⇒ 回读一致（F11.3 的补充 / 修正接口） ----
    await session.click(`[data-worker-id="${w.id}"] [data-action="driver"]`);
    assert.equal(
      await session.waitDom(`document.querySelector('[data-driver-dialog]').hidden === false ? 'y' : null`),
      'y',
      '驱动参数对话框应打开',
    );
    const initial = await session.evalJson(`({
      values: ['driver-input', 'driver-send-button', 'driver-reply'].map(f => document.querySelector('[data-field="' + f + '"]').value),
      hint: (document.querySelector('[data-driver-dialog] .custom-hint-text') || {}).textContent || '',
    })`);
    assert.deepEqual(initial.values, ['', '', ''], '初次打开三键为空串（= 通用启发式）');
    assert.ok(initial.hint.includes('实验性') && initial.hint.includes('主包AI'), '驱动对话框应带同一提示文案');
    await session.eval(`(() => {
      const set = (f, v) => { document.querySelector('[data-field="' + f + '"]').value = v; };
      set('driver-input', ${JSON.stringify(DRIVER.inputSelector)});
      set('driver-send-button', ${JSON.stringify(DRIVER.sendButtonSelector)});
      set('driver-reply', ${JSON.stringify(DRIVER.replySelector)});
    })()`);
    await session.click('[data-action="driver-save"]');
    assert.equal(
      await session.waitDom(`document.querySelector('[data-driver-dialog]').hidden === true ? 'y' : null`),
      'y',
      '保存成功后对话框关闭',
    );
    const saved = await waitConfig(userData, (c) => {
      const x = c.workers.find((y) => y.id === w.id);
      return x && x.driver && x.driver.replySelector === DRIVER.replySelector ? c : null;
    }, 15000);
    assert.ok(saved, '三键应落盘（config.json）');
    assert.deepEqual(saved.workers.find((x) => x.id === w.id).driver, DRIVER, 'config.json 三键逐字一致');
    await session.click(`[data-worker-id="${w.id}"] [data-action="driver"]`);
    const readBack = await session.waitDom(
      `(() => {
        const d = document.querySelector('[data-driver-dialog]');
        if (!d || d.hidden) return null;
        const want = ${JSON.stringify(DRIVER_VALUES)};
        const got = ['driver-input', 'driver-send-button', 'driver-reply'].map(f => document.querySelector('[data-field="' + f + '"]').value);
        return got.every((v, i) => v === want[i]) ? got.join(' | ') : null;
      })()`,
      15000,
    );
    assert.equal(readBack, DRIVER_VALUES.join(' | '), '重开对话框应回读已保存三键（快照双读一致）');
    await session.click('[data-action="driver-close"]');
    assert.equal(
      await session.waitDom(`document.querySelector('[data-driver-dialog]').hidden === true ? 'y' : null`),
      'y',
      '关闭按钮应关对话框',
    );

    // ---- ⑤b 驱动对话框的拒绝路径：超长选择器 ⇒ 行内报错 + 不落盘（界面不静默接受） ----
    await session.click(`[data-worker-id="${w.id}"] [data-action="driver"]`);
    assert.equal(
      await session.waitDom(`document.querySelector('[data-driver-dialog]').hidden === false ? 'y' : null`),
      'y',
      '驱动对话框应可再次打开',
    );
    await session.eval(`document.querySelector('[data-field="driver-input"]').value = 'x'.repeat(201)`);
    await session.click('[data-action="driver-save"]');
    const driverErr = await waitFor(
      () =>
        session.eval(
          `(() => { const n = document.querySelector('[data-field="driver-error"]'); return n && !n.hidden ? n.textContent : null; })()`,
        ),
      10000,
    );
    assert.ok(driverErr, '超长选择器应回显行内错误（不静默）');
    assert.deepEqual(readConfig(userData).workers.find((x) => x.id === w.id).driver, DRIVER, '被拒的驱动参数不得落盘');
    await session.click('[data-action="driver-close"]');
    console.log(
      `[verify:settings·custom 界面读数] 行内提示=${row.hint} · 不支持标注=${row.limits} · 开关提示=${row.unsupported} · [data-toggle]=${row.toggles} · 驱动按钮=有`,
    );
    console.log(`[verify:settings·custom 驱动读数] config.driver=${JSON.stringify(DRIVER)} · 重开回读=${readBack}`);

    assert.ok(await session.quit(), '应用应能优雅退出');
  } finally {
    session.kill();
  }
});
