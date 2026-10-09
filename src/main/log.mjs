// 日志：落 <userData>/logs/app.log 并同步到控制台（设计权威：docs/design/overview.md「安全」——不记录敏感值）
// 口径：令牌 / Cookie / Authorization 头与完整响应体不入日志；调用方自行避免传入，本模块再对超长文本截断兜底。

import fs from 'node:fs';
import path from 'node:path';

const ROTATE_BYTES = 5 * 1024 * 1024;

/** 超长文本截断（日志面兜底） */
export function truncate(value, max = 400) {
  const s = typeof value === 'string' ? value : safeString(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(截断 ${s.length - max} 字)`;
}

function safeString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stamp(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}` +
    `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

function rotateIfNeeded(filePath) {
  try {
    const st = fs.statSync(filePath);
    if (st.size > ROTATE_BYTES) {
      try {
        fs.rmSync(`${filePath}.old`, { force: true });
      } catch {
        /* 覆盖失败则保留原 .old */
      }
      fs.renameSync(filePath, `${filePath}.old`);
    }
  } catch {
    /* 文件不存在：无需轮转 */
  }
}

/**
 * 创建日志器。
 * @param {{ dir?: string|null, console?: boolean, level?: 'debug'|'info'|'warn'|'error' }} [options]
 *        dir = userData 目录；为 null 时只输出控制台（不落盘）。
 */
export function createLogger({ dir = null, console: toConsole = true, level = 'info' } = {}) {
  const order = { debug: 10, info: 20, warn: 30, error: 40 };
  let filePath = null;
  if (dir) {
    try {
      fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
      filePath = path.join(dir, 'logs', 'app.log');
      rotateIfNeeded(filePath);
    } catch {
      filePath = null;
    }
  }
  const min = order[level] ?? order.info;

  const emit = (lvl, message, extra) => {
    if ((order[lvl] ?? 99) < min) return;
    let line = `[${stamp()}] [${lvl.toUpperCase()}] ${truncate(message, 2000)}`;
    if (extra !== undefined) line += ` ${truncate(extra, 2000)}`;
    if (toConsole) {
      const toErr = lvl === 'warn' || lvl === 'error';
      (toErr ? console.error : console.log)(line);
    }
    if (filePath) {
      try {
        fs.appendFileSync(filePath, `${line}\n`, 'utf8');
      } catch {
        /* 日志写入失败不影响主流程 */
      }
    }
  };

  return {
    filePath,
    debug: (msg, extra) => emit('debug', msg, extra),
    info: (msg, extra) => emit('info', msg, extra),
    warn: (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra),
  };
}
