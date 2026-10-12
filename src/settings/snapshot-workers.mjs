// 外包工列表快照投影（b7/T1）：workforce.list() 词表 + 该外包工的配置值（toggles；自定义平台另带 url / driver）。
// 设计权威：docs/design/modules/settings-app.md §2（自定义外包工）；快照字段契约 = 批次档 b7 §2「冻结接口」。

import { DRIVER_KEYS } from './patches-custom.mjs'; // 驱动三键常量的 settings 面单一来源（= F11.3「二次优化」接口）

/** 驱动三键投影（缺项按空串——回读与派单口径同源） */
function driverView(driver) {
  const d = driver || {};
  const out = {};
  for (const k of DRIVER_KEYS) out[k] = typeof d[k] === 'string' ? d[k] : '';
  return out;
}

/**
 * @param {object[]} listWorkers workforce.list()（list_workers 词表；含 enabled / status / lastCheckedAt）
 * @param {object[]} configWorkers config.current.workers（须与 listWorkers() 同一同步步取齐；缺项为防御分支）
 * @returns {object[]} 快照 workers 视图（内置条目形状不变；custom 条目增 url / driver）
 */
export function buildWorkersSnapshot(listWorkers, configWorkers) {
  return (listWorkers || []).map((w) => {
    const cfg = (configWorkers || []).find((x) => x.id === w.id);
    const view = { ...w, toggles: cfg?.toggles ?? { thinking: false, search: false } };
    if (w.platform === 'custom') {
      view.url = typeof cfg?.url === 'string' ? cfg.url : '';
      view.driver = driverView(cfg?.driver);
    }
    return view;
  });
}
