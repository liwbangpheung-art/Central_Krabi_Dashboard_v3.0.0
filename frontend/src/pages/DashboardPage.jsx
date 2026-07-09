import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { AnalyticsChart } from "../components/analytics/AnalyticsChart.jsx";
import { analyticsPath, chartRows, comparisonPercentText, defaultAnalyticsFilters, formatNumber } from "../lib/analytics.js";
import { currentMonthValue, monthLabelThai } from "../lib/daily-entry.js";

const quickActions = [
  { to: "/entry/rdf", label: "บันทึกขยะ RDF", icon: "waste" },
  { to: "/entry/dog-food", label: "บันทึกอาหารหมา", icon: "feed" },
  { to: "/entry/wet-waste", label: "ขยะเปียก & หมู", icon: "wet" },
  { to: "/entry/recycle", label: "ขยะรีไซเคิล", icon: "recycle" },
  { to: "/analytics", label: "วิเคราะห์กราฟ", icon: "chart" },
  { to: "/data-quality", label: "ตรวจคุณภาพ", icon: "check" },
];

function QuickIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {name === "waste" && <><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></>}
      {name === "feed" && <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>}
      {name === "wet" && <><path d="M12 2C7 9 5 13 5 16a7 7 0 0 0 14 0c0-3-2-7-7-14z" /></>}
      {name === "recycle" && <><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></>}
      {name === "chart" && <><path d="M18 20V10M12 20V4M6 20v-6" /></>}
      {name === "check" && <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></>}
    </svg>
  );
}

