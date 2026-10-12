/**
 * b7 单元测试入口（随批归档；`node --test docs/batches/b7-custom-workers.units.mjs` 直跑）
 *
 * 判据 = 批次档 b7 §2「验收对照」1 的 ①②④⑥（③⑤ 属引擎面 = 切分 A：③ 已由 `test/integration/engine.custom.test.mjs`
 * 落件、随 `verify:engine` 执行；⑤ 的行为侧由同件 R11-b「无回复」集成例覆盖）：
 *   ① config-schema：custom 条目 url / driver 归一化；缺 url / 非法 ⇒ 隔离并记 issue；内置条目带 url / driver ⇒ 记 issue 丢弃
 *   ② 补丁面：worker.add(custom) 与 worker.setDriver（部分更新 / 空串 / 未知键 / 非 custom 拒绝）；PATCH_OPS 含新 op
 *   ④ workforce.pick / nextAvailable 的 requireUpload：显式指定无送件能力者 ⇒ 同步拒绝 E_WORKER_UNAVAILABLE（不置冷却）；
 *      优先级 / 降级路径跳过（no-upload）；能力位取自适配器注册表归一化——另含 toEngineWorker 载荷断言
 *   ⑥ workforce 健康清除语义（置冷却 ⇒ clearHealth ⇒ 回 ready；clearAllHealth 不变）+ service.patch 的 setDriver 触发点
 *
 * 按测试对象拆分（先例 = b1 / b2 批内单元「任一文件超 300 行 ⇒ 拆分」，本入口只做聚合——
 * node:test 的用例由被 import 的模块注册，随入口一并执行）：
 *   · `b7-custom-workers.units.config.mjs`    —— 配置 schema 与补丁面（①②）
 *   · `b7-custom-workers.units.workforce.mjs` —— 名册与健康面（④⑥，含附件能力门）
 * 设计权威：docs/design/modules/scheduler.md §4·§6·§10；docs/design/modules/mcp-server.md §3.2；docs/design/modules/settings-app.md §2。
 */
import './b7-custom-workers.units.config.mjs';
import './b7-custom-workers.units.workforce.mjs';
