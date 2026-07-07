import { randomUUID } from "node:crypto";
import { Router } from "express";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { PERMISSIONS, effectivePermissions, hasPermission } from "../security/permissions.js";
import { writeAuditLog } from "../security/audit.js";

const ROLES = ["owner", "admin", "editor", "viewer"];
const STATUSES = ["invited", "pending", "active", "suspended", "disabled"];
const CREATE_MODES = ["invite", "temporary_password", "pending"];
const PROFILE_FIELDS = "id,email,full_name,role,active,status,must_change_password,invited_at,last_login_at,created_at,updated_at";

function databaseFailure(error, message) {
  if (!error) return;
  if (error.code === "23505") throw new HttpError(409, "DUPLICATE_RECORD", "มีข้อมูลนี้อยู่แล้ว", { databaseMessage: error.message });
  if (error.code === "23514") throw new HttpError(400, "DATABASE_CONSTRAINT", "ข้อมูลไม่ผ่านกฎของระบบ", { databaseMessage: error.message });
  throw new HttpError(500, "DATABASE_ERROR", message, { databaseMessage: error.message, databaseCode: error.code });
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new HttpError(400, "EMAIL_INVALID", "รูปแบบอีเมลไม่ถูกต้อง");
  }
  return email;
}

function validateName(value) {
  const fullName = String(value ?? "").trim();
  if (fullName.length < 2 || fullName.length > 120) {
    throw new HttpError(400, "FULL_NAME_INVALID", "ชื่อผู้ใช้ต้องมี 2–120 ตัวอักษร");
  }
  return fullName;
}

function validateRole(value) {
  const role = String(value ?? "viewer").trim().toLowerCase();
  if (!ROLES.includes(role)) throw new HttpError(400, "ROLE_INVALID", "บทบาทผู้ใช้ไม่ถูกต้อง", { allowed: ROLES });
  return role;
}

function validateStatus(value) {
  const status = String(value ?? "active").trim().toLowerCase();
  if (!STATUSES.includes(status)) throw new HttpError(400, "STATUS_INVALID", "สถานะผู้ใช้ไม่ถูกต้อง", { allowed: STATUSES });
  return status;
}

function validatePassword(value) {
  const password = String(value ?? "");
  const strong = password.length >= 12
    && /[a-z]/u.test(password)
    && /[A-Z]/u.test(password)
    && /\d/u.test(password)
    && /[^A-Za-z0-9]/u.test(password);
  if (!strong) {
    throw new HttpError(400, "PASSWORD_WEAK", "รหัสผ่านชั่วคราวต้องมีอย่างน้อย 12 ตัว และมีตัวพิมพ์เล็ก พิมพ์ใหญ่ ตัวเลข และสัญลักษณ์");
  }
  return password;
}

function requireCurrentPermission(req, permission) {
  if (!hasPermission(req.auth, permission)) {
    throw new HttpError(403, "PERMISSION_FORBIDDEN", "คุณไม่มีสิทธิ์สำหรับรายการนี้", { requiredPermission: permission });
  }
}

function validateOverrides(input) {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "PERMISSION_OVERRIDES_INVALID", "Permission override ต้องเป็น object");
  }
  const rows = [];
  for (const [code, effect] of Object.entries(input)) {
    if (!PERMISSIONS.includes(code)) throw new HttpError(400, "PERMISSION_UNKNOWN", `ไม่รู้จัก Permission: ${code}`);
    if (effect === "inherit" || effect === null || effect === "") continue;
    if (!new Set(["allow", "deny"]).has(effect)) {
      throw new HttpError(400, "PERMISSION_EFFECT_INVALID", `ค่า Permission ${code} ต้องเป็น inherit, allow หรือ deny`);
    }
    rows.push({ permission_code: code, effect });
  }
  return rows;
}

async function getProfileOrThrow(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin.from("profiles").select(PROFILE_FIELDS).eq("id", id).maybeSingle();
  databaseFailure(error, "อ่านข้อมูลผู้ใช้ไม่สำเร็จ");
  if (!data) throw new HttpError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้ที่ระบุ");
  return data;
}

