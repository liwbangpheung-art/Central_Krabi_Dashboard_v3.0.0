import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AnalyticsChart } from "../components/analytics/AnalyticsChart.jsx";
import {
  analyticsModules, analyticsPath, analyticsViews, chartRows, comparisonPercentText, defaultAnalyticsFilters,
  formatNumber, weeklyRows
} from "../lib/analytics.js";

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 8 }, (_, index) => currentYear - 5 + index);

function getClosestActivePeriod(activeMonths, filters) {
  if (!activeMonths || !activeMonths.length) return filters;
  const currentMonthStr = `${filters.year}-${String(filters.month).padStart(2, '0')}`;
  
  if (filters.view === "monthly" || filters.view === "month_over_month") {
    if (activeMonths.includes(currentMonthStr)) {
      return filters;
    }
    const pastMonths = activeMonths.filter(m => m <= currentMonthStr);
    if (pastMonths.length > 0) {
      const target = pastMonths[pastMonths.length - 1];
      const [y, m] = target.split('-').map(Number);
      return { ...filters, year: y, month: m };
    } else {
      const [y, m] = activeMonths[0].split('-').map(Number);
      return { ...filters, year: y, month: m };
    }
  } else {
    const hasDataForYear = activeMonths.some(m => m.startsWith(String(filters.year)));
    if (hasDataForYear) return filters;
    
    const activeYears = [...new Set(activeMonths.map(m => Number(m.slice(0, 4))))].sort((a, b) => a - b);
    const pastYears = activeYears.filter(y => y <= filters.year);
    if (pastYears.length > 0) {
      const targetYear = pastYears[pastYears.length - 1];
      const monthsInTargetYear = activeMonths.filter(m => m.startsWith(String(targetYear))).sort();
      const latestMonth = monthsInTargetYear[monthsInTargetYear.length - 1];
      const [_, m] = latestMonth.split('-').map(Number);
      return { ...filters, year: targetYear, month: m };
    } else {
      const [y, m] = activeMonths[0].split('-').map(Number);
      return { ...filters, year: y, month: m };
    }
  }
}

