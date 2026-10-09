/**
 * b2 单元测试入口（随批归档；`node --test docs/batches/b2-settings-ui.units.mjs` 直跑）
 *
 * 覆盖（设计权威：`docs/design/modules/settings-app.md` §7 + 批次档 b2 §2「验收命令」单元行）：
 *   · patches 七操作：合法与非法（重名 / 空白 / 移动越界 / 平台白名单 / 不可用目录拒绝且不落配置 / 多余字段）
 *   · fragments 两形态与设计档 §2.3 样例逐字一致 + 端口参数化
 *   · export 写两文件 + 覆盖刷新不新增副本
 *   · config 写失败 ⇒ 抛错且内存配置不变（b1 缺口回归）· markChecked 记录形状与冷却语义（ready 记时间 /
 *     captcha ⇒ 对外 unavailable / 未知状态兜底 / 不在名册不写回）· recheckQueued 删除外包工后排队任务处置
 *     （被删 ⇒ 改派下一可用 / 无可用 ⇒ needs_human；指定任务 ⇒ 终态）
 *   · service 编排（fake engine：四态成功映射 / 引擎错误 / 显式超时 / busy / 未知 id / 写失败回滚 /
 *     快照形状含 workers[].toggles 读面 / 导出与打开落点 / 目录校验 / 孤儿健康记录 / 检查期间被删 / 回落转发）
 *   · scheduler outbox-fallback 事件去重键
 *
 * 按测试对象拆分（设计档 §3.3：任一文件超 300 行 ⇒ 按测试对象拆分），本入口只做聚合
 * （node:test 的用例由被 import 的模块注册，随入口一并执行）：
 *   · `b2-settings-ui.units.patches.mjs`    —— 配置变更纯函数面
 *   · `b2-settings-ui.units.fragments.mjs`  —— 接入片段面（fragments + export）
 *   · `b2-settings-ui.units.workforce.mjs`  —— 存储与名册面（config 回滚 / markChecked / recheckQueued / 回落事件）
 *   · `b2-settings-ui.units.service.mjs`    —— 设置服务编排面（配置落盘与快照）
 *   · `b2-settings-ui.units.check.mjs`      —— 「打开并检查」编排面（结果映射与调用预算）
 *   · `b2-settings-ui.units.fixtures.mjs`   —— 共享夹具（配置样板 / 临时目录 / 静默日志）
 */
import './b2-settings-ui.units.patches.mjs';
import './b2-settings-ui.units.fragments.mjs';
import './b2-settings-ui.units.workforce.mjs';
import './b2-settings-ui.units.service.mjs';
import './b2-settings-ui.units.check.mjs';
