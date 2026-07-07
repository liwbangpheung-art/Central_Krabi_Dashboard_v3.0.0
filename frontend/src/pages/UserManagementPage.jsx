import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { hasPermission, permissionState, roleLabels, statusLabels } from "../lib/permissions.js";

const modeOptions = [
  { id: "invite", title: "ส่งคำเชิญทางอีเมล", description: "ผู้ใช้ตั้งรหัสผ่านด้วยตนเอง เหมาะสำหรับการใช้งานทั่วไป" },
  { id: "temporary_password", title: "รหัสผ่านชั่วคราว", description: "เริ่มใช้งานได้ทันทีและต้องเปลี่ยนรหัสผ่านภายหลัง" },
  { id: "pending", title: "เตรียมบัญชีไว้ก่อน", description: "สร้างบัญชีแบบยังไม่เปิดใช้งาน แล้วค่อยเปิดภายหลัง" }
];

function blankCreate() {
  return { mode: "invite", fullName: "", email: "", role: "viewer", temporaryPassword: "" };
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordChecks = [
  { key: "length", test: (value) => value.length >= 12, message: "รหัสผ่านต้องมีอย่างน้อย 12 ตัว" },
  { key: "lower", test: (value) => /[a-z]/.test(value), message: "ต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว" },
  { key: "upper", test: (value) => /[A-Z]/.test(value), message: "ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว" },
  { key: "number", test: (value) => /\d/.test(value), message: "ต้องมีตัวเลขอย่างน้อย 1 ตัว" },
  { key: "symbol", test: (value) => /[^A-Za-z0-9]/.test(value), message: "ต้องมีสัญลักษณ์อย่างน้อย 1 ตัว" }
];

function validateCreateForm(form) {
  const errors = {};
  const fullName = String(form.fullName || "").trim();
  const email = String(form.email || "").trim();
  const role = String(form.role || "").trim();
  const password = String(form.temporaryPassword || "");

  if (!fullName) errors.fullName = "กรุณากรอกชื่อผู้ใช้งาน";
  if (!email) errors.email = "กรุณากรอกอีเมล";
  else if (!emailPattern.test(email)) errors.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (!role) errors.role = "กรุณาเลือกบทบาท";

  if (form.mode === "temporary_password") {
    if (!password) {
      errors.temporaryPassword = "กรุณากรอกรหัสผ่านชั่วคราว";
    } else {
      const failed = passwordChecks.filter((item) => !item.test(password)).map((item) => item.message);
      if (failed.length) errors.temporaryPassword = failed.join(" / ");
    }
  }

  return errors;
}

function firstCreateError(errors) {
  return errors.fullName || errors.email || errors.role || errors.temporaryPassword || "กรุณาตรวจสอบข้อมูลให้ครบถ้วน";
}

function permissionLabel(permission) {
  return permission?.name_th || permission?.code || "Permission";
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`inline-notice notice-${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
      <span>{notice.message}</span>
      <button type="button" onClick={onClose} aria-label="ปิดข้อความ">×</button>
    </div>
  );
}

export function UserManagementPage() {
  const { api, profile, permissions, refreshProfile } = useOutletContext();
  const canManage = hasPermission(permissions, "manage_users");
  const canCreate = hasPermission(permissions, "create_users") || hasPermission(permissions, "invite_users");
  const canManageAdmins = hasPermission(permissions, "manage_admins");
  const canEditProfile = hasPermission(permissions, "edit_user_profile");
  const canChangeRole = hasPermission(permissions, "change_user_role");
  const canDisable = hasPermission(permissions, "disable_users");
  const canResetPassword = hasPermission(permissions, "reset_user_password");
  const canViewAudit = hasPermission(permissions, "view_audit_logs");

  const [state, setState] = useState({ loading: true, items: [], meta: null, error: null });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [panel, setPanel] = useState("none");
  const [selectedId, setSelectedId] = useState(null);
  const [createForm, setCreateForm] = useState(blankCreate);
  const [createErrors, setCreateErrors] = useState({});
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [auditState, setAuditState] = useState({ open: false, loading: false, items: [], error: null });

  const loadData = useCallback(async () => {
    if (!canManage) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [users, meta] = await Promise.all([
        api.request("/api/users"),
        api.request("/api/users/meta")
      ]);
      setState({ loading: false, items: users.items || [], meta, error: null });
      setSelectedId((current) => users.items?.some((item) => item.id === current) ? current : null);
    } catch (error) {
      setState({ loading: false, items: [], meta: null, error });
    }
  }, [api, canManage]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.items.filter((item) => {
      const textMatch = !query || [item.full_name, item.email, roleLabels[item.role], statusLabels[item.status]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const roleMatch = roleFilter === "all" || item.role === roleFilter;
      const statusMatch = statusFilter === "all" || item.status === statusFilter;
      return textMatch && roleMatch && statusMatch;
    });
  }, [state.items, search, roleFilter, statusFilter]);

  const selected = useMemo(() => state.items.find((item) => item.id === selectedId) || null, [state.items, selectedId]);
  const counts = useMemo(() => ({
    total: state.items.length,
    active: state.items.filter((item) => item.status === "active").length,
    admins: state.items.filter((item) => ["owner", "admin"].includes(item.role)).length,
    disabled: state.items.filter((item) => ["disabled", "suspended"].includes(item.status)).length
  }), [state.items]);

  function openCreate() {
    setCreateForm({ ...blankCreate(), mode: hasPermission(permissions, "invite_users") ? "invite" : "temporary_password" });
    setCreateErrors({});
    setPanel("create");
    setSelectedId(null);
    setNotice(null);
  }

  function openEdit(item) {
    const overrides = {};
    for (const permission of state.meta?.permissions || []) {
      overrides[permission.code] = permissionState(item.permission_overrides, permission.code);
    }
    setSelectedId(item.id);
    setEditForm({
      fullName: item.full_name,
      role: item.role,
      status: item.status,
      mustChangePassword: Boolean(item.must_change_password),
      permissionOverrides: overrides
    });
    setPanel("edit");
    setNotice(null);
  }

  async function submitCreate(event) {
    event.preventDefault();
    const errors = validateCreateForm(createForm);
    setCreateErrors(errors);
    if (Object.keys(errors).length) {
      setNotice({ type: "error", message: firstCreateError(errors) });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const body = {
        mode: createForm.mode,
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim(),
        role: createForm.role,
        ...(createForm.mode === "temporary_password" ? { temporaryPassword: createForm.temporaryPassword } : {})
      };
      await api.request("/api/users", { method: "POST", body });
      setNotice({ type: "success", message: "เพิ่มผู้ใช้งานเรียบร้อยแล้ว" });
      setPanel("none");
      setCreateForm(blankCreate());
      setCreateErrors({});
      await loadData();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!selected || !editForm) return;
    setSaving(true);
    setNotice(null);
    try {
      const body = {
        ...(canEditProfile ? { fullName: editForm.fullName } : {}),
        ...(canChangeRole ? { role: editForm.role } : {}),
        ...(canDisable ? { status: editForm.status } : {}),
        ...(canResetPassword ? { mustChangePassword: editForm.mustChangePassword } : {}),
        ...(canManageAdmins && selected.id !== profile.id ? { permissionOverrides: editForm.permissionOverrides } : {})
      };
      await api.request(`/api/users/${selected.id}`, { method: "PATCH", body });
      setNotice({ type: "success", message: "บันทึกข้อมูลผู้ใช้งานเรียบร้อยแล้ว" });
      setPanel("none");
      await loadData();
      if (selected.id === profile.id) await refreshProfile();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function disableUser(item) {
    if (!window.confirm(`ยืนยันปิดใช้งานบัญชี ${item.full_name || item.email}? ข้อมูลย้อนหลังจะยังคงอยู่`)) return;
    setSaving(true);
    try {
      await api.request(`/api/users/${item.id}`, { method: "DELETE" });
      setNotice({ type: "success", message: "ปิดใช้งานบัญชีแล้ว" });
      setPanel("none");
      await loadData();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function passwordAction(item, action) {
    let body = { action };
    if (action === "set_temporary_password") {
      const temporaryPassword = window.prompt("กรอกรหัสผ่านชั่วคราวอย่างน้อย 12 ตัว พร้อมตัวพิมพ์เล็ก พิมพ์ใหญ่ ตัวเลข และสัญลักษณ์");
      if (!temporaryPassword) return;
      body = { action, temporaryPassword };
    }
    setSaving(true);
    try {
      await api.request(`/api/users/${item.id}/password`, { method: "POST", body });
      setNotice({ type: "success", message: action === "send_recovery" ? "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว" : "อัปเดตการตั้งค่ารหัสผ่านแล้ว" });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }


  async function toggleAudit() {
    if (!canViewAudit) return;
    if (auditState.open) {
      setAuditState((current) => ({ ...current, open: false }));
      return;
    }
    setAuditState({ open: true, loading: true, items: [], error: null });
    try {
      const data = await api.request("/api/audit-logs?limit=30");
      setAuditState({ open: true, loading: false, items: data.items || [], error: null });
    } catch (error) {
      setAuditState({ open: true, loading: false, items: [], error });
    }
  }

  if (!canManage) {
    return (
      <section className="connection-error page-error" role="alert">
        <div>
          <p className="eyebrow">Permission Required</p>
          <h1>คุณไม่มีสิทธิ์จัดการผู้ใช้งาน</h1>
          <p>เมนูนี้จะแสดงเฉพาะบัญชีที่ได้รับ Permission `manage_users` เท่านั้น</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack user-management-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">User & Permission Management</p>
          <h1>จัดการผู้ใช้งาน</h1>
          <p>จัดการบัญชี บทบาท และสิทธิ์เพิ่มเติม โดยไม่แสดงตัวเลือกที่ไม่จำเป็นพร้อมกัน</p>
        </div>
        <div className="page-heading-actions">
          {canViewAudit && <button className="secondary-button" type="button" onClick={toggleAudit}>{auditState.open ? "ซ่อนประวัติ" : "ดูประวัติ"}</button>}
          {canCreate && <button className="primary-button" type="button" onClick={openCreate}>+ เพิ่มผู้ใช้งาน</button>}
        </div>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      <div className="user-summary-grid">
        <article><small>ผู้ใช้ทั้งหมด</small><strong>{counts.total}</strong><span>สูงสุด 10 คน</span></article>
        <article><small>กำลังใช้งาน</small><strong>{counts.active}</strong><span>เข้าสู่ระบบและใช้งาน API ได้</span></article>
        <article><small>Owner / Admin</small><strong>{counts.admins}</strong><span>สิทธิ์จริงขึ้นกับ Permission</span></article>
        <article><small>ระงับหรือปิด</small><strong>{counts.disabled}</strong><span>ข้อมูลย้อนหลังยังคงอยู่</span></article>
      </div>

      <div className="user-toolbar">
        <label>
          <span>ค้นหา</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ชื่อ อีเมล หรือบทบาท" />
        </label>
        <label>
          <span>บทบาท</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">ทั้งหมด</option>
            {(state.meta?.roles || []).map((role) => <option key={role} value={role}>{roleLabels[role] || role}</option>)}
          </select>
        </label>
        <label>
          <span>สถานะ</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">ทั้งหมด</option>
            {(state.meta?.statuses || []).map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={loadData}>รีเฟรช</button>
      </div>

      {state.error && <div className="connection-error" role="alert"><div><h2>โหลดข้อมูลผู้ใช้ไม่สำเร็จ</h2><p>{state.error.message}</p></div></div>}

      {auditState.open && (
        <section className="audit-card">
          <div className="card-heading"><div><h2>ประวัติการจัดการล่าสุด</h2><p>แสดง 30 เหตุการณ์ล่าสุดเพื่อการตรวจสอบย้อนหลัง</p></div></div>
          {auditState.loading ? <div className="daily-loading">กำลังโหลดประวัติ...</div> : auditState.error ? (
            <div className="connection-error" role="alert"><div><p>{auditState.error.message}</p></div></div>
          ) : (
            <div className="audit-list">
              {auditState.items.map((item) => (
                <article key={item.id}>
                  <div><strong>{item.action}</strong><span>{item.target_type}{item.target_id ? ` · ${item.target_id}` : ""}</span></div>
                  <time>{new Date(item.created_at).toLocaleString("th-TH")}</time>
                </article>
              ))}
              {!auditState.items.length && <div className="empty-state"><strong>ยังไม่มีประวัติการจัดการ</strong></div>}
            </div>
          )}
        </section>
      )}

      <div className={`user-workspace ${panel !== "none" ? "with-editor" : ""}`}>
        <div className="user-list-card">
          <div className="card-heading"><div><h2>รายชื่อผู้ใช้งาน</h2><p>พบ {filtered.length} รายการ</p></div></div>
          {state.loading ? <div className="daily-loading">กำลังโหลดข้อมูล...</div> : (
            <div className="table-scroll">
              <table className="user-table">
                <thead><tr><th>ผู้ใช้งาน</th><th>บทบาท</th><th>สถานะ</th><th>สิทธิ์ใช้งาน</th><th aria-label="การจัดการ" /></tr></thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className={selectedId === item.id ? "selected-row" : ""}>
                      <td><strong>{item.full_name || "ยังไม่ระบุชื่อ"}</strong><small>{item.email}</small></td>
                      <td><span className={`role-badge role-${item.role}`}>{roleLabels[item.role] || item.role}</span></td>
                      <td><span className={`status-badge status-${item.status}`}>{statusLabels[item.status] || item.status}</span></td>
                      <td>{item.effective_permissions?.length || 0} รายการ</td>
                      <td><button className="table-action" type="button" onClick={() => openEdit(item)}>ดู / แก้ไข</button></td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan="5"><div className="empty-state"><strong>ไม่พบผู้ใช้งานตามตัวกรอง</strong></div></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {panel === "create" && (
          <aside className="user-editor-card">
            <div className="editor-heading"><div><p className="eyebrow">New User</p><h2>เพิ่มผู้ใช้งาน</h2></div><button type="button" onClick={() => setPanel("none")} aria-label="ปิด">×</button></div>
            <form className="user-form" onSubmit={submitCreate}>
              <fieldset className="create-mode-grid">
                <legend>เลือกวิธีสร้างบัญชี</legend>
                {modeOptions.filter((mode) => mode.id !== "invite" || hasPermission(permissions, "invite_users")).filter((mode) => mode.id === "invite" || hasPermission(permissions, "create_users")).map((mode) => (
                  <label key={mode.id} className={createForm.mode === mode.id ? "selected" : ""}>
                    <input type="radio" name="create-mode" value={mode.id} checked={createForm.mode === mode.id} onChange={() => setCreateForm((current) => ({ ...current, mode: mode.id }))} />
                    <span><strong>{mode.title}</strong><small>{mode.description}</small></span>
                  </label>
                ))}
              </fieldset>
              {Object.keys(createErrors).length > 0 && (
                <div className="form-error-summary" role="alert">
                  <strong>กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง</strong>
                  <span>{firstCreateError(createErrors)}</span>
                </div>
              )}
              <label><span>ชื่อผู้ใช้งาน</span><input required aria-invalid={Boolean(createErrors.fullName)} value={createForm.fullName} onChange={(event) => { setCreateForm((current) => ({ ...current, fullName: event.target.value })); if (createErrors.fullName) setCreateErrors((current) => ({ ...current, fullName: "" })); }} />{createErrors.fullName && <small className="field-error">{createErrors.fullName}</small>}</label>
              <label><span>อีเมล</span><input required aria-invalid={Boolean(createErrors.email)} type="email" value={createForm.email} onChange={(event) => { setCreateForm((current) => ({ ...current, email: event.target.value })); if (createErrors.email) setCreateErrors((current) => ({ ...current, email: "" })); }} />{createErrors.email && <small className="field-error">{createErrors.email}</small>}</label>
              <label><span>บทบาท</span><select aria-invalid={Boolean(createErrors.role)} value={createForm.role} onChange={(event) => { setCreateForm((current) => ({ ...current, role: event.target.value })); if (createErrors.role) setCreateErrors((current) => ({ ...current, role: "" })); }}>{(state.meta?.roles || []).filter((role) => canManageAdmins || !["owner", "admin"].includes(role)).map((role) => <option key={role} value={role}>{roleLabels[role] || role}</option>)}</select>{createErrors.role && <small className="field-error">{createErrors.role}</small>}</label>
              {createForm.mode === "temporary_password" && <label><span>รหัสผ่านชั่วคราว</span><input required aria-invalid={Boolean(createErrors.temporaryPassword)} type="password" autoComplete="new-password" value={createForm.temporaryPassword} onChange={(event) => { setCreateForm((current) => ({ ...current, temporaryPassword: event.target.value })); if (createErrors.temporaryPassword) setCreateErrors((current) => ({ ...current, temporaryPassword: "" })); }} /><small>อย่างน้อย 12 ตัว พร้อมตัวพิมพ์เล็ก พิมพ์ใหญ่ ตัวเลข และสัญลักษณ์</small>{createErrors.temporaryPassword && <small className="field-error">{createErrors.temporaryPassword}</small>}</label>}
              <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setPanel("none")}>ยกเลิก</button><button className="primary-button" disabled={saving} type="submit">{saving ? "กำลังสร้าง..." : "สร้างบัญชี"}</button></div>
            </form>
          </aside>
        )}

        {panel === "edit" && selected && editForm && (
          <aside className="user-editor-card">
            <div className="editor-heading"><div><p className="eyebrow">User Detail</p><h2>{selected.full_name || selected.email}</h2><p>{selected.email}</p></div><button type="button" onClick={() => setPanel("none")} aria-label="ปิด">×</button></div>
            <form className="user-form" onSubmit={submitEdit}>
              <label><span>ชื่อผู้ใช้งาน</span><input disabled={!canEditProfile} value={editForm.fullName} onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))} /></label>
              <div className="form-grid two-columns">
                <label><span>บทบาท</span><select value={editForm.role} disabled={!canChangeRole || selected.id === profile.id} onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))}>{(state.meta?.roles || []).filter((role) => canManageAdmins || !["owner", "admin"].includes(role)).map((role) => <option key={role} value={role}>{roleLabels[role] || role}</option>)}</select></label>
                <label><span>สถานะ</span><select value={editForm.status} disabled={!canDisable || selected.id === profile.id} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}>{(state.meta?.statuses || []).map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}</select></label>
              </div>
              <label className="checkbox-row"><input type="checkbox" checked={editForm.mustChangePassword} disabled={!canResetPassword} onChange={(event) => setEditForm((current) => ({ ...current, mustChangePassword: event.target.checked }))} /><span>บังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป</span></label>

              {canManageAdmins && selected.id !== profile.id && (
                <details className="permission-details">
                  <summary>สิทธิ์เพิ่มเติม <span>เปิดเมื่อจำเป็น</span></summary>
                  <p>ค่า “ตามบทบาท” ใช้สิทธิ์มาตรฐาน ส่วนอนุญาตหรือปฏิเสธจะ Override เฉพาะบัญชีนี้</p>
                  <div className="permission-list">
                    {(state.meta?.permissions || []).map((permission) => (
                      <label key={permission.code}>
                        <span><strong>{permissionLabel(permission)}</strong><small>{permission.description_th}</small></span>
                        <select value={editForm.permissionOverrides[permission.code] || "inherit"} onChange={(event) => setEditForm((current) => ({ ...current, permissionOverrides: { ...current.permissionOverrides, [permission.code]: event.target.value } }))}>
                          <option value="inherit">ตามบทบาท</option><option value="allow">อนุญาต</option><option value="deny">ปฏิเสธ</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </details>
              )}

              {canResetPassword && (
                <details className="permission-details compact-details">
                  <summary>จัดการรหัสผ่าน <span>ไม่สามารถดูรหัสผ่านปัจจุบันได้</span></summary>
                  <div className="password-actions">
                    <button className="secondary-button" type="button" onClick={() => passwordAction(selected, "send_recovery")}>ส่งอีเมลรีเซ็ต</button>
                    <button className="secondary-button" type="button" onClick={() => passwordAction(selected, "set_temporary_password")}>ตั้งรหัสผ่านชั่วคราว</button>
                    <button className="secondary-button" type="button" onClick={() => passwordAction(selected, "force_change")}>บังคับเปลี่ยนครั้งถัดไป</button>
                  </div>
                </details>
              )}

              <div className="form-actions"><button className="secondary-button" type="button" onClick={() => setPanel("none")}>ยกเลิก</button><button className="primary-button" disabled={saving} type="submit">{saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}</button></div>
              {canDisable && selected.id !== profile.id && selected.status !== "disabled" && <button className="danger-button full-width" type="button" disabled={saving} onClick={() => disableUser(selected)}>ปิดใช้งานบัญชี</button>}
            </form>
          </aside>
        )}
      </div>
    </section>
  );
}