function FilterSelect({ label, value, onChange, children }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

// KPI Evaluation logic
function getKpiEvaluation(module, comparison) {
  if (!comparison || comparison.percent === null || comparison.percent === undefined) {
    return {
      status: "info",
      text: "ไม่พบข้อมูลเปรียบเทียบกับช่วงเวลาที่แล้ว เพื่อประเมินผลแนวโน้ม",
      className: "notice-info"
    };
  }

  const percent = Number(comparison.percent);
  const isDecrease = percent < 0;
  const isZero = percent === 0;

  // Waste, Tissue, Animal Feed, Garbage Bag, Consumables -> Lower is better
  const isReductionModule = ["waste", "tissue", "animal_feed", "garbage_bag", "consumable"].includes(module);

  if (isReductionModule) {
    if (isDecrease) {
      return {
        status: "success",
        text: `ผ่านเกณฑ์เป้าหมาย 🟢 ปริมาณรวมลดลง ${Math.abs(percent)}% เมื่อเทียบกับช่วงก่อนหน้า (ประหยัดทรัพยากร/ลดของเสีย)`,
        className: "notice-success"
      };
    } else if (isZero) {
      return {
        status: "warning",
        text: `ทรงตัว 🟡 ปริมาณรวมเท่าเดิมเมื่อเทียบกับช่วงก่อนหน้า`,
        className: "notice-warning"
      };
    } else {
      return {
        status: "danger",
        text: `ต้องเฝ้าระวัง 🔴 ปริมาณรวมเพิ่มขึ้น ${percent}% เมื่อเทียบกับช่วงก่อนหน้า (ควรตรวจสอบจุดรั่วไหลหรือการใช้งานสะสม)`,
        className: "notice-error"
      };
    }
  } else {
    // Scrap Sales -> Higher is better
    if (percent > 0) {
      return {
        status: "success",
        text: `ผ่านเกณฑ์เป้าหมาย 🟢 รายได้/น้ำหนักรวมเพิ่มขึ้น ${percent}% เมื่อเทียบกับช่วงก่อนหน้า (การรีไซเคิลมีประสิทธิภาพ)`,
        className: "notice-success"
      };
    } else if (isZero) {
      return {
        status: "warning",
        text: `ทรงตัว 🟡 รายได้/น้ำหนักรวมเท่าเดิมเมื่อเทียบกับช่วงก่อนหน้า`,
        className: "notice-warning"
      };
    } else {
      return {
        status: "danger",
        text: `ต้องปรับปรุง 🔴 รายได้/น้ำหนักรวมลดลง ${Math.abs(percent)}% เมื่อเทียบกับช่วงก่อนหน้า`,
        className: "notice-error"
      };
    }
  }
}

export function AnalyticsPage() {
  const { api, theme } = useOutletContext();
  const [filters, setFilters] = useState(defaultAnalyticsFilters);
  const [settings, setSettings] = useState({ chartType: "bar", showLegend: true, showValues: true, includeTotal: false, useWeekly: false });
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [activeTab, setActiveTab] = useState("chart"); // 'chart' | 'table'
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMonthsMap, setActiveMonthsMap] = useState(null);

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await api.request("/api/analytics/status");
        if (res.activeMonths) {
          setActiveMonthsMap(res.activeMonths);
        }
      } catch (err) {
        console.error("Failed to load analytics status", err);
      }
    }
    loadStatus();
  }, [api]);

  useEffect(() => {
    if (!activeMonthsMap) return;
    const activeMonths = activeMonthsMap[filters.module] || [];
    const adjusted = getClosestActivePeriod(activeMonths, filters);
    if (adjusted.year !== filters.year || adjusted.month !== filters.month) {
      setFilters(adjusted);
    }
  }, [activeMonthsMap, filters.module]);

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

  const kpiEval = useMemo(() => getKpiEvaluation(filters.module, comparison), [filters.module, comparison]);

  // Filtered rows for detailed table view
  const filteredRows = useMemo(() => {
    const rawRows = state.data?.rows || [];
    if (!searchQuery.trim()) return rawRows;
    return rawRows.filter((row) => 
      row.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [state.data, searchQuery]);

  function updateFilter(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: ["year", "month", "quarter"].includes(key) ? Number(value) : value };
      if (key === "module") next.metric = value === "scrap_sales" ? "amount" : "quantity";
      return next;
    });
  }

  // Export to CSV helper
  const handleExport = () => {
    if (!state.data || !rows.length) return;
    const headers = ["ช่วงเวลา", ...(state.data.categories || []).map((c) => c.name_th), "รวม"];
    const csvRows = [headers.join(",")];

    for (const row of rows) {
      const line = [
        row.period || row.label || "",
        ...(state.data.categories || []).map((c) => row[c.code] || 0),
        row.TOTAL || row.total || 0
      ];
      csvRows.push(line.join(","));
    }

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `analytics_${filters.module}_${filters.view}_${filters.year}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <section className="page-heading analytics-heading">
        <div>
          <p className="eyebrow">Data Analytics</p>
          <h1>Dashboard &amp; กราฟวิเคราะห์</h1>
          <p>วิเคราะห์ข้อมูลรายเดือน รายไตรมาส รายปี และการประเมินทิศทางเปรียบเทียบ</p>
        </div>
        <div className="page-heading-actions">
          <button className="secondary-button" type="button" onClick={load} disabled={state.loading}>
            {state.loading ? "กำลังโหลด..." : "รีเฟรชข้อมูล"}
          </button>
        </div>
      </section>

      <section className="analytics-filter-card">
        <FilterSelect label="หมวดข้อมูล" value={filters.module} onChange={(value) => updateFilter("module", value)}>
          {analyticsModules.map((item) => {
            const hasData = activeMonthsMap?.[item.id]?.length > 0;
            const suffix = activeMonthsMap ? (hasData ? " (มีข้อมูล)" : " (ไม่มีข้อมูล)") : "";
            return <option key={item.id} value={item.id}>{item.label}{suffix}</option>;
          })}
        </FilterSelect>
        <FilterSelect label="มุมมองข้อมูล" value={filters.view} onChange={(value) => updateFilter("view", value)}>
          {analyticsViews.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </FilterSelect>
        <FilterSelect label="ปี" value={filters.year} onChange={(value) => updateFilter("year", value)}>
          {years.map((year) => {
            const moduleActiveMonths = activeMonthsMap?.[filters.module] || [];
            const hasData = moduleActiveMonths.some(m => m.startsWith(String(year)));
            const disabled = activeMonthsMap && !hasData;
            return (
              <option key={year} value={year} disabled={disabled}>
                {year} {disabled ? " (ไม่มีข้อมูล)" : ""}
              </option>
            );
          })}
        </FilterSelect>
        {(filters.view === "monthly" || filters.view === "month_over_month") && (
          <FilterSelect label="เดือน" value={filters.month} onChange={(value) => updateFilter("month", value)}>
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const moduleActiveMonths = activeMonthsMap?.[filters.module] || [];
              const target = `${filters.year}-${String(m).padStart(2, '0')}`;
              const hasData = moduleActiveMonths.includes(target);
              const disabled = activeMonthsMap && !hasData;
              return (
                <option key={m} value={m} disabled={disabled}>
                  {m} {disabled ? " (ไม่มีข้อมูล)" : ""}
                </option>
              );
            })}
          </FilterSelect>
        )}
        {filters.view === "quarterly" && (
          <FilterSelect label="ไตรมาส" value={filters.quarter} onChange={(value) => updateFilter("quarter", value)}>
            {[1, 2, 3, 4].map((q) => {
              const moduleActiveMonths = activeMonthsMap?.[filters.module] || [];
              const monthsInQuarter = [
                `${filters.year}-${String((q-1)*3 + 1).padStart(2, '0')}`,
                `${filters.year}-${String((q-1)*3 + 2).padStart(2, '0')}`,
                `${filters.year}-${String((q-1)*3 + 3).padStart(2, '0')}`,
              ];
              const hasData = moduleActiveMonths.some(m => monthsInQuarter.includes(m));
              const disabled = activeMonthsMap && !hasData;
              return (
                <option key={q} value={q} disabled={disabled}>
                  Q{q} {disabled ? " (ไม่มีข้อมูล)" : ""}
                </option>
              );
            })}
          </FilterSelect>
        )}
        {filters.module === "scrap_sales" && <FilterSelect label="ตัวชี้วัด" value={filters.metric} onChange={(value) => updateFilter("metric", value)}><option value="amount">มูลค่าการขาย</option><option value="weight">น้ำหนัก</option></FilterSelect>}
      </section>

      {state.error && (
        <section className="connection-error" role="alert">
          <div>
            <h2>โหลดข้อมูลวิเคราะห์ไม่สำเร็จ</h2>
            <p>{state.error.message}</p>
            <code>{state.error.url}</code>
          </div>
          <button className="primary-button compact" onClick={load}>ลองใหม่</button>
        </section>
      )}

      {/* KPI Cards */}
      <section className="analytics-kpi-grid">
        <article>
          <span>ยอดรวมประจำปี/รอบ</span>
          <strong>{formatNumber(state.data?.kpis?.grandTotal)} <small>{state.data?.unit}</small></strong>
          <em>{moduleInfo?.label}</em>
        </article>
        <article>
          <span>ค่าเฉลี่ยรายเดือน/รอบ</span>
          <strong>{formatNumber(state.data?.kpis?.average)} <small>{state.data?.unit}</small></strong>
          <em>{state.data?.rows?.length || 0} ช่วงข้อมูล</em>
        </article>
        <article>
          <span>ค่าสูงสุดประจำปี/รอบ</span>
          <strong>{formatNumber(state.data?.kpis?.maximum)} <small>{state.data?.unit}</small></strong>
          <em>{state.data?.kpis?.maximumPeriod || "—"}</em>
        </article>
        <article className={comparison ? (Number(comparison.difference) >= 0 ? (["waste", "tissue", "animal_feed", "garbage_bag", "consumable"].includes(filters.module) ? "negative" : "positive") : (["waste", "tissue", "animal_feed", "garbage_bag", "consumable"].includes(filters.module) ? "positive" : "negative")) : ""}>
          <span>เทียบช่วงก่อนหน้า</span>
          <strong>{comparisonPercentText(comparison)}</strong>
          <em>{comparison ? `${formatNumber(comparison.difference)} ${state.data?.unit || ""}` : "—"}</em>
        </article>
      </section>

      {/* KPI Evaluation Banner */}
      {!state.loading && (
        <div className={`inline-notice ${kpiEval.className}`} style={{ marginTop: "18px" }}>
          <div>
            <strong>ผลการประเมินทิศทางข้อมูล:</strong> {kpiEval.text}
          </div>
        </div>
      )}

      {/* View Switcher Tabs */}
      <section className="mode-switch-card" style={{ marginBottom: "18px" }}>
        <button
          type="button"
          className={activeTab === "chart" ? "selected" : ""}
          onClick={() => setActiveTab("chart")}
        >
          <strong>📊 มุมมองกราฟวิเคราะห์</strong>
          <span>ดูแนวโน้ม ยอดสรุปรายประเภท และแผนภูมิแบบอินเตอร์แอคทีฟ</span>
        </button>
        <button
          type="button"
          className={activeTab === "table" ? "selected" : ""}
          onClick={() => setActiveTab("table")}
        >
          <strong>📋 ตารางข้อมูลเชิงลึก</strong>
          <span>ตรวจสอบข้อมูลตัวเลขดิบ ค้นหารายเดือน และดาวน์โหลดเป็น Excel/CSV</span>
        </button>
      </section>

      {activeTab === "chart" ? (
        <>
          <section className="chart-settings-card">
            <div><strong>ตั้งค่ากราฟ</strong><span>การตั้งค่านี้จะนำไปใช้ในการสร้างรายงานเช่นกัน</span></div>
            <FilterSelect label="รูปแบบ" value={settings.chartType} onChange={(value) => setSettings((s) => ({ ...s, chartType: value }))}>
              <option value="bar">กราฟแท่ง</option>
              <option value="line">กราฟเส้น</option>
              <option value="donut">Donut</option>
            </FilterSelect>
            <label className="check-control"><input type="checkbox" checked={settings.showValues} onChange={(e) => setSettings((s) => ({ ...s, showValues: e.target.checked }))} /> แสดงตัวเลข</label>
            <label className="check-control"><input type="checkbox" checked={settings.showLegend} onChange={(e) => setSettings((s) => ({ ...s, showLegend: e.target.checked }))} /> แสดง Legend</label>
            <label className="check-control"><input type="checkbox" checked={settings.includeTotal} onChange={(e) => setSettings((s) => ({ ...s, includeTotal: e.target.checked }))} /> แสดง Total</label>
            {canUseWeekly && <label className="check-control"><input type="checkbox" checked={settings.useWeekly} onChange={(e) => setSettings((s) => ({ ...s, useWeekly: e.target.checked }))} /> แสดงรายสัปดาห์</label>}
          </section>

          <section className="analytics-chart-grid">
            <article className="analytics-chart-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">{moduleInfo?.label}</p>
                  <h2>{settings.useWeekly ? "สรุปรายสัปดาห์" : "แนวโน้มตามช่วงเวลา"}</h2>
                </div>
                <span>{state.data?.unit}</span>
              </div>
              {state.loading ? (
                <div className="daily-loading"><span className="spinner" />กำลังโหลดกราฟ...</div>
              ) : (
                <AnalyticsChart data={state.data} rows={rows} theme={theme} {...settings} />
              )}
            </article>
            <article className="analytics-summary-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Breakdown</p>
                  <h2>ยอดรวมตามประเภท</h2>
                </div>
              </div>
              <div className="category-total-list">
                {(state.data?.categories || []).map((item) => (
                  <div key={item.id}>
                    <i style={{ background: item.color_hex }} />
                    <span>{item.name_th}</span>
                    <strong>{formatNumber(item.total)} {state.data?.unit}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="analytics-table-card">
          <div className="card-heading" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "18px" }}>
            <div>
              <p className="eyebrow">Data Grid</p>
              <h2>ตารางสรุปรายรอบข้อมูล</h2>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                placeholder="🔍 ค้นหารอบเวลา..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "10px", minWidth: "200px" }}
              />
              <button className="primary-link" type="button" onClick={handleExport} disabled={!rows.length}>
                📥 ดาวน์โหลด CSV
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ช่วงเวลา</th>
                  {(state.data?.categories || []).map((item) => (
                    <th key={item.id} style={{ textAlign: "right" }}>{item.name_th}</th>
                  ))}
                  <th style={{ textAlign: "right" }}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={(state.data?.categories?.length || 0) + 2} className="empty-state">
                      ไม่พบข้อมูลที่ค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.period}>
                      <td><strong>{row.label}</strong></td>
                      {(state.data?.categories || []).map((item) => (
                        <td key={item.id} style={{ textAlign: "right" }}>
                          {formatNumber(row.values[item.code])}
                        </td>
                      ))}
                      <td style={{ textAlign: "right" }}>
                        <strong>{formatNumber(row.total)}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

