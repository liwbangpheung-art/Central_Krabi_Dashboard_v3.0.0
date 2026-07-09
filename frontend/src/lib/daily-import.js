import { bangkokTodayValue, getDaysInMonth, isFutureDate, quantityPolicyForModule } from "./daily-entry.js";

const DATE_HEADERS = new Set(["date", "entrydate", "วันที่", "วัน"]);
const QUANTITY_HEADERS = new Set(["quantity", "qty", "value", "amount", "weight", "จำนวน", "ปริมาณ", "น้ำหนัก"]);
const NOTE_HEADERS = new Set(["note", "remark", "หมายเหตุ"]);

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "result" in value) return cellText(value.result);
  if (typeof value === "object" && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  return String(value).trim();
}

function headerKey(value) {
  return cellText(value).toLowerCase().replace(/[\s_\-./()]/gu, "");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function normalizeImportedDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  const text = cellText(value);
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(text);
  if (match) return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;

  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u.exec(text);
  if (match) {
    let year = Number(match[3]);
    if (year >= 2400) year -= 543;
    return `${year}-${pad(match[2])}-${pad(match[1])}`;
  }
  return "";
}

function normalizeQuantity(value) {
  if (typeof value === "number") return value;
  const text = cellText(value).replace(/,/gu, "");
  return text === "" ? NaN : Number(text);
}

function validateImportedRow(row, { month, module, seen, today = bangkokTodayValue() }) {
  const rowNumber = row.rowNumber;
  const date = normalizeImportedDate(row.date);
  if (!date) throw Object.assign(new Error(`แถว ${rowNumber}: วันที่ไม่ถูกต้อง รองรับ YYYY-MM-DD หรือ DD/MM/YYYY`), { code: "IMPORT_DATE_INVALID", column: "วันที่", value: cellText(row.date) });
  if (!date.startsWith(`${month}-`)) throw Object.assign(new Error(`แถว ${rowNumber}: วันที่ ${date} ไม่อยู่ในเดือน ${month}`), { code: "IMPORT_DATE_OUT_OF_MONTH", column: "วันที่", value: date });
  const day = Number(date.slice(-2));
  const daysInMonth = getDaysInMonth(month);
  if (day < 1 || day > daysInMonth) throw Object.assign(new Error(`แถว ${rowNumber}: วันที่ไม่ถูกต้อง`), { code: "IMPORT_DATE_INVALID", column: "วันที่", value: date });
  if (isFutureDate(date, today)) throw Object.assign(new Error(`แถว ${rowNumber}: วันที่ ${date} เป็นวันที่ในอนาคต`), { code: "FUTURE_DATE_NOT_ALLOWED", column: "วันที่", value: date });
  if (seen.has(date)) throw Object.assign(new Error(`แถว ${rowNumber}: พบวันที่ ${date} ซ้ำ`), { code: "IMPORT_DATE_DUPLICATE", column: "วันที่", value: date });
  seen.add(date);

  const policy = quantityPolicyForModule(module);
  const quantity = normalizeQuantity(row.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) throw Object.assign(new Error(`แถว ${rowNumber}: จำนวนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`), { code: "IMPORT_QUANTITY_INVALID", column: "จำนวน", value: cellText(row.quantity) });
  if (policy.integer && !Number.isInteger(quantity)) throw Object.assign(new Error(`แถว ${rowNumber}: หมวดนี้รับเฉพาะจำนวนเต็มเท่านั้น`), { code: "IMPORT_INTEGER_REQUIRED", column: "จำนวน", value: cellText(row.quantity) });
  const decimalPart = cellText(row.quantity).replace(/,/gu, "").split(".")[1] || "";
  if (!policy.integer && decimalPart.length > 2) throw Object.assign(new Error(`แถว ${rowNumber}: ข้อมูลน้ำหนักมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง`), { code: "IMPORT_DECIMAL_SCALE", column: "จำนวน", value: cellText(row.quantity) });
  const note = cellText(row.note);
  if (note.length > 500) throw Object.assign(new Error(`แถว ${rowNumber}: หมายเหตุต้องไม่เกิน 500 ตัวอักษร`), { code: "IMPORT_NOTE_TOO_LONG", column: "หมายเหตุ", value: note });
  return { entry_date: date, quantity, note: note || null };
}

