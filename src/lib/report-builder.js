import { analyticsModules, analyticsPath, comparisonPercentText, formatNumber, thaiMonthLabel } from "./analytics.js";
import { reportFilename } from "./export-report.js";

export const reportTemplates = [
  { id: "executive", label: "รายงานผู้บริหาร", description: "เน้น KPI, กราฟ, บทวิเคราะห์ และข้อเสนอแนะ" },
  { id: "operations", label: "รายงานปฏิบัติการ", description: "เน้นรายละเอียดรายหมวด ตาราง และแนวโน้มการใช้งาน" },
  { id: "data_quality", label: "รายงานตรวจสอบข้อมูล", description: "เน้นความครบถ้วน ความผิดปกติ และสิ่งที่ต้องติดตาม" }
];

export const reportSectionOptions = [
  { id: "cover", label: "หน้าปก", required: true },
  { id: "executive_summary", label: "Executive Summary", required: true },
  { id: "module_charts", label: "กราฟแยกตามข้อมูล", required: true },
  { id: "category_breakdown", label: "สัดส่วนรายหมวด" },
  { id: "data_quality", label: "Data Quality" },
  { id: "analysis", label: "บทวิเคราะห์อัตโนมัติ", required: true },
  { id: "data_table", label: "ตารางข้อมูล" },
  { id: "recommendations", label: "ข้อเสนอแนะ", required: true }
];

export const reportThemeOptions = [
  { id: "executive_dark", label: "Executive Dark", description: "หน้าปกเข้ม เน้นผู้บริหาร", primary: "17142A", accent: "6F52C7", surface: "F7F7FB" },
  { id: "clean_government", label: "Clean Government", description: "เรียบ เป็นทางการ อ่านง่าย", primary: "1E3A5F", accent: "2F80ED", surface: "F6FAFF" },
  { id: "eco_green", label: "Eco Green", description: "เหมาะกับรายงานสิ่งแวดล้อม", primary: "12332E", accent: "42AF8C", surface: "F1FAF7" },
  { id: "minimal_white", label: "Minimal White", description: "ขาวสะอาด ใช้พื้นที่เยอะ", primary: "17142A", accent: "64748B", surface: "FFFFFF" }
];

export const slideLayoutOptions = [
  { id: "auto", label: "Auto", description: "ให้ระบบเลือก layout ตามข้อมูล" },
  { id: "kpi_chart_analysis", label: "KPI + Chart + Analysis", description: "สไลด์ภาพรวมมาตรฐาน" },
  { id: "chart_focus", label: "Chart Focus", description: "ขยายกราฟให้เด่น" },
  { id: "table_focus", label: "Table Focus", description: "เหมาะกับตารางข้อมูล" },
  { id: "analysis_focus", label: "Analysis Focus", description: "เน้นบทวิเคราะห์และข้อเสนอแนะ" },
  { id: "quality_focus", label: "Data Quality Focus", description: "เน้นสถานะข้อมูลและ warning" }
];

export function defaultReportBuilderSettings(date = new Date()) {
  return {
    template: "executive",
    view: "monthly",
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    quarter: Math.floor(date.getMonth() / 3) + 1,
    modules: ["waste", "scrap_sales"],
    categorySelection: {},
    chartType: "bar",
    chartMode: "native",
    theme: "executive_dark",
    slideOutlineOverrides: {},
    includeSections: reportSectionOptions.map((item) => item.id),
    includeTables: true,
    includeAnalysis: true
  };
}

export function reportPeriodLabel(settings) {
  if (settings.view === "yearly") return String(settings.year);
  if (settings.view === "quarterly") return `${settings.year}-Q${settings.quarter}`;
  if (settings.view === "month_over_month") return `${settings.year}-${String(settings.month).padStart(2, "0")} เทียบเดือนก่อน`;
  return `${settings.year}-${String(settings.month).padStart(2, "0")}`;
}

export function buildModuleFilters(settings, moduleId) {
  return {
    module: moduleId,
    view: settings.view,
    year: Number(settings.year),
    month: Number(settings.month),
    quarter: Number(settings.quarter),
    metric: moduleId === "scrap_sales" ? "amount" : "quantity"
  };
}


function selectedCodesForModule(settings, moduleId) {
  const codes = settings.categorySelection?.[moduleId];
  return Array.isArray(codes) ? codes.filter(Boolean) : [];
}

function filterAnalyticsByCategoryCodes(data, selectedCodes = []) {
  if (!selectedCodes.length) return data;
  const allowed = new Set(selectedCodes);
  const categories = (data?.categories || []).filter((category) => allowed.has(category.code));
  const rows = (data?.rows || []).map((row) => {
    const values = {};
    for (const category of categories) values[category.code] = Number(row.values?.[category.code] || 0);
    const total = Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0);
    return { ...row, values, total };
  });
  const grandTotal = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const populated = rows.filter((row) => Number(row.total || 0) !== 0);
  const maxRow = rows.reduce((best, row) => (!best || Number(row.total || 0) > Number(best.total || 0) ? row : best), null);
  const minRow = rows.reduce((best, row) => (!best || Number(row.total || 0) < Number(best.total || 0) ? row : best), null);
  const categoryTotals = categories.map((category) => ({
    ...category,
    total: rows.reduce((sum, row) => sum + Number(row.values?.[category.code] || 0), 0)
  }));
  return {
    ...data,
    rows,
    categories: categoryTotals,
    kpis: {
      ...(data?.kpis || {}),
      grandTotal,
      average: populated.length ? grandTotal / populated.length : 0,
      maximum: Number(maxRow?.total || 0),
      maximumPeriod: maxRow?.label || null,
      minimum: Number(minRow?.total || 0),
      minimumPeriod: minRow?.label || null
    }
  };
}

