import { HttpError } from "../http/errors.js";

const formats = ["xlsx", "pdf", "png", "pptx"];
const modules = ["waste", "tissue", "animal_feed", "garbage_bag", "consumable", "scrap_sales"];
const views = ["monthly", "quarterly", "yearly", "month_over_month"];

export function validateExportLogInput(input = {}) {
  const export_format = String(input.format || "").trim().toLowerCase();
  const module = String(input.module || "").trim();
  const view_mode = String(input.view || "").trim();
  const period_label = String(input.periodLabel || "").trim();
  const options = input.options && typeof input.options === "object" && !Array.isArray(input.options) ? input.options : {};
  if (!formats.includes(export_format)) throw new HttpError(400, "EXPORT_FORMAT_INVALID", "รูปแบบ Export ไม่ถูกต้อง");
  if (!modules.includes(module)) throw new HttpError(400, "EXPORT_MODULE_INVALID", "หมวดข้อมูล Export ไม่ถูกต้อง");
  if (!views.includes(view_mode)) throw new HttpError(400, "EXPORT_VIEW_INVALID", "มุมมอง Export ไม่ถูกต้อง");
  if (!period_label || period_label.length > 80) throw new HttpError(400, "EXPORT_PERIOD_INVALID", "ช่วงเวลาของรายงานไม่ถูกต้อง");
  return { export_format, module, view_mode, period_label, options };
}


export function validateReportRunInput(input = {}) {
  const report_type = String(input.reportType || "powerpoint_builder").trim();
  const title = String(input.title || "PowerPoint Report Builder").trim();
  const period_label = String(input.periodLabel || "").trim();
  const preset_id = input.presetId ? String(input.presetId).trim() : null;
  const export_log_id = input.exportLogId ? String(input.exportLogId).trim() : null;
  const config = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? input.config : {};
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};
  const status = String(input.status || "generated").trim();
  if (!["powerpoint_builder", "single_export"].includes(report_type)) throw new HttpError(400, "REPORT_RUN_TYPE_INVALID", "ประเภทรายงานไม่ถูกต้อง");
  if (!title || title.length > 140) throw new HttpError(400, "REPORT_RUN_TITLE_INVALID", "ชื่อรายงานไม่ถูกต้อง");
  if (!period_label || period_label.length > 80) throw new HttpError(400, "REPORT_RUN_PERIOD_INVALID", "ช่วงเวลารายงานไม่ถูกต้อง");
  if (!["generated", "failed"].includes(status)) throw new HttpError(400, "REPORT_RUN_STATUS_INVALID", "สถานะรายงานไม่ถูกต้อง");
  return { report_type, title, period_label, preset_id, export_log_id, config, metadata, status };
}


export function validateBackendPowerPointInput(input = {}) {
  const title = String(input.title || "Enterprise PowerPoint Report").trim();
  const preset_id = input.presetId ? String(input.presetId).trim() : null;
  const config = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? input.config : {};
  if (!title || title.length > 140) throw new HttpError(400, "REPORT_TITLE_INVALID", "ชื่อรายงานไม่ถูกต้อง");
  const selectedModules = Array.isArray(config.modules) ? config.modules.filter(Boolean) : [];
  if (!selectedModules.length) throw new HttpError(400, "REPORT_MODULES_REQUIRED", "ต้องเลือกข้อมูลสำหรับสร้างรายงานอย่างน้อย 1 หมวด");
  const invalidModule = selectedModules.find((module) => !modules.includes(module));
  if (invalidModule) throw new HttpError(400, "REPORT_MODULE_INVALID", `หมวดข้อมูลรายงานไม่ถูกต้อง: ${invalidModule}`);
  const view = String(config.view || "monthly").trim();
  if (!views.includes(view)) throw new HttpError(400, "REPORT_VIEW_INVALID", "มุมมองรายงานไม่ถูกต้อง");
  const year = Number(config.year || new Date().getUTCFullYear());
  const month = Number(config.month || new Date().getUTCMonth() + 1);
  const quarter = Number(config.quarter || Math.floor((month - 1) / 3) + 1);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new HttpError(400, "REPORT_YEAR_INVALID", "ปีรายงานไม่ถูกต้อง");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new HttpError(400, "REPORT_MONTH_INVALID", "เดือนรายงานไม่ถูกต้อง");
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new HttpError(400, "REPORT_QUARTER_INVALID", "ไตรมาสรายงานไม่ถูกต้อง");
  return {
    title,
    presetId: preset_id,
    config: {
      ...config,
      modules: selectedModules,
      view,
      year,
      month,
      quarter,
      chartType: ["bar", "line"].includes(config.chartType) ? config.chartType : "bar",
      includeSections: Array.isArray(config.includeSections) ? config.includeSections : ["cover", "executive_summary", "module_charts", "analysis", "recommendations"]
    }
  };
}
