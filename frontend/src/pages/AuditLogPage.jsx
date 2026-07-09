import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { hasPermission } from "../lib/permissions.js";

const ACTION_GROUPS = [
  { label: "ทั้งหมด", value: "" },
  { label: "ข้อมูลรายวัน", value: "daily_entry" },
  { label: "งวดข้อมูล", value: "period" },
  { label: "ขยะรีไซเคิล", value: "scrap_sale" },
  { label: "Master Data", value: "master_category" },
  { label: "ผู้ใช้", value: "user" },
  { label: "Import", value: "import" },
  { label: "Export", value: "export" },
];

const TARGET_TYPES = [
  { label: "ทุกประเภท", value: "" },
  { label: "daily_entry", value: "daily_entry" },
  { label: "data_period", value: "data_period" },
  { label: "scrap_sale", value: "scrap_sale" },
  { label: "master_category", value: "master_category" },
  { label: "user", value: "user" },
  { label: "import_history", value: "import_history" },
  { label: "export_log", value: "export_log" },
  { label: "report_run", value: "report_run" },
];

function actionBadgeClass(action) {
  if (!action) return "status-chip";
  if (action.includes("create") || action.includes("insert") || action.includes("import") || action.includes("validated")) return "status-chip status-open";
  if (action.includes("delete") || action.includes("remove") || action.includes("rejected")) return "status-chip status-rejected";
  if (action.includes("update") || action.includes("edit") || action.includes("review") || action.includes("transition") || action.includes("reopen")) return "status-chip status-partial";
  if (action.includes("lock") || action.includes("export") || action.includes("generate")) return "status-chip status-closed";
  return "status-chip";
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
}

function JsonPreview({ data, label }) {
  const [open, setOpen] = useState(false);
  if (!data) return <span className="muted-text">—</span>;
  return (
    <details className="audit-json-details">
      <summary onClick={() => setOpen(!open)}>{label || "ดูข้อมูล"}</summary>
      {open && <pre className="audit-json-pre">{JSON.stringify(data, null, 2)}</pre>}
    </details>
  );
}