function qualityMonthForSettings(settings) {
  if (settings.view !== "monthly" && settings.view !== "month_over_month") return null;
  return `${settings.year}-${String(settings.month).padStart(2, "0")}`;
}

async function loadDataQuality(api, settings) {
  if (!settings.includeSections?.includes("data_quality")) return null;
  const month = qualityMonthForSettings(settings);
  if (!month) return { skipped: true, reason: "Data Quality รองรับรายเดือนเท่านั้นใน MVP", month: null };
  const quality = await api.request(`/api/data-quality?month=${encodeURIComponent(month)}`);
  return { ...quality, month };
}
export async function loadReportBuilderData(api, settings) {
  const modules = settings.modules
    .map((moduleId) => analyticsModules.find((item) => item.id === moduleId))
    .filter(Boolean);
  const results = [];
  for (const moduleInfo of modules) {
    const filters = buildModuleFilters(settings, moduleInfo.id);
    const rawData = await api.request(analyticsPath(filters));
    const selectedCodes = selectedCodesForModule(settings, moduleInfo.id);
    const data = filterAnalyticsByCategoryCodes(rawData, selectedCodes);
    results.push({ moduleInfo, filters, selectedCodes, data, analysis: analyzeModule({ moduleInfo, data }) });
  }
  const dataQuality = await loadDataQuality(api, settings);
  return {
    generatedAt: new Date().toISOString(),
    settings,
    periodLabel: reportPeriodLabel(settings),
    dataQuality,
    modules: results,
    summary: buildExecutiveSummary(results, dataQuality)
  };
}

function trendLabel(comparison) {
  const diff = Number(comparison?.difference || 0);
  if (diff > 0) return "เพิ่มขึ้น";
  if (diff < 0) return "ลดลง";
  return "ทรงตัว";
}

