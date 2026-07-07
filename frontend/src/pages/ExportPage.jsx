import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AnalyticsChart } from "../components/analytics/AnalyticsChart.jsx";
import { analyticsModules, analyticsPath, analyticsViews, chartRows, comparisonPercentText, defaultAnalyticsFilters, formatNumber } from "../lib/analytics.js";
import { exportExcel, exportPdf, exportPng, exportPowerPoint } from "../lib/export-report.js";
import { buildReadabilityWarnings, buildReportSlideOutline, defaultReportBuilderSettings, exportReportBuilderPowerPoint, loadReportBuilderData, reportPeriodLabel, reportSectionOptions, reportTemplates, reportThemeOptions, slideLayoutOptions } from "../lib/report-builder.js";

const years = Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - 5 + index);

function Select({ label, value, onChange, children }) {
  return <label><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></label>;
}

function ToggleButton({ active, children, onClick }) {
  return <button type="button" className={active ? "selected" : ""} onClick={onClick}>{children}</button>;
}

function localPresetFallback() {
  try {
    const raw = localStorage.getItem("ck-report-builder-presets");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((item) => ({ ...item, config: item.settings || item.config, visibility: "local", isLocal: true })) : [];
  } catch { return []; }
}

function moduleCategoryKey(moduleId) {
  return moduleId === "scrap_sales" ? "scrap_material" : moduleId;
}

