import { HttpError } from "../http/errors.js";

const VISIBILITIES = new Set(["private", "team"]);
const TEMPLATES = new Set(["executive", "operations", "data_quality"]);
const VIEWS = new Set(["monthly", "quarterly", "yearly", "month_over_month"]);
const MODULES = new Set(["waste", "tissue", "animal_feed", "garbage_bag", "consumable", "scrap_sales"]);
const CHART_TYPES = new Set(["bar", "line"]);
const SECTIONS = new Set(["cover", "executive_summary", "module_charts", "category_breakdown", "data_quality", "analysis", "data_table", "recommendations"]);

function asTrimmedString(value, field, { min = 0, max = 255 } = {}) {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) {
    throw new HttpError(400, `${field.toUpperCase()}_INVALID`, `${field} ต้องมีความยาว ${min}–${max} ตัวอักษร`);
  }
  return text;
}

function asInteger(value, field, { min, max }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new HttpError(400, `${field.toUpperCase()}_INVALID`, `${field} ไม่ถูกต้อง`);
  }
  return number;
}

function validateConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new HttpError(400, "PRESET_CONFIG_INVALID", "config ของ preset ต้องเป็น object");
  }
  const config = { ...rawConfig };
  const template = String(config.template ?? "executive").trim();
  if (!TEMPLATES.has(template)) throw new HttpError(400, "PRESET_TEMPLATE_INVALID", "Template รายงานไม่ถูกต้อง");

  const view = String(config.view ?? "monthly").trim();
  if (!VIEWS.has(view)) throw new HttpError(400, "PRESET_VIEW_INVALID", "มุมมองรายงานไม่ถูกต้อง");

  const modules = Array.isArray(config.modules) ? [...new Set(config.modules.map((item) => String(item).trim()).filter(Boolean))] : [];
  if (!modules.length || modules.some((item) => !MODULES.has(item))) {
    throw new HttpError(400, "PRESET_MODULES_INVALID", "Module ใน preset ไม่ถูกต้อง");
  }

  const includeSections = Array.isArray(config.includeSections) ? [...new Set(config.includeSections.map((item) => String(item).trim()).filter(Boolean))] : [];
  const safeSections = includeSections.length ? includeSections : ["cover", "executive_summary", "module_charts", "analysis", "recommendations"];
  if (safeSections.some((item) => !SECTIONS.has(item))) {
    throw new HttpError(400, "PRESET_SECTIONS_INVALID", "Section ใน preset ไม่ถูกต้อง");
  }
  for (const required of ["cover", "executive_summary", "module_charts", "analysis", "recommendations"]) {
    if (!safeSections.includes(required)) safeSections.push(required);
  }

  const chartType = String(config.chartType ?? "bar").trim();
  if (!CHART_TYPES.has(chartType)) throw new HttpError(400, "PRESET_CHART_TYPE_INVALID", "ชนิดกราฟไม่ถูกต้อง");

  const categorySelection = {};
  if (config.categorySelection && typeof config.categorySelection === "object" && !Array.isArray(config.categorySelection)) {
    for (const [moduleId, codes] of Object.entries(config.categorySelection)) {
      if (!MODULES.has(moduleId)) continue;
      if (!Array.isArray(codes)) continue;
      categorySelection[moduleId] = [...new Set(codes.map((code) => String(code).trim()).filter(Boolean))].slice(0, 80);
    }
  }

  return {
    template,
    view,
    year: asInteger(config.year ?? new Date().getFullYear(), "year", { min: 2000, max: 2100 }),
    month: asInteger(config.month ?? 1, "month", { min: 1, max: 12 }),
    quarter: asInteger(config.quarter ?? 1, "quarter", { min: 1, max: 4 }),
    modules,
    categorySelection,
    chartType,
    includeSections: safeSections,
    includeTables: Boolean(config.includeTables ?? safeSections.includes("data_table")),
    includeAnalysis: Boolean(config.includeAnalysis ?? safeSections.includes("analysis"))
  };
}

export function validateReportPresetInput(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "PRESET_BODY_INVALID", "ข้อมูล preset ไม่ถูกต้อง");
  }
  const payload = {};
  if (!partial || body.name !== undefined) payload.name = asTrimmedString(body.name, "name", { min: 1, max: 100 });
  if (!partial || body.description !== undefined) payload.description = asTrimmedString(body.description, "description", { min: 0, max: 500 });
  if (!partial || body.visibility !== undefined) {
    const visibility = String(body.visibility ?? "private").trim();
    if (!VISIBILITIES.has(visibility)) throw new HttpError(400, "PRESET_VISIBILITY_INVALID", "visibility ต้องเป็น private หรือ team");
    payload.visibility = visibility;
  }
  if (!partial || body.config !== undefined) payload.config = validateConfig(body.config);
  return payload;
}
