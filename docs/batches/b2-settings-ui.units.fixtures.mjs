/**
 * b2 单元测试 · 共享夹具（配置样板 / 临时工作区 / 静默日志）
 * 由各拆分件引用；入口 `b2-settings-ui.units.mjs` 聚合执行
 * （`node --test docs/batches/b2-settings-ui.units.mjs`）。
 * 临时产物一律落 `.thincoder/tmp/units-b2-settings-<pid>/`（跑完自动清理；不碰真实 %APPDATA%）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSettingsService } from '../../src/settings/service.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 仓库根（`docs/batches/` → 上两级） */
export const REPO = path.resolve(HERE, '..', '..');

export const TMP = path.join(REPO, '.thincoder', 'tmp', `units-b2-settings-${process.pid}`);
process.on('exit', () => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

/** 新建隔离临时目录（同名先清空） */
export function freshDir(name) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 静默日志（单元不落盘） */
export const quietLog = { filePath: null, debug() {}, info() {}, warn() {}, error() {} };

/** 配置样板：w-1 启用 / w-2 停用且 thinking 已开（开关语义有分辨力）；openingMs 取非默认值（与 schema 默认 60000 可分辨） */
export function baseConfig() {
  return {
    version: 1,
    mcp: { port: 17873, host: '127.0.0.1', token: '' },
    outboxDir: 'D:\\免费外包\\outbox',
    workers: [
      { id: 'w-1', platform: 'deepseek', name: 'DeepSeek', enabled: true, toggles: { thinking: false, search: false } },
      { id: 'w-2', platform: 'deepseek', name: '二号机', enabled: false, toggles: { thinking: true, search: false } },
    ],
    limits: { timeouts: { openingMs: 20000 } },
  };
}

/** 单个外包工条目（配置 schema 形状） */
export function worker(id, name, extra = {}) {
  return { id, platform: 'deepseek', name, enabled: true, toggles: { thinking: false, search: false }, ...extra };
}

/**
 * 造设置服务（可注入引擎结果 / 保存失败 / busy / 引擎钩子）。
 * 依赖全部以夹具注入：config（可写失败）/ scheduler（含 workforce 视图）/ engine（记录调用）。
 * @returns {{service: object, calls: object, broadcasts: object[], config: object, userDataDir: string,
 *            health: Map<string, object>, workforce: object}}
 */
export function makeService({ engineResult = null, engineError = null, busy = false, outboxDir = null, saveError = null, engineHook = null } = {}) {
  const calls = { saved: null, saveCount: 0, markChecked: null, pumps: 0, engineCalls: [], cleared: [] };
  const userDataDir = freshDir('service-ud');
  const cfg = baseConfig();
  cfg.outboxDir = outboxDir || path.join(userDataDir, 'outbox');
  const config = {
    file: path.join(userDataDir, 'config.json'),
    current: cfg,
    save: async (next) => {
      calls.saveCount += 1;
      if (saveError) throw saveError;
      calls.saved = next;
      config.current = next;
      return [];
    },
  };
  const health = new Map();
  const workforce = {
    health,
    byId: (id) => config.current.workers.find((w) => w.id === id) || null,
    markChecked: (id, r) => {
      calls.markChecked = { id, ...r };
    },
    clearHealth: (id) => {
      calls.cleared.push(id);
      health.delete(id);
    },
  };
  const scheduler = {
    // 视图条目取 w-2（配置值 thinking:true / search:false——非兜底默认 {false,false}）⇒ 快照双读断言有分辨力；
    // enabled/status 与配置样板一致（w-2 停用 ⇒ 视图 disabled，保真度不造假）
    listWorkers: () => [{ id: 'w-2', name: '二号机', platform: 'deepseek', enabled: false, status: 'disabled', lastCheckedAt: null }],
    workforce,
    runner: { isWorkerBusy: () => busy },
    pump: () => {
      calls.pumps += 1;
    },
  };
  const engine = {
    call: async (method, params, opts) => {
      calls.engineCalls.push({ method, params, opts });
      if (engineHook) engineHook();
      if (engineError) throw engineError;
      return engineResult;
    },
  };
  const broadcasts = [];
  const service = createSettingsService({
    config,
    scheduler,
    engine,
    log: quietLog,
    userDataDir,
    version: '9.9.9',
    getServiceInfo: () => ({ ok: true, url: 'http://127.0.0.1:17873/mcp', port: 17873, reason: null }),
    broadcast: (snapshot) => {
      broadcasts.push(snapshot);
      return true;
    },
  });
  return { service, calls, broadcasts, config, userDataDir, health, workforce };
}
