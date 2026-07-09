import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { currentMonthValue, monthLabelThai } from "../lib/daily-entry.js";

function formatPercent(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

export function DataQualityPage() {
  const { api } = useOutletContext();
  const [month, setMonth] = useState(currentMonthValue());
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [quality, imports] = await Promise.all([
        api.request(`/api/data-quality?month=${encodeURIComponent(month)}`),
        api.request(`/api/import-history?month=${encodeURIComponent(month)}`)
      ]);
      setState({ loading: false, data: { ...quality, imports: imports.items || [] }, error: null });
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
  }, [api, month]);

  useEffect(() => { load(); }, [load]);
  const data = state.data;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Phase B</p>
          <h1>คุณภาพข้อมูล</h1>
          <p>ดูภาพรวมก่อน แล้วค่อยเปิดรายละเอียดวันที่ขาดหาย เพื่อให้ตรวจข้อมูลได้ง่ายโดยไม่ทำให้หน้าจอรก</p>
        </div>
      </section>

      <section className="daily-filter-panel quality-filter-panel">
        <label>เดือนที่ต้องการตรวจ
          <input type="month" min="2020-01" max={currentMonthValue()} value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <button className="secondary-button" type="button" onClick={load} disabled={state.loading}>{state.loading ? "กำลังตรวจ..." : "ตรวจข้อมูลใหม่"}</button>
      </section>

      {state.error && <section className="connection-error page-error" role="alert"><div><p className="eyebrow">Data Quality Error</p><h2>ตรวจคุณภาพข้อมูลไม่สำเร็จ</h2><p>{state.error.message}</p></div><button className="primary-button compact" type="button" onClick={load}>ลองใหม่</button></section>}

      {data && (
        <>
          <section className="quality-hero-card">
            <div>
              <p className="eyebrow">{monthLabelThai(month)}</p>
              <h2>{formatPercent(data.summary.completeness_percent)}% พร้อมใช้งาน</h2>
              <p>ตรวจถึงวันที่ {data.today} ตามเวลา Asia/Bangkok • สถานะงวด: <strong>{data.period.status_label}</strong></p>
            </div>
            <div className="quality-ring" aria-label={`ความครบถ้วน ${data.summary.completeness_percent} เปอร์เซ็นต์`}><strong>{Math.round(data.summary.completeness_percent)}%</strong><span>ครบถ้วน</span></div>
          </section>

          <section className="daily-summary-grid quality-summary-grid">
            <article><small>ประเภทที่ตรวจ</small><strong>{data.summary.categories}</strong><span>รายการ</span></article>
            <article><small>ช่องข้อมูลที่คาดหวัง</small><strong>{data.summary.expected_cells}</strong><span>ถึงวันปัจจุบัน</span></article>
            <article><small>มีข้อมูลแล้ว</small><strong>{data.summary.filled_cells}</strong><span>ช่อง</span></article>
            <article><small>ยังขาด</small><strong>{data.summary.missing_cells}</strong><span>{data.summary.issue_count} ประเด็น</span></article>
          </section>

          <section className="quality-list-card">
            <div className="card-heading"><div><p className="eyebrow">Category completeness</p><h2>ความครบถ้วนแยกประเภท</h2></div><span>{data.elapsed_days} วันที่ตรวจแล้ว</span></div>
            <div className="quality-category-list">
              {data.categories.map((item) => (
                <article key={item.id}>
                  <div><strong>{item.name_th}</strong><small>{item.module} • {item.unit}</small></div>
                  <div className="quality-progress"><i style={{ width: `${Math.min(100, item.completeness_percent)}%` }} /></div>
                  <span>{formatPercent(item.completeness_percent)}% • ขาด {item.missing_days} วัน</span>
                </article>
              ))}
            </div>
          </section>

          <details className="quality-issues-card">
            <summary>ประวัติ Import ของเดือนนี้ ({data.imports.length})</summary>
            {data.imports.length === 0 ? <p>ยังไม่มีประวัติ Import ในเดือนนี้</p> : (
              <div className="quality-issue-list import-history-list">
                {data.imports.map((item) => (
                  <article key={item.id}>
                    <strong>{item.file_name}</strong>
                    <p>{item.status} • ผ่าน {item.valid_rows} แถว • ผิด {item.error_rows} แถว</p>
                    <small>{item.sheet_name || "ไม่ระบุ Sheet"} • {item.created_at ? new Date(item.created_at).toLocaleString("th-TH") : "—"}</small>
                  </article>
                ))}
              </div>
            )}
          </details>

          <details className="quality-issues-card" open={data.summary.issue_count > 0}>
            <summary>รายละเอียดที่ควรตรวจสอบ ({data.summary.issue_count})</summary>
            {data.issues.length === 0 ? <p>ไม่พบประเด็นที่ต้องแก้ไขในช่วงวันที่ตรวจสอบ</p> : (
              <div className="quality-issue-list">
                {data.issues.map((issue, index) => (
                  <article key={`${issue.code}-${issue.category_id || index}`}>
                    <strong>{issue.category_name || "สถานะงวด"}</strong>
                    <p>{issue.code === "MISSING_DAILY_DATA" ? `ยังไม่มีข้อมูล ${issue.count} วัน` : issue.message}</p>
                    {issue.dates?.length > 0 && <small>{issue.dates.slice(0, 12).join(", ")}{issue.dates.length > 12 ? ` และอีก ${issue.dates.length - 12} วัน` : ""}</small>}
                  </article>
                ))}
              </div>
            )}
          </details>
        </>
      )}
    </>
  );
}