async function getPermissionModel(supabaseAdmin) {
  const [permissionResult, roleResult, overrideResult] = await Promise.all([
    supabaseAdmin.from("permissions").select("code,name_th,description_th,group_code,sensitive,sort_order").order("sort_order", { ascending: true }),
    supabaseAdmin.from("role_permissions").select("role,permission_code"),
    supabaseAdmin.from("user_permission_overrides").select("user_id,permission_code,effect,granted_by,created_at,updated_at")
  ]);
  databaseFailure(permissionResult.error || roleResult.error || overrideResult.error, "โหลด Permission Model ไม่สำเร็จ");
  return {
    permissions: permissionResult.data ?? [],
    rolePermissions: roleResult.data ?? [],
    overrides: overrideResult.data ?? []
  };
}

function enrichUser(profile, model) {
  const rolePermissions = model.rolePermissions
    .filter((item) => item.role === profile.role)
    .map((item) => item.permission_code);
  const overrides = model.overrides.filter((item) => item.user_id === profile.id);
  return {
    ...profile,
    effective_permissions: effectivePermissions({ role: profile.role, rolePermissions, overrides }),
    permission_overrides: Object.fromEntries(overrides.map((item) => [item.permission_code, item.effect]))
  };
}

async function replaceOverrides(supabaseAdmin, targetUserId, rows, actorUserId) {
  const { error: deleteError } = await supabaseAdmin
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", targetUserId);
  databaseFailure(deleteError, "ล้าง Permission เดิมไม่สำเร็จ");
  if (!rows.length) return;
  const { error: insertError } = await supabaseAdmin.from("user_permission_overrides").insert(
    rows.map((row) => ({ ...row, user_id: targetUserId, granted_by: actorUserId }))
  );
  databaseFailure(insertError, "บันทึก Permission ไม่สำเร็จ");
}

function ensureHighRoleAllowed(req, role) {
  if (["owner", "admin"].includes(role)) requireCurrentPermission(req, "manage_admins");
  if (role === "owner" && req.auth.profile.role !== "owner") {
    throw new HttpError(403, "OWNER_ONLY", "เฉพาะ Owner เท่านั้นที่สามารถแต่งตั้ง Owner ได้");
  }
}