export function DashboardPage() {
  const { api, profile } = useOutletContext();
  const defaults = useMemo(() => defaultAnalyticsFilters(), []);
  const thisMonth = useMemo(() => currentMonthValue(), []);
  const [state, setState] = useState({ loading: true, waste: null, scrap: null, error: null });
  const [monthState, setMonthState] = useState({ loading: true, data: null, error: null });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    setMonthState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [waste, scrap, quality] = await Promise.all([
        api.request(analyticsPath({ ...defaults, module: "waste", view: "yearly", metric: "quantity" })),
        api.request(analyticsPath({ ...defaults, module: "scrap_sales", view: "yearly", metric: "amount" })),
        api.request(`/api/data-quality?month=${encodeURIComponent(thisMonth)}`).catch(() => null)
      ]);
      setState({ loading: false, waste, scrap, error: null });
      setMonthState({ loading: false, data: quality, error: null });
    } catch (error) {
      setState({ loading: false, waste: null, scrap: null, error });
      setMonthState({ loading: false, data: null, error: null });
    }
  }, [api, defaults, thisMonth]);

  useEffect(() => { load(); }, [load]);

  const wasteRows = chartRows(state.waste);
  const wasteCategories = state.waste?.categories || [];
  const wet = wasteCategories.find((item) => item.code === "WET_WASTE")?.total || 0;
  const recycle = wasteCategories.find((item) => item.code === "RECYCLE")?.total || 0;
  const rdf = wasteCategories.find((item) => item.code === "RDF")?.total || 0;
  const quality = monthState.data;

  return (
    <>
      <section className="page-heading executive-heading" style={{ marginBottom: "20px" }}>
        <div>
          <p className="eyebrow">Executive Dashboard • ปี {defaults.year}</p>
          <h1>สวัสดี, {profile?.full_name || "ผู้เข้าใช้งานระบบ"}</h1>
          <p>สรุปข้อมูลปริมาณขยะสะสมและการทำงานประจำงวดของ Central Krabi</p>
        </div>
        <div className="page-heading-actions">
          <Link className="secondary-link" to="/data-quality">ตรวจคุณภาพข้อมูล</Link>
          <Link className="primary-link" to="/analytics">วิเคราะห์เชิงลึก</Link>
        </div>
      </section>

      {/* Monthly Data Quality KPI block */}
      {quality && (
        <section className="dashboard-month-kpi" style={{ marginBottom: "20px" }}>
          <article>
            <small>เดือน {monthLabelThai(thisMonth)}</small>
            <strong>{Math.round(quality.summary?.completeness_percent || 0)}%</strong>
            <span>ความครบถ้วนข้อมูล</span>
          </article>
          <article>
            <small>ช่องที่บันทึกแล้ว</small>
            <strong>{(quality.summary?.filled_cells || 0).toLocaleString("th-TH")}</strong>
            <span>จาก {(quality.summary?.expected_cells || 0).toLocaleString("th-TH")} ช่อง</span>
          </article>
          <article>
            <small>ยังขาด</small>
            <strong>{quality.summary?.missing_cells || 0}</strong>
            <span>ช่องข้อมูล</span>
          </article>
          <article>
            <small>สถานะงวด</small>
            <strong style={{ fontSize: "1.1rem" }}>{quality.period?.status_label || "—"}</strong>
            <span>{quality.elapsed_days} วันที่ตรวจแล้ว</span>
          </article>
        </section>
      )}

      {/* KPI Cards Grid */}
      <section className="executive-kpi-grid-v3">
        <article className="kpi-card-highlighted">
          <div className="kpi-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 6h-1V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v2H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM8 4h8v2H8V4z" /></svg>
          </div>
          <div className="kpi-body">
            <span>ขยะสะสมรวมทั้งหมด</span>
            <strong>{formatNumber(state.waste?.kpis?.grandTotal)} <small>กก.</small></strong>
            <em>{formatNumber((state.waste?.kpis?.grandTotal || 0) / 1000)} ตัน</em>
          </div>
        </article>

        <article className="kpi-card-standard">
          <div className="kpi-icon-badge rdf-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
          </div>
          <div className="kpi-body">
            <span>ขยะ RDF (พลังงาน)</span>
            <strong>{formatNumber(rdf)} <small>กก.</small></strong>
            <em>ถังสีดำ</em>
          </div>
        </article>

        <article className="kpi-card-standard">
          <div className="kpi-icon-badge wet-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C7 9 5 13 5 16a7 7 0 0 0 14 0c0-3-2-7-7-14z" /></svg>
          </div>
          <div className="kpi-body">
            <span>ขยะเปียก / อาหารสัตว์</span>
            <strong>{formatNumber(wet)} <small>กก.</small></strong>
            <em>ถังสีเขียว</em>
          </div>
        </article>

        <article className="kpi-card-standard">
          <div className="kpi-icon-badge recycle-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg>
          </div>
          <div className="kpi-body">
            <span>ขยะรีไซเคิล (คัดแยก)</span>
            <strong>{formatNumber(recycle)} <small>กก.</small></strong>
            <em>ถังสีเหลือง</em>
          </div>
        </article>

        <article className="kpi-card-standard">
          <div className="kpi-icon-badge scrap-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 0 0 4h4a2 2 0 0 1 0 4H8M12 18V6" /></svg>
          </div>
          <div className="kpi-body">
            <span>รายได้จากการขายเศษวัสดุ</span>
            <strong>{formatNumber(state.scrap?.kpis?.grandTotal)} <small>บาท</small></strong>
            <em>{comparisonPercentText(state.scrap?.comparison, { fallback: "ไม่มีเปรียบเทียบ", suffix: " จากปีก่อน" })}</em>
          </div>
        </article>
      </section>

      {/* Two Column Charts Block (Proportion & Trend) */}
      <section className="executive-chart-grid" style={{ marginTop: "24px" }}>
        <article className="analytics-chart-card">
          <div className="card-heading">
            <div><p className="eyebrow">Waste Proportion</p><h2>สัดส่วนประเภทขยะสะสม</h2></div>
            <Link to="/analytics">วิเคราะห์ประเภท</Link>
          </div>
          {state.loading
            ? <div className="daily-loading"><span className="spinner" />กำลังโหลด...</div>
            : <AnalyticsChart data={state.waste} rows={wasteRows} chartType="donut" showLegend showValues={false} includeTotal={false} height={280} />
          }
        </article>
        <article className="analytics-chart-card">
          <div className="card-heading">
            <div><p className="eyebrow">Monthly Trend</p><h2>แนวโน้มปริมาณขยะรายเดือน</h2></div>
            <Link to="/analytics">วิเคราะห์แนวโน้ม</Link>
          </div>
          {state.loading
            ? <div className="daily-loading"><span className="spinner" />กำลังโหลด...</div>
            : <AnalyticsChart data={state.waste} rows={wasteRows} chartType="bar" showLegend showValues={false} includeTotal={false} height={280} />
          }
        </article>
      </section>

      {/* Executive Summary Insight Banner */}
      <section className="executive-insight-banner" style={{ background: "white", padding: "18px 24px", borderRadius: "18px", border: "1px solid var(--border)", marginTop: "24px", boxShadow: "0 4px 14px rgba(30,28,59,.025)" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div style={{ background: "var(--accent-soft)", color: "var(--accent-strong)", borderRadius: "12px", padding: "10px", display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.02rem", fontWeight: "800", color: "#20243a" }}>สรุปวิเคราะห์ข้อมูลผู้บริหารประจำรอบ</h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
              ปริมาณขยะเฉลี่ยรายเดือน: <strong>{formatNumber(state.waste?.kpis?.average)} กก.</strong> • ปริมาณสูงสุดในงวด: <strong>{formatNumber(state.waste?.kpis?.maximum)} กก.</strong> (รอบ {state.waste?.kpis?.maximumPeriod || "—"}) • เปรียบเทียบรายได้เศษวัสดุรวม: <strong>{comparisonPercentText(state.scrap?.comparison, { fallback: "ไม่มีข้อมูลเปรียบเทียบ" })}</strong>
            </p>
          </div>
        </div>
      </section>

      {/* Quick Menu shortcuts bottom */}
      <h3 style={{ marginTop: "28px", marginBottom: "12px", fontSize: "1.1rem", fontWeight: "800", color: "#20243a" }}>ทางลัดด่วนการทำงาน</h3>
      <nav className="dashboard-quick-actions-grid" aria-label="ทางลัดด่วน">
        {quickActions.map((item) => (
          <Link key={item.to} to={item.to}>
            <span className="quick-icon-wrapper">
              <QuickIcon name={item.icon} />
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