export function ExportPage() {
  const { config, api, profile, permissions } = useOutletContext();
  const reportRef = useRef(null);
  const [mode, setMode] = useState("single");
  const [filters, setFilters] = useState(defaultAnalyticsFilters);
  const [settings, setSettings] = useState({ chartType:"bar", showLegend:true, showValues:true, includeTotal:false });
  const [builder, setBuilder] = useState(() => defaultReportBuilderSettings());
  const [state, setState] = useState({ loading:true, data:null, error:null });
  const [builderState, setBuilderState] = useState({ loading:false, report:null, error:null });
  const [outlineEditOpen, setOutlineEditOpen] = useState(true);
  const [builderCategories, setBuilderCategories] = useState({ loading:false, items:{}, error:null });
  const [presets, setPresets] = useState([]);
  const [presetState, setPresetState] = useState({ loading:false, error:null });
  const [exportState, setExportState] = useState({ format:null, message:null, error:null });
  const [history, setHistory] = useState([]);
  const [reportFiles, setReportFiles] = useState([]);
  const [reportRuns, setReportRuns] = useState([]);
  const [selectedReportRun, setSelectedReportRun] = useState(null);
  const [draggedSlideId, setDraggedSlideId] = useState(null);
  const moduleInfo = analyticsModules.find((item) => item.id === filters.module);
  const rows = useMemo(() => chartRows(state.data, settings), [state.data, settings]);
  const periodLabel = filters.view === "yearly" ? String(filters.year) : filters.view === "quarterly" ? `${filters.year}-Q${filters.quarter}` : `${filters.year}-${String(filters.month).padStart(2,"0")}`;
  const builderPeriodLabel = reportPeriodLabel(builder);
  const builderSlideOutline = useMemo(() => builderState.report ? buildReportSlideOutline(builderState.report, builder) : [], [builderState.report, builder]);
  const readabilityWarnings = useMemo(() => builderState.report ? buildReadabilityWarnings(builderState.report, builder) : [], [builderState.report, builder]);
  const canManageReportPresets = permissions?.includes("manage_report_presets");
  const context = { organizationName: config.organizationName, title: "รายงานการจัดการขยะและทรัพยากร", moduleLabel: moduleInfo?.label || filters.module, periodLabel };

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading:true, error:null }));
    try { setState({ loading:false, data:await api.request(analyticsPath(filters)), error:null }); }
    catch (error) { setState({ loading:false, data:null, error }); }
  }, [api, filters]);
  const loadHistory = useCallback(async () => {
    try { const result = await api.request("/api/export-logs?limit=8"); setHistory(result.items || []); } catch { setHistory([]); }
  }, [api]);
  const loadReportFiles = useCallback(async () => {
    try { const result = await api.request("/api/report-files?limit=6"); setReportFiles(result.items || []); } catch { setReportFiles([]); }
  }, [api]);
  const loadReportRuns = useCallback(async () => {
    try { const result = await api.request("/api/report-runs?limit=8"); setReportRuns(result.items || []); } catch { setReportRuns([]); }
  }, [api]);
  const loadBuilderCategories = useCallback(async () => {
    setBuilderCategories((current) => ({ ...current, loading:true, error:null }));
    try {
      const pairs = await Promise.all(builder.modules.map(async (moduleId) => {
        const result = await api.request(`/api/master-data?module=${encodeURIComponent(moduleCategoryKey(moduleId))}&status=active`);
        return [moduleId, result.items || []];
      }));
      setBuilderCategories({ loading:false, items:Object.fromEntries(pairs), error:null });
    } catch (error) {
      setBuilderCategories({ loading:false, items:{}, error });
    }
  }, [api, builder.modules]);
  const loadBuilderPresets = useCallback(async () => {
    setPresetState({ loading:true, error:null });
    try {
      const result = await api.request("/api/report-presets?limit=80");
      setPresets(result.items || []);
      setPresetState({ loading:false, error:null });
    } catch (error) {
      const fallback = localPresetFallback();
      setPresets(fallback);
      setPresetState({ loading:false, error });
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadReportFiles(); }, [loadReportFiles]);
  useEffect(() => { loadReportRuns(); }, [loadReportRuns]);
  useEffect(() => { if (mode === "builder") loadBuilderCategories(); }, [mode, loadBuilderCategories]);
  useEffect(() => { if (mode === "builder") loadBuilderPresets(); }, [mode, loadBuilderPresets]);

  function updateFilter(key, value) {
    setFilters((current) => { const next = { ...current, [key]: ["year","month","quarter"].includes(key) ? Number(value) : value }; if (key === "module") next.metric = value === "scrap_sales" ? "amount" : "quantity"; return next; });
  }

  function updateBuilder(key, value) {
    setBuilderState((current) => ({ ...current, report:null }));
    setBuilder((current) => ({ ...current, [key]: ["year","month","quarter"].includes(key) ? Number(value) : value }));
  }

  function toggleBuilderModule(moduleId) {
    setBuilderState((current) => ({ ...current, report:null }));
    setBuilder((current) => {
      const hasModule = current.modules.includes(moduleId);
      const modules = hasModule ? current.modules.filter((item) => item !== moduleId) : [...current.modules, moduleId];
      return { ...current, modules: modules.length ? modules : current.modules };
    });
  }

  function toggleBuilderSection(sectionId) {
    setBuilderState((current) => ({ ...current, report:null }));
    const section = reportSectionOptions.find((item) => item.id === sectionId);
    if (section?.required) return;
    setBuilder((current) => {
      const hasSection = current.includeSections.includes(sectionId);
      const includeSections = hasSection ? current.includeSections.filter((item) => item !== sectionId) : [...current.includeSections, sectionId];
      return { ...current, includeSections, includeTables: includeSections.includes("data_table"), includeAnalysis: includeSections.includes("analysis") };
    });
  }


  function toggleBuilderCategory(moduleId, code) {
    setBuilderState((current) => ({ ...current, report:null }));
    setBuilder((current) => {
      const currentCodes = current.categorySelection?.[moduleId] || [];
      const nextCodes = currentCodes.includes(code) ? currentCodes.filter((item) => item !== code) : [...currentCodes, code];
      return { ...current, categorySelection: { ...(current.categorySelection || {}), [moduleId]: nextCodes } };
    });
  }

  function setBuilderModuleCategories(moduleId, codes) {
    setBuilderState((current) => ({ ...current, report:null }));
    setBuilder((current) => ({ ...current, categorySelection: { ...(current.categorySelection || {}), [moduleId]: codes } }));
  }

  function updateSlideOverride(slideId, patch) {
    setBuilder((current) => ({
      ...current,
      slideOutlineOverrides: {
        ...(current.slideOutlineOverrides || {}),
        [slideId]: { ...(current.slideOutlineOverrides?.[slideId] || {}), ...patch }
      }
    }));
  }

  function toggleOutlineSlide(slide) {
    if (slide.locked) return;
    updateSlideOverride(slide.id, { enabled: slide.enabled === false });
  }

  function moveOutlineSlide(slide, direction) {
    const index = builderSlideOutline.findIndex((item) => item.id === slide.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= builderSlideOutline.length) return;
    const reordered = [...builderSlideOutline];
    const [picked] = reordered.splice(index, 1);
    reordered.splice(target, 0, picked);
    const nextOverrides = { ...(builder.slideOutlineOverrides || {}) };
    reordered.forEach((item, itemIndex) => {
      nextOverrides[item.id] = { ...(nextOverrides[item.id] || {}), order: itemIndex };
    });
    setBuilder((current) => ({ ...current, slideOutlineOverrides: nextOverrides }));
  }

  async function saveBuilderPreset() {
    const name = window.prompt("ตั้งชื่อ Preset รายงาน", `รายงาน ${builderPeriodLabel}`);
    if (!name?.trim()) return;
    const description = window.prompt("คำอธิบาย Preset (ไม่บังคับ)", "");
    const visibility = canManageReportPresets && window.confirm("ต้องการแชร์ Preset นี้ให้ทีมใช้ร่วมกันไหม?\nกด OK = แชร์ให้ทีม, Cancel = ใช้ส่วนตัว") ? "team" : "private";
    setPresetState({ loading:true, error:null });
    try {
      const result = await api.request("/api/report-presets", {
        method:"POST",
        body:{ name: name.trim(), description: description || "", visibility, config: builder }
      });
      setPresets((current) => [result.item, ...current.filter((item) => item.id !== result.item.id)]);
      setPresetState({ loading:false, error:null });
      setExportState({ format:null, message: visibility === "team" ? "บันทึก Preset สำหรับทีมแล้ว" : "บันทึก Preset ส่วนตัวแล้ว", error:null });
    } catch (error) {
      setPresetState({ loading:false, error });
      setExportState({ format:null, message:null, error:error.message || "บันทึก Preset ไม่สำเร็จ" });
    }
  }

  function applyBuilderPreset(preset) {
    setBuilderState((current) => ({ ...current, report:null }));
    setBuilder({ ...defaultReportBuilderSettings(), ...(preset.config || preset.settings || {}) });
    setExportState({ format:null, message:`โหลด Preset: ${preset.name}`, error:null });
  }

  async function deleteBuilderPreset(preset) {
    if (!window.confirm(`ลบ Preset “${preset.name}” ใช่ไหม?`)) return;
    if (preset.isLocal || preset.visibility === "local") {
      setPresets((current) => current.filter((item) => item.id !== preset.id));
      return;
    }
    setPresetState({ loading:true, error:null });
    try {
      await api.request(`/api/report-presets/${encodeURIComponent(preset.id)}`, { method:"DELETE" });
      setPresets((current) => current.filter((item) => item.id !== preset.id));
      setPresetState({ loading:false, error:null });
      setExportState({ format:null, message:"ลบ Preset แล้ว", error:null });
    } catch (error) {
      setPresetState({ loading:false, error });
      setExportState({ format:null, message:null, error:error.message || "ลบ Preset ไม่สำเร็จ" });
    }
  }


  async function duplicateBuilderPreset(preset) {
    const baseConfig = preset.config || preset.settings || {};
    const name = window.prompt("ตั้งชื่อ Preset ที่คัดลอก", `${preset.name} copy`);
    if (!name?.trim()) return;
    setPresetState({ loading:true, error:null });
    try {
      const result = await api.request("/api/report-presets", {
        method:"POST",
        body:{ name: name.trim(), description: preset.description || "", visibility: "private", config: baseConfig }
      });
      setPresets((current) => [result.item, ...current]);
      setPresetState({ loading:false, error:null });
      setExportState({ format:null, message:`Duplicate Preset แล้ว: ${result.item.name}`, error:null });
    } catch (error) {
      setPresetState({ loading:false, error });
      setExportState({ format:null, message:null, error:error.message || "Duplicate Preset ไม่สำเร็จ" });
    }
  }

  async function editBuilderPreset(preset) {
    const name = window.prompt("แก้ชื่อ Preset", preset.name);
    if (!name?.trim()) return;
    const description = (window.prompt("แก้คำอธิบาย Preset", preset.description || "") ?? (preset.description || ""));
    const config = window.confirm("อัปเดต config ของ Preset นี้ด้วยค่าที่ตั้งอยู่บน Wizard ตอนนี้ไหม?") ? builder : (preset.config || preset.settings || {});
    if (preset.isLocal || preset.visibility === "local") {
      const next = { ...preset, name: name.trim(), description, config, updatedAt: new Date().toISOString(), isLocal: true, visibility: "local" };
      setPresets((current) => current.map((item) => item.id === preset.id ? next : item));
      setExportState({ format:null, message:"แก้ไข local Preset แล้ว", error:null });
      return;
    }
    setPresetState({ loading:true, error:null });
    try {
      const result = await api.request(`/api/report-presets/${encodeURIComponent(preset.id)}`, {
        method:"PATCH",
        body:{ name: name.trim(), description, config }
      });
      setPresets((current) => current.map((item) => item.id === preset.id ? result.item : item));
      setPresetState({ loading:false, error:null });
      setExportState({ format:null, message:"แก้ไข Preset แล้ว", error:null });
    } catch (error) {
      setPresetState({ loading:false, error });
      setExportState({ format:null, message:null, error:error.message || "แก้ไข Preset ไม่สำเร็จ" });
    }
  }

  function setDefaultBuilderPreset(preset) {
    try {
      localStorage.setItem("ck-report-builder-default-preset", JSON.stringify({ id: preset.id, config: preset.config || preset.settings || {}, name: preset.name }));
      setExportState({ format:null, message:`ตั้ง “${preset.name}” เป็นค่าเริ่มต้นในเครื่องนี้แล้ว`, error:null });
    } catch {
      setExportState({ format:null, message:null, error:"บันทึกค่าเริ่มต้นในเครื่องไม่สำเร็จ" });
    }
  }

  function handleOutlineDrop(targetSlideId) {
    if (!draggedSlideId || draggedSlideId === targetSlideId) return;
    const reordered = [...builderSlideOutline];
    const from = reordered.findIndex((slide) => slide.id === draggedSlideId);
    const to = reordered.findIndex((slide) => slide.id === targetSlideId);
    if (from < 0 || to < 0) return;
    const [picked] = reordered.splice(from, 1);
    reordered.splice(to, 0, picked);
    const nextOverrides = { ...(builder.slideOutlineOverrides || {}) };
    reordered.forEach((slide, index) => {
      nextOverrides[slide.id] = { ...(nextOverrides[slide.id] || {}), order: index };
    });
    setDraggedSlideId(null);
    setBuilder((current) => ({ ...current, slideOutlineOverrides: nextOverrides }));
  }

  async function logExport(format, logContext = {}) {
    const result = await api.request("/api/export-logs", {
      method:"POST",
      body:{
        format,
        module: logContext.module || filters.module,
        view: logContext.view || filters.view,
        periodLabel: logContext.periodLabel || periodLabel,
        options: logContext.options || settings
      }
    });
    await loadHistory();
    return result.item;
  }

  async function runExport(format) {
    if (!state.data || !reportRef.current) return;
    setExportState({ format, message:null, error:null });
    try {
      if (format === "xlsx") await exportExcel(state.data, context);
      if (format === "png") await exportPng(reportRef.current, context);
      if (format === "pdf") await exportPdf(reportRef.current, context);
      if (format === "pptx") await exportPowerPoint(reportRef.current, state.data, context);
      try { await logExport(format); } catch (logError) { console.warn("Export succeeded but log failed", logError); }
      setExportState({ format:null, message:`สร้างไฟล์ ${format.toUpperCase()} สำเร็จ`, error:null });
    } catch (error) { setExportState({ format:null, message:null, error:error.message || "Export ไม่สำเร็จ" }); }
  }

  async function previewBuilderReport() {
    setBuilderState({ loading:true, report:null, error:null });
    try {
      const report = await loadReportBuilderData(api, builder);
      setBuilderState({ loading:false, report, error:null });
      return report;
    } catch (error) {
      setBuilderState({ loading:false, report:null, error });
      throw error;
    }
  }


  async function downloadStoredReportFile(item) {
    setExportState({ format:null, message:null, error:null });
    try {
      const result = await api.request(`/api/report-files/${encodeURIComponent(item.id)}/download`, { method:"POST" });
      if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setExportState({ format:null, message:null, error:error.message || "สร้างลิงก์ดาวน์โหลดไฟล์รายงานไม่สำเร็จ" });
    }
  }

  async function runBackendBuilderPowerPoint() {
    setExportState({ format:"pptx-server", message:null, error:null });
    try {
      const result = await api.request("/api/reports/powerpoint", {
        method:"POST",
        body:{ title:"Enterprise PowerPoint Report", presetId:null, config:builder }
      });
      await loadHistory();
      await loadReportFiles();
      await loadReportRuns();
      if (result.downloadUrl) window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      setExportState({ format:null, message:`สร้างและเก็บไฟล์ PowerPoint สำเร็จ (${result.metadata?.slideCount || "หลาย"} สไลด์)`, error:null });
    } catch (error) {
      setExportState({ format:null, message:null, error:error.message || "สร้าง PowerPoint ด้วย Backend ไม่สำเร็จ" });
    }
  }

  async function runBuilderPowerPoint() {
    setExportState({ format:"pptx", message:null, error:null });
    try {
      const report = await previewBuilderReport();
      const exportMeta = await exportReportBuilderPowerPoint(report, {
        organizationName: config.organizationName,
        title: "PowerPoint Report Builder",
        periodLabel: report.periodLabel,
        chartType: builder.chartType,
        chartMode: builder.chartMode,
        includeCategoryBreakdown: builder.includeSections.includes("category_breakdown"),
        includeDataQuality: builder.includeSections.includes("data_quality"),
        includeTables: builder.includeSections.includes("data_table"),
        theme: builder.theme,
        slideOutlineOverrides: builder.slideOutlineOverrides
      });
      try {
        const exportLog = await logExport("pptx", {
          module: builder.modules[0] || "waste",
          view: builder.view,
          periodLabel: report.periodLabel,
          options: { reportBuilder:true, template:builder.template, modules:builder.modules, sections:builder.includeSections, chartType:builder.chartType, chartMode:builder.chartMode, categorySelection:builder.categorySelection, exportMeta }
        });
        try {
          await api.request("/api/report-runs", {
            method:"POST",
            body:{
              reportType:"powerpoint_builder",
              title:"PowerPoint Report Builder",
              periodLabel:report.periodLabel,
              exportLogId:exportLog?.id,
              config:builder,
              metadata:{ ...exportMeta, modules:report.modules.map((item)=>item.moduleInfo.id), generatedAt:report.generatedAt }
            }
          });
        } catch (runLogError) { console.warn("Report run metadata failed", runLogError); }
      } catch (logError) { console.warn("PowerPoint succeeded but log failed", logError); }
      setExportState({ format:null, message:"สร้าง PowerPoint Report Builder สำเร็จ", error:null });
    } catch (error) {
      setExportState({ format:null, message:null, error:error.message || "สร้าง PowerPoint ไม่สำเร็จ" });
    }
  }

  return (
    <>
      <section className="page-heading export-heading"><div><p className="eyebrow">Phase C</p><h1>ศูนย์ส่งออกรายงาน</h1><p>สร้าง Excel, PDF, PNG และ PowerPoint จากข้อมูลและการตั้งค่ากราฟ รวมถึง PowerPoint หลายสไลด์แบบเลือกข้อมูลได้</p></div></section>

      <section className="mode-switch-card" aria-label="เลือกรูปแบบรายงาน">
        <ToggleButton active={mode === "single"} onClick={() => setMode("single")}><strong>รายงานเดี่ยว</strong><span>Export จากกราฟชุดเดียว</span></ToggleButton>
        <ToggleButton active={mode === "builder"} onClick={() => setMode("builder")}><strong>PowerPoint Report Builder</strong><span>เลือกหลายข้อมูล สร้างหลายสไลด์พร้อมบทวิเคราะห์</span></ToggleButton>
      </section>

      {mode === "single" ? (
        <>
          <section className="export-config-card">
            <Select label="หมวดข้อมูล" value={filters.module} onChange={(v) => updateFilter("module",v)}>{analyticsModules.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
            <Select label="มุมมอง" value={filters.view} onChange={(v) => updateFilter("view",v)}>{analyticsViews.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
            <Select label="ปี" value={filters.year} onChange={(v) => updateFilter("year",v)}>{years.map((year) => <option key={year}>{year}</option>)}</Select>
            {(filters.view === "monthly" || filters.view === "month_over_month") && <Select label="เดือน" value={filters.month} onChange={(v) => updateFilter("month",v)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</Select>}
            {filters.view === "quarterly" && <Select label="ไตรมาส" value={filters.quarter} onChange={(v) => updateFilter("quarter",v)}>{[1,2,3,4].map((q)=><option key={q} value={q}>Q{q}</option>)}</Select>}
            {filters.module === "scrap_sales" && <Select label="ตัวชี้วัด" value={filters.metric} onChange={(v) => updateFilter("metric",v)}><option value="amount">มูลค่าการขาย</option><option value="weight">น้ำหนัก</option></Select>}
          </section>
          <section className="chart-settings-card export-settings">
            <Select label="รูปแบบกราฟ" value={settings.chartType} onChange={(v) => setSettings((s)=>({...s,chartType:v}))}><option value="bar">แท่ง</option><option value="line">เส้น</option><option value="donut">Donut</option></Select>
            <label className="check-control"><input type="checkbox" checked={settings.showValues} onChange={(e)=>setSettings((s)=>({...s,showValues:e.target.checked}))}/> แสดงตัวเลข</label>
            <label className="check-control"><input type="checkbox" checked={settings.showLegend} onChange={(e)=>setSettings((s)=>({...s,showLegend:e.target.checked}))}/> แสดง Legend</label>
            <label className="check-control"><input type="checkbox" checked={settings.includeTotal} onChange={(e)=>setSettings((s)=>({...s,includeTotal:e.target.checked}))}/> แสดง Total</label>
          </section>
          {state.error && <section className="connection-error"><div><h2>โหลดข้อมูลไม่สำเร็จ</h2><p>{state.error.message}</p></div><button className="primary-button compact" onClick={load}>ลองใหม่</button></section>}
          {exportState.error && <p className="alert alert-error">{exportState.error}</p>}
          {exportState.message && <p className="alert alert-success">{exportState.message}</p>}
          <section className="export-layout">
            <div className="export-preview" ref={reportRef}>
              <header><div><small>{config.organizationName}</small><h2>รายงานการจัดการขยะและทรัพยากร</h2><p>{moduleInfo?.label} • {periodLabel}</p></div><img src="/central-krabi-logo.png" alt="Central Krabi" /></header>
              <div className="export-kpis"><article><span>ยอดรวม</span><strong>{formatNumber(state.data?.kpis?.grandTotal)} {state.data?.unit}</strong></article><article><span>ค่าเฉลี่ย</span><strong>{formatNumber(state.data?.kpis?.average)} {state.data?.unit}</strong></article><article><span>ค่าสูงสุด</span><strong>{formatNumber(state.data?.kpis?.maximum)} {state.data?.unit}</strong></article><article><span>เปลี่ยนแปลง</span><strong>{comparisonPercentText(state.data?.comparison)}</strong></article></div>
              <div className="export-chart"><AnalyticsChart data={state.data} rows={rows} {...settings} height={380}/></div>
              <table><thead><tr><th>ช่วงเวลา</th>{(state.data?.categories||[]).map((c)=><th key={c.id}>{c.name_th}</th>)}<th>รวม</th></tr></thead><tbody>{(state.data?.rows||[]).map((row)=><tr key={row.period}><td>{row.label}</td>{state.data.categories.map((c)=><td key={c.id}>{formatNumber(row.values[c.code])}</td>)}<td>{formatNumber(row.total)}</td></tr>)}</tbody></table>
              <footer>จัดทำโดย {profile?.full_name || profile?.email} • {new Intl.DateTimeFormat("th-TH",{dateStyle:"medium"}).format(new Date())}</footer>
            </div>
            <aside className="export-actions-card"><p className="eyebrow">Export formats</p><h2>เลือกชนิดไฟล์</h2>{["xlsx","pdf","png","pptx"].map((format)=><button key={format} type="button" disabled={Boolean(exportState.format)||state.loading} onClick={()=>runExport(format)}><strong>{exportState.format===format?"กำลังสร้าง...":format.toUpperCase()}</strong><span>{format==="xlsx"?"ข้อมูลและตาราง":format==="pptx"?"สไลด์พร้อมนำเสนอ":format==="pdf"?"เอกสารคงรูป":"รูปกราฟความละเอียดสูง"}</span></button>)}<small>ไฟล์สร้างใน Browser โดยไม่ส่งข้อมูลรายงานไปบริการภายนอก</small></aside>
          </section>
        </>
      ) : (
        <>
          <section className="report-builder-wizard" aria-label="ขั้นตอนสร้าง PowerPoint">
            {[
              ["1", "Template", "เลือกรูปแบบรายงาน"],
              ["2", "Period", "เลือกช่วงข้อมูล"],
              ["3", "Data", "เลือกหมวดและหมวดย่อย"],
              ["4", "Slides", "เลือกส่วนประกอบสไลด์"],
              ["5", "Preview", builderState.report ? "Outline พร้อมตรวจ" : "กด Preview ก่อนสร้าง"],
              ["6", "Generate", "สร้างไฟล์ PowerPoint"]
            ].map((step, index) => (
              <article key={step[0]} className={index < 4 || builderState.report ? "done" : index === 4 ? "current" : ""}>
                <span>{step[0]}</span>
                <strong>{step[1]}</strong>
                <small>{step[2]}</small>
              </article>
            ))}
          </section>

          <section className="report-builder-grid">
            <div className="report-builder-card">
              <p className="eyebrow">PowerPoint Builder</p><h2>ตั้งค่าชุดสไลด์</h2>
              <div className="builder-controls">
                <Select label="Template" value={builder.template} onChange={(v) => updateBuilder("template", v)}>{reportTemplates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
                <Select label="ชนิดกราฟใน PowerPoint" value={builder.chartType} onChange={(v) => updateBuilder("chartType", v)}><option value="bar">กราฟแท่ง</option><option value="line">กราฟเส้น</option></Select>
                <Select label="โหมดกราฟ PowerPoint" value={builder.chartMode || "native"} onChange={(v) => updateBuilder("chartMode", v)}><option value="native">Native chart แก้ไขได้</option><option value="shape">Shape chart เสถียรสูง</option></Select>
                <Select label="Theme" value={builder.theme || "executive_dark"} onChange={(v) => updateBuilder("theme", v)}>{reportThemeOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
                <Select label="มุมมอง" value={builder.view} onChange={(v) => updateBuilder("view", v)}>{analyticsViews.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
                <Select label="ปี" value={builder.year} onChange={(v) => updateBuilder("year", v)}>{years.map((year) => <option key={year}>{year}</option>)}</Select>
                {(builder.view === "monthly" || builder.view === "month_over_month") && <Select label="เดือน" value={builder.month} onChange={(v) => updateBuilder("month", v)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</Select>}
                {builder.view === "quarterly" && <Select label="ไตรมาส" value={builder.quarter} onChange={(v) => updateBuilder("quarter", v)}>{[1,2,3,4].map((q)=><option key={q} value={q}>Q{q}</option>)}</Select>}
              </div>
              <h3>เลือกข้อมูลที่จะใส่ PowerPoint</h3>
              <div className="module-check-grid">
                {analyticsModules.map((item) => <label key={item.id} className={builder.modules.includes(item.id) ? "selected" : ""}><input type="checkbox" checked={builder.modules.includes(item.id)} onChange={() => toggleBuilderModule(item.id)} /> <span>{item.label}</span></label>)}
              </div>
              <h3>เลือกหมวดย่อยที่จะนำไปทำกราฟ</h3>
              {builderCategories.error && <p className="alert alert-error">โหลดหมวดย่อยไม่สำเร็จ: {builderCategories.error.message}</p>}
              <div className="category-picker-grid">
                {builder.modules.map((moduleId) => {
                  const moduleLabel = analyticsModules.find((item) => item.id === moduleId)?.label || moduleId;
                  const categories = builderCategories.items[moduleId] || [];
                  const selectedCodes = builder.categorySelection?.[moduleId] || [];
                  const allSelected = categories.length > 0 && selectedCodes.length === categories.length;
                  return (
                    <article key={moduleId}>
                      <div className="category-picker-heading"><strong>{moduleLabel}</strong><span>{selectedCodes.length ? `${selectedCodes.length}/${categories.length}` : "ทั้งหมด"}</span></div>
                      <div className="category-picker-actions">
                        <button type="button" className="text-button" onClick={() => setBuilderModuleCategories(moduleId, categories.map((item) => item.code))}>เลือกทั้งหมด</button>
                        <button type="button" className="text-button" onClick={() => setBuilderModuleCategories(moduleId, [])}>ใช้ทั้งหมดอัตโนมัติ</button>
                      </div>
                      <div className="category-chip-list">
                        {categories.length === 0 ? <small>{builderCategories.loading ? "กำลังโหลด..." : "ไม่มีหมวดย่อย"}</small> : categories.map((category) => {
                          const active = selectedCodes.length === 0 || selectedCodes.includes(category.code);
                          return <button key={category.code} type="button" className={active ? "selected" : ""} onClick={() => toggleBuilderCategory(moduleId, category.code)}>{category.name_th}</button>;
                        })}
                      </div>
                      {allSelected && <small>เลือกครบทุกหมวดแล้ว</small>}
                    </article>
                  );
                })}
              </div>
              <h3>เลือกส่วนประกอบในสไลด์</h3>
              <div className="section-check-grid">
                {reportSectionOptions.map((item) => <label key={item.id} className={builder.includeSections.includes(item.id) ? "selected" : ""}><input type="checkbox" disabled={item.required} checked={builder.includeSections.includes(item.id)} onChange={() => toggleBuilderSection(item.id)} /> <span>{item.label}</span>{item.required && <small>จำเป็น</small>}</label>)}
              </div>
            </div>
            <aside className="report-builder-summary">
              <p className="eyebrow">Preview</p><h2>{builderPeriodLabel}</h2>
              <p>{reportTemplates.find((item) => item.id === builder.template)?.description}</p>
              <div className="builder-summary-list"><strong>ข้อมูลที่เลือก</strong>{builder.modules.map((moduleId) => <span key={moduleId}>{analyticsModules.find((item) => item.id === moduleId)?.label || moduleId}</span>)}</div>
              <div className="preset-panel"><div><strong>Enterprise Saved Presets</strong><button type="button" className="text-button" disabled={presetState.loading} onClick={saveBuilderPreset}>บันทึก Preset นี้</button></div>{presetState.error && <small className="warning-text">โหลด Preset จากระบบไม่สำเร็จ จะแสดง local preset สำรอง: {presetState.error.message}</small>}{presets.length === 0 ? <small>ยังไม่มี Preset ที่บันทึกไว้</small> : presets.map((preset) => <span key={preset.id} className="preset-row"><button type="button" onClick={() => applyBuilderPreset(preset)}><strong>{preset.name}</strong><small>{preset.visibility === "team" ? "ทีม" : preset.visibility === "local" ? "ในเครื่อง" : "ส่วนตัว"}{preset.owner?.fullName ? ` • ${preset.owner.fullName}` : ""}</small></button><div className="preset-row-actions"><button type="button" className="text-button" disabled={presetState.loading} onClick={() => duplicateBuilderPreset(preset)}>Duplicate</button>{(preset.isOwner || canManageReportPresets || preset.isLocal) && <button type="button" className="text-button" disabled={presetState.loading} onClick={() => editBuilderPreset(preset)}>Edit</button>}<button type="button" className="text-button" disabled={presetState.loading} onClick={() => setDefaultBuilderPreset(preset)}>Default</button>{(preset.isOwner || canManageReportPresets || preset.isLocal) && <button type="button" className="text-button danger-link" aria-label={`ลบ ${preset.name}`} disabled={presetState.loading} onClick={() => deleteBuilderPreset(preset)}>Delete</button>}</div></span>)}</div>
              <button className="secondary-button" type="button" disabled={builderState.loading || Boolean(exportState.format)} onClick={previewBuilderReport}>{builderState.loading ? "กำลัง Preview..." : "Preview ข้อมูล"}</button>
              <button className="primary-button" type="button" disabled={builderState.loading || Boolean(exportState.format)} onClick={runBuilderPowerPoint}>{exportState.format === "pptx" ? "กำลังสร้าง PowerPoint..." : "สร้าง PowerPoint หลายสไลด์"}</button>
              <button className="secondary-button" type="button" disabled={builderState.loading || Boolean(exportState.format)} onClick={runBackendBuilderPowerPoint}>{exportState.format === "pptx-server" ? "กำลังสร้างและเก็บไฟล์..." : "สร้างด้วย Backend + เก็บไฟล์"}</button>
              <small>ระบบจะดึงข้อมูลแต่ละหมวดจาก Analytics API แล้วสร้างสไลด์ KPI, กราฟ, สัดส่วนรายหมวด, ตาราง และบทวิเคราะห์ให้อัตโนมัติ หากเลือก Native chart จะสามารถแก้กราฟต่อใน PowerPoint ได้</small>
            </aside>
          </section>
          {builderState.error && <p className="alert alert-error">{builderState.error.message}</p>}
          {builderState.loading && <section className="builder-preview-card builder-preview-loading"><div className="card-heading"><div><p className="eyebrow">Report Preview</p><h2>กำลังโหลดข้อมูลพรีวิว</h2></div><strong>กำลังทำงาน</strong></div><p>ระบบกำลังดึงข้อมูลจาก Analytics API เพื่อสรุป KPI, กราฟ และบทวิเคราะห์ก่อนสร้าง PowerPoint</p></section>}
          {exportState.error && <p className="alert alert-error">{exportState.error}</p>}
          {exportState.message && <p className="alert alert-success">{exportState.message}</p>}
          {builderState.report && <section className="builder-preview-card"><div className="card-heading"><div><p className="eyebrow">Report Preview</p><h2>สรุปก่อนสร้างสไลด์</h2><small>ใช้ชุดเดียวกับที่นำไปสร้าง PowerPoint จริง</small></div><strong>{builderSlideOutline.length} สไลด์</strong></div><div className="builder-preview-modules">{builderState.report.modules.map((item) => <article key={item.moduleInfo.id}><h3>{item.moduleInfo.label}</h3><strong>{formatNumber(item.data.kpis.grandTotal)} {item.data.unit}</strong><p>{item.analysis.insights[0]}</p><small>{item.data.categories?.length || 0} หมวดย่อย • {item.data.rows?.length || 0} ช่วงข้อมูล</small></article>)}{builderState.report.dataQuality?.summary && <article><h3>Data Quality</h3><strong>{formatNumber(builderState.report.dataQuality.summary.completeness_percent, 1)}%</strong><p>ขาด {formatNumber(builderState.report.dataQuality.summary.missing_cells, 0)} ช่องข้อมูล • {builderState.report.dataQuality.period?.status_label}</p><small>ตรวจจากข้อมูลช่วงเดียวกับรายงาน</small></article>}</div><div className="builder-outline"><div className="builder-outline-heading"><div><h3>Slide Outline</h3><small>แก้ชื่อสไลด์ เลือก layout และเปิด/ปิดสไลด์ก่อนสร้างจริง</small></div><button type="button" className="text-button" onClick={() => setOutlineEditOpen((value) => !value)}>{outlineEditOpen ? "ย่อ Outline" : "แก้ Outline"}</button></div>{readabilityWarnings.length > 0 && <div className="readability-warning-list">{readabilityWarnings.map((warning, index) => <p key={`${warning.level}-${index}`} className={`warning-${warning.level}`}><strong>{warning.level === "error" ? "ต้องแก้" : warning.level === "warning" ? "ควรตรวจ" : "Info"}</strong>{warning.message}</p>)}</div>}{builderSlideOutline.map((slide, index) => <article key={slide.id} draggable onDragStart={() => setDraggedSlideId(slide.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => handleOutlineDrop(slide.id)} className={`${slide.enabled === false ? "disabled" : ""} ${draggedSlideId === slide.id ? "dragging" : ""}`}><span>{slide.no}</span><div><strong>{slide.title}</strong><p>{slide.description}</p>{outlineEditOpen && <div className="outline-edit-row"><label><small>ชื่อสไลด์</small><input value={builder.slideOutlineOverrides?.[slide.id]?.title || slide.title} onChange={(event) => updateSlideOverride(slide.id, { title: event.target.value })} /></label><label><small>Layout</small><select value={slide.layout || "auto"} onChange={(event) => updateSlideOverride(slide.id, { layout: event.target.value })}>{slideLayoutOptions.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}</select></label><div className="outline-buttons"><button type="button" className="text-button" disabled={index === 0} onClick={() => moveOutlineSlide(slide, -1)}>ขึ้น</button><button type="button" className="text-button" disabled={index === builderSlideOutline.length - 1} onClick={() => moveOutlineSlide(slide, 1)}>ลง</button><button type="button" className="text-button" disabled={slide.locked} onClick={() => toggleOutlineSlide(slide)}>{slide.enabled === false ? "เปิดใช้" : "ปิดสไลด์"}</button></div></div>}</div><div className={`mini-slide mini-${slide.layout || "auto"}`}><i /><b /><em /><small>{slide.type}</small></div></article>)}</div></section>}
        </>
      )}

      <section className="export-history-card report-run-detail-card"><div className="card-heading"><div><p className="eyebrow">Report Run History</p><h2>ประวัติการสร้างรายงาน</h2></div><strong>{reportRuns.length} รายการ</strong></div><div className="report-run-grid"><div className="export-history-list">{reportRuns.length ? reportRuns.map((item) => <div key={item.id}><strong>{item.title}</strong><span>{item.period_label} • {item.status} • {item.metadata?.slideCount || "-"} สไลด์</span><time>{new Intl.DateTimeFormat("th-TH",{dateStyle:"short",timeStyle:"short"}).format(new Date(item.generated_at))}</time><button type="button" className="text-button" onClick={() => setSelectedReportRun(item)}>ดูรายละเอียด</button></div>) : <p className="muted">ยังไม่มีประวัติการสร้างรายงาน</p>}</div>{selectedReportRun && <aside className="report-run-detail"><div><strong>{selectedReportRun.title}</strong><button type="button" className="text-button" onClick={() => setSelectedReportRun(null)}>ปิด</button></div><p>{selectedReportRun.period_label} • {selectedReportRun.status}</p><dl><div><dt>Theme</dt><dd>{selectedReportRun.metadata?.theme || "-"}</dd></div><div><dt>Slides</dt><dd>{selectedReportRun.metadata?.slideCount || "-"}</dd></div><div><dt>Modules</dt><dd>{selectedReportRun.metadata?.modules?.join(", ") || "-"}</dd></div></dl>{selectedReportRun.metadata?.outline?.length > 0 && <ol>{selectedReportRun.metadata.outline.slice(0, 12).map((slide) => <li key={slide.id || `${slide.no}-${slide.title}`}><strong>{slide.no}. {slide.title}</strong><span>{slide.layout || slide.type}</span></li>)}</ol>}</aside>}</div></section>

      <section className="export-history-card"><div className="card-heading"><div><p className="eyebrow">Enterprise storage</p><h2>ไฟล์รายงานที่เก็บไว้ล่าสุด</h2></div></div><div className="export-history-list">{reportFiles.length?reportFiles.map((item)=><div key={item.id}><strong>{item.file_name}</strong><span>{Math.round(Number(item.file_size_bytes || 0)/1024)} KB • {item.metadata?.slideCount || "-"} สไลด์</span><time>{new Intl.DateTimeFormat("th-TH",{dateStyle:"short",timeStyle:"short"}).format(new Date(item.created_at))}</time><button type="button" className="text-button" onClick={() => downloadStoredReportFile(item)}>ดาวน์โหลด</button></div>):<p className="muted">ยังไม่มีไฟล์รายงานที่เก็บไว้</p>}</div></section>

      <section className="export-history-card"><div className="card-heading"><div><p className="eyebrow">Audit trail</p><h2>ประวัติการ Export ล่าสุด</h2></div></div><div className="export-history-list">{history.length?history.map((item)=><div key={item.id}><strong>{item.export_format.toUpperCase()}</strong><span>{item.module} • {item.period_label}</span><time>{new Intl.DateTimeFormat("th-TH",{dateStyle:"short",timeStyle:"short"}).format(new Date(item.created_at))}</time></div>):<p className="muted">ยังไม่มีประวัติการ Export</p>}</div></section>
    </>
  );
}
