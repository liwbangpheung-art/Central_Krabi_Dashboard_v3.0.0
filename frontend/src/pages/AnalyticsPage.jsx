import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AnalyticsChart } from "../components/analytics/AnalyticsChart.jsx";
import {
  analyticsModules, analyticsPath, analyticsViews, chartRows, comparisonPercentText, defaultAnalyticsFilters,
  formatNumber, weeklyRows
} from "../lib/analytics.js";

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 8 }, (_, index) => currentYear - 5 + index);

function FilterSelect({ label, value, onChange, children }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

export function AnalyticsPage() {
  const { api } = useOutletContext();
  const [filters, setFilters] = useState(defaultAnalyticsFilters);
  const [settings, setSettings] = useState({ chartType: "bar", showLegend: true, showValues: true, includeTotal: false, useWeekly: false });
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await api.request(analyticsPath(filters));
      setState({ loading: false, data, error: null });
    } catch (error) { setState({ loading: false, data: null, error }); }
  }, [api, filters]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => settings.useWeekly && state.data?.weekly?.length
    ? weeklyRows(state.data, settings)
    : chartRows(state.data, settings), [state.data, settings]);
  const moduleInfo = analyticsModules.find((item) => item.id === filters.module);
  const canUseWeekly = filters.view === "monthly" && filters.module !== "scrap_sales" && Boolean(state.data?.weekly?.length);
  const comparison = state.data?.comparison;

  function updateFilter(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: ["year", "month", "quarter"].includes(key) ? Number(value) : value };
      if (key === "module") next.metric = value === "scrap_sales" ? "amount" : "quantity";
      return next;
    });
  }

  return (
    <>
      <section className="page-heading analytics-heading">
        <div><p className="eyebrow">Phase 5</p><h1>Dashboard และกราฟวิเคราะห์</h1><p>วิเคราะห์รายเดือน รายไตรมาส รายปี และเดือนต่อเดือนจากข้อมูลจริงในระบบ</p></div>
        <button className="secondary-button" type="button" onClick={load} disabled={state.loading}>{state.loading ? "กำลังโหลด..." : "รีเฟรชข้อมูล"}</button>
      </section>

      <section className="analytics-filter-card">
        <FilterSelect label="หมวดข้อมูล" value={filters.module} onChange={(value) => updateFilter("module", value)}>
          {analyticsModules.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </FilterSelect>
        <FilterSelect label="มุมมองข้อมูล" value={filters.view} onChange={(value) => updateFilter("view", value)}>
          {analyticsViews.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </FilterSelect>
        <FilterSelect label="ปี" value={filters.year} onChange={(value) => updateFilter("year", value)}>{years.map((year) => <option key={year}>{year}</option>)}</FilterSelect>
        {(filters.view === "monthly" || filters.view === "month_over_month") && <FilterSelect label="เดือน" value={filters.month} onChange={(value) => updateFilter("month", value)}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</FilterSelect>}
        {filters.view === "quarterly" && <FilterSelect label="ไตรมาส" value={filters.quarter} onChange={(value) => updateFilter("quarter", value)}>{[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}</FilterSelect>}
        {filters.module === "scrap_sales" && <FilterSelect label="ตัวชี้วัด" value={filters.metric} onChange={(value) => updateFilter("metric", value)}><option value="amount">มูลค่าการขาย</option><option value="weight">น้ำหนัก</option></FilterSelect>}
      </section>

      {state.error && <section className="connection-error" role="alert"><div><h2>โหลดข้อมูลวิเคราะห์ไม่สำเร็จ</h2><p>{state.error.message}</p><code>{state.error.url}</code></div><button className="primary-button compact" onClick={load}>ลองใหม่</button></section>}

      <section className="analytics-kpi-grid">
        <article><span>ยอดรวม</span><strong>{formatNumber(state.data?.kpis?.grandTotal)} <small>{state.data?.unit}</small></strong><em>{moduleInfo?.label}</em></article>
        <article><span>ค่าเฉลี่ยต่อช่วง</span><strong>{formatNumber(state.data?.kpis?.average)} <small>{state.data?.unit}</small></strong><em>{state.data?.rows?.length || 0} ช่วงข้อมูล</em></article>
        <article><span>ค่าสูงสุด</span><strong>{formatNumber(state.data?.kpis?.maximum)} <small>{state.data?.unit}</small></strong><em>{state.data?.kpis?.maximumPeriod || "—"}</em></article>
        <article className={comparison ? (Number(comparison.difference) >= 0 ? "positive" : "negative") : ""}><span>เทียบช่วงก่อนหน้า</span><strong>{comparisonPercentText(comparison)}</strong><em>{comparison ? `${formatNumber(comparison.difference)} ${state.data?.unit || ""}` : "—"}</em></article>
      </section>

      <section className="chart-settings-card">
        <div><strong>ตั้งค่ากราฟ</strong><span>การตั้งค่านี้จะใช้ต่อในขั้นตอน Export</span></div>
        <FilterSelect label="รูปแบบ" value={settings.chartType} onChange={(value) => setSettings((s) => ({ ...s, chartType: value }))}><option value="bar">กราฟแท่ง</option><option value="line">กราฟเส้น</option><option value="donut">Donut</option></FilterSelect>
        <label className="check-control"><input type="checkbox" checked={settings.showValues} onChange={(e) => setSettings((s) => ({ ...s, showValues: e.target.checked }))} /> แสดงตัวเลข</label>
        <label className="check-control"><input type="checkbox" checked={settings.showLegend} onChange={(e) => setSettings((s) => ({ ...s, showLegend: e.target.checked }))} /> แสดง Legend</label>
        <label className="check-control"><input type="checkbox" checked={settings.includeTotal} onChange={(e) => setSettings((s) => ({ ...s, includeTotal: e.target.checked }))} /> แสดง Total</label>
        {canUseWeekly && <label className="check-control"><input type="checkbox" checked={settings.useWeekly} onChange={(e) => setSettings((s) => ({ ...s, useWeekly: e.target.checked }))} /> แสดงรายสัปดาห์</label>}
      </section>

      <section className="analytics-chart-grid">
        <article className="analytics-chart-card">
          <div className="card-heading"><div><p className="eyebrow">{moduleInfo?.label}</p><h2>{settings.useWeekly ? "สรุปรายสัปดาห์" : "แนวโน้มตามช่วงเวลา"}</h2></div><span>{state.data?.unit}</span></div>
          {state.loading ? <div className="daily-loading"><span className="spinner" />กำลังโหลดกราฟ...</div> : <AnalyticsChart data={state.data} rows={rows} {...settings} />}
        </article>
        <article className="analytics-summary-card">
          <div className="card-heading"><div><p className="eyebrow">Breakdown</p><h2>ยอดรวมตามประเภท</h2></div></div>
          <div className="category-total-list">{(state.data?.categories || []).map((item) => <div key={item.id}><i style={{ background: item.color_hex }} /><span>{item.name_th}</span><strong>{formatNumber(item.total)} {state.data?.unit}</strong></div>)}</div>
        </article>
      </section>

      <section className="analytics-table-card">
        <div className="card-heading"><div><p className="eyebrow">Data Table</p><h2>ข้อมูลที่ใช้สร้างกราฟ</h2></div></div>
        <div className="table-scroll"><table><thead><tr><th>ช่วงเวลา</th>{(state.data?.categories || []).map((item) => <th key={item.id}>{item.name_th}</th>)}<th>รวม</th></tr></thead><tbody>{(state.data?.rows || []).map((row) => <tr key={row.period}><td>{row.label}</td>{(state.data?.categories || []).map((item) => <td key={item.id}>{formatNumber(row.values[item.code])}</td>)}<td><strong>{formatNumber(row.total)}</strong></td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}