export function AuditLogPage() {
  const { api, permissions } = useOutletContext();
  const canView = hasPermission(permissions, "view_audit_logs");

  const [filters, setFilters] = useState({ action: "", target_type: "", user_id: "", from: "", to: "", limit: 50 });
  const [page, setPage] = useState(0);
  const [state, setState] = useState({ loading: false, items: [], total: 0, error: null });
  const [expandedRow, setExpandedRow] = useState(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      params.set("limit", String(filters.limit));
      params.set("offset", String(page * filters.limit));
      if (filters.action) params.set("action", filters.action);
      if (filters.target_type) params.set("target_type", filters.target_type);
      if (filters.user_id) params.set("user_id", filters.user_id);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const data = await api.request(`/api/audit-logs?${params.toString()}`);
      setState({ loading: false, items: data.items ?? [], total: data.total ?? 0, error: null });
    } catch (error) {
      setState({ loading: false, items: [], total: 0, error });
    }
  }, [api, canView, filters, page]);

  useEffect(() => { load(); }, [load]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  }

  const totalPages = Math.ceil(state.total / filters.limit);

  if (!canView) {
    return (
      <>
        <section className="page-heading">
          <div><p className="eyebrow">ระบบ</p><h1>ประวัติการกระทำ</h1></div>
        </section>
        <section className="connection-error page-error" role="alert">
          <div>
            <h2>ไม่มีสิทธิ์เข้าถึง</h2>
            <p>คุณต้องมีสิทธิ์ <strong>view_audit_logs</strong> เพื่อดูหน้านี้</p>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Security &amp; Compliance</p>
          <h1>ประวัติการกระทำ (Audit Log)</h1>
          <p>ตรวจสอบทุกการเปลี่ยนแปลงในระบบ — ใครทำ ทำอะไร เมื่อไหร่</p>
        </div>
        <button className="secondary-button" type="button" onClick={load} disabled={state.loading}>
          {state.loading ? "กำลังโหลด..." : "รีเฟรช"}
        </button>
      </section>

      <section className="daily-filter-panel audit-filter-panel">
        <label>การกระทำ
          <select value={filters.action} onChange={(e) => updateFilter("action", e.target.value)}>
            {ACTION_GROUPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>ประเภทเป้าหมาย
          <select value={filters.target_type} onChange={(e) => updateFilter("target_type", e.target.value)}>
            {TARGET_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>จากวันที่
          <input type="date" value={filters.from} onChange={(e) => updateFilter("from", e.target.value)} />
        </label>
        <label>ถึงวันที่
          <input type="date" value={filters.to} onChange={(e) => updateFilter("to", e.target.value)} />
        </label>
        <label>จำนวนแสดง
          <select value={filters.limit} onChange={(e) => updateFilter("limit", Number(e.target.value))}>
            <option value={25}>25 รายการ</option>
            <option value={50}>50 รายการ</option>
            <option value={100}>100 รายการ</option>
            <option value={200}>200 รายการ</option>
          </select>
        </label>
      </section>

      {state.error && (
        <section className="connection-error page-error" role="alert">
          <div>
            <p className="eyebrow">Audit Log Error</p>
            <h2>โหลดประวัติไม่สำเร็จ</h2>
            <p>{state.error.message}</p>
          </div>
          <button className="primary-button compact" type="button" onClick={load}>ลองใหม่</button>
        </section>
      )}

      <section className="quality-list-card audit-log-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Audit Trail</p>
            <h2>รายการทั้งหมด</h2>
          </div>
          <span>{state.loading ? "กำลังโหลด..." : `${state.total.toLocaleString("th-TH")} รายการ`}</span>
        </div>

        {state.loading ? (
          <div className="daily-loading"><span className="spinner" />กำลังโหลดประวัติ...</div>
        ) : state.items.length === 0 ? (
          <p className="empty-hint">ไม่พบรายการในช่วงที่กรอง</p>
        ) : (
          <div className="table-scroll">
            <table className="v3-data-table audit-log-table">
              <thead>
                <tr>
                  <th>วันที่/เวลา</th>
                  <th>การกระทำ</th>
                  <th>ประเภท</th>
                  <th>ผู้ดำเนินการ</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => {
                  const isExpanded = expandedRow === item.id;
                  return (
                    <>
                      <tr
                        key={item.id}
                        className={`audit-log-row ${isExpanded ? "expanded" : ""}`}
                        onClick={() => setExpandedRow(isExpanded ? null : item.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td className="numeric-cell" style={{ whiteSpace: "nowrap" }}>{formatDate(item.createdAt)}</td>
                        <td><span className={actionBadgeClass(item.action)}>{item.action}</span></td>
                        <td><code className="audit-target-type">{item.targetType}</code></td>
                        <td>
                          {item.performedByUser ? (
                            <div>
                              <strong>{item.performedByUser.fullName}</strong>
                              <br />
                              <small>{item.performedByUser.email}</small>
                            </div>
                          ) : (
                            <span className="muted-text">{item.performedBy?.slice(0, 8) || "ระบบ"}</span>
                          )}
                        </td>
                        <td>
                          <span className="muted-text">
                            {item.targetId ? `ID: ${String(item.targetId).slice(0, 16)}${String(item.targetId).length > 16 ? "..." : ""}` : "—"}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${item.id}-detail`} className="audit-log-detail-row">
                          <td colSpan={5}>
                            <div className="audit-detail-grid">
                              <div>
                                <strong>ก่อนแก้ไข</strong>
                                <JsonPreview data={item.beforeData} label="ดูข้อมูลก่อน" />
                              </div>
                              <div>
                                <strong>หลังแก้ไข</strong>
                                <JsonPreview data={item.afterData} label="ดูข้อมูลหลัง" />
                              </div>
                              <div>
                                <strong>Metadata</strong>
                                <JsonPreview data={item.metadata} label="ดู Metadata" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="audit-pagination">
            <button
              className="secondary-button compact"
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || state.loading}
            >
              ← ก่อนหน้า
            </button>
            <span>หน้า {page + 1} / {totalPages}</span>
            <button
              className="secondary-button compact"
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || state.loading}
            >
              ถัดไป →
            </button>
          </div>
        )}
      </section>
    </>
  );
}
