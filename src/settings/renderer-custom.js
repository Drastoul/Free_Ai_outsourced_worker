/* 免费外包 · 设置窗口渲染进程——自定义外包工（b7/T2）：新增表单 + 驱动参数对话框 + 自定义行 / 平台按钮的附加元素。
 * 经典 script；共享工具与状态来自 window.FOUI（renderer.js，先加载）；零 Node 能力，只经 window.fo。
 * 冻结契约（批次档 b7 §2「冻结接口」）：[data-custom-form] · [data-field=custom-name|custom-url|custom-error] ·
 *   [data-action=custom-submit|custom-back] · [data-driver-dialog] ·
 *   [data-field=driver-input|driver-send-button|driver-reply|driver-error] · 行内 [data-action=driver] ·
 *   行内 [data-field=custom-hint|custom-limits]（行构建钩子 decorateRow，登记在 renderer-workers.js）。
 * 写路径 = 补丁操作 worker.add（custom 分支：name + url；新增时不给 driver）与 worker.setDriver（三键，空串 = 通用启发式）；
 * 名称（列表内唯一）与链接（http/https 绝对地址）一律由服务端校验：本文件不做本地猜测，失败只回显 patch 结果、不提交。
 */
(function () {
  'use strict';

  var api = window.FOUI;
  if (!api) { console.error('自定义外包工：核心脚本未加载（renderer.js）'); return; }
  var fo = window.fo;
  var $ = api.$, el = api.el, notify = api.notify;

  /* 提示文案（F11.5 的单一来源）：表单内 · custom 平台按钮处 · 自定义行内 [data-field=custom-hint] · 驱动参数对话框「同一提示」——
     四处同文；另两处由 renderer-workers.js 经 decoratePlatformButton / decorateRow 注入（不复制字面量） */
  var HINT_TEXT = '实验性：通用尽力驱动，不承诺对所有站点稳定。若派单失败，可由你的主包AI 优化该外包工的驱动参数（输入区 / 发送 / 回复区选择器）。';

  /* 不支持能力如实标注（R11 边界；第 4 项「平台开关」由行内 [data-field=toggles-unsupported] 承载） */
  var LIMITS_TEXT = '不支持：送件（附件）、下载捕获、新建会话。';

  var driverWorkerId = null;   // 驱动参数对话框的目标（打开时从快照解析；保存按 id 提交）
  var driverWorkerName = '';   // 保存成功后的回执用名（关框时清空）

  function byField(name) { return $('[data-field="' + name + '"]'); }
  function showError(node, text) { node.textContent = text; node.hidden = false; }
  function clearError(node) { node.textContent = ''; node.hidden = true; }

  /** 提示文案注入（HTML 里的 .custom-hint-text 空节点由本函数填充；四处共用同一常量） */
  function fillHints() {
    Array.prototype.slice.call(document.querySelectorAll('.custom-hint-text')).forEach(function (n) {
      n.textContent = HINT_TEXT;
    });
  }

  /* ---------- 新增表单（同一 [data-add-dialog] 内展开 / 返回；不新开对话框） ---------- */
  /** 复位为「平台清单」视图（打开 / 关闭对话框、提交成功后调用——下次打开一律从选平台开始） */
  function resetForm() {
    byField('custom-name').value = '';
    byField('custom-url').value = '';
    clearError(byField('custom-error'));
    $('[data-custom-form]').hidden = true;
    $('[data-platform-list]').hidden = false;
    $('[data-add-dialog] .add-intro').hidden = false;
  }
  /** 平台清单 ⇒ 自定义表单 */
  function openForm() {
    clearError(byField('custom-error'));
    $('[data-custom-form]').hidden = false;
    $('[data-platform-list]').hidden = true;
    $('[data-add-dialog] .add-intro').hidden = true;
    byField('custom-name').focus();
  }
  /** 表单 ⇒ 返回平台清单（保留已填内容，只清错误行） */
  function backToList() {
    clearError(byField('custom-error'));
    $('[data-custom-form]').hidden = true;
    $('[data-platform-list]').hidden = false;
    $('[data-add-dialog] .add-intro').hidden = false;
  }
  /** 提交 ⇒ worker.add（custom 分支）；服务端拒绝 ⇒ 行内回显、保持对话框与输入、不提交 */
  function submitForm() {
    var name = byField('custom-name').value.trim();
    var url = byField('custom-url').value.trim();
    var err = byField('custom-error');
    clearError(err);
    fo.patch({ op: 'worker.add', platform: 'custom', name: name, url: url }).then(
      function (res) {
        if (!res || !res.ok) {
          showError(err, (res && res.error) || '新增失败（未提交）');
          return;
        }
        var mod = api.workers;
        if (mod && typeof mod.closeAddDialog === 'function') mod.closeAddDialog();
        else { resetForm(); $('[data-add-dialog]').hidden = true; }
        notify('已新增自定义外包工：' + name + '（派单失败时可在行内「驱动参数」补充选择器）');
      },
      function () { showError(err, '与主进程通信失败，请重试（未提交）'); }
    );
  }

  /* ---------- 驱动参数对话框（F11.3 的「二次优化」接口；写入 = worker.setDriver） ---------- */
  function openDriverDialog(id) {
    var workers = (api.state.snapshot && api.state.snapshot.workers) || [];
    var w = workers.filter(function (x) { return x.id === id; })[0];
    if (!w) { notify('外包工不存在（可能已被删除）', 'error'); return; }
    driverWorkerId = w.id;
    driverWorkerName = w.name;
    var d = w.driver || {};
    byField('driver-input').value = d.inputSelector || '';
    byField('driver-send-button').value = d.sendButtonSelector || '';
    byField('driver-reply').value = d.replySelector || '';
    $('[data-driver-dialog] .driver-title').textContent = '驱动参数：' + w.name + '（留空 = 通用启发式）';
    clearError(byField('driver-error'));
    $('[data-driver-dialog]').hidden = false;
    byField('driver-input').focus();
  }
  function closeDriverDialog() {
    driverWorkerId = null;
    driverWorkerName = '';
    $('[data-driver-dialog]').hidden = true;
  }
  /** 保存三键（部分更新本可只发改动键；此处整份三键提交 = 用户可见的「当前值」即落盘值） */
  function saveDriver() {
    if (!driverWorkerId) return;
    var id = driverWorkerId;
    var name = driverWorkerName;
    var err = byField('driver-error');
    clearError(err);
    var driver = {
      inputSelector: byField('driver-input').value.trim(),
      sendButtonSelector: byField('driver-send-button').value.trim(),
      replySelector: byField('driver-reply').value.trim(),
    };
    fo.patch({ op: 'worker.setDriver', id: id, driver: driver }).then(
      function (res) {
        if (!res || !res.ok) {
          showError(err, (res && res.error) || '保存失败（未提交）');
          return;
        }
        closeDriverDialog();
        notify('已保存「' + name + '」的驱动参数（即时生效，可直接重派）');
      },
      function () { showError(err, '与主进程通信失败，请重试（未提交）'); }
    );
  }

  /* ---------- 行内 / 平台按钮的附加元素（renderer-workers.js 的钩子调用） ---------- */
  /** 自定义行：常显提示 + 不支持能力标注 + 「驱动参数」按钮（[data-action=driver]）；非自定义行直接返回（内置平台行零变化） */
  function decorateRow(li, actions, w) {
    if (!w || w.platform !== 'custom') return;
    var hint = el('span', 'worker-note', HINT_TEXT);
    hint.setAttribute('data-field', 'custom-hint');
    li.appendChild(hint);
    var limits = el('span', 'worker-note', LIMITS_TEXT);
    limits.setAttribute('data-field', 'custom-limits');
    li.appendChild(limits);
    var btn = el('button', null, '驱动参数');
    btn.type = 'button';
    btn.setAttribute('data-action', 'driver');
    btn.addEventListener('click', function () { openDriverDialog(w.id); });
    if (actions.lastElementChild && actions.lastElementChild.getAttribute('data-action') === 'delete') {
      actions.insertBefore(btn, actions.lastElementChild);   // 「驱动参数」排在「删除」之前（危险动作靠尾）
    } else actions.appendChild(btn);
  }
  /** custom 平台按钮处提示（F11.5 ①；按钮标签本身只写平台名，警示只在提示文案里） */
  function decoratePlatformButton(btn) {
    btn.appendChild(el('span', 'platform-note', HINT_TEXT));
  }

  /* ---------- 事件接线（本文件独占的四个动作 + 驱动对话框的背板 / Escape） ---------- */
  function bind() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var action = t.getAttribute('data-action');
      if (action === 'custom-submit') submitForm();
      else if (action === 'custom-back') backToList();
      else if (action === 'driver-save') saveDriver();
      else if (action === 'driver-close') closeDriverDialog();
    });
    var dlg = $('[data-driver-dialog]');
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) closeDriverDialog(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !$('[data-driver-dialog]').hidden) closeDriverDialog();
    });
  }

  /* 注册到共享面（renderer-workers.js 的 openAddDialog 与 buildRow 经此调用）；本页在核心之后加载，直接接线 */
  api.custom = {
    openForm: openForm,
    resetForm: resetForm,
    openDriverDialog: openDriverDialog,
    decorateRow: decorateRow,
    decoratePlatformButton: decoratePlatformButton,
  };
  fillHints();
  bind();
})();