export function inspectImportedDailyRows(rows, options) {
  const seen = new Set();
  const items = [];
  const errors = [];
  for (const row of rows) {
    try {
      items.push(validateImportedRow(row, { ...options, seen }));
    } catch (error) {
      errors.push({ rowNumber: row.rowNumber, column: error.column || null, value: error.value ?? null, code: error.code || "IMPORT_ROW_INVALID", message: error.message });
    }
  }
  return { items: items.sort((a, b) => a.entry_date.localeCompare(b.entry_date)), errors, totalRows: rows.length, validRows: items.length, errorRows: errors.length };
}

export function normalizeImportedDailyRows(rows, options) {
  const result = inspectImportedDailyRows(rows, options);
  if (result.errors.length) throw new Error(result.errors[0].message);
  return result.items;
}

function findColumns(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount || 10); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = {};
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const key = headerKey(cell.value);
      if (DATE_HEADERS.has(key)) columns.date = columnNumber;
      if (QUANTITY_HEADERS.has(key)) columns.quantity = columnNumber;
      if (NOTE_HEADERS.has(key)) columns.note = columnNumber;
    });
    if (columns.date && columns.quantity) return { headerRow: rowNumber, ...columns };
  }
  throw new Error("ไม่พบหัวคอลัมน์ วันที่ และ จำนวน/ปริมาณ ใน 10 แถวแรกของ Excel");
}


function parseCsvText(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function findCsvColumns(headerRow) {
  const columns = {};
  headerRow.forEach((header, index) => {
    const key = headerKey(header);
    if (DATE_HEADERS.has(key) || key === "entrydate") columns.date = index;
    if (QUANTITY_HEADERS.has(key)) columns.quantity = index;
    if (NOTE_HEADERS.has(key)) columns.note = index;
  });
  if (columns.date === undefined || columns.quantity === undefined) {
    throw new Error("ไม่พบหัวคอลัมน์ entry_date/date/วันที่ และ quantity/จำนวน/ปริมาณ ในไฟล์ CSV");
  }
  return columns;
}

function csvCell(row, index) {
  return index === undefined ? "" : row[index] ?? "";
}

export async function importDailyCsvPreview(file, options) {
  if (!file) throw new Error("กรุณาเลือกไฟล์ CSV");
  const text = await file.text();
  const parsedRows = parseCsvText(text.replace(/^\ufeff/u, ""));
  if (parsedRows.length < 2) throw new Error("ไฟล์ CSV ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว");

  const columns = findCsvColumns(parsedRows[0]);
  const rows = [];
  for (let index = 1; index < parsedRows.length; index += 1) {
    const row = parsedRows[index];
    const date = csvCell(row, columns.date);
    const quantity = csvCell(row, columns.quantity);
    const note = csvCell(row, columns.note);
    if (cellText(date) === "" && cellText(quantity) === "" && cellText(note) === "") continue;
    rows.push({ rowNumber: index + 1, date, quantity, note });
  }

  if (!rows.length) throw new Error("ไม่พบข้อมูลสำหรับ Import ในไฟล์ CSV");
  return { ...inspectImportedDailyRows(rows, options), sheetName: "CSV" };
}

export async function importDailyFilePreview(file, options) {
  const name = file?.name?.toLowerCase() || "";
  if (name.endsWith(".csv")) return importDailyCsvPreview(file, options);
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return importDailyExcelPreview(file, options);
  throw new Error("รองรับเฉพาะไฟล์ .xlsx, .xlsm และ .csv");
}

export async function importDailyExcelPreview(file, options) {
  if (!file) throw new Error("กรุณาเลือกไฟล์ Excel");
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("ไฟล์ Excel ไม่มี Worksheet");

  const columns = findColumns(worksheet);
  const rows = [];
  for (let rowNumber = columns.headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const date = row.getCell(columns.date).value;
    const quantity = row.getCell(columns.quantity).value;
    const note = columns.note ? row.getCell(columns.note).value : "";
    if (cellText(date) === "" && cellText(quantity) === "" && cellText(note) === "") continue;
    rows.push({ rowNumber, date, quantity, note });
  }
  if (!rows.length) throw new Error("ไม่พบข้อมูลสำหรับ Import ใน Worksheet แรก");
  return { ...inspectImportedDailyRows(rows, options), sheetName: worksheet.name || "Sheet1" };
}

export async function importDailyExcel(file, options) {
  const result = await importDailyExcelPreview(file, options);
  if (result.errors.length) throw new Error(result.errors[0].message);
  return result.items;
}


export async function importDailyFile(file, options) {
  const result = await importDailyFilePreview(file, options);
  if (result.errors.length) throw new Error(result.errors[0].message);
  return result.items;
}
