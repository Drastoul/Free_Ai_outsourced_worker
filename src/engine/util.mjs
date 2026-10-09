/**
 * 引擎内部小工具：日志 / 延时 / 余量计算。
 * 日志一律走 stderr（stdout 留给 JSON-RPC）；**不记录**令牌 / Cookie 等敏感值。
 */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 距 deadline 的剩余毫秒（下限 0） */
export const remainingMs = (deadline) => Math.max(0, deadline - Date.now());

/**
 * 给一个异步步骤套上截止时间：超时 ⇒ 以 `makeError()` 抛错（阶段预算整体收口）。
 * 注：超时后内部步骤可能仍在后台收尾，其后续拒绝被 race 吸收（不会变成未处理拒绝）。
 */
export async function withDeadline(fn, deadline, makeError) {
  const left = remainingMs(deadline);
  if (left <= 0) throw makeError();
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(makeError()), left);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 引擎日志（stderr，带启动后的相对时间） */
export function makeLogger(out = process.stderr) {
  const boot = Date.now();
  return (scope, message) => {
    const line = `[engine +${((Date.now() - boot) / 1000).toFixed(1)}s]${scope ? ` [${scope}]` : ''} ${message}`;
    try {
      out.write(`${line}\n`);
    } catch {
      /* 忽略写日志失败 */
    }
  };
}
