// MCP 工具面（六件套）：参数校验 + 处理实现 + 统一信封。
// 契约权威：docs/design/modules/mcp-server.md（§3 工具契约 / §5 错误码 / §6 参数校验要点）；工具定义（名称/描述/schema）= tool-defs.mjs。
// 实现说明：用 SDK 低层 Server 自管 tools/list 与 tools/call，是为了让「任何」失败（含缺参 / 类型错）
// 都走统一信封 {code,message,hint} + isError:true（契约 §3），而不是 SDK 高层的纯文本校验错误。

import fsp from 'node:fs/promises';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { apiError, toEnvelope } from './errors.mjs';
import { TOOL_DEFS } from './tool-defs.mjs';
import { isTerminalState } from '../scheduler/task.mjs';
import { readAnswerText } from '../../shared/outbox.mjs';

// ---------------------------------------------------------------------------
// 参数校验（mcp-server.md §6）
// ---------------------------------------------------------------------------

function requireTaskId(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw apiError('E_BAD_ARGS', 'taskId 必须是非空字符串（任务号由 dispatch_task 返回）');
  }
  return value.trim();
}

function parseWaitSeconds(raw) {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 600) {
    throw apiError('E_BAD_ARGS', `waitSeconds 必须是 0–600 的整数（收到 ${JSON.stringify(raw)}）`);
  }
  return raw;
}

/** 附件校验（聚合为一条 E_BAD_FILE，列出每个不合规项） */
export async function validateAttachFiles(raw, limits) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw apiError('E_BAD_ARGS', 'files 必须是绝对路径字符串数组');
  const problems = [];
  if (raw.length > limits.maxAttachFiles) {
    problems.push(`数量 ${raw.length} 超过上限 ${limits.maxAttachFiles}`);
  }
  const ok = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) {
      problems.push(`「${String(item)}」不是字符串路径`);
      continue;
    }
    const p = item.trim();
    if (!path.isAbsolute(p)) {
      problems.push(`「${p}」不是绝对路径`);
      continue;
    }
    let st;
    try {
      st = await fsp.stat(p);
    } catch {
      problems.push(`「${p}」不存在`);
      continue;
    }
    if (!st.isFile()) {
      problems.push(`「${p}」不是普通文件`);
      continue;
    }
    if (st.size > limits.maxFileBytes) {
      problems.push(`「${p}」大小 ${st.size} 超过上限 ${limits.maxFileBytes}`);
      continue;
    }
    ok.push(p);
  }
  if (problems.length) throw apiError('E_BAD_FILE', `附件不合规：${problems.join('；')}`);
  return ok;
}

// ---------------------------------------------------------------------------
// 工具实现
// ---------------------------------------------------------------------------

/**
 * @param {string} name
 * @param {object} args
 * @param {{scheduler: object, config: object, log: object}} ctx
 */
async function callTool(name, args, ctx) {
  const { scheduler, config } = ctx;
  const limits = config.current.limits;

  switch (name) {
    case 'list_workers': {
      return { ok: true, workers: scheduler.listWorkers() };
    }

    case 'dispatch_task': {
      const taskText = args?.task;
      if (typeof taskText !== 'string' || !taskText.trim()) {
        throw apiError('E_BAD_ARGS', 'task 必须是非空字符串（任务文本）');
      }
      if (taskText.length > limits.maxTaskChars) {
        throw apiError('E_BAD_ARGS', `task 长度超限（${taskText.length} > ${limits.maxTaskChars}）`);
      }
      const rawWorker = args?.worker;
      if (rawWorker !== undefined && (typeof rawWorker !== 'string' || !rawWorker.trim())) {
        throw apiError('E_BAD_ARGS', 'worker 必须是外包工名或条目 id（非空字符串）');
      }
      const files = await validateAttachFiles(args?.files, limits);
      const waitSeconds = parseWaitSeconds(args?.waitSeconds);
      const t = await scheduler.dispatch({
        task: taskText,
        worker: rawWorker === undefined ? undefined : rawWorker.trim(),
        files,
      });
      if (waitSeconds > 0) await scheduler.waitForTask(t.taskId, waitSeconds * 1000);
      return { ok: true, task: t.toView() };
    }

    case 'get_task': {
      const taskId = requireTaskId(args?.taskId);
      const waitSeconds = parseWaitSeconds(args?.waitSeconds);
      const t = scheduler.getTask(taskId);
      if (!t) throw apiError('E_TASK_UNKNOWN', `任务号不存在：${taskId}`);
      if (waitSeconds > 0) await scheduler.waitForTask(taskId, waitSeconds * 1000);
      return { ok: true, task: t.toView() };
    }

    case 'fetch_result': {
      const taskId = requireTaskId(args?.taskId);
      let includeText = true;
      if (args?.includeText !== undefined) {
        if (typeof args.includeText !== 'boolean') {
          throw apiError('E_BAD_ARGS', 'includeText 必须是布尔值');
        }
        includeText = args.includeText;
      }
      const t = scheduler.getTask(taskId);
      if (!t) throw apiError('E_TASK_UNKNOWN', `任务号不存在：${taskId}`);
      const payload = { ok: true, task: t.toView(), outboxDir: t.taskDir };
      if (!isTerminalState(t.state)) {
        payload.files = [];
        payload.hint = '任务尚未完成：请继续轮询 get_task / fetch_result（可用 waitSeconds 长轮询）';
        return payload;
      }
      payload.files = (t.delivery?.files || []).map((f) => ({
        name: f?.name ?? null,
        relPath: f?.relPath ?? null,
        bytes: f?.bytes ?? null,
        sha256: f?.sha256 ?? null,
      }));
      if (includeText) {
        const text = await readAnswerText(t.taskDir);
        if (text !== null) {
          if (text.length > limits.maxInlineTextChars) {
            payload.text = text.slice(0, limits.maxInlineTextChars);
            payload.textTruncated = true;
          } else {
            payload.text = text;
          }
        }
      }
      return payload;
    }

    case 'cancel_task': {
      const taskId = requireTaskId(args?.taskId);
      const t = await scheduler.cancel(taskId);
      return { ok: true, task: t.toView() };
    }

    case 'attach_files': {
      const taskId = requireTaskId(args?.taskId);
      const files = await validateAttachFiles(args?.files, limits);
      if (!files.length) throw apiError('E_BAD_ARGS', 'files 不能为空数组');
      const t = await scheduler.attachFiles(taskId, files);
      return { ok: true, task: t.toView() };
    }

    default:
      throw apiError('E_BAD_ARGS', `未知工具：${name}`);
  }
}

// ---------------------------------------------------------------------------
// MCP Server（低层；每个会话一个实例）
// ---------------------------------------------------------------------------

/**
 * 构建一个 MCP Server 实例（能力声明仅 tools）。
 * @param {{version: string, ctx: object, log: object}} options
 */
export function createMcpServer({ version, ctx, log }) {
  const server = new Server(
    { name: 'free-outsource', version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request?.params?.name;
    const args = request?.params?.arguments ?? {};
    try {
      const payload = await callTool(name, args, ctx);
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    } catch (err) {
      const env = toEnvelope(err);
      log?.warn(`工具 ${name} 失败：${env.code} ${env.message}`);
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(env) }] };
    }
  });

  return server;
}
