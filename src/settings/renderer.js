/* 免费外包 · 设置窗口渲染进程——核心（页签 / 快照刷新 / 提示 / 接入指引页 / 交付目录页 / 关于页 / 复制·导出·打开接线）。
 * 外包工页在 renderer-workers.js（经 window.FOUI 共享本文件的工具与状态；两文件均由 index.html 引入）。
 * 经典 script（无 ESM / 无构建）；零 Node 能力（只用 window.fo 八方法）；不加载任何远程资源。
 * 契约 = 批次档 b2 §2「冻结接口」（DOM 契约见 index.html；快照字段映射见 src/settings/service.mjs 头注）。
 */
(function () {
  'use strict';

  var fo = window.fo || null;
  var PAGES = ['workers', 'guide', 'outbox', 'about'];
  var state = { page: 'workers', snapshot: null };

  /* ---------- 小工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmtTime(iso) {
    if (!iso) return '从未检查';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------- 提示（不静默：成功 / 失败都明示） ---------- */
  var noticeTimer = null;
  function notify(text, kind) {
    var box = $('[data-field="notice"]');
    box.textContent = text;
    box.setAttribute('data-kind', kind || 'info');
    box.hidden = false;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { box.hidden = true; }, 5000);
  }
  function fail(res, fallback) { notify((res && res.error) || fallback || '操作失败', 'error'); }

  /* ---------- 页签（单窗口四页；面板 [data-page-panel] 同步显隐） ---------- */
  function setPage(name) {
    if (PAGES.indexOf(name) < 0) return;
    state.page = name;
    Array.prototype.slice.call(document.querySelectorAll('[data-page]')).forEach(function (tab) {
      tab.classList.toggle('is-active', tab.getAttribute('data-page') === name);
    });
    Array.prototype.slice.call(document.querySelectorAll('[data-page-panel]')).forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-page-panel') !== name;
    });
  }

  /* ---------- 接入指引页（T9 / T10） ---------- */
  function serviceNote(svc) {
    if (svc.state !== 'running') {
      return '未启动：' + (svc.reason || 'MCP 服务未启动') +
        (svc.suggestion ? '；建议：' + svc.suggestion : '');
    }
    if (svc.drift) {
      return '端口顺延：期望端口 ' + svc.expectedPort + ' 不可用，实际端口 ' + svc.port +
        '；宿主配置需更新（以本页实际地址为准）。';
    }
    return '';
  }
  function renderGuide() {
    var s = state.snapshot || {};
    var svc = s.service || {};
    var running = svc.state === 'running';
    $('[data-field="service-status"]').textContent = running ? '运行中' : '未启动';
    $('[data-field="mcp-url"]').textContent = (running && svc.url) || '—';
    $('[data-field="sse-url"]').textContent = (running && svc.sseUrl) || '—';
    $('[data-field="version"]').textContent = s.version || '—';
    $('[data-field="export-dir"]').textContent = s.exportDir || '—';
    var note = $('[data-field="service-note"]');
    var text = serviceNote(svc);
    if (text) { note.textContent = text; note.hidden = false; } else { note.hidden = true; }
    // 服务未启动 ⇒ 片段无实际端口可依循：复制 / 导出入口禁用；随包文档缺失时打开入口禁用
    ['copy-mcp-json', 'copy-mcp-servers', 'export'].forEach(function (action) {
      $('[data-action="' + action + '"]').disabled = !running;
    });
    $('[data-action="open-guide"]').disabled = !(s.guide && s.guide.available);
  }

  /* ---------- 交付目录页（T11） ---------- */
  function renderOutbox() {
    var o = (state.snapshot && state.snapshot.outbox) || {};
    $('[data-field="outbox-actual"]').textContent = o.actual || '—';
    var note = $('[data-field="outbox-note"]');
    if (o.note) { note.textContent = o.note; note.hidden = false; } else { note.hidden = true; }
  }

  /* ---------- 关于页（T12） ---------- */
  function renderAbout() {
    var s = state.snapshot || {};
    $('[data-field="about-version"]').textContent = s.version || '—';
    $('[data-field="logs-dir"]').textContent = s.logsDir || '—';
  }

  /* ---------- 渲染总入口（快照 ⇒ 四页；外包工页由 renderer-workers.js 承担） ---------- */
  function renderWorkersPage() {
    var mod = window.FOUI && window.FOUI.workers;
    if (mod) { mod.render(); return; }
    console.error('外包工页脚本未加载（renderer-workers.js）');
    $('[data-worker-list]').textContent = '';
    var empty = $('[data-field="workers-empty"]');
    empty.textContent = '外包工页脚本未加载（renderer-workers.js）';
    empty.hidden = false;
  }
  function render() {
    renderWorkersPage();
    renderGuide();
    renderOutbox();
    renderAbout();
  }

  function refresh() {
    return fo.getSnapshot().then(function (snap) {
      state.snapshot = snap || {};
      render();
    }, function () { notify('读取设置快照失败', 'error'); });
  }

  /* ---------- 复制 / 导出 / 打开（T9 / T10 / T12；片段文本来自快照 = 主进程生成器权威） ---------- */
  function copyFrom(run, okText) {
    run().then(function (res) {
      if (res && res.ok === false) { fail(res, '复制失败'); return; }
      notify(okText || '已复制到剪贴板');
    }, function () { notify('复制失败', 'error'); });
  }
  function fragmentText(key) {
    var f = (state.snapshot && state.snapshot.fragments) || {};
    if (!f[key]) { notify('服务未启动，暂无可用片段：启动后重试', 'error'); return null; }
    return f[key];
  }
  function doExport() {
    fo.exportFragments().then(function (res) {
      if (!res || !res.ok) { fail(res, '导出失败'); return; }
      notify('已导出到 ' + (res.dir || (state.snapshot && state.snapshot.exportDir) || '导出目录'));
      refresh();
    }, function () { notify('导出失败', 'error'); });
  }
  function openPath(kind) {
    fo.openPath(kind).then(function (res) {
      if (res && res.ok === false) fail(res, '打开失败');
    }, function () { notify('打开失败', 'error'); });
  }
  function pickOutboxDir() {
    fo.pickOutboxDir().then(function (res) {
      if (!res || !res.ok) {
        if (res && res.error) fail(res, res.error); // 取消（canceled）⇒ 静默
        return;
      }
      fo.patch({ op: 'outbox.set', dir: res.dir }).then(function (r2) {
        if (!r2 || !r2.ok) fail(r2, '目录不可用：需存在或可创建且可写（未落配置）');
        else notify('交付目录已更新：' + res.dir);
      }, function () { notify('设置交付目录失败', 'error'); });
    }, function () { notify('选择目录失败', 'error'); });
  }

  /* ---------- 事件接线（本文件负责的三个页；外包工页动作在 renderer-workers.js） ---------- */
  var ACTIONS = {
    'copy-mcp-json': function () {
      var t = fragmentText('mcpJson');
      if (t) copyFrom(function () { return fo.copyText(t); }, '已复制 .mcp.json 片段');
    },
    'copy-mcp-servers': function () {
      var t = fragmentText('mcpServers');
      if (t) copyFrom(function () { return fo.copyText(t); }, '已复制 mcp.servers 片段');
    },
    export: doExport,
    'open-export': function () { openPath('export'); },
    'open-guide': function () { openPath('guide'); },
    'open-outbox': function () { openPath('outbox'); },
    'pick-outbox-dir': pickOutboxDir,
    'copy-logs-path': function () {
      var dir = (state.snapshot && state.snapshot.logsDir) || '';
      if (!dir) { notify('日志目录未知：稍后重试', 'error'); return; }
      copyFrom(function () { return fo.copyText(dir); }, '已复制日志路径');
    },
  };
  function bind() {
    Array.prototype.slice.call(document.querySelectorAll('[data-page]')).forEach(function (tab) {
      tab.addEventListener('click', function () { setPage(tab.getAttribute('data-page')); });
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var action = t.getAttribute('data-action');
      if (action && ACTIONS[action]) ACTIONS[action]();
    });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    if (!fo) {
      document.body.textContent = '设置界面初始化失败：预加载接口（window.fo）不可用。';
      return;
    }
    bind();
    // 初始页接缝（T5）：URL ?page=<name> 经 PAGES 校验；缺省 / 非法 ⇒ workers（无参数时与 b2 完全一致）
    var page = new URLSearchParams(location.search || '').get('page') || '';
    setPage(PAGES.indexOf(page) >= 0 ? page : 'workers');
    refresh();
    if (typeof fo.onChanged === 'function') {
      fo.onChanged(function (snap) {
        if (snap && typeof snap === 'object') { state.snapshot = snap; render(); }
        else refresh();
      });
    }
  }

  /* 共享面（renderer-workers.js 依赖；两文件同改须同步） */
  window.FOUI = {
    $: $, el: el, fmtTime: fmtTime, notify: notify, fail: fail,
    state: state, refresh: refresh,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
