/**
 * `verify:loop*` 共享辅助件（平台参数化与按能力位条件断言）——主文件 `loop.test.mjs` 控行 ≤300 行
 *（拆分档见 `docs/design/overview.md` §13 / §3.3）。
 *
 * 平台由环境变量 `FO_LOOP_PLATFORM` 选择（默认 `deepseek`：不带 env 时行为逐字同今日）。
 * 条件断言口径 = `docs/batches/b3-kimi-adapter.md` §2「验收命令」③–⑥：
 *   · `capabilities.downloadCapture === false` ⇒ 不得出现 `source='download'`，且须至少一个 `source='code_block'`（取件层②保底）；
 *   · `capabilities.toggles !== true` ⇒ 跳过载荷断言（不锁 `manifest.toggles.payload` / `ok` 值——
 *     `requestPayloadCapture=true` 时 payload 照常回报非空，属机制设计明示的合法路径）。
 * 能力位从适配器注册表读取（与实现同源，不在测试里另抄一份）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getAdapter, listAdapters } from '../../src/engine/adapters/registry.mjs';

/** 每平台外包工名表（默认名 = 平台名；从适配器注册表派生，不另抄一份——平台改名不会漂移） */
export const PLATFORM_WORKER_NAMES = Object.fromEntries(listAdapters().map((a) => [a.id, a.platformName]));

/** 选中平台（env 缺省 / 空白 ⇒ `deepseek`；未知平台由 `workerName` / `capabilitiesOf` 明确报错） */
export const PLATFORM = (process.env.FO_LOOP_PLATFORM || '').trim() || 'deepseek';

/** 平台对应的外包工名（写 config 与读数用） */
export function workerName(platform = PLATFORM) {
  const name = PLATFORM_WORKER_NAMES[platform];
  assert.ok(name, `未知平台 ${JSON.stringify(platform)}（FO_LOOP_PLATFORM 仅支持：${Object.keys(PLATFORM_WORKER_NAMES).join(' / ')}）`);
  return name;
}

/** 平台适配器能力位（注册表取；未注册 ⇒ 断言失败） */
export function capabilitiesOf(platform = PLATFORM) {
  const adapter = getAdapter(platform);
  assert.ok(adapter, `平台 ${JSON.stringify(platform)} 未注册适配器（src/engine/adapters/registry.mjs）`);
  return adapter.capabilities;
}

/**
 * 取件判据（AC-R3-1）+ 按能力位条件断言（下载捕获）。
 * @param {{capabilities: object, manifest: object, fileNames: string[], taskDir: string}} o
 * @returns {string[]} 各交付文件的 `source`（供读数）
 */
export function assertDeliveryOutcome({ capabilities, manifest, fileNames, taskDir }) {
  assert.ok(fileNames.length >= 1, 'files/ 应至少 1 个文件（下载捕获 / 代码块提取；AC-R3-1）');
  // 文件清单契约（不锁平台侧命名：平台可能把代码块渲染为「文件/画布」⇒ 落盘名由下载建议名给出）
  const deliveryFiles = manifest.delivery?.files ?? [];
  assert.equal(deliveryFiles.length, fileNames.length, 'manifest 文件清单应与 files/ 实况一致');
  for (const f of deliveryFiles) {
    assert.ok(f.name && f.relPath && f.bytes > 0 && /^[0-9a-f]{64}$/.test(f.sha256 ?? ''), `文件条目形状不完整：${JSON.stringify(f)}`);
    assert.equal(path.dirname(path.join(taskDir, f.relPath)), path.join(taskDir, 'files'), `${f.name} 应落在 files/ 内`);
    assert.ok(fs.existsSync(path.join(taskDir, f.relPath)), `${f.relPath} 应实际存在`);
    assert.ok(['download', 'code_block'].includes(f.source), `取件层来源：${f.source}`);
  }
  const sources = deliveryFiles.map((f) => f.source);
  if (capabilities.downloadCapture === false) {
    assert.ok(sources.every((s) => s !== 'download'), `downloadCapture=false ⇒ 不得出现 source='download'：${JSON.stringify(sources)}`);
    assert.ok(sources.includes('code_block'), `downloadCapture=false ⇒ 须至少一个 source='code_block'（取件层②保底）：${JSON.stringify(sources)}`);
  }
  return sources;
}

/**
 * 开关判据（AC-R8-1）+ 按能力位条件断言。
 * `capabilities.toggles === true` ⇒ 载荷核对（`configured` ↔ `payload` 一致）；否则跳过载荷断言。
 * @returns {object|null} 载荷核对面返回 `manifest.toggles`（供读数）；跳过面返回 null。
 */
export function assertTogglesOutcome({ capabilities, manifest, wantToggles }) {
  assert.deepEqual(manifest.toggles?.configured, wantToggles, `manifest.toggles.configured 应等于外包工配置值：${JSON.stringify(manifest.toggles)}`);
  if (capabilities.toggles !== true) return null; // 无开关能力位 ⇒ 跳过载荷断言（§2 验收⑥）
  assert.ok(manifest.toggles?.payload, `未捕获请求载荷（toggles=${JSON.stringify(manifest.toggles)}）`);
  assert.equal(manifest.toggles.payload.thinking_enabled, wantToggles.thinking, '载荷 thinking_enabled 应与配置一致');
  assert.equal(manifest.toggles.payload.search_enabled, wantToggles.search, '载荷 search_enabled 应与配置一致');
  assert.equal(manifest.toggles.ok, true, 'configured 与 payload 应一致');
  return manifest.toggles;
}
