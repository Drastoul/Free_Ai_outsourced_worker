// MCP 服务面：双传输端点 + /healthz + token 授权 + 端口绑定与顺延（≤+120）。
// 设计权威：docs/design/modules/mcp-server.md §2（传输与端点表）；端口策略见 docs/design/overview.md §2.3。
// 说明：`@modelcontextprotocol/sdk` 的 StreamableHTTPServerTransport（/mcp，会话态）与 SSEServerTransport（/sse + /messages）。

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './tools.mjs';

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_PORT_OFFSET = 120;

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function rpcError(res, status, code, message) {
  json(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 单次绑定尝试 */
function listenOn(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onOk);
      reject(err);
    };
    const onOk = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onOk);
    server.listen(port, host);
  });
}

/**
 * 启动 MCP 服务（仅绑 127.0.0.1）：期望端口被占 ⇒ +1 顺延（≤ +120）；+120 内全被占 ⇒ 不启动。
 * @param {{version: string, config: object, scheduler: object, log: object}} deps
 * @returns {Promise<{ok: boolean, port: number|null, url: string|null, host: string,
 *                    attempted: number, close: Function, sessionCounts: Function}>}
 */
export async function startMcpServer({ version, config, scheduler, log }) {
  const expected = config.current.mcp.port;
  const host = config.current.mcp.host || '127.0.0.1';
  const ctx = { scheduler, config, log };

  /** @type {Map<string, StreamableHTTPServerTransport>} */
  const streamable = new Map();
  /** @type {Map<string, SSEServerTransport>} */
  const sse = new Map();
  const sessions = new Set(); // MCP Server 实例（随会话创建，close 时统一关闭）

  let actualPort = null;

  const httpServer = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      log.error(`MCP 请求处理失败：${err?.stack || err}`);
      if (!res.headersSent) rpcError(res, 500, -32603, '服务器内部错误');
      else res.end();
    });
  });

  httpServer.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  function createSessionServer() {
    const server = createMcpServer({ version, ctx, log });
    sessions.add(server);
    return server;
  }

  function authorized(req) {
    const token = String(config.current.mcp.token || '');
    if (!token) return true;
    return req.headers['authorization'] === `Bearer ${token}`;
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', `http://${host}`);
    const pathname = url.pathname;

    // 探活：开放（无需 token）；载荷 = ok / version / port / workers
    if (pathname === '/healthz' && req.method === 'GET') {
      json(res, 200, { ok: true, version, port: actualPort, workers: scheduler.listWorkers() });
      return;
    }

    if (!authorized(req)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    if (pathname === '/mcp') {
      if (req.method === 'POST') {
        const bodyText = await readBody(req);
        let body;
        try {
          body = bodyText ? JSON.parse(bodyText) : undefined;
        } catch {
          rpcError(res, 400, -32700, '请求体不是合法 JSON');
          return;
        }
        const sessionId = req.headers['mcp-session-id'];
        if (typeof sessionId === 'string' && sessionId) {
          const transport = streamable.get(sessionId);
          if (!transport) {
            rpcError(res, 404, -32001, 'Session not found');
            return;
          }
          await transport.handleRequest(req, res, body);
          return;
        }
        if (!isInitializeRequest(body)) {
          rpcError(res, 400, -32000, 'Bad Request：新会话的首个请求必须是 initialize');
          return;
        }
        let transport;
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            streamable.set(sid, transport);
          },
        });
        const server = createSessionServer();
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) streamable.delete(sid);
          sessions.delete(server);
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }
      if (req.method === 'GET' || req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'];
        const transport = typeof sessionId === 'string' && sessionId ? streamable.get(sessionId) : null;
        if (!transport) {
          rpcError(res, 404, -32001, 'Session not found');
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }
      json(res, 405, { error: 'method not allowed' });
      return;
    }

    // 旧式 SSE（兼容兜底）：GET /sse 建流 + POST /messages 上行
    if (pathname === '/sse' && req.method === 'GET') {
      const transport = new SSEServerTransport('/messages', res);
      sse.set(transport.sessionId, transport);
      const server = createSessionServer();
      transport.onclose = () => {
        sse.delete(transport.sessionId);
        sessions.delete(server);
      };
      await server.connect(transport);
      return;
    }
    if (pathname === '/messages' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      const transport = sessionId ? sse.get(sessionId) : null;
      if (!transport) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Bad Request：未知的 sessionId');
        return;
      }
      const bodyText = await readBody(req);
      let body;
      try {
        body = bodyText ? JSON.parse(bodyText) : undefined;
      } catch {
        rpcError(res, 400, -32700, '请求体不是合法 JSON');
        return;
      }
      await transport.handlePostMessage(req, res, body);
      return;
    }

    json(res, 404, { error: 'not found' });
  }

  // 端口绑定与顺延（≤ +120）
  let bound = null;
  let lastError = null;
  const lastPort = Math.min(expected + MAX_PORT_OFFSET, 65535);
  for (let port = expected; port <= lastPort; port++) {
    try {
      await listenOn(httpServer, host, port);
      bound = port;
      break;
    } catch (e) {
      lastError = e;
      if (e?.code !== 'EADDRINUSE' && e?.code !== 'EACCES') break;
    }
  }

  if (bound === null) {
    const detail = lastError?.code === 'EADDRINUSE' ? `端口 ${expected}–${lastPort} 均被占用` : `绑定失败（${lastError?.code || lastError?.message}）`;
    log.error(`MCP 服务未启动：${detail}；请释放端口或改写配置 mcp.port 后重启`);
    return {
      ok: false,
      port: null,
      url: null,
      host,
      attempted: expected,
      reason: detail,
      close: async () => {},
      sessionCounts: () => ({ streamable: streamable.size, sse: sse.size }),
    };
  }

  actualPort = bound;
  httpServer.on('error', (err) => log.error(`MCP HTTP 服务错误：${err?.message || err}`));
  if (bound !== expected) {
    log.warn(`MCP 端口 ${expected} 被占用，已顺延到 ${bound}（实际地址 http://${host}:${bound}/mcp）`);
  }
  log.info(`MCP 服务已启动：http://${host}:${bound}/mcp（/sse 兼容；/healthz 探活）`);

  const close = async () => {
    for (const transport of [...streamable.values()]) {
      try {
        await transport.close();
      } catch {
        /* 忽略 */
      }
    }
    streamable.clear();
    for (const transport of [...sse.values()]) {
      try {
        await transport.close();
      } catch {
        /* 忽略 */
      }
    }
    sse.clear();
    for (const server of sessions) {
      try {
        await server.close();
      } catch {
        /* 忽略 */
      }
    }
    sessions.clear();
    httpServer.closeAllConnections?.();
    await new Promise((resolve) => httpServer.close(() => resolve()));
  };

  return {
    ok: true,
    port: bound,
    url: `http://${host}:${bound}/mcp`,
    host,
    attempted: expected,
    close,
    sessionCounts: () => ({ streamable: streamable.size, sse: sse.size }),
  };
}

export { MAX_PORT_OFFSET };
