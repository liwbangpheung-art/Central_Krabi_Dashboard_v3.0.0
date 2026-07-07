import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { hasPermission, roleLabels } from "../lib/permissions.js";

const ROLE_ORDER = ["owner", "admin", "editor", "viewer"];
const ROLE_COLORS = { owner: "#7c3aed", admin: "#2563eb", editor: "#059669", viewer: "#6b7280" };

const GROUP_LABELS = {
  users: "👥 การจัดการผู้ใช้",
  security: "🔒 ความปลอดภัย",
  data: "📊 การจัดการข้อมูล",
  governance: "📋 Data Governance",
  reports: "📄 รายงาน"
};

// Default permission matrix based on migration 014
const DEFAULT_PERMISSIONS = [
  { code: "manage_users", name_th: "ดูและจัดการผู้ใช้งาน", description_th: "เปิดหน้าจัดการผู้ใช้และดูรายชื่อผู้ใช้", group_code: "users", sensitive: true },
  { code: "invite_users", name_th: "ส่งคำเชิญผู้ใช้", description_th: "เชิญผู้ใช้ผ่านอีเมล", group_code: "users", sensitive: true },
  { code: "create_users", name_th: "สร้างบัญชีผู้ใช้", description_th: "สร้างบัญชีด้วยรหัสผ่านชั่วคราว", group_code: "users", sensitive: true },
  { code: "edit_user_profile", name_th: "แก้ไขข้อมูลผู้ใช้", description_th: "แก้ไขชื่อและข้อมูลพื้นฐาน", group_code: "users", sensitive: true },
  { code: "change_user_role", name_th: "เปลี่ยนบทบาทผู้ใช้", description_th: "เปลี่ยน Owner/Admin/Editor/Viewer", group_code: "users", sensitive: true },
  { code: "disable_users", name_th: "ปิดหรือเปิดบัญชีผู้ใช้", description_th: "ระงับหรือปิดใช้งานบัญชี", group_code: "users", sensitive: true },
  { code: "reset_user_password", name_th: "จัดการรีเซ็ตรหัสผ่าน", description_th: "ส่งคำขอหรือกำหนดให้เปลี่ยนรหัสผ่าน", group_code: "users", sensitive: true },
  { code: "manage_admins", name_th: "จัดการ Owner และ Admin", description_th: "แต่งตั้งหรือแก้ไขผู้ดูแลระดับสูง", group_code: "users", sensitive: true },
  { code: "view_audit_logs", name_th: "ดูประวัติการใช้งาน", description_th: "ดู Audit Log ของเหตุการณ์สำคัญ", group_code: "security", sensitive: true },
  { code: "manage_system_settings", name_th: "จัดการตั้งค่าระบบ", description_th: "แก้ไขการตั้งค่าระบบที่สำคัญ", group_code: "security", sensitive: true },
  { code: "manage_master_data", name_th: "จัดการ Master Data", description_th: "เพิ่ม แก้ไข ปิดใช้งาน และลบ Master Data", group_code: "data", sensitive: false },
  { code: "manage_prices", name_th: "จัดการราคาขายเศษวัสดุ", description_th: "เพิ่มและแก้ไขประวัติราคา", group_code: "data", sensitive: false },
  { code: "manage_daily_data", name_th: "จัดการข้อมูลรายวัน", description_th: "เพิ่ม แก้ไข ล้าง และ Import ข้อมูลรายวัน", group_code: "data", sensitive: false },
  { code: "manage_scrap_sales", name_th: "จัดการรายการขายเศษวัสดุ", description_th: "เพิ่ม แก้ไข และลบรายการขาย", group_code: "data", sensitive: false },
  { code: "import_data", name_th: "Import ข้อมูล", description_th: "Import Excel เข้าสู่ระบบ", group_code: "data", sensitive: false },
  { code: "export_reports", name_th: "Export รายงาน", description_th: "สร้าง Excel, PDF, PNG และ PowerPoint", group_code: "reports", sensitive: false },
  { code: "manage_report_presets", name_th: "จัดการชุดรายงาน", description_th: "สร้างและดูแล Saved Report Presets", group_code: "reports", sensitive: false },
  { code: "review_data", name_th: "ตรวจสอบข้อมูล", description_th: "ทำเครื่องหมายว่าข้อมูลผ่านการตรวจสอบ", group_code: "governance", sensitive: false },
  { code: "lock_periods", name_th: "ปิดงวดข้อมูล", description_th: "ปิดงวดเพื่อป้องกันการแก้ไข", group_code: "governance", sensitive: true },
  { code: "reopen_periods", name_th: "เปิดงวดเพื่อแก้ไข", description_th: "เปิดงวดที่เคยปิดพร้อมระบุเหตุผล", group_code: "governance", sensitive: true },
];

