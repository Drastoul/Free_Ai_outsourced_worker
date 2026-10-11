/**
 * b3 单元测试入口（随批归档；`node --test docs/batches/b3-kimi-adapter.units.mjs` 直跑）
 *
 * 覆盖（T4）：Kimi 流解析（帧形 / 完成判定 / 返回形）· 答复流命中判定 · 代码块抽取（共享实现，D5）。
 * 「读键」不适用：Kimi `toggles` / `requestPayloadCapture` 均 false（`src/engine/adapters/kimi.mjs:34-35`；
 * §1 裁定 3）⇒ 无载荷读键面可测（T4 目标句中的「读键」按此口径不适用）。
 * fixture（版本化基线，随批归档 —— 探针产物不入版本库）：
 *   · `b3-kimi-adapter.fixtures/chat-resp.txt`            —— `probe/out13/chat-resp.txt` 逐字节副本
 *   · `b3-kimi-adapter.fixtures/answer-stream.expected.md` —— 期望正文/思考（**独立推导**，路径与读数见其文件头）
 *
 * 拆分为 b2 先例同形（聚合入口 + 按测试对象分件；未触 300 行拆分档 —— 同 `b2-settings-ui.units.mjs` 的组织）：
 *   · `b3-kimi-adapter.units.fixtures.mjs` —— 共用件（fixture 读取 / 期望值提取 / 模块装载；不注册用例）
 *   · `b3-kimi-adapter.units.stream.mjs`  —— 流解析（全量逐字 / SET-only / 截断 / 完成归属）
 *   · `b3-kimi-adapter.units.match.mjs`   —— 命中判定
 *   · `b3-kimi-adapter.units.extract.mjs` —— 代码块抽取
 * 本入口只做聚合：node:test 的用例由被 import 的模块注册，随入口一并执行。
 */
import './b3-kimi-adapter.units.stream.mjs';
import './b3-kimi-adapter.units.match.mjs';
import './b3-kimi-adapter.units.extract.mjs';