export function createUsersRouter({ supabaseAdmin, authenticate }) {
  const router = Router();
  router.use(authenticate);

  router.get("/permissions", (req, res) => {
    res.json({ permissions: req.auth.permissions });
  });

  router.get("/users/meta", requirePermission("manage_users"), async (_req, res, next) => {
    try {
      const model = await getPermissionModel(supabaseAdmin);
      res.json({ roles: ROLES, statuses: STATUSES, createModes: CREATE_MODES, permissions: model.permissions, rolePermissions: model.rolePermissions });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users", requirePermission("manage_users"), async (_req, res, next) => {
    try {
      const [profileResult, model] = await Promise.all([
        supabaseAdmin.from("profiles").select(PROFILE_FIELDS).order("created_at", { ascending: true }),
        getPermissionModel(supabaseAdmin)
      ]);
      databaseFailure(profileResult.error, "โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
      res.json({ items: (profileResult.data ?? []).map((profile) => enrichUser(profile, model)), total: profileResult.data?.length ?? 0 });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users", requirePermission("manage_users"), async (req, res, next) => {
    try {
      const mode = String(req.body?.mode ?? "invite").trim().toLowerCase();
      if (!CREATE_MODES.includes(mode)) throw new HttpError(400, "CREATE_MODE_INVALID", "วิธีสร้างบัญชีไม่ถูกต้อง");
      requireCurrentPermission(req, mode === "invite" ? "invite_users" : "create_users");

      const email = normalizeEmail(req.body?.email);
      const fullName = validateName(req.body?.fullName);
      const role = validateRole(req.body?.role);
      ensureHighRoleAllowed(req, role);

      let authResult;
      if (mode === "invite") {
        authResult = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
      } else {
        const password = mode === "temporary_password"
          ? validatePassword(req.body?.temporaryPassword)
          : `Pending-${randomUUID()}-Aa1!`;
        authResult = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName }
        });
      }
      if (authResult.error || !authResult.data?.user) {
        throw new HttpError(400, "AUTH_USER_CREATE_FAILED", "สร้างบัญชี Supabase ไม่สำเร็จ", { authMessage: authResult.error?.message });
      }

      const userId = authResult.data.user.id;
      const status = mode === "invite" ? "invited" : mode === "pending" ? "pending" : "active";
      const active = status !== "pending";
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          email,
          full_name: fullName,
          role,
          status,
          active,
          must_change_password: mode === "temporary_password",
          invited_at: mode === "invite" ? new Date().toISOString() : null
        })
        .eq("id", userId)
        .select(PROFILE_FIELDS)
        .single();
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);
        databaseFailure(profileError, "สร้าง Profile ผู้ใช้ไม่สำเร็จ");
      }

      await writeAuditLog({
        supabaseAdmin,
        req,
        action: "user.created",
        targetType: "user",
        targetId: userId,
        afterData: profile,
        metadata: { mode }
      });
      res.status(201).json({ item: profile, mode });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/users/:id", requirePermission("manage_users"), async (req, res, next) => {
    try {
      const targetId = req.params.id;
      const existing = await getProfileOrThrow(supabaseAdmin, targetId);
      if (existing.role === "owner" && req.auth.profile.role !== "owner") {
        throw new HttpError(403, "OWNER_PROTECTED", "Admin ไม่สามารถแก้ไข Owner ได้");
      }

      const payload = {};
      if (req.body?.fullName !== undefined) {
        const nextFullName = validateName(req.body.fullName);
        if (nextFullName !== existing.full_name) {
          requireCurrentPermission(req, "edit_user_profile");
          payload.full_name = nextFullName;
        }
      }
      if (req.body?.role !== undefined) {
        const nextRole = validateRole(req.body.role);
        if (nextRole !== existing.role) {
          requireCurrentPermission(req, "change_user_role");
          ensureHighRoleAllowed(req, nextRole);
          if (targetId === req.auth.user.id) {
            throw new HttpError(409, "SELF_ROLE_CHANGE_FORBIDDEN", "ไม่สามารถเปลี่ยนบทบาทของตนเองได้");
          }
          payload.role = nextRole;
        }
      }
      if (req.body?.status !== undefined) {
        const nextStatus = validateStatus(req.body.status);
        if (nextStatus !== existing.status) {
          requireCurrentPermission(req, "disable_users");
          if (targetId === req.auth.user.id && nextStatus !== "active") {
            throw new HttpError(409, "SELF_DISABLE_FORBIDDEN", "ไม่สามารถปิดใช้งานบัญชีของตนเองได้");
          }
          payload.status = nextStatus;
          payload.active = !["pending", "suspended", "disabled"].includes(nextStatus);
        }
      }
      if (req.body?.mustChangePassword !== undefined) {
        const nextMustChange = Boolean(req.body.mustChangePassword);
        if (nextMustChange !== Boolean(existing.must_change_password)) {
          requireCurrentPermission(req, "reset_user_password");
          payload.must_change_password = nextMustChange;
        }
      }

      const overrides = validateOverrides(req.body?.permissionOverrides);
      if (overrides !== undefined) {
        requireCurrentPermission(req, "manage_admins");
        if (targetId === req.auth.user.id) {
          throw new HttpError(409, "SELF_PERMISSION_CHANGE_FORBIDDEN", "ไม่สามารถเปลี่ยน Permission ของตนเองได้");
        }
      }
      if (!Object.keys(payload).length && overrides === undefined) {
        throw new HttpError(400, "NO_CHANGES", "ไม่มีข้อมูลที่ต้องการแก้ไข");
      }

      let updated = existing;
      if (Object.keys(payload).length) {
        const { data, error } = await supabaseAdmin.from("profiles").update(payload).eq("id", targetId).select(PROFILE_FIELDS).single();
        databaseFailure(error, "แก้ไขผู้ใช้ไม่สำเร็จ");
        updated = data;

        if (payload.status) {
          const banDuration = payload.active ? "none" : "876000h";
          const authUpdate = await supabaseAdmin.auth.admin.updateUserById(targetId, { ban_duration: banDuration });
          if (authUpdate.error) {
            throw new HttpError(500, "AUTH_STATUS_UPDATE_FAILED", "ปรับสถานะ Supabase Auth ไม่สำเร็จ", { authMessage: authUpdate.error.message });
          }
        }
      }
      if (overrides !== undefined) await replaceOverrides(supabaseAdmin, targetId, overrides, req.auth.user.id);

      const model = await getPermissionModel(supabaseAdmin);
      const item = enrichUser(updated, model);
      await writeAuditLog({
        supabaseAdmin,
        req,
        action: "user.updated",
        targetType: "user",
        targetId,
        beforeData: existing,
        afterData: item,
        metadata: { changedFields: Object.keys(req.body ?? {}) }
      });
      res.json({ item });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/:id/password", requirePermission("reset_user_password"), async (req, res, next) => {
    try {
      const target = await getProfileOrThrow(supabaseAdmin, req.params.id);
      const action = String(req.body?.action ?? "send_recovery");
      if (action === "send_recovery") {
        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(target.email);
        if (error) throw new HttpError(400, "PASSWORD_RECOVERY_FAILED", "ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ", { authMessage: error.message });
      } else if (action === "set_temporary_password") {
        const password = validatePassword(req.body?.temporaryPassword);
        const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, { password });
        if (error) throw new HttpError(400, "TEMPORARY_PASSWORD_FAILED", "ตั้งรหัสผ่านชั่วคราวไม่สำเร็จ", { authMessage: error.message });
        const { error: profileError } = await supabaseAdmin.from("profiles").update({ must_change_password: true, active: true, status: "active" }).eq("id", target.id);
        databaseFailure(profileError, "อัปเดตสถานะรหัสผ่านไม่สำเร็จ");
      } else if (action === "force_change") {
        const { error } = await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", target.id);
        databaseFailure(error, "ตั้งค่าบังคับเปลี่ยนรหัสผ่านไม่สำเร็จ");
      } else {
        throw new HttpError(400, "PASSWORD_ACTION_INVALID", "คำสั่งจัดการรหัสผ่านไม่ถูกต้อง");
      }

      await writeAuditLog({ supabaseAdmin, req, action: `user.password.${action}`, targetType: "user", targetId: target.id, metadata: { email: target.email } });
      res.json({ status: "ok", action });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/users/:id", requirePermission("disable_users"), async (req, res, next) => {
    try {
      const target = await getProfileOrThrow(supabaseAdmin, req.params.id);
      if (target.id === req.auth.user.id) throw new HttpError(409, "SELF_DISABLE_FORBIDDEN", "ไม่สามารถปิดใช้งานบัญชีของตนเองได้");
      if (target.role === "owner" && req.auth.profile.role !== "owner") throw new HttpError(403, "OWNER_PROTECTED", "Admin ไม่สามารถปิดใช้งาน Owner ได้");
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({ active: false, status: "disabled" })
        .eq("id", target.id)
        .select(PROFILE_FIELDS)
        .single();
      databaseFailure(error, "ปิดใช้งานผู้ใช้ไม่สำเร็จ");
      const authUpdate = await supabaseAdmin.auth.admin.updateUserById(target.id, { ban_duration: "876000h" });
      if (authUpdate.error) throw new HttpError(500, "AUTH_STATUS_UPDATE_FAILED", "ปิดใช้งาน Supabase Auth ไม่สำเร็จ", { authMessage: authUpdate.error.message });
      await writeAuditLog({ supabaseAdmin, req, action: "user.disabled", targetType: "user", targetId: target.id, beforeData: target, afterData: data });
      res.json({ item: data, deletionMode: "soft_disable" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/audit-logs", requirePermission("view_audit_logs"), async (req, res, next) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
      const { data, error } = await supabaseAdmin
        .from("audit_logs")
        .select("id,actor_user_id,action,target_type,target_id,before_data,after_data,metadata,request_id,ip_address,user_agent,success,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      databaseFailure(error, "โหลด Audit Log ไม่สำเร็จ");
      res.json({ items: data ?? [], limit });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
