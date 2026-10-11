// 设置窗口控制器（b2，主进程侧）：单例创建 / 显示 / 聚焦 / 关闭（应用常驻）；IPC 注册与转发；配置变更广播。
// 设计权威：docs/design/modules/settings-app.md §1（形态与入口）/ §7（配置同步）；托盘三入口与二实例唤起见 src/main/index.mjs。
// 安全边界：contextIsolation 开 / nodeIntegration 关 / 沙箱预加载（preload.cjs）；渲染层零 Node 能力、不联网（拒绝非 file:// 导航）。

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');
export const PAGE_PATH = path.join(__dirname, 'index.html');

/** IPC 通道（与 preload.cjs 一一对应；值口径 = 冻结接口「window.fo 八方法」） */
const CH = {
  snapshot: 'fo:snapshot',
  patch: 'fo:patch',
  checkWorker: 'fo:check-worker',
  copyText: 'fo:copy-text',
  export: 'fo:export',
  openPath: 'fo:open-path',
  pickOutboxDir: 'fo:pick-outbox-dir',
  changed: 'fo:changed',
};

/** 用系统默认程序打开一个路径（设置窗口按钮与托盘入口共用；失败 ⇒ {ok:false, error}） */
export async function openPathExternal(target) {
  try {
    const err = await shell.openPath(target);
    return err ? { ok: false, error: `打开失败：${err}` } : { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: `打开失败：${e?.message || e}` };
  }
}

/**
 * 创建设置窗口控制器（单例语义：未销毁 ⇒ 显示并聚焦；已销毁 ⇒ 重建）。
 * @param {{service: object, log: object}} deps service = 设置服务（src/settings/service.mjs）
 */
export function createSettingsWindow({ service, log }) {
  /** @type {BrowserWindow|null} */
  let win = null;

  ipcMain.removeHandler(CH.snapshot);
  ipcMain.removeHandler(CH.patch);
  ipcMain.removeHandler(CH.checkWorker);
  ipcMain.removeHandler(CH.copyText);
  ipcMain.removeHandler(CH.export);
  ipcMain.removeHandler(CH.openPath);
  ipcMain.removeHandler(CH.pickOutboxDir);

  ipcMain.handle(CH.snapshot, () => service.getSnapshot());
  ipcMain.handle(CH.patch, (_event, op) => service.patch(op));
  ipcMain.handle(CH.checkWorker, (_event, id) => service.checkWorker(id));
  ipcMain.handle(CH.copyText, (_event, text) => {
    const s = typeof text === 'string' ? text : '';
    if (!s) return { ok: false, error: '复制内容为空' };
    clipboard.writeText(s);
    return { ok: true, bytes: Buffer.byteLength(s, 'utf8') };
  });
  ipcMain.handle(CH.export, () => service.exportFragmentFiles());
  ipcMain.handle(CH.openPath, async (_event, kind) => {
    const resolved = await service.resolveOpenPath(kind);
    if (!resolved.ok) return resolved;
    return openPathExternal(resolved.path);
  });
  ipcMain.handle(CH.pickOutboxDir, async () => {
    const opts = {
      title: '选择交付目录',
      buttonLabel: '使用此目录',
      properties: ['openDirectory', 'createDirectory'],
    };
    const res = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || !res.filePaths?.length) return { ok: false, canceled: true };
    return service.validateOutboxDir(res.filePaths[0]); // 提交前校验；落配置仍走 patch 清单
  });

  function safeShow(target) {
    if (!target || target.isDestroyed()) return;
    try {
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
    } catch (e) {
      log.warn(`设置窗口显示失败：${e?.message || e}`);
    }
  }

  /** 单例打开：未销毁 ⇒ 聚焦；已销毁 ⇒ 重建后聚焦（T1 / M9）。
   *  initialPage（T5 接缝）= 新建窗口的初始页：经 loadFile query 传 ?page=<name>（渲染层按 PAGES 校验）；
   *  已存在窗口 ⇒ 不追溯换页（照旧显示 / 聚焦）。 */
  function open(initialPage) {
    if (win && !win.isDestroyed()) {
      safeShow(win);
      log.info('设置窗口：已存在 ⇒ 显示并聚焦');
      return win;
    }
    win = new BrowserWindow({
      width: 920,
      height: 660,
      minWidth: 720,
      minHeight: 480,
      title: '免费外包 · 设置',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: PRELOAD_PATH,
      },
    });
    win.once('ready-to-show', () => safeShow(win));
    win.on('closed', () => {
      win = null;
      log.info('设置窗口已关闭（应用常驻，托盘仍在）');
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      log.warn(`设置窗口渲染进程退出（${details?.reason || '未知'}）；关闭后重开即可重建`);
    });
    // 不联网：只允许本地 file:// 页面；外部导航一律拒绝（设计 §3 边界）
    win.webContents.on('will-navigate', (event, url) => {
      if (!String(url).startsWith('file://')) {
        event.preventDefault();
        log.warn(`设置窗口拒绝外部导航：${url}`);
      }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // 启动期竞态兜底（b6/T1）：页面加载完成 ⇒ 补推一次全量快照（此后的 webContents.send 页面必达；幂等）
    win.webContents.once('did-finish-load', () => {
      log.info('设置窗口：加载完成，补推一次全量快照（启动期竞态兜底）');
      void service.emitChanged('窗口加载完成');
    });
    const loadOptions = initialPage ? { query: { page: String(initialPage) } } : undefined;
    win
      .loadFile(PAGE_PATH, loadOptions)
      .then(() => log.info(`设置窗口：已创建并加载界面（${PAGE_PATH}）`))
      .catch((e) => {
        // 界面资源未落地（切分 ③）时：明示 + 仍显示窗口（不静默留一个不可见窗口）
        log.warn(`设置界面加载失败：${PAGE_PATH}（${e?.message || e}）`);
        safeShow(win);
      });
    return win;
  }

  /** 变更广播：推全量快照给渲染层（配置变更 / 检查完成 / 交付目录回落）；无窗口 ⇒ 跳过 */
  function broadcast(snapshot) {
    if (!win || win.isDestroyed()) {
      log.debug?.('设置窗口未打开：变更广播跳过（下次打开取全量快照）');
      return false;
    }
    try {
      win.webContents.send(CH.changed, snapshot);
      log.info('设置窗口：变更广播已发送');
      return true;
    } catch (e) {
      log.warn(`设置窗口广播失败：${e?.message || e}`);
      return false;
    }
  }

  function isOpen() {
    return !!win && !win.isDestroyed();
  }

  return {
    open,
    broadcast,
    isOpen,
    close() {
      if (win && !win.isDestroyed()) win.close();
    },
    get window() {
      return win;
    },
  };
}
