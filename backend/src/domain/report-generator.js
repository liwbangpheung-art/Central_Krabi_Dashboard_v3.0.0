const READABILITY_RULES = {
  maxTableRowsPerSlide: 8,
  maxCategoriesPerBreakdown: 7,
  maxBulletsPerSlide: 5,
  maxBulletChars: 128
};

function truncateReportText(value, max = READABILITY_RULES.maxBulletChars) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}…` : text;
}

function readableReportBullets(items, maxItems = READABILITY_RULES.maxBulletsPerSlide) {
  const bullets = (items || []).map((item) => truncateReportText(item)).filter(Boolean).slice(0, maxItems);
  return bullets.length ? bullets : ["ยังไม่มีบทวิเคราะห์"];
}

function chunkReportRows(rows, size = READABILITY_RULES.maxTableRowsPerSlide) {
  const list = Array.isArray(rows) ? rows : [];
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

// Backend generator readability guard:
// - table > 8 rows should be split
// - category breakdown should show top 7 first
// - long bullets should be shortened before rendering
// These helpers are intentionally kept close to the frontend report-builder rules.

import crypto from "node:crypto";
import PptxGenJS from "pptxgenjs";
import { buildAnalytics, calculateComparison } from "./analytics.js";
import { validateAnalyticsQuery, ANALYTICS_MODULES } from "../validation/analytics.js";
import { HttpError } from "../http/errors.js";

const CATEGORY_FIELDS = "id,module,code,name_th,name_en,unit,color_hex,pattern,sort_order,active,metadata";
const MODULE_LABELS = {
  waste: "ขยะ",
  tissue: "ทิชชู่",
  animal_feed: "อาหารสัตว์",
  garbage_bag: "ถุงขยะ",
  consumable: "วัสดุสิ้นเปลือง",
  scrap_sales: "ขายเศษวัสดุ"
};

const REPORT_THEMES = {
  executive_dark: { id: "executive_dark", primary: "17142A", accent: "6F52C7", surface: "F7F7FB" },
  clean_government: { id: "clean_government", primary: "1E3A5F", accent: "2F80ED", surface: "F6FAFF" },
  eco_green: { id: "eco_green", primary: "12332E", accent: "42AF8C", surface: "F1FAF7" },
  minimal_white: { id: "minimal_white", primary: "17142A", accent: "64748B", surface: "FFFFFF" }
};

function reportTheme(themeId = "executive_dark") {
  return REPORT_THEMES[themeId] || REPORT_THEMES.executive_dark;
}

function slideId(type, moduleId = "global", index = 0) {
  return `${type}:${moduleId}:${index}`;
}

function applyServerOutlineOverrides(outline, overrides = {}) {
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

function buildServerSlideOutline(dataset) {
  const settings = dataset.settings || {};
  const include = new Set(settings.includeSections || []);
  const slides = [];
  let rawIndex = 0;
  slides.push({ id: slideId("cover", "global", rawIndex++), type: "cover", title: "Cover", description: "หน้าปกรายงาน", layout: "analysis_focus", locked: true });
  slides.push({ id: slideId("summary", "global", rawIndex++), type: "summary", title: "Executive Summary", description: "สรุป KPI และประเด็นสำคัญ", layout: "kpi_chart_analysis", locked: true });
  if (include.has("data_quality")) slides.push({ id: slideId("data_quality", "global", rawIndex++), type: "data_quality", title: "Data Quality", description: "สถานะความครบถ้วนของข้อมูล", layout: "quality_focus" });
  for (const item of dataset.modules || []) {
    slides.push({ id: slideId("module_chart", item.moduleId, rawIndex++), type: "module_chart", module: item.moduleId, title: `${item.label} — กราฟและบทวิเคราะห์`, description: "KPI กราฟ และบทวิเคราะห์", layout: "kpi_chart_analysis" });
    if (include.has("category_breakdown")) slides.push({ id: slideId("category_breakdown", item.moduleId, rawIndex++), type: "category_breakdown", module: item.moduleId, title: `${item.label} — หมวดสูงสุด`, description: "Top categories", layout: "analysis_focus" });
    if (include.has("data_table")) {
      chunkReportRows(item.data?.rows || []).forEach((chunk, index) => {
        slides.push({ id: slideId("data_table", item.moduleId, rawIndex++), type: "data_table", module: item.moduleId, chunkIndex: index, title: `${item.label} — ตารางข้อมูล${index ? ` (${index + 1})` : ""}`, description: `ตาราง ${chunk.length} แถว`, layout: "table_focus" });
      });
    }
  }
  slides.push({ id: slideId("recommendations", "global", rawIndex++), type: "recommendations", title: "ข้อเสนอแนะรวม", description: "ประเด็นที่ควรติดตามรอบถัดไป", layout: "analysis_focus", locked: true });
  return applyServerOutlineOverrides(slides, settings.slideOutlineOverrides || {});
}

function outlineHas(outline, type, moduleId = null) {
  return outline.some((slide) => slide.type === type && (moduleId === null || slide.module === moduleId));
}

function outlineTitle(outline, type, moduleId = null, fallback = "") {
  return outline.find((slide) => slide.type === type && (moduleId === null || slide.module === moduleId))?.title || fallback;
}

function databaseFailure(error, message) {
  if (!error) return;
  throw new HttpError(500, "DATABASE_ERROR", message, { databaseMessage: error.message, databaseCode: error.code });
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: digits }).format(Number(value || 0));
}

function monthThai(label) {
  const [year, month] = String(label || "").split("-");
  if (!year || !month) return String(label || "-");
  return new Intl.DateTimeFormat("th-TH", { month: "short", year: "numeric" }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
}

function selectedCodesForModule(settings, moduleId) {
  const codes = settings.categorySelection?.[moduleId];
  return Array.isArray(codes) ? codes.filter(Boolean) : [];
}

function filterAnalyticsByCategoryCodes(data, selectedCodes) {
  if (!selectedCodes.length) return data;
  const allowed = new Set(selectedCodes);
  const categories = (data.categories || []).filter((item) => allowed.has(item.code));
  const rows = (data.rows || []).map((row) => {
    const values = {};
    for (const category of categories) values[category.code] = Number(row.values?.[category.code] || 0);
    const total = round(Object.values(values).reduce((sum, value) => sum + value, 0), 4);
    return { ...row, values, total };
  });
  const grandTotal = round(rows.reduce((sum, row) => sum + Number(row.total || 0), 0), 4);
  const populated = rows.filter((row) => row.total !== 0);
  const maxRow = rows.reduce((best, row) => (!best || Number(row.total || 0) > Number(best.total || 0) ? row : best), null);
  return {
    ...data,
    categories: categories.map((category) => ({ ...category, total: round(rows.reduce((sum, row) => sum + Number(row.values?.[category.code] || 0), 0), 4) })),
    rows,
    kpis: {
      ...data.kpis,
      grandTotal,
      average: populated.length ? round(grandTotal / populated.length, 4) : 0,
      maximum: Number(maxRow?.total || 0),
      maximumPeriod: maxRow?.label || null
    }
  };
}

async function loadCategories(supabaseAdmin, module) {
  const categoryModule = module === "scrap_sales" ? "scrap_material" : module;
  const { data, error } = await supabaseAdmin
    .from("master_categories")
    .select(CATEGORY_FIELDS)
    .eq("module", categoryModule)
    .order("sort_order", { ascending: true })
    .order("name_th", { ascending: true });
  databaseFailure(error, "โหลดประเภทข้อมูลสำหรับรายงานไม่สำเร็จ");
  return data ?? [];
}

async function loadRecords(supabaseAdmin, query, categories, start, end) {
  if (query.module === "scrap_sales") {
    const field = query.metric === "weight" ? "weight_kg" : "amount";
    const { data, error } = await supabaseAdmin.from("scrap_sales")
      .select(`category_id,sale_date,${field}`)
      .gte("sale_date", start).lte("sale_date", end).order("sale_date", { ascending: true });
    databaseFailure(error, "โหลดข้อมูลขายเศษวัสดุสำหรับรายงานไม่สำเร็จ");
    return { records: data ?? [], valueField: field, dateField: "sale_date" };
  }
  const ids = categories.map((item) => item.id);
  if (!ids.length) return { records: [], valueField: "quantity", dateField: "entry_date" };
  const { data, error } = await supabaseAdmin.from("daily_entries")
    .select("category_id,entry_date,quantity")
    .in("category_id", ids).gte("entry_date", start).lte("entry_date", end).order("entry_date", { ascending: true });
  databaseFailure(error, "โหลดข้อมูลรายวันสำหรับรายงานไม่สำเร็จ");
  return { records: data ?? [], valueField: "quantity", dateField: "entry_date" };
}

async function loadAnalyticsForModule(supabaseAdmin, settings, moduleId) {
  const query = validateAnalyticsQuery({
    module: moduleId,
    view: settings.view,
    year: settings.year,
    month: settings.month,
    quarter: settings.quarter,
    metric: moduleId === "scrap_sales" ? "amount" : "quantity"
  });
  const categories = await loadCategories(supabaseAdmin, query.module);
  const fullStart = query.comparison && query.comparison.start < query.start ? query.comparison.start : query.start;
  const fullEnd = query.comparison && query.comparison.end > query.end ? query.comparison.end : query.end;
  const loaded = await loadRecords(supabaseAdmin, query, categories, fullStart, fullEnd);
  const currentRecords = loaded.records.filter((item) => item[loaded.dateField] >= query.start && item[loaded.dateField] <= query.end);
  const analysis = buildAnalytics({ categories, records: currentRecords, query, valueField: loaded.valueField, dateField: loaded.dateField });
  const previousRecords = query.comparison
    ? loaded.records.filter((item) => item[loaded.dateField] >= query.comparison.start && item[loaded.dateField] <= query.comparison.end)
    : [];
  const previousTotal = previousRecords.reduce((sum, item) => sum + Number(item[loaded.valueField] || 0), 0);
  const data = {
    query,
    unit: query.module === "scrap_sales" ? (query.metric === "weight" ? "กก." : "บาท") : categories[0]?.unit || "หน่วย",
    ...analysis,
    comparison: calculateComparison(analysis.kpis.grandTotal, previousTotal)
  };
  return filterAnalyticsByCategoryCodes(data, selectedCodesForModule(settings, moduleId));
}

function analyzeModule(moduleId, data) {
  const label = MODULE_LABELS[moduleId] || moduleId;
  const total = Number(data?.kpis?.grandTotal || 0);
  const categories = [...(data?.categories || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  const top = categories[0] || null;
  const peak = (data?.rows || []).reduce((best, row) => (!best || Number(row.total || 0) > Number(best.total || 0) ? row : best), null);
  const percent = data?.comparison?.percent;
  const trend = Number(data?.comparison?.difference || 0) > 0 ? "เพิ่มขึ้น" : Number(data?.comparison?.difference || 0) < 0 ? "ลดลง" : "ทรงตัว";
  const insights = total === 0
    ? [`${label} ยังไม่มีข้อมูลในช่วงเวลานี้ ควรตรวจสอบการบันทึกหรือการนำเข้าไฟล์`]
    : [
      `${label} มียอดรวม ${formatNumber(total, 2)} ${data.unit || "หน่วย"} และแนวโน้ม${trend}${percent === null || percent === undefined ? "เมื่อไม่มีฐานเปรียบเทียบ" : ` ${formatNumber(Math.abs(percent), 1)}% เมื่อเทียบช่วงก่อนหน้า`}`,
      top ? `หมวดสูงสุดคือ ${top.name_th} รวม ${formatNumber(top.total, 2)} ${data.unit || "หน่วย"}` : "ยังไม่มีหมวดที่มีข้อมูลเด่นชัด",
      peak ? `ช่วงที่สูงสุดคือ ${monthThai(peak.label)} รวม ${formatNumber(peak.total, 2)} ${data.unit || "หน่วย"}` : "ยังไม่มีช่วงเวลาที่โดดเด่น"
    ];
  const recommendations = [];
  if (moduleId === "waste") recommendations.push("ติดตามสัดส่วน Recycle/RDF เพื่อลดขยะปลายทางและเพิ่มประสิทธิภาพการคัดแยก");
  else if (moduleId === "scrap_sales") recommendations.push("ติดตามประเภทวัสดุที่สร้างรายได้สูงสุดและทบทวนราคาขายเป็นรายเดือน");
  else recommendations.push(`ใช้ค่าเฉลี่ยของ ${label} เป็น baseline เพื่อควบคุมการเบิกและ stock`);
  if (Number(percent || 0) > 20) recommendations.push("ตรวจสอบสาเหตุการเพิ่มขึ้นมากกว่า 20% เช่น กิจกรรมพิเศษ จำนวนผู้ใช้บริการ หรือความคลาดเคลื่อนของข้อมูล");
  return { total, top, peak, insights, recommendations };
}

function addText(slide, text, opts) { slide.addText(String(text || ""), opts); }

function addHeader(slide, title, subtitle) {
  slide.addText(truncateReportText(title, 72), { x: 0.55, y: 0.32, w: 9.3, h: 0.38, fontSize: 21, bold: true, color: "17142A", margin: 0 });
  if (subtitle) slide.addText(subtitle, { x: 0.55, y: 0.78, w: 9.8, h: 0.22, fontSize: 9, color: "6F758B", margin: 0 });
}

function addFooter(slide, context, page) {
  slide.addText(`${context.organizationName} • ${context.periodLabel}`, { x: 0.55, y: 7.14, w: 6, h: 0.18, fontSize: 7, color: "7B8194", margin: 0 });
  slide.addText(String(page), { x: 12.05, y: 7.14, w: 0.5, h: 0.18, fontSize: 7, color: "7B8194", align: "right", margin: 0 });
}

function rowsForChart(data) { return (data?.rows || []).map((row) => ({ name: monthThai(row.label), value: Number(row.total || 0) })); }

function addChart(slide, pptx, rows, chartType) {
  const type = chartType === "line" ? pptx.ChartType.line : pptx.ChartType.bar;
  slide.addChart(type, [{ name: "ยอดรวม", labels: rows.map((r) => r.name), values: rows.map((r) => r.value) }], {
    x: 0.75, y: 1.58, w: 7.25, h: 3.05,
    showLegend: false,
    showValue: true,
    valAxisLabelFontSize: 8,
    catAxisLabelFontSize: 8,
    dataLabelPosition: "outEnd",
    showCatName: false,
    showValAxis: true,
    showCatAxis: true
  });
}

function addBulletList(slide, items, x, y, w, h, fontSize = 11) {
  const text = readableReportBullets(items).map((item) => `• ${item}`).join("\n");
  slide.addText(text || "• ยังไม่มีข้อมูล", { x, y, w, h, fontSize, color: "2B2F42", breakLine: false, fit: "shrink", valign: "top", margin: 0.05 });
}

function addTable(slide, data, rowChunk = null) {
  const categories = (data.categories || []).slice(0, 5);
  const sourceRows = rowChunk || (data.rows || []).slice(0, READABILITY_RULES.maxTableRowsPerSlide);
  const rows = sourceRows.map((row) => [monthThai(row.label), ...categories.map((c) => formatNumber(row.values?.[c.code] || 0, 1)), formatNumber(row.total || 0, 1)]);
  const table = [["ช่วงเวลา", ...categories.map((c) => truncateReportText(c.name_th, 24)), "รวม"], ...rows];
  slide.addTable(table, { x: 0.55, y: 1.25, w: 12.1, h: 5.45, border: { color: "DFE3EF", pt: 0.5 }, fontSize: 8.8, color: "2B2F42", fill: "FFFFFF", margin: 0.05, rowH: 0.45 });
}

export async function buildReportDataset({ supabaseAdmin, settings }) {
  const modules = Array.isArray(settings.modules) && settings.modules.length ? settings.modules : ["waste", "scrap_sales"];
  const validModules = modules.filter((moduleId) => ANALYTICS_MODULES.includes(moduleId));
  if (!validModules.length) throw new HttpError(400, "REPORT_MODULES_INVALID", "ต้องเลือกข้อมูลอย่างน้อย 1 หมวด");
  const results = [];
  for (const moduleId of validModules) {
    const data = await loadAnalyticsForModule(supabaseAdmin, settings, moduleId);
    results.push({ moduleId, label: MODULE_LABELS[moduleId] || moduleId, data, analysis: analyzeModule(moduleId, data) });
  }
  const periodLabel = settings.view === "yearly" ? String(settings.year)
    : settings.view === "quarterly" ? `${settings.year}-Q${settings.quarter}`
    : `${settings.year}-${String(settings.month).padStart(2, "0")}`;
  return { generatedAt: new Date().toISOString(), periodLabel, settings, modules: results };
}

export async function generatePowerPointBuffer({ dataset, context = {} }) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = context.organizationName || "Central Krabi";
  pptx.company = context.organizationName || "Central Krabi";
  pptx.subject = "Waste & Resource Management Report";
  pptx.title = context.title || "Enterprise PowerPoint Report";
  pptx.lang = "th-TH";
  pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: "th-TH" };

  const page = { n: 1 };
  const theme = reportTheme(dataset.settings?.theme || context.theme || "executive_dark");
  const outline = buildServerSlideOutline(dataset);
  const ctx = { organizationName: context.organizationName || "Central Krabi", periodLabel: dataset.periodLabel };
  const moduleById = new Map((dataset.modules || []).map((item) => [item.moduleId, item]));

  function renderCover(slideDef) {
    const slide = pptx.addSlide();
    slide.background = { color: theme.surface };
    slide.addText(slideDef.title === "Cover" ? (context.title || "Enterprise PowerPoint Report") : slideDef.title, { x: 0.65, y: 1.15, w: 9.8, h: 0.65, fontSize: 30, bold: true, color: theme.primary, margin: 0, fit: "shrink" });
    slide.addText(`รายงานการจัดการขยะและทรัพยากร • ${dataset.periodLabel}`, { x: 0.68, y: 1.92, w: 10.5, h: 0.32, fontSize: 15, color: "4D5470", margin: 0 });
    slide.addText(`${ctx.organizationName}\nสร้างเมื่อ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`, { x: 0.72, y: 5.55, w: 6.3, h: 0.6, fontSize: 11, color: "5C637B", margin: 0 });
    addFooter(slide, ctx, page.n++);
  }

  function renderSummary(slideDef) {
    const slide = pptx.addSlide();
    addHeader(slide, slideDef.title || "Executive Summary", `ภาพรวม ${dataset.periodLabel}`);
    dataset.modules.slice(0, 4).forEach((item, index) => {
      const x = 0.65 + index * 3.05;
      slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.35, w: 2.75, h: 1.05, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: "E3E5F0", pt: 1 } });
      slide.addText(item.label, { x: x + 0.15, y: 1.52, w: 2.45, h: 0.2, fontSize: 8, color: "697089", margin: 0 });
      slide.addText(`${formatNumber(item.analysis.total, 1)} ${item.data.unit || ""}`, { x: x + 0.15, y: 1.8, w: 2.45, h: 0.28, fontSize: 13, bold: true, color: "17142A", margin: 0, fit: "shrink" });
    });
    addBulletList(slide, dataset.modules.flatMap((item) => item.analysis.insights.slice(0, 1)), 0.72, 2.95, 11.35, 2.6, 12);
    addFooter(slide, ctx, page.n++);
  }

  function renderDataQuality(slideDef) {
    const slide = pptx.addSlide();
    addHeader(slide, slideDef.title || "Data Quality", "สถานะข้อมูลสำหรับรายงานนี้");
    const warnings = [];
    for (const item of dataset.modules) {
      if ((item.data?.rows || []).length > READABILITY_RULES.maxTableRowsPerSlide) warnings.push(`${item.label}: ตารางจะถูกแยกเป็น ${chunkReportRows(item.data.rows).length} สไลด์`);
      if ((item.data?.categories || []).length > READABILITY_RULES.maxCategoriesPerBreakdown) warnings.push(`${item.label}: มีหมวดย่อยเกิน ${READABILITY_RULES.maxCategoriesPerBreakdown} รายการ`);
      if ((item.analysis?.insights || []).some((text) => String(text || "").length > READABILITY_RULES.maxBulletChars)) warnings.push(`${item.label}: มี bullet ยาว ระบบจะย่อให้อ่านง่าย`);
    }
    addBulletList(slide, warnings.length ? warnings : ["ข้อมูลพร้อมสร้างรายงาน ไม่พบ warning ด้าน readability"], 0.85, 1.45, 11.3, 4.8, 13);
    addFooter(slide, ctx, page.n++);
  }

  function renderModuleChart(slideDef) {
    const item = moduleById.get(slideDef.module);
    if (!item) return;
    const slide = pptx.addSlide();
    addHeader(slide, slideDef.title || `${item.label} — กราฟและบทวิเคราะห์`, `${dataset.periodLabel} • ${item.data.unit || "หน่วย"} • ${slideDef.layout || "auto"}`);
    addChart(slide, pptx, rowsForChart(item.data), dataset.settings.chartType || "bar");
    addBulletList(slide, item.analysis.insights, 8.35, 1.48, 4.05, 2.45, 10.5);
    addBulletList(slide, item.analysis.recommendations, 8.35, 4.25, 4.05, 1.8, 10.5);
    addFooter(slide, ctx, page.n++);
  }

  function renderCategoryBreakdown(slideDef) {
    const item = moduleById.get(slideDef.module);
    if (!item) return;
    const slide = pptx.addSlide();
    addHeader(slide, slideDef.title || `${item.label} — หมวดสูงสุด`, `${dataset.periodLabel} • Top ${READABILITY_RULES.maxCategoriesPerBreakdown}`);
    const categories = [...(item.data?.categories || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)).slice(0, READABILITY_RULES.maxCategoriesPerBreakdown);
    const total = categories.reduce((sum, category) => sum + Number(category.total || 0), 0) || 1;
    categories.forEach((category, index) => {
      const y = 1.35 + index * 0.58;
      slide.addText(category.name_th, { x: 0.85, y, w: 2.6, h: 0.22, fontSize: 10, color: "252A40", margin: 0, fit: "shrink" });
      slide.addShape(pptx.ShapeType.rect, { x: 3.65, y: y + 0.04, w: 5.2, h: 0.16, fill: { color: "E9ECF5" }, line: { color: "E9ECF5", transparency: 100 } });
      slide.addShape(pptx.ShapeType.rect, { x: 3.65, y: y + 0.04, w: 5.2 * (Number(category.total || 0) / total), h: 0.16, fill: { color: theme.accent }, line: { color: theme.accent, transparency: 100 } });
      slide.addText(`${formatNumber(category.total, 1)} ${item.data.unit || ""}`, { x: 9.1, y, w: 2.5, h: 0.22, fontSize: 10, color: "6F758B", align: "right", margin: 0 });
    });
    addFooter(slide, ctx, page.n++);
  }

  function renderDataTable(slideDef) {
    const item = moduleById.get(slideDef.module);
    if (!item) return;
    const chunks = chunkReportRows(item.data?.rows || []);
    const chunk = chunks[slideDef.chunkIndex || 0] || chunks[0] || [];
    const slide = pptx.addSlide();
    addHeader(slide, slideDef.title || `${item.label} — ตารางข้อมูล`, `${dataset.periodLabel} • แสดง ${chunk.length} แถว`);
    addTable(slide, item.data, chunk);
    addFooter(slide, ctx, page.n++);
  }

  function renderRecommendations(slideDef) {
    const slide = pptx.addSlide();
    addHeader(slide, slideDef.title || "ข้อเสนอแนะรวม", "ประเด็นที่ควรติดตามรอบถัดไป");
    addBulletList(slide, dataset.modules.flatMap((item) => item.analysis.recommendations), 0.9, 1.45, 11.2, 4.7, 14);
    addFooter(slide, ctx, page.n++);
  }

  for (const slideDef of outline) {
    if (slideDef.type === "cover") renderCover(slideDef);
    else if (slideDef.type === "summary") renderSummary(slideDef);
    else if (slideDef.type === "data_quality") renderDataQuality(slideDef);
    else if (slideDef.type === "module_chart") renderModuleChart(slideDef);
    else if (slideDef.type === "category_breakdown") renderCategoryBreakdown(slideDef);
    else if (slideDef.type === "data_table") renderDataTable(slideDef);
    else if (slideDef.type === "recommendations") renderRecommendations(slideDef);
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return { buffer, metadata: { slideCount: page.n - 1, modules: dataset.modules.map((item) => item.moduleId), nativeCharts: dataset.modules.length, generatedAt: dataset.generatedAt, theme: theme.id, outline } };
}

export function reportFileName({ title = "Enterprise Report", periodLabel = "report" }) {
  const safe = String(`${title}_${periodLabel}`).replace(/[^a-zA-Z0-9ก-๙_-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 120) || "enterprise_report";
  return `${safe}.pptx`;
}

export function reportObjectPath({ userId, filename }) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${userId}/${crypto.randomUUID()}-${filename}`;
}

export function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

export const __reportGeneratorTest = { buildServerSlideOutline, applyServerOutlineOverrides, chunkReportRows, readableReportBullets, reportTheme };
