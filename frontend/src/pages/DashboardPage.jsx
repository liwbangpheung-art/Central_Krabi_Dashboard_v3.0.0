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
    <svg viewBox="0 0 24 24">
      {name === "waste" && <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>}
      {name === "feed" && <><path d="M10 2v4" /><path d="M14 2v4" /><path d="M7 6h10a1 1 0 011 1v3a5 5 0 01-10 0V7a1 1 0 011-1z" /><path d="M12 13v8" /><path d="M9 21h6" /></>}
      {name === "wet" && <><path d="M12 2C7 9 5 13 5 16a7 7 0 0014 0c0-3-2-7-7-14z" /></>}
      {name === "recycle" && <><path d="M7.5 7.5l2.2-3.1c.8-1.1 2.5-1.1 3.2.1l1 1.8" /><path d="M13 5.5h3.6l-1.3-3.3" /><path d="M17 12l2.2 3.1c.8 1.1.1 2.7-1.3 2.7h-2.2" /></>}
      {name === "chart" && <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-5" /><path d="M12 16V8" /><path d="M16 16v-9" /></>}
      {name === "check" && <><path d="M20 6L9 17l-5-5" /></>}
    </svg>
  );
}

export function DashboardPage() {
  const { api } = useOutletContext();
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
      <section className="page-heading executive-heading">
        <div>
          <p className="eyebrow">Executive Dashboard</p>
          <h1>ภาพรวมการจัดการขยะและทรัพยากร</h1>
          <p>ข้อมูลปี {defaults.year} จากฐานข้อมูลจริงของ Central Krabi</p>
        </div>
        <div className="page-heading-actions">
          <Link className="secondary-link" to="/data-quality">ตรวจคุณภาพ</Link>
          <Link className="primary-link" to="/analytics">วิเคราะห์เชิงลึก</Link>
        </div>
      </section>

      {/* Quick Action shortcuts */}
      <nav className="dashboard-quick-actions" aria-label="ทางลัด">
        {quickActions.map((item) => (
          <Link key={item.to} to={item.to}>
            <QuickIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>

      {state.error && (
        <section className="connection-error" role="alert">
          <div><h2>โหลด Dashboard ไม่สำเร็จ</h2><p>{state.error.message}</p></div>
          <button className="primary-button compact" onClick={load}>ลองใหม่</button>
        </section>
      )}

      {/* Monthly KPI for current month */}
      {quality && (
        <section className="dashboard-month-kpi">
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

      <section className="executive-kpi-grid">
        <article><span>ขยะรวม</span><strong>{formatNumber(state.waste?.kpis?.grandTotal)} <small>กก.</small></strong><em>{formatNumber((state.waste?.kpis?.grandTotal || 0) / 1000)} ตัน</em></article>
        <article><span>ขยะ RDF</span><strong>{formatNumber(rdf)} <small>กก.</small></strong><em>สีมาตรฐาน: ดำ</em></article>
        <article><span>ขยะเปียก</span><strong>{formatNumber(wet)} <small>กก.</small></strong><em>สีมาตรฐาน: เขียว</em></article>
        <article><span>Recycle</span><strong>{formatNumber(recycle)} <small>กก.</small></strong><em>สีมาตรฐาน: เหลือง</em></article>
        <article><span>รายได้เศษวัสดุ</span><strong>{formatNumber(state.scrap?.kpis?.grandTotal)} <small>บาท</small></strong><em>{comparisonPercentText(state.scrap?.comparison, { fallback: "ไม่มีฐานเปรียบเทียบ", suffix: " จากปีก่อน" })}</em></article>
      </section>

      <section className="executive-chart-grid">
        <article className="analytics-chart-card">
          <div className="card-heading">
            <div><p className="eyebrow">Waste trend</p><h2>แนวโน้มปริมาณขยะรายเดือน</h2></div>
            <Link to="/analytics">ดูรายละเอียด</Link>
          </div>
          {state.loading
            ? <div className="daily-loading"><span className="spinner" />กำลังโหลด...</div>
            : <AnalyticsChart data={state.waste} rows={wasteRows} chartType="line" showLegend showValues={false} includeTotal={false} />
          }
        </article>
        <article className="analytics-summary-card">
          <div className="card-heading">
            <div><p className="eyebrow">Executive insight</p><h2>สรุปสำหรับผู้บริหาร</h2></div>
          </div>
          <div className="insight-list">
            <p><strong>ปริมาณสูงสุด:</strong> {formatNumber(state.waste?.kpis?.maximum)} กก. ใน {state.waste?.kpis?.maximumPeriod || "—"}</p>
            <p><strong>ค่าเฉลี่ยต่อเดือน:</strong> {formatNumber(state.waste?.kpis?.average)} กก.</p>
            <p><strong>รายได้เศษวัสดุรวม:</strong> {formatNumber(state.scrap?.kpis?.grandTotal)} บาท</p>
            <p><strong>เปรียบเทียบปีก่อน:</strong> {comparisonPercentText(state.scrap?.comparison, { fallback: "ไม่มีข้อมูลเปรียบเทียบ" })}</p>
            <p><strong>สถานะข้อมูล:</strong> แสดงจากรายการที่บันทึกจริง ระบบไม่สร้างตัวเลขตัวอย่างแทนข้อมูล</p>
          </div>
        </article>
      </section>
    </>
  );
}
