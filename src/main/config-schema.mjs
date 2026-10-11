// 配置 schema 与校验（纯函数）：默认值 + 归一化（非法项隔离 / 回退默认并记 issue）。
// 设计权威：docs/design/overview.md「配置存储」。存储与读写见 config.mjs。

import { DEFAULT_OUTBOX_DIR } from '../shared/outbox.mjs';

export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  mcp: { port: 17873, host: '127.0.0.1', token: '' },
  // 出厂随包 Chromium：mode=chromium 且 channel 空 ⇒ 引擎用随包运行时（b4）；切系统 Edge = mode:'edge' + 重启
  browser: { mode: 'chromium', channel: '', headless: false },
  outboxDir: DEFAULT_OUTBOX_DIR,
  workers: [
    {
      id: 'w-1',
      platform: 'deepseek',
      name: 'DeepSeek',
      enabled: true,
      toggles: { thinking: false, search: false },
    },
  ],
  limits: {
    maxFileBytes: 52428800,
    maxInlineTextChars: 100000,
    maxTaskChars: 50000,
    maxAttachFiles: 10,
    timeouts: {
      openingMs: 60000,
      uploadingMs: 60000,
      sendingMs: 30000,
      streamFirstByteMs: 120000,
      taskTimeoutMs: 300000,
      extractingMs: 60000,
    },
  },
  scheduler: { globalConcurrency: 2, perWorkerConcurrency: 1, retryPerWorker: 2, maxFailoverWorkers: 3 },
  session: { reuse: true, ttlMs: 600000, maxTasksPerSession: 5 },
};

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function pickNumber(value, fallback, { min, max, integer = true }, issues, label) {
  if (value === undefined) return fallback;
  const n = Number(value);
  const ok = Number.isFinite(n) && (!integer || Number.isInteger(n)) && n >= min && n <= max;
  if (!ok) {
    issues.push(`${label} 非法（${JSON.stringify(value)}），回退默认 ${fallback}`);
    return fallback;
  }
  return n;
}

function pickBoolean(value, fallback, issues, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    issues.push(`${label} 非法（${JSON.stringify(value)}），回退默认 ${fallback}`);
    return fallback;
  }
  return value;
}

function pickEnum(value, allowed, fallback, issues, label) {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && allowed.includes(value)) return value;
  issues.push(`${label} 非法（${JSON.stringify(value)}），回退默认 ${fallback}`);
  return fallback;
}

function pickString(value, fallback, issues, label) {
  if (value === undefined) return fallback;
  if (typeof value === 'string') return value;
  issues.push(`${label} 非法（${JSON.stringify(value)}），回退默认`);
  return fallback;
}

const MAX_INT = Number.MAX_SAFE_INTEGER;

/**
 * 归一化：非法项回退默认并记一条 issue（调用方记日志，不静默丢）。
 * @returns {{config: object, issues: string[]}}
 */
