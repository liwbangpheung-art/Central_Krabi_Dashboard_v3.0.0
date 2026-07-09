import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { analyticsPath, defaultAnalyticsFilters, analyticsModules, analyticsViews, formatNumber, thaiMonthLabel } from "../lib/analytics.js";
import { exportExcel, exportPdf, exportPng, exportPowerPoint } from "../lib/export-report.js";

function chartData(data) {
  return (data?.rows || []).map((row) => ({ period: thaiMonthLabel(row.label), total: row.total, ...row.values }));
}

function pieData(data) {
  return (data?.categories || []).map((category) => ({ name: category.name_th, value: data?.totalsByCategory?.[category.code] || 0, color: category.color_hex || "#64748b" })).filter((item) => item.value > 0);
}

export function PreviewDashboardPage() {
  const { api, config } = useOutletContext();
  const [filters, setFilters] = useState(() => defaultAnalyticsFilters());
  const [chartType, setChartType] = useState("bar");
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reportRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    api.request(analyticsPath(filters))
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error }));
    return () => { alive = false; };
  }, [api, filters]);

  const data = state.data;
  const rows = useMemo(() => chartData(data), [data]);
  const pies = useMemo(() => pieData(data), [data]);
  const module = analyticsModules.find((item) => item.id === filters.module) || analyticsModules[0];
  const recommended = filters.view === "monthly" || filters.view === "month_over_month" ? "line" : "bar";
  const context = {
    organizationName: config.organizationName,
    title: "CKAP v3 Dashboard Preview",
    moduleLabel: module.label,
    periodLabel: `${filters.year}/${String(filters.month).padStart(2, "0")}`
  };

  function updateFilter(key, value) { setFilters((current) => ({ ...current, [key]: value })); }
  async function runExport(type) {
    if (!data || !reportRef.current) return;
    if (type === "pptx") return exportPowerPoint(reportRef.current, data, context);
    if (type === "xlsx") return exportExcel(data, context);
    if (type === "pdf") return exportPdf(reportRef.current, context);
    return exportPng(reportRef.current, context);
  }

  return (
    <div className="preview-page">
      <div className="preview-toolbar-card">
        <div><p className="eyebrow">Real Analytics Preview</p><h1>Dashboard / Chart Engine</h1><p>Bar, Line, Pie ใช้ข้อมูลจาก API เดียวกัน และ Export ต่อไป PowerPoint ได้จริง</p></div>
        <Link to="/preview" className="secondary-button">กลับ Home Preview</Link>
      </div>

      <section className="preview-filter-bar">
        <label>โมดูล<select value={filters.module} onChange={(e) => updateFilter("module", e.target.value)}>{analyticsModules.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>มุมมอง<select value={filters.view} onChange={(e) => updateFilter("view", e.target.value)}>{analyticsViews.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>ปี<input type="number" value={filters.year} onChange={(e) => updateFilter("year", Number(e.target.value))} /></label>
        <label>เดือน<input type="number" min="1" max="12" value={filters.month} onChange={(e) => updateFilter("month", Number(e.target.value))} /></label>
      </section>

      {state.error && <div className="inline-notice notice-error">โหลด Dashboard ไม่สำเร็จ: {state.error.message}</div>}
      {state.loading ? <div className="daily-loading"><span className="spinner" /> กำลังโหลด Analytics จริง...</div> : data && (
        <section className="preview-dashboard-grid" ref={reportRef}>
          <div className="preview-dashboard-main">
            <div className="preview-kpis compact">
              <article><span>ยอดรวม</span><strong>{formatNumber(data.kpis?.grandTotal)}</strong><small>{data.unit}</small></article>
              <article><span>ค่าเฉลี่ย</span><strong>{formatNumber(data.kpis?.average)}</strong><small>{data.unit}</small></article>
              <article><span>สูงสุด</span><strong>{formatNumber(data.kpis?.maximum)}</strong><small>{data.unit}</small></article>
              <article><span>แนะนำกราฟ</span><strong>{recommended.toUpperCase()}</strong><small>ระบบช่วยเลือก</small></article>
            </div>
            <div className="preview-chart-card">
              <div className="preview-chart-head"><div><h2>{module.label}</h2><p>สีกราฟอ่านจาก Master Data / Category</p></div><div className="preview-chart-switch">{["bar", "line", "pie"].map((type) => <button key={type} type="button" className={chartType === type ? "selected" : ""} onClick={() => setChartType(type)}>{type}</button>)}</div></div>
              <div className="preview-chart-box">
                {chartType === "bar" && <ResponsiveContainer width="100%" height={330}><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip /><Legend /><Bar dataKey="total" name={`รวม (${data.unit})`} radius={[12,12,0,0]} fill="#2563eb" /></BarChart></ResponsiveContainer>}
                {chartType === "line" && <ResponsiveContainer width="100%" height={330}><LineChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="total" name={`รวม (${data.unit})`} stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>}
                {chartType === "pie" && <ResponsiveContainer width="100%" height={330}><PieChart><Tooltip /><Legend /><Pie data={pies} dataKey="value" nameKey="name" outerRadius={120} label>{pies.map((entry, i) => <Cell key={`${entry.name}-${i}`} fill={entry.color} />)}</Pie></PieChart></ResponsiveContainer>}
              </div>
            </div>
          </div>
          <aside className="preview-insight-panel"><h3>Insight Panel</h3><p>{data.insights?.[0]?.text || "ระบบจะแสดงข้อสังเกตจาก Analytics Engine ในพื้นที่นี้"}</p><div className="preview-export-stack"><button onClick={() => runExport("pptx")}>Export PPTX</button><button onClick={() => runExport("xlsx")}>Excel</button><button onClick={() => runExport("pdf")}>PDF</button><button onClick={() => runExport("png")}>PNG</button></div></aside>
        </section>
      )}
    </div>
  );
}
