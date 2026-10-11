// 会话复用块快照投影（b6/T7）：config.session 三键 ⇒ 快照 session 子对象（纯函数）。
// 区间与默认的权威 = src/main/config-schema.mjs；渲染层读写契约 = 批次档 b6 §2（控件 session-reuse|session-ttl-ms|session-max-tasks）。

/** 投影三键（reuse 非 true ⇒ false；数值非整数 ⇒ null——界面按空值呈现，不伪装数值） */
export function buildSessionSnapshot(session) {
  const s = session || {};
  return {
    reuse: s.reuse === true,
    ttlMs: Number.isInteger(s.ttlMs) ? s.ttlMs : null,
    maxTasksPerSession: Number.isInteger(s.maxTasksPerSession) ? s.maxTasksPerSession : null,
  };
}
