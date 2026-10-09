/**
 * 适配器注册表（`docs/design/modules/adapters.md` §1：加平台＝加模块）。
 * 引擎按任务所属外包工的 `worker.platform` 取适配器；未注册的平台由调用方按 `E_WORKER_UNAVAILABLE` 处置。
 */
import deepseek from './deepseek.mjs';

const adapters = new Map();

/** 注册（重复注册同 id ⇒ 覆盖；供 b3 起新增平台使用） */
export function registerAdapter(adapter) {
  adapters.set(adapter.id, adapter);
  return adapter;
}

/** 取适配器；未注册 ⇒ null */
export function getAdapter(platformId) {
  return adapters.get(platformId) ?? null;
}

/** 全部适配器（按注册顺序） */
export function listAdapters() {
  return [...adapters.values()];
}

registerAdapter(deepseek);
