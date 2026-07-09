import { HttpError } from "../http/errors.js";
import { effectivePermissions } from "../security/permissions.js";

function bearerToken(header) {
  const match = /^Bearer\s+(.+)$/iu.exec(header ?? "");
  return match?.[1]?.trim() || null;
}

async function loadEffectivePermissions(supabaseAdmin, profile) {
  const [roleResult, overrideResult] = await Promise.all([
    supabaseAdmin
      .from("role_permissions")
      .select("permission_code")
      .eq("role", profile.role),
    supabaseAdmin
      .from("user_permission_overrides")
      .select("permission_code,effect")
      .eq("user_id", profile.id)
  ]);

  const rolePermissions = roleResult.error ? [] : (roleResult.data ?? []).map((item) => item.permission_code);
  const overrides = overrideResult.error ? [] : (overrideResult.data ?? []);
  return effectivePermissions({ role: profile.role, rolePermissions, overrides });
}

export function createAuthenticationMiddleware(supabaseAdmin) {
  return async function authenticate(req, _res, next) {
    try {
      const token = bearerToken(req.header("authorization"));
      if (!token) throw new HttpError(401, "AUTH_TOKEN_MISSING", "กรุณาเข้าสู่ระบบก่อนใช้งาน");

      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data?.user) {
        throw new HttpError(401, "AUTH_TOKEN_INVALID", "Session หมดอายุหรือ Token ไม่ถูกต้อง");
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id,email,full_name,role,active,status,must_change_password,invited_at,last_login_at,created_at,updated_at")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile) {
        throw new HttpError(403, "PROFILE_NOT_FOUND", "ไม่พบ Profile ของผู้ใช้ กรุณารัน Database Migration หรือสร้าง Profile ใหม่");
      }
      if (!profile.active || ["suspended", "disabled", "pending"].includes(profile.status)) {
        throw new HttpError(403, "USER_INACTIVE", "บัญชีผู้ใช้นี้ยังไม่พร้อมใช้งานหรือถูกปิดการใช้งาน");
      }

      const permissions = await loadEffectivePermissions(supabaseAdmin, profile);
      req.auth = { user: data.user, profile, permissions };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...allowedRoles) {
  return function roleGuard(req, _res, next) {
    if (!req.auth?.profile || !allowedRoles.includes(req.auth.profile.role)) {
      return next(new HttpError(403, "ROLE_FORBIDDEN", "สิทธิ์ของคุณไม่เพียงพอสำหรับรายการนี้"));
    }
    next();
  };
}

export function requirePermission(...requiredPermissions) {
  return function permissionGuard(req, _res, next) {
    const current = new Set(req.auth?.permissions ?? []);
    const missing = requiredPermissions.filter((permission) => !current.has(permission));
    if (missing.length) {
      return next(new HttpError(
        403,
        "PERMISSION_FORBIDDEN",
        "คุณไม่มีสิทธิ์สำหรับรายการนี้",
        { requiredPermissions, missingPermissions: missing }
      ));
    }
    next();
  };
}
