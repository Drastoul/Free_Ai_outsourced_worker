/**
 * b1 单元测试入口（随批归档；`node --test docs/batches/b1-core-loop.units.mjs` 直跑）
 *
 * 覆盖（设计权威：`docs/design/overview.md`「验收体系」单元行；职责分表见同档「b1 落地文件计划」测试面）：
 *   · SSE 解析 / 代码块提取 / 请求载荷读键
 *   · 命名净化与上限（穿越 / 保留名 / 长度 / 重名 / 超限 skippedFiles / 越界拒绝）
 *   · 选人（优先级 / 忙排队 / 降级 / 硬绑定 / 冷却映射）
 *   · 状态机（终态与 needs_human 分界，含 b1 单外包工 `E_SELECTOR_MISSING` ⇒ needs_human）
 *
 * 按测试对象拆分（设计档 §3.3：任一文件超 300 行 ⇒ 按测试对象拆分）：
 *   · `b1-core-loop.units.engine.mjs`    —— SSE 解析 / 代码块提取 / 载荷读键
 *   · `b1-core-loop.units.outbox.mjs`    —— 命名净化与上限
 *   · `b1-core-loop.units.scheduler.mjs` —— 选人 / 状态机 / 终态分界
 * 本入口只做聚合：node:test 的用例由被 import 的模块注册，随入口一并执行。
 *
 * 基线说明：SSE 基线以批次档 fixtures 为准（`probe/out3/answer-sse.md` 的 106 字为探针 3 解析器 bug 产物，
 * 不得作判据——见批次档 §1「实施期裁定与基线更正」与 `docs/design/modules/adapters.md`「验收判据」）。
 */
import './b1-core-loop.units.engine.mjs';
import './b1-core-loop.units.outbox.mjs';
import './b1-core-loop.units.scheduler.mjs';
