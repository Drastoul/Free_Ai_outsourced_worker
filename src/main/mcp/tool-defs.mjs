// MCP 六件套工具定义（对外契约面）：名称、中文 description（面向主包AI）、JSON Schema 入参。
// 契约权威：docs/design/modules/mcp-server.md §3（工具契约表）。设为独立文件：纯声明数据，便于与实现分开核对。

export const TOOL_DEFS = [
  {
    name: 'list_workers',
    description:
      '列出全部外包工（网页版 AI）及其当前状态。主包AI 在派单前用它确认可指定的 worker 名与可用性：' +
      'status=ready 可派单；busy 表示该外包工正在执行任务（仍可派单，新任务会在它的队列排队）；' +
      'login_required / unavailable / disabled 表示需要人工处理（登录、验证码或启用），指定它们会被拒绝。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'dispatch_task',
    description:
      '把一条任务交给网页版 AI 执行（异步）。主包AI 用法：默认按优先级选外包工，也可用 worker 指定（自定义名或条目 id）；' +
      '可附本机绝对路径文件作为附件随任务上传。立即返回任务号；之后用 get_task 查状态、用 fetch_result 取答复与文件。' +
      'waitSeconds > 0 时本调用会等待到终态或到点（任务不会因等待中断）。',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '任务文本（必填，非空；长度上限见配置 limits.maxTaskChars）' },
        worker: {
          type: 'string',
          description: '指定外包工（自定义名或条目 id，先按名精确匹配）；缺省 = 按优先级选人。指定必须能命中已登记条目',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: '附件本机绝对路径列表（可选；数量与单文件大小上限见配置 limits）',
        },
        waitSeconds: {
          type: 'integer',
          minimum: 0,
          maximum: 600,
          description: '长轮询等待秒数；0（默认）= 立即返回任务号',
        },
      },
      required: ['task'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_task',
    description:
      '查询任务当前状态与阶段（state / phase / worker / attempts / error / delivery）。' +
      '主包AI 用于轮询进度；waitSeconds > 0 时等到终态或到点返回。' +
      '返回 error 时按其 code / needsHuman 决定是重派（机器原因）还是请人处理（登录、验证码、页面结构、产物落盘等）。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '任务号（dispatch_task 返回）' },
        waitSeconds: {
          type: 'integer',
          minimum: 0,
          maximum: 600,
          description: '长轮询等待秒数；0（默认）= 立即返回当前状态',
        },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'fetch_result',
    description:
      '取回任务产物：答复文本（长文在任务目录的 answer.md，超出内联上限时截断并置 textTruncated）与文件清单（相对路径 / 字节数 / sha256），' +
      '并给出该单实际交付目录 outboxDir。任务未达终态时不返回文本（hint 提示继续轮询 get_task）。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '任务号（dispatch_task 返回）' },
        includeText: { type: 'boolean', description: '是否内联答复文本；默认 true' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancel_task',
    description:
      '取消任务。排队中 ⇒ 立即取消；执行中 ⇒ 尽量停止（停止收流 / 等待下载），状态置 canceled，页面不关闭、' +
      '已写出的部分产物保留（是否部分交付见交付目录 manifest 的 delivery.partial）。如需继续请重新派单。',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string', description: '任务号（dispatch_task 返回）' } },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'attach_files',
    description:
      '给「尚未发送」的任务补送附件（任务文本已提交执行时用）。仅当任务排队中、或执行中处于 opening / uploading 阶段有效；' +
      '已发送后返回 E_TASK_ALREADY_SENT，此时应改为新派单并携带附件。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '任务号（dispatch_task 返回）' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: '附件本机绝对路径列表（约束同 dispatch_task.files）',
        },
      },
      required: ['taskId', 'files'],
      additionalProperties: false,
    },
  },
];

/** 工具名单（与 tools/list 返回值对照用） */
export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);
