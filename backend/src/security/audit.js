export async function writeAuditLog({
  supabaseAdmin,
  req,
  action,
  targetType,
  targetId = null,
  beforeData = null,
  afterData = null,
  metadata = {},
  success = true
}) {
  const payload = {
    actor_user_id: req.auth?.user?.id ?? null,
    action,
    target_type: targetType,
    target_id: targetId ? String(targetId) : null,
    before_data: beforeData,
    after_data: afterData,
    metadata,
    request_id: req.requestId ?? null,
    ip_address: req.ip ?? null,
    user_agent: req.header?.("user-agent") ?? null,
    success
  };
  const { error } = await supabaseAdmin.from("audit_logs").insert(payload);
  if (error) console.error(`[${req.requestId}] audit log failed`, error);
}
