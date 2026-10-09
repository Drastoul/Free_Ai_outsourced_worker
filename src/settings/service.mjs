// 设置服务（b2，主进程侧）：快照合成 / patch 落实（校验 → 原子写 → 广播）/ 「打开并检查」编排 / 导出 / 打开路径 / 复制落点。
// 设计权威：docs/design/modules/settings-app.md（§2 外包工页 · §3 接入指引 · §5 交付目录 · §6 关于 · §7 配置同步）；
// 冻结接口（批次档 b2 §2）——快照字段 ↔ 渲染层 DOM 契约：service.url↔[data-field=mcp-url] ·
//   service.sseUrl↔sse-url · version↔version · outbox.actual↔outbox-actual · outbox.note↔outbox-note ·
//   exportDir↔export-dir · logsDir↔logs-dir · workers[].toggles↔[data-toggle=thinking|search]（配置值，随外包工）；
//   fragments.* = 一键复制的两形态文本（生成器权威）。
// 单写者 = 主进程：渲染层只经 IPC（preload → window.mjs 转发）调用本服务，不直接触达文件系统。

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOutboxDir, dirHasWriteAccess } from '../shared/outbox.mjs';
import { applyPatch, PATCH_OPS, PLATFORM_CHOICES } from './patches.mjs';
import { buildFragments, stringifyFragment } from './fragments.mjs';
import { exportFragments, exportDirFor } from './export.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

/** 「打开随包文档」开发期落点（b4 打包后 = 安装目录 `guide/agent-onboarding.md`） */
export const GUIDE_PATH = path.join(repoRoot, 'docs', 'guide', 'agent-onboarding.md');

/** 端口不可用时的建议文案（与 docs/design/overview.md §2.3 同源） */
export const PORT_UNAVAILABLE_SUGGESTION = '释放占用端口的程序，或改写 mcp.port 期望端口后重启';

/** 引擎「打开并检查」词表（与 opening 阶段同源；scheduler.md §10） */
export const CHECK_STATUSES = ['ready', 'login_required', 'captcha', 'unavailable'];

/**
 * 创建设置服务。
 * @param {{config: object, scheduler: object, engine: object, log: object, userDataDir: string,
 *          version: string, getServiceInfo?: () => object, broadcast?: (snapshot: object) => void}} deps
 *        getServiceInfo = MCP 服务实况（{ok, url, port, reason}；未就绪 ⇒ 空对象）；
 *        broadcast = 窗口广播（配置变更 / 检查完成 / 回落发生时推全量快照）
 */