function topCategory(data) {
  return [...(data?.categories || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0] || null;
}

function maxPeriod(data) {
  return (data?.rows || []).reduce((best, row) => (!best || Number(row.total || 0) > Number(best.total || 0) ? row : best), null);
}

export function analyzeModule({ moduleInfo, data }) {
  const total = Number(data?.kpis?.grandTotal || 0);
  const average = Number(data?.kpis?.average || 0);
  const top = topCategory(data);
  const peak = maxPeriod(data);
  const trend = trendLabel(data?.comparison);
  const percentText = comparisonPercentText(data?.comparison, { fallback: "ไม่มีข้อมูลเดือนก่อน" });
  const topShare = total > 0 && top ? (Number(top.total || 0) / total) * 100 : 0;
  const insights = [];
  if (total === 0) {
    insights.push(`${moduleInfo.label} ยังไม่มีข้อมูลในช่วงเวลานี้ ควรตรวจสอบการบันทึกหรือการนำเข้าไฟล์`);
  } else {
    insights.push(`${moduleInfo.label} มียอดรวม ${formatNumber(total)} ${data.unit || "หน่วย"} โดยแนวโน้มเมื่อเทียบช่วงก่อนหน้า${trend === "ทรงตัว" ? "ทรงตัว" : trend} (${percentText})`);
    if (top) insights.push(`หมวดที่มีสัดส่วนสูงสุดคือ ${top.name_th} คิดเป็นประมาณ ${formatNumber(topShare, 1)}% ของยอดรวม`);
    if (peak) insights.push(`ช่วงที่มีค่าสูงสุดคือ ${thaiMonthLabel(peak.label)} จำนวน ${formatNumber(peak.total)} ${data.unit || "หน่วย"}`);
    if (average > 0) insights.push(`ค่าเฉลี่ยต่อช่วงอยู่ที่ ${formatNumber(average)} ${data.unit || "หน่วย"} ใช้เป็น baseline สำหรับติดตามความผิดปกติได้`);
  }
  const recommendations = [];
  if (moduleInfo.id === "waste") {
    recommendations.push("ติดตามสัดส่วน Recycle และ RDF เพื่อเพิ่มประสิทธิภาพการคัดแยกและลดขยะปลายทาง");
  } else if (moduleInfo.id === "scrap_sales") {
    recommendations.push("ติดตามวัสดุที่สร้างรายได้สูงสุดและตรวจราคาขายย้อนหลังเพื่อเพิ่มรายได้จากเศษวัสดุ");
  } else {
    recommendations.push(`ติดตามการใช้ ${moduleInfo.label} ที่สูงกว่าค่าเฉลี่ย เพื่อควบคุม stock และลดการเบิกเกินจำเป็น`);
  }
  if (data?.comparison?.percent !== null && Number(data?.comparison?.percent || 0) > 20) {
    recommendations.push("ควรตรวจสอบสาเหตุการเพิ่มขึ้นมากกว่า 20% เช่น จำนวนผู้ใช้บริการ กิจกรรมพิเศษ หรือความคลาดเคลื่อนของข้อมูล");
  }
  return { total, average, topCategory: top, peakPeriod: peak, trend, percentText, topShare, insights, recommendations };
}

export function buildExecutiveSummary(modules, dataQuality = null) {
  const totals = modules.map((item) => ({
    moduleId: item.moduleInfo.id,
    label: item.moduleInfo.label,
    total: Number(item.data?.kpis?.grandTotal || 0),
    unit: item.data?.unit || "หน่วย",
    trend: item.analysis.trend,
    percentText: item.analysis.percentText
  }));
  const highest = [...totals].sort((a, b) => b.total - a.total)[0] || null;
  const insights = [];
  if (highest) insights.push(`ข้อมูลที่มีมูลค่า/ปริมาณสูงสุดคือ ${highest.label} รวม ${formatNumber(highest.total)} ${highest.unit}`);
  const increased = totals.filter((item) => item.trend === "เพิ่มขึ้น");
  if (increased.length) insights.push(`หมวดที่เพิ่มขึ้นเมื่อเทียบช่วงก่อนหน้า: ${increased.map((item) => item.label).join(", ")}`);
  const flatOrDown = totals.filter((item) => item.trend !== "เพิ่มขึ้น");
  if (flatOrDown.length) insights.push(`หมวดที่ควบคุมได้หรือทรงตัว: ${flatOrDown.map((item) => item.label).join(", ")}`);
  if (dataQuality?.summary) insights.push(`คุณภาพข้อมูลเดือนนี้ครบถ้วน ${formatNumber(dataQuality.summary.completeness_percent, 1)}% ขาด ${formatNumber(dataQuality.summary.missing_cells, 0)} ช่องข้อมูล`);
  if (!insights.length) insights.push("ยังไม่มีข้อมูลเพียงพอสำหรับสรุปภาพรวม");
  return { totals, highest, insights };
}

function safeName(value) { return String(value || "report").replace(/[^a-zA-Z0-9ก-๙_-]+/gu, "_").replace(/^_+|_+$/gu, ""); }
function pct(value, total) { return total > 0 ? Math.round((Number(value || 0) / total) * 1000) / 10 : 0; }

const READABILITY = {
  maxTableRowsPerSlide: 8,
  maxCategoriesPerBreakdown: 7,
  maxBulletsPerSlide: 5,
  maxBulletChars: 128,
  maxTitleChars: 72
};

function truncateText(value, max = READABILITY.maxBulletChars) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function readableBullets(items, maxItems = READABILITY.maxBulletsPerSlide) {
  const normalized = (items || [])
    .map((item) => truncateText(item))
    .filter(Boolean)
    .slice(0, maxItems);
  return normalized.length ? normalized : ["ยังไม่มีบทวิเคราะห์"];
}

function chunkRows(rows, size = READABILITY.maxTableRowsPerSlide) {
  const list = Array.isArray(rows) ? rows : [];
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

function readableSlideTitle(title) {
  return truncateText(title, READABILITY.maxTitleChars);
}

function makeSlideId(type, moduleId = "global", index = 0) {
  return `${type}:${moduleId}:${index}`;
}

function inferSlideLayout(slide, report, settings = {}) {
  if (settings.slideOutlineOverrides?.[slide.id]?.layout && settings.slideOutlineOverrides[slide.id].layout !== "auto") {
    return settings.slideOutlineOverrides[slide.id].layout;
  }
  if (slide.type === "cover") return "analysis_focus";
  if (slide.type === "summary") return "kpi_chart_analysis";
  if (slide.type === "data_quality") return "quality_focus";
  if (slide.type === "data_table") return "table_focus";
  if (slide.type === "recommendations") return "analysis_focus";
  if (slide.type === "category_breakdown") return "analysis_focus";
  const moduleItem = (report?.modules || []).find((item) => item.moduleInfo.id === slide.module);
  if (moduleItem?.data?.rows?.length > 10) return "chart_focus";
  if ((moduleItem?.analysis?.insights || []).join(" ").length > 280) return "analysis_focus";
  return "kpi_chart_analysis";
}

export function buildReadabilityWarnings(report, settings = {}) {
  const warnings = [];
  (report?.modules || []).forEach((item) => {
    if ((item.data?.rows || []).length > READABILITY.maxTableRowsPerSlide) {
      warnings.push({
        level: "info",
        module: item.moduleInfo.label,
        message: `${item.moduleInfo.label}: ตาราง ${item.data.rows.length} แถว จะถูกแยกเป็น ${chunkRows(item.data.rows).length} สไลด์`
      });
    }
    if ((item.data?.categories || []).length > READABILITY.maxCategoriesPerBreakdown) {
      warnings.push({
        level: "info",
        module: item.moduleInfo.label,
        message: `${item.moduleInfo.label}: มี ${item.data.categories.length} หมวดย่อย จะแสดง Top ${READABILITY.maxCategoriesPerBreakdown} ก่อน`
      });
    }
    if ((item.analysis?.insights || []).some((text) => String(text || "").length > READABILITY.maxBulletChars)) {
      warnings.push({
        level: "warning",
        module: item.moduleInfo.label,
        message: `${item.moduleInfo.label}: มี bullet ยาว ระบบจะย่อข้อความเพื่อไม่ให้สไลด์แน่น`
      });
    }
  });
  if (!report?.modules?.length) warnings.push({ level: "error", module: "report", message: "ยังไม่มีหมวดข้อมูลสำหรับสร้างรายงาน" });
  return warnings;
}

export function applySlideOutlineOverrides(outline, overrides = {}) {
  return outline
    .map((slide, fallbackOrder) => {
      const override = overrides[slide.id] || {};
      return {
        ...slide,
        enabled: override.enabled !== false,
        title: override.title || slide.title,
        layout: override.layout || slide.layout || "auto",
        order: Number.isFinite(Number(override.order)) ? Number(override.order) : fallbackOrder,
        hasCustomOrder: Number.isFinite(Number(override.order))
      };
    })
    .sort((a, b) => (a.order - b.order) || Number(b.hasCustomOrder) - Number(a.hasCustomOrder))
    .filter((slide) => slide.enabled)
    .map((slide, index) => {
      const { hasCustomOrder, order, ...cleanSlide } = slide;
      return { ...cleanSlide, no: index + 1 };
    });
}

export function getReportTheme(themeId = "executive_dark") {
  return reportThemeOptions.find((theme) => theme.id === themeId) || reportThemeOptions[0];
}

function moduleSlideCount(item, context) {
  let count = 1;
  if (context.includeCategoryBreakdown) count += 1;
  if (context.includeTables) count += chunkRows(item.data?.rows || []).length;
  return count;
}

export function buildReportSlideOutline(report, settings = {}) {
  const context = {
    includeCategoryBreakdown: settings.includeSections?.includes?.("category_breakdown") ?? settings.includeCategoryBreakdown ?? true,
    includeDataQuality: settings.includeSections?.includes?.("data_quality") ?? settings.includeDataQuality ?? false,
    includeTables: settings.includeSections?.includes?.("data_table") ?? settings.includeTables ?? false
  };
  const slides = [];
  let rawIndex = 0;
  slides.push({ id: makeSlideId("cover", "global", rawIndex++), no: slides.length + 1, title: "Cover", description: "หน้าปก รายงาน ช่วงข้อมูล และหมวดที่เลือก", type: "cover", layout: "analysis_focus", locked: true });
  slides.push({ id: makeSlideId("summary", "global", rawIndex++), no: slides.length + 1, title: "Executive Summary", description: "KPI รวม ประเด็นสำคัญ และภาพรวมแต่ละหมวด", type: "summary", layout: "kpi_chart_analysis", locked: true });
  if (context.includeDataQuality) slides.push({ id: makeSlideId("data_quality", "global", rawIndex++), no: slides.length + 1, title: "Data Quality", description: "ความครบถ้วน สถานะงวด และประเด็นที่ควรตรวจ", type: "data_quality", layout: "quality_focus" });
  (report?.modules || []).forEach((item) => {
    const chartSlide = {
      id: makeSlideId("module_chart", item.moduleInfo.id, rawIndex++),
      no: slides.length + 1,
      title: `${item.moduleInfo.label} — KPI + กราฟ`,
      description: `กราฟ ${settings.chartType === "line" ? "เส้น" : "แท่ง"} พร้อม KPI หลักและบทวิเคราะห์`,
      type: "module_chart",
      module: item.moduleInfo.id
    };
    slides.push({ ...chartSlide, layout: inferSlideLayout(chartSlide, report, settings) });
    if (context.includeCategoryBreakdown) {
      const slide = {
        id: makeSlideId("category_breakdown", item.moduleInfo.id, rawIndex++),
        no: slides.length + 1,
        title: `${item.moduleInfo.label} — สัดส่วนรายหมวด`,
        description: `แสดง Top ${READABILITY.maxCategoriesPerBreakdown} หมวดสูงสุดพร้อมข้อเสนอแนะ`,
        type: "category_breakdown",
        module: item.moduleInfo.id,
        layout: "analysis_focus"
      };
      slides.push(slide);
    }
    if (context.includeTables) {
      const chunks = chunkRows(item.data?.rows || []);
      chunks.forEach((chunk, index) => {
        const slide = {
          id: makeSlideId("data_table", item.moduleInfo.id, rawIndex++),
          no: slides.length + 1,
          title: `${item.moduleInfo.label} — ตารางข้อมูล${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`,
          description: `ตาราง ${chunk.length} แถว เพื่อไม่ให้สไลด์แออัด`,
          type: "data_table",
          module: item.moduleInfo.id,
          layout: "table_focus"
        };
        slides.push(slide);
      });
    }
  });
  slides.push({ id: makeSlideId("recommendations", "global", rawIndex++), no: slides.length + 1, title: "Recommendations", description: "ข้อเสนอแนะและการติดตามต่อ", type: "recommendations", layout: "analysis_focus", locked: true });
  return applySlideOutlineOverrides(slides, settings.slideOutlineOverrides || {});
}

function addTitle(slide, title, subtitle) {
  slide.addText(readableSlideTitle(title), { x: 0.45, y: 0.28, w: 9.6, h: 0.58, fontSize: 28, bold: true, color: "17142A", margin: 0 });
  if (subtitle) slide.addText(subtitle, { x: 0.45, y: 0.88, w: 10.2, h: 0.34, fontSize: 13, color: "6F758B", margin: 0 });
}

function addFooter(slide, context, pageNumber) {
  slide.addText(`${context.organizationName} • ${context.periodLabel}`, { x: 0.45, y: 7.15, w: 6.2, h: 0.18, fontSize: 9, color: "777C8F", margin: 0 });
  slide.addText(String(pageNumber), { x: 12.2, y: 7.15, w: 0.55, h: 0.18, fontSize: 9, color: "777C8F", align: "right", margin: 0 });
}

function addKpiCard(slide, { title, value, subtitle }, x, y, w = 2.75) {
  slide.addShape("roundRect", { x, y, w, h: 1.08, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: "E2E5F0", pt: 1 } });
  slide.addText(title, { x: x + 0.14, y: y + 0.14, w: w - 0.28, h: 0.22, fontSize: 10, color: "6F758B", margin: 0 });
  slide.addText(value, { x: x + 0.14, y: y + 0.43, w: w - 0.28, h: 0.32, fontSize: 19, bold: true, color: "17142A", margin: 0, fit: "shrink" });
  if (subtitle) slide.addText(subtitle, { x: x + 0.14, y: y + 0.80, w: w - 0.28, h: 0.20, fontSize: 8.8, color: "6F758B", margin: 0, fit: "shrink" });
}

function rowsForChart(data) {
  return (data?.rows || []).map((row) => ({ name: thaiMonthLabel(row.label), value: Number(row.total || 0) }));
}

function addSimpleBarChart(slide, rows, { x, y, w, h, unit }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  const gap = 0.07;
  const barW = Math.max(0.16, (w - gap * (rows.length - 1)) / Math.max(rows.length, 1));
  rows.forEach((row, index) => {
    const barH = Math.max(0.04, (Number(row.value || 0) / max) * (h - 0.56));
    const bx = x + index * (barW + gap);
    slide.addShape("rect", { x: bx, y: y + h - 0.36 - barH, w: barW, h: barH, fill: { color: "6F52C7" }, line: { color: "6F52C7", transparency: 100 } });
    slide.addText(row.name, { x: bx - 0.04, y: y + h - 0.28, w: barW + 0.08, h: 0.18, fontSize: 8.5, color: "6F758B", align: "center", margin: 0, rotate: rows.length > 8 ? 45 : 0 });
    slide.addText(formatNumber(row.value), { x: bx - 0.04, y: y + h - 0.55 - barH, w: barW + 0.08, h: 0.14, fontSize: 8, color: "17142A", align: "center", margin: 0, fit: "shrink" });
  });
  slide.addText(unit || "หน่วย", { x, y: y - 0.04, w, h: 0.15, fontSize: 8.5, color: "6F758B", align: "right", margin: 0 });
}


function addSimpleLineChart(slide, rows, { x, y, w, h, unit }) {
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  const points = rows.map((row, index) => {
    const px = x + (rows.length <= 1 ? w / 2 : (index / (rows.length - 1)) * w);
    const py = y + h - 0.38 - (Number(row.value || 0) / max) * (h - 0.62);
    return { ...row, x: px, y: py };
  });
  for (let index = 0; index < points.length - 1; index += 1) {
    slide.addShape("line", { x: points[index].x, y: points[index].y, w: points[index + 1].x - points[index].x, h: points[index + 1].y - points[index].y, line: { color: "6F52C7", pt: 2 } });
  }
  points.forEach((point, index) => {
    slide.addShape("ellipse", { x: point.x - 0.065, y: point.y - 0.065, w: 0.13, h: 0.13, fill: { color: "6F52C7" }, line: { color: "6F52C7" } });
    slide.addText(point.name, { x: point.x - 0.25, y: y + h - 0.28, w: 0.5, h: 0.16, fontSize: 8.3, color: "6F758B", align: "center", margin: 0, rotate: points.length > 8 ? 45 : 0 });
    if (index === points.length - 1 || index === 0 || point.value === max) {
      slide.addText(formatNumber(point.value), { x: point.x - 0.28, y: point.y - 0.24, w: 0.56, h: 0.14, fontSize: 8, color: "17142A", align: "center", margin: 0, fit: "shrink" });
    }
  });
  slide.addText(unit || "หน่วย", { x, y: y - 0.04, w, h: 0.15, fontSize: 8.5, color: "6F758B", align: "right", margin: 0 });
}

function addNativeEditableChart(slide, pptx, rows, { x, y, w, h, unit, chartType }) {
  if (typeof slide.addChart !== "function") return false;
  const labels = rows.map((row) => String(row.name || "—"));
  const values = rows.map((row) => Number(row.value || 0));
  if (!labels.length || values.every((value) => value === 0)) return false;
  const chartTypes = pptx?.ChartType || {};
  const type = chartType === "line" ? (chartTypes.line || "line") : (chartTypes.bar || "bar");
  const chartData = [{ name: unit || "จำนวน", labels, values }];
  try {
    slide.addChart(type, chartData, {
      x, y, w, h,
      showLegend: false,
      showTitle: false,
      showValue: chartType !== "line",
      valAxisTitle: unit || "หน่วย",
      valAxisTitleFontFace: "Aptos",
      valAxisTitleFontSize: 11,
      dataLabelFontFace: "Aptos",
      dataLabelFontSize: 10,
      catAxisLabelFontFace: "Aptos",
      catAxisLabelFontSize: rows.length > 8 ? 9 : 11,
      valAxisLabelFontFace: "Aptos",
      valAxisLabelFontSize: 10.5,
      valAxisMinVal: 0,
      valAxisMajorGridLines: true,
      showCatName: true,
      showLeaderLines: true,
      lineSize: 3,
      roundedCorners: true
    });
    slide.addText("กราฟนี้เป็น PowerPoint chart object สามารถแก้ข้อมูล/รูปแบบต่อใน PowerPoint ได้", { x, y: y + h + 0.1, w, h: 0.16, fontSize: 8.5, color: "6F758B", align: "right", margin: 0 });
    return true;
  } catch (error) {
    console.warn("Native PowerPoint chart failed, falling back to shape chart", error);
    return false;
  }
}

function addTrendChart(slide, pptx, rows, options) {
  const useNative = options.chartMode !== "shape" && addNativeEditableChart(slide, pptx, rows, options);
  if (useNative) return "native";
  if (options.chartType === "line") addSimpleLineChart(slide, rows, options);
  else addSimpleBarChart(slide, rows, options);
  return "shape";
}

function addCategoryBreakdown(slide, data, x, y, w, h) {
  const total = Number(data?.kpis?.grandTotal || 0);
  const categories = [...(data?.categories || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)).slice(0, READABILITY.maxCategoriesPerBreakdown);
  categories.forEach((category, index) => {
    const cy = y + index * 0.43;
    const share = pct(category.total, total);
    slide.addText(category.name_th, { x, y: cy, w: w * 0.38, h: 0.18, fontSize: 10, color: "252A40", margin: 0, fit: "shrink" });
    slide.addShape("rect", { x: x + w * 0.4, y: cy + 0.04, w: w * 0.42, h: 0.1, fill: { color: "EEF0F8" }, line: { color: "EEF0F8", transparency: 100 } });
    slide.addShape("rect", { x: x + w * 0.4, y: cy + 0.04, w: (w * 0.42) * (share / 100), h: 0.1, fill: { color: "42AF8C" }, line: { color: "42AF8C", transparency: 100 } });
    slide.addText(`${formatNumber(category.total)} ${data.unit || ""} • ${formatNumber(share, 1)}%`, { x: x + w * 0.84, y: cy, w: w * 0.16, h: 0.18, fontSize: 8.8, color: "6F758B", align: "right", margin: 0, fit: "shrink" });
  });
  if (!categories.length) slide.addText("ไม่มีข้อมูลรายหมวด", { x, y, w, h: 0.3, fontSize: 10, color: "6F758B", margin: 0 });
}

function addBullets(slide, items, x, y, w, fontSize = 12, maxItems = READABILITY.maxBulletsPerSlide) {
  const text = readableBullets(items, maxItems).map((item) => ({ text: item, options: { bullet: { type: "ul" }, breakLine: true } }));
  slide.addText(text, { x, y, w, h: 2.55, fontSize, color: "252A40", margin: 0.04, breakLine: false, fit: "shrink" });
}


function addDataQualitySlide(pptx, report, context, page) {
  const slide = pptx.addSlide();
  slide.background = { color: "F7F7FB" };
  addTitle(slide, "Data Quality", "ความครบถ้วนของข้อมูลก่อนนำเสนอรายงาน");
  const quality = report.dataQuality;
  if (!quality || quality.skipped) {
    slide.addText(quality?.reason || "ไม่มีข้อมูล Data Quality สำหรับช่วงนี้", { x: 0.75, y: 1.45, w: 10.5, h: 0.35, fontSize: 16, color: "6F758B", margin: 0 });
    addFooter(slide, context, page);
    return page + 1;
  }
  addKpiCard(slide, { title: "ความครบถ้วน", value: `${formatNumber(quality.summary?.completeness_percent, 1)}%`, subtitle: quality.period?.status_label || "สถานะงวด" }, 0.65, 1.25, 2.7);
  addKpiCard(slide, { title: "ประเภทที่ตรวจ", value: formatNumber(quality.summary?.categories, 0), subtitle: "รายการ" }, 3.55, 1.25, 2.2);
  addKpiCard(slide, { title: "มีข้อมูลแล้ว", value: formatNumber(quality.summary?.filled_cells, 0), subtitle: "ช่องข้อมูล" }, 5.95, 1.25, 2.2);
  addKpiCard(slide, { title: "ยังขาด", value: formatNumber(quality.summary?.missing_cells, 0), subtitle: `${formatNumber(quality.summary?.issue_count, 0)} ประเด็น` }, 8.35, 1.25, 2.2);

  slide.addText("ความครบถ้วนรายประเภท", { x: 0.75, y: 2.55, w: 4, h: 0.24, fontSize: 16, bold: true, color: "17142A", margin: 0 });
  const cats = [...(quality.categories || [])].sort((a, b) => Number(a.completeness_percent || 0) - Number(b.completeness_percent || 0)).slice(0, 8);
  cats.forEach((item, index) => {
    const y = 2.95 + index * 0.35;
    slide.addText(item.name_th, { x: 0.75, y, w: 2.2, h: 0.16, fontSize: 9.5, color: "252A40", margin: 0, fit: "shrink" });
    slide.addShape("rect", { x: 3.08, y: y + 0.035, w: 3.2, h: 0.1, fill: { color: "E8EAF4" }, line: { color: "E8EAF4", transparency: 100 } });
    slide.addShape("rect", { x: 3.08, y: y + 0.035, w: 3.2 * Math.min(100, Number(item.completeness_percent || 0)) / 100, h: 0.1, fill: { color: Number(item.completeness_percent || 0) >= 95 ? "42AF8C" : "E49B4A" }, line: { color: "42AF8C", transparency: 100 } });
    slide.addText(`${formatNumber(item.completeness_percent, 1)}%`, { x: 6.45, y, w: 0.7, h: 0.16, fontSize: 8.5, color: "6F758B", align: "right", margin: 0 });
  });
  slide.addText("ประเด็นที่ควรตรวจ", { x: 7.55, y: 2.55, w: 4, h: 0.24, fontSize: 16, bold: true, color: "17142A", margin: 0 });
  const issues = (quality.issues || []).slice(0, 6).map((issue) => issue.code === "MISSING_DAILY_DATA" ? `${issue.category_name}: ยังไม่มีข้อมูล ${formatNumber(issue.count, 0)} วัน` : issue.message);
  addBullets(slide, issues.length ? issues : ["ไม่พบประเด็นที่ต้องแก้ไขในช่วงวันที่ตรวจสอบ"], 7.58, 2.95, 4.8, 9);
  addFooter(slide, context, page);
  return page + 1;
}

export async function exportReportBuilderPowerPoint(report, context) {
  const module = await import("pptxgenjs");
  const PptxGenJS = module.default || module;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = context.organizationName;
  pptx.subject = context.title;
  pptx.title = context.title;
  pptx.company = context.organizationName;
  pptx.lang = "th-TH";
  pptx.theme = { headFontFace: "Aptos Display", bodyFontFace: "Aptos", lang: "th-TH" };
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

  const theme = getReportTheme(context.theme || "executive_dark");
  const metadata = { slideCount: 0, nativeCharts: 0, shapeCharts: 0, chartMode: context.chartMode || "native", chartType: context.chartType || "bar", theme: theme.id };

  let page = 1;
  const cover = pptx.addSlide();
  cover.background = { color: theme.primary };
  cover.addShape("rect", { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: theme.primary }, line: { color: theme.primary } });
  cover.addText(context.organizationName, { x: 0.65, y: 0.55, w: 5.2, h: 0.28, fontSize: 12, bold: true, color: "FFFFFF", margin: 0, charSpace: 1.2 });
  cover.addText(context.title, { x: 0.65, y: 1.55, w: 9.6, h: 1.15, fontSize: 42, bold: true, color: "FFFFFF", margin: 0, fit: "shrink" });
  cover.addText(`ช่วงรายงาน: ${context.periodLabel}`, { x: 0.68, y: 2.85, w: 5.8, h: 0.3, fontSize: 17, color: "EEE8FF", margin: 0 });
  cover.addText(`ข้อมูลที่เลือก: ${report.modules.map((item) => item.moduleInfo.label + (item.selectedCodes?.length ? ` (${item.selectedCodes.length} หมวดย่อย)` : "")).join(" • ")}`, { x: 0.68, y: 3.25, w: 8.8, h: 0.3, fontSize: 13, color: "D5CEEA", margin: 0, fit: "shrink" });
  cover.addShape("roundRect", { x: 0.68, y: 5.75, w: 4.1, h: 0.56, rectRadius: 0.05, fill: { color: "FFFFFF", transparency: 8 }, line: { color: "FFFFFF", transparency: 100 } });
  cover.addText(`สร้างเมื่อ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`, { x: 0.9, y: 5.93, w: 3.55, h: 0.18, fontSize: 10.5, color: "FFFFFF", margin: 0 });
  cover.addText(String(page++), { x: 12.25, y: 7.1, w: 0.5, h: 0.18, fontSize: 7.5, color: "BEB6D9", align: "right", margin: 0 });

  const summary = pptx.addSlide();
  summary.background = { color: "F7F7FB" };
  addTitle(summary, "Executive Summary", "สรุปภาพรวมจากข้อมูลที่เลือก พร้อมแนวโน้มเปรียบเทียบช่วงก่อนหน้า");
  report.summary.totals.slice(0, 4).forEach((item, index) => {
    addKpiCard(summary, { title: item.label, value: `${formatNumber(item.total)} ${item.unit}`, subtitle: item.percentText }, 0.55 + index * 3.05, 1.25, 2.75);
  });
  summary.addText("ประเด็นสำคัญ", { x: 0.55, y: 2.55, w: 4.2, h: 0.24, fontSize: 17, bold: true, color: "17142A", margin: 0 });
  addBullets(summary, report.summary.insights, 0.58, 2.92, 5.55, 10);
  summary.addText("ภาพรวมแต่ละหมวด", { x: 6.55, y: 2.55, w: 4.2, h: 0.24, fontSize: 17, bold: true, color: "17142A", margin: 0 });
  const max = Math.max(...report.summary.totals.map((item) => item.total), 1);
  report.summary.totals.slice(0, 7).forEach((item, index) => {
    const y = 2.95 + index * 0.38;
    summary.addText(item.label, { x: 6.55, y, w: 1.75, h: 0.16, fontSize: 9.5, color: "252A40", margin: 0, fit: "shrink" });
    summary.addShape("rect", { x: 8.35, y: y + 0.03, w: 2.75, h: 0.12, fill: { color: "E8EAF4" }, line: { color: "E8EAF4", transparency: 100 } });
    summary.addShape("rect", { x: 8.35, y: y + 0.03, w: 2.75 * (item.total / max), h: 0.12, fill: { color: "6F52C7" }, line: { color: "6F52C7", transparency: 100 } });
    summary.addText(`${formatNumber(item.total)} ${item.unit}`, { x: 11.25, y, w: 1.05, h: 0.16, fontSize: 8.5, color: "6F758B", align: "right", margin: 0, fit: "shrink" });
  });
  addFooter(summary, context, page++);

  if (context.includeDataQuality) page = addDataQualitySlide(pptx, report, context, page);

  for (const item of report.modules) {
    const chartSlide = pptx.addSlide();
    chartSlide.background = { color: "F7F7FB" };
    addTitle(chartSlide, `${item.moduleInfo.label} — กราฟและ KPI`, `${context.periodLabel} • ${item.data.unit || "หน่วย"}`);
    addKpiCard(chartSlide, { title: "ยอดรวม", value: `${formatNumber(item.data.kpis.grandTotal)} ${item.data.unit || ""}`, subtitle: item.analysis.percentText }, 0.55, 1.18, 2.55);
    addKpiCard(chartSlide, { title: "ค่าเฉลี่ย", value: `${formatNumber(item.data.kpis.average)} ${item.data.unit || ""}`, subtitle: "ค่าเฉลี่ยต่อช่วง" }, 3.28, 1.18, 2.55);
    addKpiCard(chartSlide, { title: "ค่าสูงสุด", value: `${formatNumber(item.data.kpis.maximum)} ${item.data.unit || ""}`, subtitle: item.data.kpis.maximumPeriod ? thaiMonthLabel(item.data.kpis.maximumPeriod) : "—" }, 6.01, 1.18, 2.55);
    addKpiCard(chartSlide, { title: "หมวดสูงสุด", value: item.analysis.topCategory?.name_th || "—", subtitle: item.analysis.topCategory ? `${formatNumber(item.analysis.topShare, 1)}% ของทั้งหมด` : "ไม่มีข้อมูล" }, 8.74, 1.18, 3.0);
    const chartResult = addTrendChart(chartSlide, pptx, rowsForChart(item.data), { x: 0.55, y: 2.35, w: 8.15, h: 3.75, unit: item.data.unit, chartType: context.chartType, chartMode: context.chartMode });
    if (chartResult === "native") metadata.nativeCharts += 1;
    else metadata.shapeCharts += 1;
    chartSlide.addText("บทวิเคราะห์", { x: 9.0, y: 2.35, w: 2.7, h: 0.24, fontSize: 16, bold: true, color: "17142A", margin: 0 });
    addBullets(chartSlide, item.analysis.insights, 9.03, 2.8, 3.65, 11);
    addFooter(chartSlide, context, page++);

    if (context.includeCategoryBreakdown) {
      const breakdown = pptx.addSlide();
      breakdown.background = { color: "FFFFFF" };
      addTitle(breakdown, `${item.moduleInfo.label} — สัดส่วนรายหมวด`, "เรียงจากหมวดที่มีปริมาณ/มูลค่าสูงสุด");
      addCategoryBreakdown(breakdown, item.data, 0.8, 1.35, 11.7, 3.4);
      breakdown.addText("ข้อเสนอแนะ", { x: 0.8, y: 5.35, w: 3, h: 0.24, fontSize: 16, bold: true, color: "17142A", margin: 0 });
      addBullets(breakdown, item.analysis.recommendations, 0.82, 5.72, 11.2, 9.2);
      addFooter(breakdown, context, page++);
    }

    if (context.includeTables) {
      const categories = (item.data.categories || []).slice(0, 6);
      const headers = ["ช่วงเวลา", ...categories.map((category) => truncateText(category.name_th, 24)), "รวม"];
      const rowChunks = chunkRows(item.data.rows || [], READABILITY.maxTableRowsPerSlide);
      rowChunks.forEach((rowsChunk, chunkIndex) => {
        const tableSlide = pptx.addSlide();
        tableSlide.background = { color: "FFFFFF" };
        addTitle(
          tableSlide,
          `${item.moduleInfo.label} — ตารางข้อมูล${rowChunks.length > 1 ? ` (${chunkIndex + 1}/${rowChunks.length})` : ""}`,
          `แสดง ${rowsChunk.length} แถวต่อสไลด์ตาม Readability Rule เพื่อลดความแออัด`
        );
        const tableRows = rowsChunk.map((row) => [thaiMonthLabel(row.label), ...categories.map((category) => formatNumber(row.values[category.code])), formatNumber(row.total)]);
        tableSlide.addTable([headers, ...tableRows], { x: 0.55, y: 1.35, w: 12.2, h: 4.9, border: { type: "solid", color: "DDE0EC", pt: 1 }, fontSize: 10.5, color: "252A40", fill: "FFFFFF", rowH: 0.46, margin: 0.06, autoFit: false, colW: [1.55, ...categories.map(() => 1.65), 1.55] });
        addFooter(tableSlide, context, page++);
      });
    }
  }

  const reco = pptx.addSlide();
  reco.background = { color: "F7F7FB" };
  addTitle(reco, "ข้อเสนอแนะและการติดตามต่อ", "รวบรวมจากแนวโน้มและหมวดที่มีผลกระทบสูง");
  const recommendations = report.modules.flatMap((item) => item.analysis.recommendations.map((text) => `${item.moduleInfo.label}: ${text}`));
  addBullets(reco, recommendations, 0.75, 1.35, 11.8, 12);
  reco.addShape("roundRect", { x: 0.75, y: 5.85, w: 11.6, h: 0.68, rectRadius: 0.06, fill: { color: "EEE8FF" }, line: { color: "D9D0F5" } });
  reco.addText("หมายเหตุ: บทวิเคราะห์นี้สร้างจากข้อมูลในระบบอัตโนมัติ ควรตรวจทานกับบริบทหน้างานก่อนนำเสนอผู้บริหาร", { x: 1.0, y: 6.08, w: 11.05, h: 0.2, fontSize: 10, color: "6240BD", margin: 0 });
  addFooter(reco, context, page++);

  const fileName = reportFilename({ ...context, moduleLabel: `PowerPoint_Report_${safeName(context.periodLabel)}` }, "pptx");
  metadata.slideCount = Math.max(page - 1, 1);
  metadata.fileName = fileName;
  metadata.outline = buildReportSlideOutline(report, context);
  await pptx.writeFile({ fileName });
  return metadata;
}
