// 设置窗口预加载（b2；冻结接口 = 批次档 b2 §2「window.fo（preload 暴露面）」八方法）。
// 渲染进程零 Node 能力：contextIsolation 开 / nodeIntegration 关 / 沙箱预加载（CJS 形态）；
// 只经 contextBridge 暴露 window.fo，全部动作走 ipcRenderer.invoke 到主进程设置服务（单一写者）。
// 不暴露 ipcRenderer / require / 任何 Node 能力，不加载远程资源。

const { contextBridge, ipcRenderer } = require('electron');

/** IPC 通道（与 window.mjs 的注册面一一对应；跨切分改动须双方同步） */
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

contextBridge.exposeInMainWorld('fo', {
  /** 只读快照（服务状态 / 实际地址 / 两形态片段文本 / workers 视图 / 平台子键能力 / 会话三键 / 交付目录 / 导出与日志目录 / 版本） */
  getSnapshot: () => ipcRenderer.invoke(CH.snapshot),
  /** 配置变更唯一写入口：op 形如 {op:'worker.add', platform:'deepseek'}（九操作见 patches.mjs） */
  patch: (op) => ipcRenderer.invoke(CH.patch, op),
  /** 「打开并检查」：打开 / 复用该外包工浏览器窗口到平台页并刷新登录态 */
  checkWorker: (id) => ipcRenderer.invoke(CH.checkWorker, id),
  /** 复制文本到系统剪贴板（Electron clipboard；不经过渲染层任何 Node 能力） */
  copyText: (text) => ipcRenderer.invoke(CH.copyText, text),
  /** 一键导出两形态片段到 <userData>/export/（覆盖刷新同一文件） */
  exportFragments: () => ipcRenderer.invoke(CH.export),
  /** 打开路径：kind ∈ outbox | export | logs | guide */
  openPath: (kind) => ipcRenderer.invoke(CH.openPath, kind),
  /** 目录选择器（选定后主进程做提交前校验；返回 {ok, dir?} 或 {ok:false, canceled?/error}） */
  pickOutboxDir: () => ipcRenderer.invoke(CH.pickOutboxDir),
  /** 变更广播订阅（配置变更 / 检查完成 / 交付目录回落 ⇒ 收到全量快照）；返回退订函数 */
  onChanged: (cb) => {
    const listener = (_event, snapshot) => {
      try {
        cb(snapshot);
      } catch {
        /* 渲染层回调异常不影响订阅 */
      }
    };
    ipcRenderer.on(CH.changed, listener);
    return () => ipcRenderer.removeListener(CH.changed, listener);
  },
});