// Default role permission matrix from migration 014
const DEFAULT_ROLE_MATRIX = {
  owner: new Set(DEFAULT_PERMISSIONS.map(p => p.code)),
  admin: new Set(["manage_master_data","manage_prices","manage_daily_data","manage_scrap_sales","import_data","export_reports","review_data","lock_periods","manage_report_presets"]),
  editor: new Set(["manage_daily_data","manage_scrap_sales","import_data","export_reports"]),
  viewer: new Set(["export_reports"]),
};

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15"/>
      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" opacity="0.3"/>
      <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

export function PermissionMatrixPage() {
  const { api, permissions } = useOutletContext();
  const canManage = hasPermission(permissions, "manage_users");

  const [matrix, setMatrix] = useState(null); // null = use defaults
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlight, setHighlight] = useState(null); // { row: code, col: role }
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [showSensitive, setShowSensitive] = useState(true);

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.request("/api/users/meta");
      // Build matrix from live role_permissions data
      if (data.role_permissions) {
        const live = {};
        for (const role of ROLE_ORDER) live[role] = new Set();
        for (const item of data.role_permissions) {
          if (live[item.role]) live[item.role].add(item.permission_code);
        }
        setMatrix(live);
      }
    } catch {
      // Fall back to defaults — still useful
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  }, [api, canManage]);

  useEffect(() => { load(); }, [load]);

  const effectiveMatrix = matrix || DEFAULT_ROLE_MATRIX;

  const displayPermissions = DEFAULT_PERMISSIONS.filter(p => {
    const textMatch = !search.trim() ||
      p.code.includes(search.toLowerCase()) ||
      p.name_th.includes(search);
    const groupMatch = groupFilter === "all" || p.group_code === groupFilter;
    const sensitiveMatch = showSensitive || !p.sensitive;
    return textMatch && groupMatch && sensitiveMatch;
  });

  // Group permissions for rendering
  const groups = Object.entries(
    displayPermissions.reduce((acc, p) => {
      const g = p.group_code;
      if (!acc[g]) acc[g] = [];
      acc[g].push(p);
      return acc;
    }, {})
  );

  if (!canManage) {
    return (
      <section className="connection-error page-error" role="alert">
        <div>
          <p className="eyebrow">Permission Required</p>
          <h1>คุณไม่มีสิทธิ์ดู Permission Matrix</h1>
          <p>หน้านี้ต้องการสิทธิ์ <strong>manage_users</strong></p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Security &amp; Access Control</p>
          <h1>Permission Matrix</h1>
          <p>ตารางแสดงสิทธิ์มาตรฐานของแต่ละบทบาท — ตรวจสอบเพื่อออกแบบการมอบหมายสิทธิ์</p>
        </div>
        <button className="secondary-button" type="button" onClick={load} disabled={loading}>
          {loading ? "กำลังโหลด..." : "รีเฟรช"}
        </button>
      </section>

      {/* Role Legend */}
      <section className="perm-matrix-legend">
        {ROLE_ORDER.map(role => (
          <div key={role} className="perm-legend-item" style={{ "--role-color": ROLE_COLORS[role] }}>
            <span className="perm-legend-dot" />
            <div>
              <strong>{roleLabels[role]}</strong>
              <small>{role}</small>
            </div>
            <span className="perm-legend-count">
              {effectiveMatrix[role]?.size ?? 0} สิทธิ์
            </span>
          </div>
        ))}
      </section>

      {/* Filters */}
      <section className="daily-filter-panel perm-filter-panel">
        <label>
          ค้นหา Permission
          <input
            type="search"
            placeholder="เช่น manage_users, ผู้ใช้..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <label>
          หมวดหมู่
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
            <option value="all">ทุกหมวด</option>
            {Object.entries(GROUP_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showSensitive} onChange={e => setShowSensitive(e.target.checked)} />
          <span>แสดง Sensitive Permissions</span>
        </label>
        {error && <span className="muted-text" style={{ color: "var(--warn)"}}>⚠ ใช้ข้อมูลค่าเริ่มต้น (ไม่ได้โหลดจาก DB)</span>}
      </section>

      {/* Matrix Table */}
      <section className="quality-list-card perm-matrix-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Role × Permission Matrix</p>
            <h2>ตารางสิทธิ์การเข้าถึง</h2>
          </div>
          <span className="muted-text">{displayPermissions.length} permissions</span>
        </div>

        {groups.length === 0 ? (
          <p className="empty-hint">ไม่พบ Permission ตามตัวกรอง</p>
        ) : (
          <div className="table-scroll perm-matrix-scroll">
            <table className="perm-matrix-table">
              <thead>
                <tr>
                  <th className="perm-name-col">Permission</th>
                  {ROLE_ORDER.map(role => (
                    <th key={role} className="perm-role-col" style={{ "--role-color": ROLE_COLORS[role] }}>
                      <span className="perm-role-header">
                        <span className="perm-role-dot" />
                        {roleLabels[role]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(([groupCode, perms]) => (
                  <div key={groupCode} style={{ display: 'contents' }}>
                    <tr className="perm-group-row">
                      <td colSpan={5} className="perm-group-header">
                        {GROUP_LABELS[groupCode] || groupCode}
                      </td>
                    </tr>
                    {perms.map(p => (
                      <tr
                        key={p.code}
                        className={`perm-row ${p.sensitive ? "perm-sensitive" : ""} ${highlight?.row === p.code ? "perm-row-highlighted" : ""}`}
                        onMouseEnter={() => setHighlight({ row: p.code })}
                        onMouseLeave={() => setHighlight(null)}
                      >
                        <td className="perm-name-cell">
                          <div>
                            <code className="perm-code">{p.code}</code>
                            {p.sensitive && <span className="perm-sensitive-tag">sensitive</span>}
                          </div>
                          <small>{p.name_th}</small>
                        </td>
                        {ROLE_ORDER.map(role => {
                          const granted = effectiveMatrix[role]?.has(p.code);
                          return (
                            <td
                              key={role}
                              className={`perm-cell ${granted ? "perm-granted" : "perm-denied"} ${highlight?.col === role ? "perm-col-highlighted" : ""}`}
                              style={granted ? { "--role-color": ROLE_COLORS[role] } : {}}
                              onMouseEnter={() => setHighlight({ row: p.code, col: role })}
                              onMouseLeave={() => setHighlight(null)}
                              title={`${role}: ${granted ? "อนุญาต" : "ไม่มีสิทธิ์"} — ${p.code}`}
                            >
                              {granted ? <CheckIcon /> : <DashIcon />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </div>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Info footer */}
      <section className="perm-matrix-footer">
        <div>
          <span>💡</span>
          <p>
            ตารางนี้แสดงสิทธิ์ <strong>มาตรฐานของบทบาท</strong> เจ้าของระบบสามารถปรับ Override เฉพาะรายบุคคลได้ในหน้า <strong>จัดการผู้ใช้งาน</strong>
          </p>
        </div>
        <div>
          <span>🔒</span>
          <p>
            <strong>Sensitive</strong> = สิทธิ์ที่อาจกระทบความปลอดภัยของระบบ ควรมอบหมายด้วยความระมัดระวัง
          </p>
        </div>
      </section>
    </>
  );
}
