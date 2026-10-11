/**
 * `verify:pack` 段 D：首启引导（F6.3 / 裁定 ③；P2 段 D）。
 *
 * 读数口径：
 *   · 空 userData（无 config.json）+ **显式清空 `FO_OPEN_SETTINGS`**——b2 驱动默认置 '1' ⇒ 窗口会先落
 *     `workers`、guide 断言必失败（b4 切分 2 上抛 #1；处置照切分 2 首启直验 A）
 *   · ① 设置窗口存在（CDP 取到窗口 = 存在）∧ ② 激活页 =「接入指引」（`[data-page="guide"].is-active`
 *     + 面板可见）∧ ③ `[data-field="mcp-url"]` == 实际地址（runtime.json.url）∧ ④ 日志「首次运行」行
 *   · 附：窗口 URL 带 `?page=guide`（冻结面「设置窗口初始页接缝」的消费面）；首启落盘配置 = 出厂默认
 *     （`mode=chromium` / `channel=''`，T2-④）
 *   · 真实交付目录（出厂默认 `D:\\免费外包\\outbox`）零落痕：首启默认配置指向它，启动期只做可写性
 *     探测（瞬时建删）+ 非终态扫描；运行前后条目 / manifest 摘要一致 = 测试未扰动真实数据
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_OUTBOX_DIR } from '../../src/shared/outbox.mjs';
import { freshUserData, readAppLog, readRuntime, waitFor } from './pack.driver.mjs';
import { killAll, startPackApp } from './pack.session.mjs';

after(killAll);

/** 真实交付目录只读快照（条目 / 各目录内层条目 / manifest 摘要）——零落痕核对用 */
function realOutboxSnapshot() {
  let names = [];
  try {
    names = fs.readdirSync(DEFAULT_OUTBOX_DIR).sort();
  } catch (e) {
    return { error: String(e?.code || e) };
  }
  const snap = {};
  for (const n of names) {
    const p = path.join(DEFAULT_OUTBOX_DIR, n);
    let inner = null;
    try {
      inner = fs.readdirSync(p).sort();
    } catch {
      /* 非目录 */
    }
    let manifest = null;
    try {
      manifest = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(p, 'manifest.json')))
        .digest('hex')
        .slice(0, 16);
    } catch {
      /* 无 manifest */
    }
    snap[n] = { inner, manifest };
  }
  return { names, snap };
}

test('段 D：首启（空 userData ⇒ 设置窗口 · 接入指引 · mcp-url == 实际地址 · 日志「首次运行」）', { timeout: 300000 }, async () => {
  const userData = freshUserData('firstrun');
  assert.ok(!fs.existsSync(path.join(userData, 'config.json')), '前置：config.json 缺失 = 首启条件');
  const before = realOutboxSnapshot();

  const session = await startPackApp({ userData, envExtra: { FO_OPEN_SETTINGS: '' } });
  try {
    const rt = await waitFor(() => readRuntime(userData), 90000, 250);
    assert.ok(rt, '首启应写 runtime.json');

    // ③ 实际地址（有界等待：窗口首帧可能早于服务状态广播 ⇒ 有界等待到位）
    const urlOk = await session.waitDom(
      `document.querySelector('[data-field="mcp-url"]').textContent === ${JSON.stringify(rt.url)} ? 'y' : null`,
      20000,
    );
    assert.equal(urlOk, 'y', '接入指引页实际地址应等于 runtime.json.url');

    const dom = await session.evalJson(`(function () { return {
      active: Array.from(document.querySelectorAll('[data-page].is-active')).map(function (el) { return el.getAttribute('data-page'); }),
      guidePanelVisible: !document.querySelector('[data-page-panel="guide"]').hidden,
      workersPanelVisible: !document.querySelector('[data-page-panel="workers"]').hidden,
      mcpUrl: document.querySelector('[data-field="mcp-url"]').textContent,
      search: location.search,
    }; })()`);
    assert.deepEqual(dom.active, ['guide'], `首启激活页应为 guide（实际 ${JSON.stringify(dom.active)}）`);
    assert.equal(dom.guidePanelVisible, true, 'guide 面板应可见');
    assert.equal(dom.workersPanelVisible, false, 'workers 面板应隐藏（页面互斥）');
    assert.equal(dom.mcpUrl, rt.url);
    assert.equal(dom.search, '?page=guide', '窗口 URL 应带 ?page=guide（初始页接缝的消费面）');

    // ④ 日志「首次运行」行
    const log = await waitFor(() => {
      const t = readAppLog(userData);
      return t.includes('首次运行：打开设置窗口') ? t : null;
    }, 30000, 300);
    assert.ok(log, '日志应有「首次运行：打开设置窗口」行');

    // 附：出厂默认落盘（T2-④）
    const cfg = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
    assert.equal(cfg.browser.mode, 'chromium');
    assert.equal(cfg.browser.channel, '', '出厂默认 channel 为空串（随包 Chromium）');

    // —— 退出与零落痕核对 ——
    assert.ok(await session.quit(), '首启实例应能优雅退出（--quit）');
    const gone = await waitFor(() => (!fs.existsSync(path.join(userData, 'runtime.json')) ? true : null), 15000, 200);
    assert.ok(gone, '退出后 runtime.json 应已删除');
    assert.deepEqual(realOutboxSnapshot(), before, '首启期间真实交付目录零落痕（条目 / manifest 摘要一致）');

    console.log(
      `[verify:pack·段 D 读数] 激活页=${dom.active.join('/')} search=${dom.search} mcp-url=${dom.mcpUrl}（== runtime.json.url） · ` +
        `日志「首次运行」=有 · 出厂默认 mode=${cfg.browser.mode} channel=${JSON.stringify(cfg.browser.channel)} · 退出干净 · 真实 outbox 零落痕`,
    );
  } finally {
    session.kill();
  }
});
