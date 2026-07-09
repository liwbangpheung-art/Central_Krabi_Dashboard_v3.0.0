export const PERMISSIONS = Object.freeze([
  "manage_users",
  "invite_users",
  "create_users",
  "edit_user_profile",
  "change_user_role",
  "disable_users",
  "delete_users",
  "reset_user_password",
  "manage_admins",
  "view_audit_logs",
  "manage_system_settings",
  "manage_master_data",
  "manage_prices",
  "manage_daily_data",
  "manage_scrap_sales",
  "import_data",
  "export_reports",
  "review_data",
  "lock_periods",
  "reopen_periods",
  "manage_report_presets"
]);

export const LEGACY_ROLE_PERMISSIONS = Object.freeze({
  owner: [...PERMISSIONS],
  admin: [
    "manage_master_data",
    "manage_prices",
    "manage_daily_data",
    "manage_scrap_sales",
    "import_data",
    "export_reports",
    "review_data",
    "lock_periods",
    "manage_report_presets"
  ],
  editor: ["manage_daily_data", "manage_scrap_sales", "import_data", "export_reports"],
  viewer: ["export_reports"]
});

export function effectivePermissions({ role, rolePermissions = [], overrides = [] }) {
  const base = new Set(rolePermissions.length ? rolePermissions : (LEGACY_ROLE_PERMISSIONS[role] || []));
  for (const override of overrides) {
    if (override.effect === "deny") base.delete(override.permission_code);
    if (override.effect === "allow") base.add(override.permission_code);
  }
  return [...base].sort();
}

export function hasPermission(auth, permission) {
  return Boolean(auth?.permissions?.includes(permission));
}
