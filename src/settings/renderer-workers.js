/* 免费外包 · 设置窗口渲染进程——外包工页（T2–T8）：行渲染与行内交互（改名 / 启用 / 开关 / 上移下移 / 打开并检查 / 删除二次确认）
 * + 新增选平台对话框。经典 script；共享工具与状态来自 window.FOUI（renderer.js，先加载）；零 Node 能力，只经 window.fo。
 * 冻结契约（批次档 b2 §2）：行 [data-worker-id] · [data-field=name|enabled|status|checked] ·
 *   [data-toggle=thinking|search] · [data-action=up|down|delete|check]；确认框 [data-confirm] + confirm-yes/no。
 */
(function () {
  'use strict';

  var api = window.FOUI;
  if (!api) { console.error('外包工页：核心脚本未加载（renderer.js）'); return; }
  var fo = window.fo;
  var $ = api.$, el = api.el, notify = api.notify, fail = api.fail;
  var state = api.state;

  /* 状态徽标词表（ready / login_required / busy / unavailable / disabled）⇒ 中文标签；
     原始词表值同时落在 data-state 与 title（供机器断言），可见文本用中文。 */
  var STATUS_TEXT = { ready: '可用', login_required: '需登录', busy: '执行中', unavailable: '不可用', disabled: '已停用' };

  var checking = {};        // 在途检查（防连点：按钮禁用 + 文案「检查中…」）
  var pendingDelete = null; // 待确认删除的外包工 id

  /** 唯一的 patch 包装：成功 ⇒ true；失败 / 通信异常 ⇒ 先回滚界面显示再弹错（不静默） */
  function patchOp(op, onFail) {
    return fo.patch(op).then(
      function (res) {
        if (!res || !res.ok) { onFail(res || { error: '操作失败' }); return false; }
        return true;
      },
      function () { onFail({ error: '与主进程通信失败，请重试' }); return false; }
    );
  }

  function platformLabel(id) {
    var platforms = (state.snapshot && state.snapshot.platforms) || [];
    var found = platforms.filter(function (p) { return p.id === id; })[0];
    return found ? (found.label || found.id) : String(id || '');
  }

  function actionButton(action, label, disabled, onClick) {
    var b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('data-action', action);
    b.disabled = !!disabled;
    b.addEventListener('click', function () { onClick(); });
    return b;
  }

  /* ---------- 行构建 ---------- */
  function buildRow(w, index, total) {
    var li = el('li', 'worker');
    li.setAttribute('data-worker-id', w.id);

    var chip = el('span', 'platform-chip', platformLabel(w.platform));

    var input = el('input', 'name-input');
    input.type = 'text';
    input.value = w.name;
    input.setAttribute('data-field', 'name');
    input.setAttribute('aria-label', '外包工名称（主包AI 指定调用用的名字）');
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { input.value = w.name; input.blur(); }
    });
    input.addEventListener('blur', function () {
      var next = input.value.trim();
      if (!next || next === w.name) { input.value = w.name; return; }
      patchOp({ op: 'worker.rename', id: w.id, name: next }, function (res) {
        input.value = w.name;
        fail(res, '改名失败：名称空白或在列表内重复');
      });
    });

    var badge = el('span', 'badge', STATUS_TEXT[w.status] || w.status || '未知');
    badge.setAttribute('data-field', 'status');
    badge.setAttribute('data-state', w.status || '');
    badge.title = w.detail ? w.status + '：' + w.detail : (w.status || '');

    var checked = el('span', 'meta', '最近检查：' + api.fmtTime(w.lastCheckedAt));
    checked.setAttribute('data-field', 'checked');

    var enable = el('label', 'switch');
    var enabledBox = el('input');
    enabledBox.type = 'checkbox';
    enabledBox.checked = !!w.enabled;
    enabledBox.setAttribute('data-field', 'enabled');
    enabledBox.addEventListener('change', function () {
      patchOp({ op: 'worker.setEnabled', id: w.id, enabled: enabledBox.checked }, function (res) {
        enabledBox.checked = !!w.enabled;
        fail(res, '切换启用状态失败');
      });
    });
    enable.appendChild(enabledBox);
    enable.appendChild(el('span', null, '启用'));

    var toggles = el('div', 'row-toggles');
    [['thinking', '深度思考'], ['search', '联网搜索']].forEach(function (pair) {
      var key = pair[0];
      var box = el('input');
      box.type = 'checkbox';
      box.checked = !!(w.toggles && w.toggles[key]);   // 勾选态 == 该外包工的配置值（快照 workers[].toggles）
      box.setAttribute('data-toggle', key);
      box.addEventListener('change', function () {
        var op = { op: 'worker.setToggles', id: w.id, toggles: {} };
        op.toggles[key] = box.checked; // 部分更新：只发改动键，不覆盖另一键
        var before = box.checked;
        patchOp(op, function (res) {
          box.checked = !before;
          fail(res, '切换「' + pair[1] + '」失败');
        });
      });
      var label = el('label', 'switch');
      label.title = '派单时自动应用';
      label.appendChild(box);
      label.appendChild(el('span', null, pair[1]));
      toggles.appendChild(label);
    });

    var actions = el('div', 'row-actions');
    var up = actionButton('up', '上移', index === 0, function () { move(w.id, 'up'); });
    var down = actionButton('down', '下移', index === total - 1, function () { move(w.id, 'down'); });
    var check = actionButton('check', checking[w.id] ? '检查中…' : '打开并检查',
      !!checking[w.id] || w.status === 'busy', function () { runCheck(w); });
    var del = actionButton('delete', '删除', false, function () { askDelete(w); });
    del.classList.add('danger');
    actions.appendChild(up);
    actions.appendChild(down);
    actions.appendChild(check);
    actions.appendChild(del);

    li.appendChild(chip);
    li.appendChild(input);
    li.appendChild(badge);
    li.appendChild(checked);
    li.appendChild(enable);
    li.appendChild(toggles);
    li.appendChild(actions);
    return li;
  }

  /* ---------- 渲染（快照 ⇒ 行列表 + 登录引导） ---------- */
  function render() {
    var list = $('[data-worker-list]');
    var workers = (state.snapshot && state.snapshot.workers) || [];
    list.textContent = '';
    workers.forEach(function (w, i) { list.appendChild(buildRow(w, i, workers.length)); });
    $('[data-field="workers-empty"]').hidden = workers.length > 0;
    renderLoginGuide();
  }

  /* ---------- 登录引导（T6 / M1；末句为设计档原文，勿改——按快照 login_required 常显，窗口重开后仍在） ---------- */
  function renderLoginGuide() {
    var node = $('[data-field="login-guide"]');
    var workers = (state.snapshot && state.snapshot.workers) || [];
    var pending = workers.filter(function (w) { return w.status === 'login_required'; });
    if (!pending.length) { node.hidden = true; return; }
    var names = pending.map(function (w) { return w.name; }).join('、');
    node.textContent = '外包工「' + names + '」未登录。请在已打开的浏览器窗口完成登录后，再点「打开并检查」。' +
      '登录态只存本机，换机后每个平台需重新登录一次。';
    node.hidden = false;
  }

  /* ---------- 调序（T4：上移 / 下移 ⇒ 直接改数组顺序） ---------- */
  function move(id, dir) {
    patchOp({ op: 'worker.move', id: id, dir: dir }, function (res) { fail(res, '调整顺序失败'); });
  }

  /* ---------- 「打开并检查」（T6：动作 ≤ openingMs 返回；busy 时按钮禁用） ---------- */
  function runCheck(w) {
    if (checking[w.id]) return;
    checking[w.id] = true;
    render();
    fo.checkWorker(w.id).then(function (res) {
      checking[w.id] = false;
      if (res.ok) {
        if (res.status === 'login_required') notify('未登录：请完成登录后再点「打开并检查」');
        else notify('检查完成：' + (STATUS_TEXT[res.status] || res.status));
        api.refresh();
      } else {
        render();
        notify((res && res.error) || '检查失败，请重试', 'error');
      }
    }, function () {
      checking[w.id] = false;
      render();
      notify('检查失败（通信异常），请重试', 'error');
    });
  }

  /* ---------- 删除（T3：二次确认；确认框文案 = 目录保留 + 排队任务处置） ---------- */
  function askDelete(w) {
    pendingDelete = w.id;
    $('[data-field="confirm-text"]').textContent =
      '确认删除外包工「' + w.name + '」？该外包工的浏览器配置目录保留；已排队的任务会改派或转人工。';
    $('[data-confirm]').hidden = false;
  }
  function closeConfirm() {
    pendingDelete = null;
    $('[data-confirm]').hidden = true;
  }
  function confirmDelete() {
    var id = pendingDelete;
    closeConfirm();
    if (!id) return;
    patchOp({ op: 'worker.remove', id: id }, function (res) { fail(res, '删除失败'); });
  }

  /* ---------- 新增（T2：先选平台；清单来自快照——DeepSeek 可选 / Kimi 灰显「待支持」） ---------- */
  function openAddDialog() {
    var platforms = (state.snapshot && state.snapshot.platforms) || [];
    if (!platforms.length) { notify('平台清单未知：请稍后重试（或检查主进程日志）', 'error'); return; }
    var list = $('[data-platform-list]');
    list.textContent = '';
    platforms.forEach(function (p) {
      var btn = el('button', 'platform', p.label || p.id);
      btn.type = 'button';
      btn.setAttribute('data-platform', p.id);
      btn.disabled = !p.available;
      if (!p.available) btn.appendChild(el('span', 'platform-note', p.note || '待支持'));
      btn.addEventListener('click', function () { addWorker(p); });
      list.appendChild(btn);
    });
    $('[data-add-dialog]').hidden = false;
  }
  function closeAddDialog() { $('[data-add-dialog]').hidden = true; }
  function addWorker(p) {
    patchOp({ op: 'worker.add', platform: p.id }, function (res) { fail(res, '新增失败'); }).then(function (ok) {
      if (!ok) return;
      closeAddDialog();
      notify('已新增外包工（默认名：' + (p.label || p.id) + '，可在列表内改名）');
    });
  }

  /* ---------- 事件接线（本页专属：新增 / 确认框 / Escape） ---------- */
  function bind() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var action = t.getAttribute('data-action');
      if (action === 'add-worker') openAddDialog();
      else if (action === 'add-worker-cancel') closeAddDialog();
      else if (action === 'confirm-yes') confirmDelete();
      else if (action === 'confirm-no') closeConfirm();
    });
    backdropClose('[data-confirm]', closeConfirm);
    backdropClose('[data-add-dialog]', closeAddDialog);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!$('[data-add-dialog]').hidden) closeAddDialog();
      else if (!$('[data-confirm]').hidden) closeConfirm();
    });
  }
  function backdropClose(sel, close) {
    var node = $(sel);
    node.addEventListener('click', function (ev) { if (ev.target === node) close(); });
  }

  /* 注册到共享面（renderer.js 的 render() 经 FOUI.workers 调用）；本页在核心之后加载，直接接线 */
  api.workers = { render: render, openAddDialog: openAddDialog, closeAddDialog: closeAddDialog };
  bind();
})();