export function createSettingsService({
  config,
  scheduler,
  engine,
  log,
  userDataDir,
  version,
  getServiceInfo = () => ({}),
  broadcast = null,
}) {
  const exportDir = exportDirFor(userDataDir);
  const logsDir = path.join(userDataDir, 'logs');

  /** 实际监听端口（服务未启动 ⇒ 期望端口，作片段样板） */
  function actualPort() {
    const svc = getServiceInfo() || {};
    return svc.ok && Number.isInteger(svc.port) ? svc.port : config.current.mcp.port;
  }

  /** 只读快照（渲染层唯一读入口；页面打开与每次广播都取全量） */
  async function getSnapshot() {
    const cfg = config.current;
    const svc = getServiceInfo() || {};
    const running = svc.ok === true && !!svc.url;
    const frag = buildFragments({ host: '127.0.0.1', port: actualPort() });
    const outbox = await resolveOutboxDir(cfg.outboxDir, { log });
    return {
      version,
      service: {
        state: running ? 'running' : 'stopped',
        url: running ? svc.url : null,
        sseUrl: running ? `http://127.0.0.1:${svc.port}/sse` : null,
        port: running ? svc.port : null,
        expectedPort: cfg.mcp.port,
        drift: running && svc.port !== cfg.mcp.port,
        reason: running ? null : svc.reason || 'MCP 服务未启动（详见日志）',
        suggestion: running ? null : PORT_UNAVAILABLE_SUGGESTION,
      },
      fragments: {
        url: frag.url,
        mcpJson: stringifyFragment(frag.mcpJson),
        mcpServers: stringifyFragment(frag.mcpServers),
      },
      // workers 视图 = list_workers 词表（workforce.list()，不含 toggles）+ 该外包工的开关配置值（config.workers[].toggles；
      // 兜底默认与 config-schema 的 workers[].toggles 同源——listWorkers() 即源于同一数组，故为不可达兜底）。
      // toggles 只并入设置快照：list_workers（tools.mjs:89）与 /healthz（server.mjs:102）直取 scheduler.listWorkers()，不经此处。
      workers: scheduler.listWorkers().map((w) => ({
        ...w,
        toggles: config.current.workers.find((x) => x.id === w.id)?.toggles ?? { thinking: false, search: false },
      })),
      platforms: PLATFORM_CHOICES,
      outbox: {
        configured: outbox.configured,
        actual: outbox.dir,
        fallback: outbox.fallback,
        reason: outbox.reason,
        note: outbox.fallback ? `已回落：${outbox.reason || '配置目录不可用'}` : null,
      },
      exportDir,
      logsDir,
      guide: { path: GUIDE_PATH, available: fs.existsSync(GUIDE_PATH) },
      ops: PATCH_OPS,
    };
  }

  /** 推全量快照给窗口（无窗口 / 未接线 ⇒ 跳过，不报错） */
  async function emitChanged(reason = null) {
    if (typeof broadcast !== 'function') return false;
    let ok = false;
    try {
      ok = broadcast(await getSnapshot()) === true;
    } catch (e) {
      log.warn(`设置窗口广播失败：${e?.message || e}`);
    }
    if (reason) log.debug?.(`设置窗口广播（${reason}）${ok ? '已发送' : '跳过（窗口未打开）'}`);
    return ok;
  }

  // -------------------------------------------------------------------------
  // 配置变更（唯一写入口 = patch 清单；T8：校验 → 原子写 + .bak → 广播）
  // -------------------------------------------------------------------------

  /** 卫生：清理不在名册里的健康记录（防「删除 ⇒ 重加」复用 id 时继承被删条目的状态；健康记录只对当前名册有意义） */
  function pruneWorkerHealth(reason) {
    const wf = scheduler.workforce;
    try {
      if (!wf || typeof wf.clearHealth !== 'function' || typeof wf.health?.keys !== 'function') return;
      const live = new Set(config.current.workers.map((w) => w.id));
      const stale = [...wf.health.keys()].filter((id) => !live.has(id));
      for (const id of stale) wf.clearHealth(id);
      if (stale.length) log.info(`配置变更后清理孤儿健康记录 ${stale.length} 条（${reason}）`);
    } catch (e) {
      log.warn(`清理孤儿健康记录失败：${e?.message || e}`);
    }
  }

  /** @returns {Promise<{ok: true} | {ok: false, error: string}>} */
  async function patch(op) {
    let res;
    try {
      res = await applyPatch(config.current, op, { checkDir: (dir) => dirHasWriteAccess(dir) });
    } catch (e) {
      log.error(`patch 校验异常：${e?.stack || e}`);
      return { ok: false, error: `校验异常：${e?.message || e}` };
    }
    if (!res.ok) return { ok: false, error: res.error };
    try {
      const issues = await config.save(res.config);
      for (const issue of issues) log.warn(`配置保存校验：${issue}`);
    } catch (e) {
      // ConfigStore.save 写失败已回滚内存（内存与磁盘不漂移）；此处只负责把错误交给界面
      log.error(`配置保存失败（已回滚内存）：${e?.message || e}`);
      return { ok: false, error: `保存失败（改动已回滚）：${e?.message || e}` };
    }
    log.info(`配置已更新并落盘（${op?.op}）：${config.file}`);
    pruneWorkerHealth(op?.op);
    // 即时生效：外包工变动后让排队任务按既有复核语义处置（scheduler.md §5 出队复核）
    try {
      scheduler.pump();
    } catch (e) {
      log.warn(`配置变更后队列复核失败：${e?.message || e}`);
    }
    await emitChanged(`patch ${op?.op}`);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // 「打开并检查」（T6；引擎 worker.check 的调用预算 = 本节显式超时）
  // -------------------------------------------------------------------------

  /** @returns {Promise<{ok: true, status: string, detail: string|null} | {ok: false, error: string}>} */
  async function checkWorker(id) {
    const workerId = typeof id === 'string' ? id.trim() : '';
    const w = workerId ? scheduler.workforce.byId(workerId) : null;
    if (!w) return { ok: false, error: '外包工不存在（可能已被删除）' };
    if (scheduler.runner.isWorkerBusy(workerId)) {
      return { ok: false, error: `外包工「${w.name}」正在执行任务，暂不能检查（等任务结束后再试）` };
    }
    const timeoutMs = config.current.limits.timeouts.openingMs; // 不给引擎加预算入参（scheduler.md §10）
    let result;
    try {
      result = await engine.call(
        'worker.check',
        { worker: { id: w.id, name: w.name, platform: w.platform } },
        { timeoutMs },
      );
    } catch (e) {
      const timeout = e?.code === 'E_TIMEOUT';
      log.warn(`外包工检查失败（${w.name}）：${e?.code || ''} ${e?.message || e}`);
      return {
        ok: false,
        error: timeout
          ? `检查超时（${Math.round(timeoutMs / 1000)} 秒；本次结果已丢弃，可再点一次重试）`
          : `检查失败：${e?.message || e}`,
      };
    }
    if (result && result.error) {
      log.warn(`外包工检查失败（${w.name}）：${result.error.code || ''} ${result.error.message || ''}`);
      return { ok: false, error: `检查失败：${result.error.message || result.error.code || '未知错误'}` };
    }
    const status = result?.status;
    if (!CHECK_STATUSES.includes(status)) {
      log.warn(`外包工检查返回未知状态（${w.name}）：${JSON.stringify(status)}`);
      return { ok: false, error: `引擎返回了未知检查状态：${JSON.stringify(status)}` };
    }
    const detail = typeof result.detail === 'string' && result.detail ? result.detail : null;
    if (!scheduler.workforce.byId(workerId)) {
      // 检查期间该外包工被删除：结果无对象可归属 ⇒ 不写回（记日志、界面明示）
      log.warn(`外包工「${w.name}」检查期间已被删除，检查结果（${status}）丢弃不写回`);
      return { ok: false, error: '外包工在检查期间已被删除（检查结果已丢弃）' };
    }
    scheduler.workforce.markChecked(workerId, { status, detail });
    log.info(`外包工检查完成（${w.name}）：${status}${detail ? `（${detail}）` : ''}`);
    await emitChanged(`check ${workerId}`);
    return { ok: true, status, detail };
  }

  // -------------------------------------------------------------------------
  // 交付目录（T11）与导出 / 打开路径 / 复制落点（T9 / T10 / T12）
  // -------------------------------------------------------------------------

  /** 目录选择器选定后的提交前校验（提交前校验 = 设计 §5；落配置仍走 patch 清单） */
  async function validateOutboxDir(dir) {
    const d = typeof dir === 'string' ? dir.trim() : '';
    if (!d) return { ok: false, error: '目录不能为空' };
    const usable = await dirHasWriteAccess(d);
    return usable
      ? { ok: true, dir: d }
      : { ok: false, error: `目录不可用（不存在且不可创建，或不可写）：${d}` };
  }

  /** 一键导出两形态片段到 <userData>/export/（覆盖刷新同一文件；R9·F9.6） */
  async function exportFragmentFiles() {
    try {
      const r = await exportFragments({ dir: exportDir, port: actualPort(), host: '127.0.0.1', log });
      return { ok: true, dir: r.dir, files: r.files, url: r.url };
    } catch (e) {
      log.error(`导出接入片段失败：${e?.message || e}`);
      return { ok: false, error: `导出失败：${e?.message || e}` };
    }
  }

  /** 打开类动作的落点解析（真实打开动作由窗口层经 shell 执行） */
  async function resolveOpenPath(kind) {
    const k = typeof kind === 'string' ? kind.trim() : '';
    if (k === 'outbox') {
      const outbox = await resolveOutboxDir(config.current.outboxDir, { log });
      if (!outbox.dir) return { ok: false, error: `交付目录不可用：${outbox.reason}` };
      return { ok: true, path: outbox.dir };
    }
    if (k === 'export') {
      try {
        await fsp.mkdir(exportDir, { recursive: true });
        return { ok: true, path: exportDir };
      } catch (e) {
        return { ok: false, error: `导出目录不可用：${e?.message || e}` };
      }
    }
    if (k === 'logs') {
      try {
        await fsp.mkdir(logsDir, { recursive: true });
        return { ok: true, path: logsDir };
      } catch (e) {
        return { ok: false, error: `日志目录不可用：${e?.message || e}` };
      }
    }
    if (k === 'guide') {
      if (!fs.existsSync(GUIDE_PATH)) {
        return { ok: false, error: `随包文档不存在：${GUIDE_PATH}（b4 随包后可用）` };
      }
      return { ok: true, path: GUIDE_PATH };
    }
    return { ok: false, error: `未知路径类型：${JSON.stringify(kind)}（应为 outbox / export / logs / guide）` };
  }

  /** 运行期交付目录回落（scheduler 'outbox-fallback' 的接线落点）：广播实际落点与原因（T11 / M3） */
  async function notifyOutboxFallback(outbox) {
    const info = outbox || {};
    log.info(`设置窗口：交付目录回落事件转发（实际落点=${info.dir ?? '(无)'}；原因=${info.reason ?? '(未知)'}）`);
    await emitChanged('outbox-fallback');
  }

  return {
    getSnapshot,
    emitChanged,
    patch,
    checkWorker,
    validateOutboxDir,
    exportFragmentFiles,
    resolveOpenPath,
    notifyOutboxFallback,
    /** 导出目录（关于页 / 接入指引页显示用） */
    exportDir,
    logsDir,
  };
}
