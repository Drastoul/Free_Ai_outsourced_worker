/* 免费外包 · 设置窗口渲染进程——会话复用块（b6/T7）：全局 session 三键的呈现与写入。
 * 经典 script；共享工具与状态来自 window.FOUI（renderer.js，先加载）；零 Node 能力，只经 window.fo。
 * 冻结契约（批次档 b6 §2）：块 [data-field=session-policy] · 控件 [data-field=session-reuse|session-ttl-ms|session-max-tasks]
 *   · 非法态 [data-field=session-error] · 写路径 = 补丁操作 session.set（src/settings/patches.mjs）。
 * 非法 / 越界 ⇒ 不提交、值回滚快照值、行内提示（区间与 src/main/config-schema.mjs 归一化同口径）。 */
(function () {
  'use strict';

  var api = window.FOUI;
  if (!api) { console.error('会话复用块：核心脚本未加载（renderer.js）'); return; }
  var fo = window.fo;
  var $ = api.$, fail = api.fail;
  var state = api.state;

  var TTL_MAX = Number.MAX_SAFE_INTEGER; // session.ttlMs 区间（权威 = src/main/config-schema.mjs）
  var MAX_TASKS_MAX = 1000;              // session.maxTasksPerSession 区间

  function field(name) { return $('[data-field="' + name + '"]'); }
  function session() { return (state.snapshot && state.snapshot.session) || {}; }
  function showError(text) { var n = field('session-error'); n.textContent = text; n.hidden = false; }
  function clearError() { var n = field('session-error'); n.textContent = ''; n.hidden = true; }

  /** 快照 ⇒ 控件（非法输入的回滚也走这里：值一律回快照值；不清错误行）
   *  注：每次广播都重写三控件——与外包工行「整表重建」同取舍（未提交的在途输入会被丢弃，值以快照为准） */
  function syncControls() {
    var s = session();
    field('session-reuse').checked = s.reuse === true;
    field('session-ttl-ms').value = s.ttlMs == null ? '' : String(s.ttlMs);
    field('session-max-tasks').value = s.maxTasksPerSession == null ? '' : String(s.maxTasksPerSession);
  }
  function render() { syncControls(); clearError(); }

  /** 单 op 提交（失败 ⇒ 回滚控件 + 弹错，不静默） */
  function commit(op, rollback) {
    fo.patch(op).then(function (res) {
      if (!res || !res.ok) rollback(res || { error: '操作失败' });
    }, function () { rollback({ error: '与主进程通信失败，请重试' }); });
  }

  /** 读整数输入（非法 ⇒ 行内提示 + 返回 null；调用方回滚且不提交） */
  function readInt(node, min, max, label) {
    var raw = node.value.trim();
    var n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
      showError(label + ' 非法（应为 ' + min + '..' + max + ' 的整数）：' + JSON.stringify(raw) + '；未提交');
      return null;
    }
    return n;
  }

  function bind() {
    field('session-reuse').addEventListener('change', function () {
      var box = field('session-reuse');
      commit({ op: 'session.set', reuse: box.checked }, function (res) {
        box.checked = session().reuse === true;
        fail(res, '切换「复用会话」失败');
      });
    });
    field('session-ttl-ms').addEventListener('change', function () {
      var box = field('session-ttl-ms');
      var n = readInt(box, 1, TTL_MAX, '空闲 TTL');
      if (n === null) { syncControls(); return; }
      if (n === session().ttlMs) return;
      commit({ op: 'session.set', ttlMs: n }, function (res) {
        syncControls();
        fail(res, '保存会话空闲 TTL 失败');
      });
    });
    field('session-max-tasks').addEventListener('change', function () {
      var box = field('session-max-tasks');
      var n = readInt(box, 1, MAX_TASKS_MAX, '单会话任务上限');
      if (n === null) { syncControls(); return; }
      if (n === session().maxTasksPerSession) return;
      commit({ op: 'session.set', maxTasksPerSession: n }, function (res) {
        syncControls();
        fail(res, '保存单会话任务上限失败');
      });
    });
  }

  /* 注册到共享面（renderer-workers.js 的 render() 每帧调用）；本页在核心之后加载，直接接线 */
  api.session = { render: render };
  bind();
})();
