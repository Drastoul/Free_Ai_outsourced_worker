// 标识生成：任务号与随机段（设计权威：docs/design/modules/scheduler.md「任务模型」）
// 任务号形如 YYYYMMDD-HHmmss-<4位随机>（本地时间，人可读；撞名由调用方重新生成随机段）

import { randomBytes } from 'node:crypto';

/** n 位十六进制随机段（小写） */
export function randomHex(len = 4) {
  return randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

/** 本地时间戳：yyyymmdd-HHmmss */
export function timestampLocal(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

/** 任务号：YYYYMMDD-HHmmss-<4位随机> */
export function newTaskId(date = new Date()) {
  return `${timestampLocal(date)}-${randomHex(4)}`;
}