export function normalizeConfig(raw) {
  const issues = [];
  const d = DEFAULT_CONFIG;
  if (!isPlainObject(raw)) {
    issues.push('配置根不是对象，整份回退默认值');
    return { config: structuredClone(d), issues };
  }

  const src = raw;
  const config = { ...structuredClone(d) };

  config.version = pickNumber(src.version, d.version, { min: 1, max: 9999 }, issues, 'version');

  // mcp：host 固定 127.0.0.1（不提供跳网访问——R9 边界；非该值按非法配置处理）
  const mcpSrc = isPlainObject(src.mcp) ? src.mcp : {};
  if (src.mcp !== undefined && !isPlainObject(src.mcp)) issues.push('mcp 不是对象，回退默认值');
  config.mcp = {
    port: pickNumber(mcpSrc.port, d.mcp.port, { min: 1, max: 65535 }, issues, 'mcp.port'),
    host: pickEnum(mcpSrc.host, ['127.0.0.1'], d.mcp.host, issues, 'mcp.host'),
    token: pickString(mcpSrc.token, d.mcp.token, issues, 'mcp.token').trim(),
  };

  // browser
  const browserSrc = isPlainObject(src.browser) ? src.browser : {};
  if (src.browser !== undefined && !isPlainObject(src.browser)) issues.push('browser 不是对象，回退默认值');
  config.browser = {
    mode: pickEnum(browserSrc.mode, ['chromium', 'edge'], d.browser.mode, issues, 'browser.mode'),
    channel: pickString(browserSrc.channel, d.browser.channel, issues, 'browser.channel'),
    headless: pickBoolean(browserSrc.headless, d.browser.headless, issues, 'browser.headless'),
  };

  // outboxDir（实际路径解析与回落见 docs/design/modules/outbox.md）
  if (src.outboxDir !== undefined && typeof src.outboxDir !== 'string') {
    issues.push('outboxDir 非法（非字符串），回退默认');
  }
  config.outboxDir =
    typeof src.outboxDir === 'string' && src.outboxDir.trim() ? src.outboxDir.trim() : d.outboxDir;

  // workers（数组顺序即优先级；K12）
  if (src.workers !== undefined && !Array.isArray(src.workers)) {
    issues.push('workers 不是数组，回退默认外包工列表');
    config.workers = structuredClone(d.workers);
  } else if (Array.isArray(src.workers)) {
    const workers = [];
    const seenIds = new Set();
    const seenNames = new Set();
    src.workers.forEach((w, i) => {
      if (!isPlainObject(w)) {
        issues.push(`workers[${i}] 不是对象，已隔离`);
        return;
      }
      const name = typeof w.name === 'string' && w.name.trim() ? w.name.trim() : null;
      const platform = typeof w.platform === 'string' && w.platform.trim() ? w.platform.trim() : null;
      if (!name || !platform) {
        issues.push(`workers[${i}] 缺少 name / platform，已隔离`);
        return;
      }
      if (seenNames.has(name)) {
        issues.push(`workers[${i}] 名称重复（${name}），已隔离`);
        return;
      }
      let id = typeof w.id === 'string' && w.id.trim() ? w.id.trim() : `w-${i + 1}`;
      if (seenIds.has(id)) {
        issues.push(`workers[${i}] id 重复（${id}），改用 ${id}-${i + 1}`);
        id = `${id}-${i + 1}`;
      }
      const togglesSrc = isPlainObject(w.toggles) ? w.toggles : {};
      workers.push({
        id,
        platform,
        name,
        enabled: pickBoolean(w.enabled, true, issues, `workers[${i}].enabled`),
        toggles: {
          thinking: pickBoolean(togglesSrc.thinking, false, issues, `workers[${i}].toggles.thinking`),
          search: pickBoolean(togglesSrc.search, false, issues, `workers[${i}].toggles.search`),
        },
      });
      seenIds.add(id);
      seenNames.add(name);
    });
    if (!workers.length && src.workers.length > 0) {
      issues.push('workers 无合法条目，回退默认外包工列表');
      config.workers = structuredClone(d.workers);
    } else {
      config.workers = workers; // 空数组合法（派单期 ⇒ E_NO_WORKER）
    }
  }

  // limits / limits.timeouts
  const limitsSrc = isPlainObject(src.limits) ? src.limits : {};
  if (src.limits !== undefined && !isPlainObject(src.limits)) issues.push('limits 不是对象，回退默认值');
  const timeoutsSrc = isPlainObject(limitsSrc.timeouts) ? limitsSrc.timeouts : {};
  if (limitsSrc.timeouts !== undefined && !isPlainObject(limitsSrc.timeouts)) {
    issues.push('limits.timeouts 不是对象，回退默认值');
  }
  config.limits = {
    maxFileBytes: pickNumber(limitsSrc.maxFileBytes, d.limits.maxFileBytes, { min: 1, max: MAX_INT }, issues, 'limits.maxFileBytes'),
    maxInlineTextChars: pickNumber(limitsSrc.maxInlineTextChars, d.limits.maxInlineTextChars, { min: 1, max: MAX_INT }, issues, 'limits.maxInlineTextChars'),
    maxTaskChars: pickNumber(limitsSrc.maxTaskChars, d.limits.maxTaskChars, { min: 1, max: MAX_INT }, issues, 'limits.maxTaskChars'),
    maxAttachFiles: pickNumber(limitsSrc.maxAttachFiles, d.limits.maxAttachFiles, { min: 1, max: 1000 }, issues, 'limits.maxAttachFiles'),
    timeouts: {
      openingMs: pickNumber(timeoutsSrc.openingMs, d.limits.timeouts.openingMs, { min: 1, max: MAX_INT }, issues, 'limits.timeouts.openingMs'),
      uploadingMs: pickNumber(timeoutsSrc.uploadingMs, d.limits.timeouts.uploadingMs, { min: 1, max: MAX_INT }, issues, 'limits.timeouts.uploadingMs'),
      sendingMs: pickNumber(timeoutsSrc.sendingMs, d.limits.timeouts.sendingMs, { min: 1, max: MAX_INT }, issues, 'limits.timeouts.sendingMs'),
      streamFirstByteMs: pickNumber(timeoutsSrc.streamFirstByteMs, d.limits.timeouts.streamFirstByteMs, { min: 1, max: MAX_INT }, issues, 'limits.timeouts.streamFirstByteMs'),
      taskTimeoutMs: pickNumber(timeoutsSrc.taskTimeoutMs, d.limits.timeouts.taskTimeoutMs, { min: 1, max: MAX_INT }, issues, 'limits.timeouts.taskTimeoutMs'),
      extractingMs: pickNumber(timeoutsSrc.extractingMs, d.limits.timeouts.extractingMs, { min: 1, max: MAX_INT }, issues, 'limits.timeouts.extractingMs'),
    },
  };

  // scheduler
  const schedSrc = isPlainObject(src.scheduler) ? src.scheduler : {};
  if (src.scheduler !== undefined && !isPlainObject(src.scheduler)) issues.push('scheduler 不是对象，回退默认值');
  config.scheduler = {
    globalConcurrency: pickNumber(schedSrc.globalConcurrency, d.scheduler.globalConcurrency, { min: 1, max: 16 }, issues, 'scheduler.globalConcurrency'),
    perWorkerConcurrency: pickNumber(schedSrc.perWorkerConcurrency, d.scheduler.perWorkerConcurrency, { min: 1, max: 16 }, issues, 'scheduler.perWorkerConcurrency'),
    retryPerWorker: pickNumber(schedSrc.retryPerWorker, d.scheduler.retryPerWorker, { min: 0, max: 10 }, issues, 'scheduler.retryPerWorker'),
    maxFailoverWorkers: pickNumber(schedSrc.maxFailoverWorkers, d.scheduler.maxFailoverWorkers, { min: 1, max: 16 }, issues, 'scheduler.maxFailoverWorkers'),
  };

  // session（会话复用策略；机制权威 = docs/design/modules/browser-engine.md §9）
  const sessionSrc = isPlainObject(src.session) ? src.session : {};
  if (src.session !== undefined && !isPlainObject(src.session)) issues.push('session 不是对象，回退默认值');
  config.session = {
    reuse: pickBoolean(sessionSrc.reuse, d.session.reuse, issues, 'session.reuse'),
    ttlMs: pickNumber(sessionSrc.ttlMs, d.session.ttlMs, { min: 1, max: MAX_INT }, issues, 'session.ttlMs'),
    maxTasksPerSession: pickNumber(sessionSrc.maxTasksPerSession, d.session.maxTasksPerSession, { min: 1, max: 1000 }, issues, 'session.maxTasksPerSession'),
  };

  return { config, issues };
}
