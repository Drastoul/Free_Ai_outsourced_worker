// 平台能力派生（b6/T3）：快照 platforms[].toggles 子键对象的唯一来源——与引擎分支条件同源（适配器注册表，D5）。
// 缺信息 / 未知平台 ⇒ 两子键按不支持（D6）；两参数可注入（供批内单元覆盖回退分支）。
import { PLATFORM_CHOICES } from './patches.mjs';
import { getAdapter } from '../engine/adapters/registry.mjs';

/** 平台清单 ⇒ 增补 toggles 子键对象（能力位非 true 的键一律按不支持；形状 `{thinking, search}`） */
export function buildPlatforms(choices = PLATFORM_CHOICES, lookup = getAdapter) {
  return choices.map((p) => {
    const caps = lookup(p.id)?.capabilities?.toggles;
    return { ...p, toggles: { thinking: caps?.thinking === true, search: caps?.search === true } };
  });
}
