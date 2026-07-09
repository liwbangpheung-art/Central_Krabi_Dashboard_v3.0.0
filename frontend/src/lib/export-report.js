import { comparisonPercentText, formatNumber, thaiMonthLabel } from "./analytics.js";

function safeName(value) { return String(value || "report").replace(/[^a-zA-Z0-9ก-๙_-]+/gu, "_").replace(/^_+|_+$/gu, ""); }
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function reportFilename(context, extension) {
  return `${safeName(context.organizationName)}_${safeName(context.moduleLabel)}_${safeName(context.periodLabel)}.${extension}`;
}
export async function captureReport(element) {
  if (!element) throw new Error("ไม่พบพื้นที่ Preview สำหรับ Export");
  const { toPng } = await import("html-to-image");
  return toPng(element, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
}
export async function exportPng(element, context) {
  const dataUrl = await captureReport(element);
  const response = await fetch(dataUrl);
  downloadBlob(await response.blob(), reportFilename(context, "png"));
}
export async function exportPdf(element, context) {
  const dataUrl = await captureReport(element);
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(dataUrlToBytes(dataUrl));
  const pageWidth = 842;
  const pageHeight = Math.max(595, pageWidth * image.height / image.width);
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  const bytes = await pdf.save();
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), reportFilename(context, "pdf"));
}
export async function exportExcel(data, context) {
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = context.organizationName;
  workbook.created = new Date();
  const summary = workbook.addWorksheet("สรุป");
  summary.addRows([
    ["รายงาน", context.title], ["องค์กร", context.organizationName], ["หมวด", context.moduleLabel], ["ช่วงเวลา", context.periodLabel],
    ["ยอดรวม", data.kpis.grandTotal, data.unit], ["ค่าเฉลี่ย", data.kpis.average, data.unit], ["ค่าสูงสุด", data.kpis.maximum, data.unit],
    ["เปลี่ยนแปลง", comparisonPercentText(data?.comparison)]
  ]);
  summary.getColumn(1).width = 24; summary.getColumn(2).width = 32; summary.getColumn(3).width = 14;
  summary.getRow(1).font = { bold: true, size: 14 };

  const sheet = workbook.addWorksheet("ข้อมูลกราฟ");
  sheet.columns = [
    { header: "ช่วงเวลา", key: "period", width: 18 },
    ...data.categories.map((category) => ({ header: category.name_th, key: category.code, width: 20 })),
    { header: "รวม", key: "TOTAL", width: 20 }
  ];
  for (const row of data.rows) sheet.addRow({ period: thaiMonthLabel(row.label), ...row.values, TOTAL: row.total });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6F52C7" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), reportFilename(context, "xlsx"));
}
export async function exportPowerPoint(element, data, context) {
  const dataUrl = await captureReport(element);
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

  const slide = pptx.addSlide();
  slide.background = { color: "F7F7FB" };
  slide.addText(context.organizationName, { x: .45, y: .25, w: 4, h: .35, fontSize: 12, bold: true, color: "17142A", margin: 0 });
  slide.addText(context.title, { x: .45, y: .65, w: 8.8, h: .55, fontSize: 24, bold: true, color: "17142A", margin: 0 });
  slide.addText(`${context.moduleLabel} • ${context.periodLabel}`, { x: .45, y: 1.2, w: 5, h: .3, fontSize: 11, color: "6F758B", margin: 0 });
  slide.addImage({ data: dataUrl, x: .45, y: 1.65, w: 12.4, h: 5.15 });
  slide.addText(`สร้างเมื่อ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`, { x: 8.7, y: 7.15, w: 4.1, h: .25, fontSize: 8, color: "777C8F", align: "right", margin: 0 });

  const tableSlide = pptx.addSlide();
  tableSlide.addText(`${context.title} — ตารางข้อมูล`, { x: .45, y: .3, w: 10, h: .5, fontSize: 23, bold: true, color: "17142A", margin: 0 });
  const headers = ["ช่วงเวลา", ...data.categories.map((category) => category.name_th), "รวม"];
  const rows = data.rows.slice(0, 18).map((row) => [thaiMonthLabel(row.label), ...data.categories.map((category) => formatNumber(row.values[category.code])), formatNumber(row.total)]);
  tableSlide.addTable([headers, ...rows], { x: .45, y: 1.05, w: 12.35, h: 5.8, border: { type: "solid", color: "DDE0EC", pt: 1 }, fontSize: 10, color: "252A40", fill: "FFFFFF", rowH: .32, margin: .06, bold: false, autoFit: false, colW: [1.5, ...data.categories.map(() => 1.45), 1.45] });
  await pptx.writeFile({ fileName: reportFilename(context, "pptx") });
}
