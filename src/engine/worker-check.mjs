/**
 * 「打开并检查」引擎侧通道（b2 设置界面的引擎侧能力；设计权威：
 * `docs/design/modules/scheduler.md` §10 增量方法 `worker.check`、`docs/design/modules/settings-app.md` §2）。
 *
 * 语义：
 *   · 打开 / 复用该外包工的浏览器会话到平台页 → 刷新登录态（判定口径与 opening 阶段同源：`opening.waitForLoginState`）；
 *   · **不发送消息、不关窗口**——窗口留给人工登录（登录引导；`docs/design/modules/browser-engine.md` §5）；
 *   · 该外包工有在途任务 ⇒ 直接拒绝（`result.error`）——不干扰执行中的任务；
 *   · 浏览器 / 会话起不来 ⇒ `{status:'unavailable', detail}`（检查不抛、不悬挂）。
 *
 * 调用预算：deadline 权威 = 主进程（按 `limits.timeouts.openingMs` 设本次显式调用超时——`scheduler.md` §10）；
 * 引擎不读配置、协议不传预算——`budgetMs` 仅为引擎侧内部缺省（= 引擎默认 opening 预算；自证脚本可传短值），
 * **尽力而为、不作硬上界**（浏览器启动不受其约束；硬上界 = 主进程的显式调用超时）。
 */
import { adapterFor } from './adapters/registry.mjs';
import { ensureOnPlatform, loginFailureError, waitForLoginState } from './opening.mjs';
import { DEFAULT_TIMEOUTS } from './task-runner.mjs';
import { remainingMs } from './util.mjs';

/** 该外包工是否有在途任务（既有在途登记 = `TaskRunner.tasks`：登记先于等锁，执行中与排队中都算） */
function hasInFlightTask(runner, workerId) {
  const tasks = runner?.tasks;
  if (!tasks || typeof tasks.values !== 'function') return false;
  for (const task of tasks.values()) {
    if (task?.workerId === workerId) return true;
  }
  return false;
}

/** 失败消息短形（detail / 日志用）：去 ANSI 色码、折叠换行、截断——detail 会进健康记录 / 界面，须单行短文本 */
const shortMessage = (e, max = 200) =>
  String(e?.message ?? e)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/**
 * 执行一次「打开并检查」。
 * @param {{browser: object, runner: object, worker?: {id?: string, name?: string, platform?: string}, log?: (m: string) => void, budgetMs?: number}} opts
 *        `browser` = `BrowserHost`（`ensureSession` / `sessionPage`）；`runner` = `TaskRunner`（在途登记）。
 * @returns {Promise<{status: 'ready'|'login_required'|'captcha'|'unavailable', detail?: string} | {error: {code: string, message: string, hint?: string}}>}
 *          成功 = `{status, detail?}`；失败（入参缺 / 有在途任务）走 `result.error` 口径（`scheduler.md` §10）。
 */
export async function checkWorker({ browser, runner, worker, log = () => {}, budgetMs = DEFAULT_TIMEOUTS.openingMs } = {}) {
  const workerId = worker?.id;
  if (!workerId || !worker?.platform) {
    return { error: { code: 'E_BAD_ARGS', message: 'worker.check 缺必填参数：worker.id、worker.platform' } };
  }

  if (hasInFlightTask(runner, workerId)) {
    log(`检查被拒绝：该外包工有在途任务（worker=${workerId}）`);
    // 忙碌拒绝复用既有码 E_WORKER_UNAVAILABLE（错误码表封闭，b2 边界禁新增错误码）；该态任务结束即自解
    return {
      error: {
        code: 'E_WORKER_UNAVAILABLE',
        message: `外包工「${worker.name || workerId}」有在途任务：检查请求被拒绝（不干扰执行中的任务）`,
        hint: '等该外包工的任务结束后再检查',
      },
    };
  }

  const adapter = adapterFor(worker);
  if (!adapter) {
    log(`检查不可用：平台适配器未注册（platform=${worker.platform}）`);
    return { status: 'unavailable', detail: `平台适配器未注册：${worker.platform}` };
  }

  const deadline = Date.now() + budgetMs;
  let phase = '浏览器会话';
  try {
    const page = await browser.sessionPage(workerId);
    phase = '平台页';
    const nav = await ensureOnPlatform(page, adapter, deadline);
    log(`打开平台页（${nav.via}）worker=${workerId} url=${page.url()}`);
    phase = '登录态判定';
    const state = await waitForLoginState(page, adapter, remainingMs(deadline));
    // 「输入区未找到」类诊断（b7 loginFailure 钩子）⇒ unavailable + detail（徽标直读）；其余按既有映射
    if (state !== 'ready' && state !== 'captcha') {
      const diag = await loginFailureError(state, adapter, page);
      if (diag.code === 'E_SELECTOR_MISSING') {
        log(`检查完成 worker=${workerId} status=unavailable（${diag.message}）`);
        return { status: 'unavailable', detail: diag.message };
      }
    }
    // 判定口径与 opening 阶段同源；未判定（超时 / 未知值）⇒ login_required（保守交人工，T6 边界）
    const status = state === 'ready' || state === 'captcha' ? state : 'login_required';
    log(`检查完成 worker=${workerId} status=${status}（窗口保留、未发送消息）`);
    return { status };
  } catch (e) {
    log(`检查失败（${phase}）：${shortMessage(e, 400)}`);
    return { status: 'unavailable', detail: `${phase}未就绪：${shortMessage(e)}` };
  }
}
