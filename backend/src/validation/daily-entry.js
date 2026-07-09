import { HttpError } from "../http/errors.js";
import { assertNotFutureDate } from "../domain/data-governance.js";

export const DAILY_MODULES = Object.freeze([
  "waste",
  "tissue",
  "animal_feed",
  "garbage_bag",
  "consumable"
]);

export const INTEGER_DAILY_MODULES = Object.freeze(["tissue", "garbage_bag", "consumable"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_MONTH = /^\d{4}-\d{2}$/u;

function invalid(message, details) {
  throw new HttpError(400, "VALIDATION_ERROR", message, details);
}

function decimalPlaces(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized.includes("e")) {
    const number = Number(normalized);
    if (!Number.isFinite(number)) return Infinity;
    const fixed = number.toFixed(12).replace(/0+$/u, "").replace(/\.$/u, "");
    return fixed.split(".")[1]?.length ?? 0;
  }
  return normalized.split(".")[1]?.length ?? 0;
}

function normalizeMonth(value) {
  const month = typeof value === "string" ? value.trim() : "";
  if (!ISO_MONTH.test(month)) invalid("เดือนต้องอยู่ในรูปแบบ YYYY-MM", { field: "month" });
  const [year, monthNumber] = month.split("-").map(Number);
  if (year < 2000 || year > 2200 || monthNumber < 1 || monthNumber > 12) {
    invalid("เดือนไม่ถูกต้อง", { field: "month" });
  }
  return month;
}

export function quantityPolicyForModule(module) {
  const normalized = validateDailyModule(module);
  const integer = INTEGER_DAILY_MODULES.includes(normalized);
  return Object.freeze({
    module: normalized,
    integer,
    maximumFractionDigits: integer ? 0 : 2,
    step: integer ? 1 : 0.01
  });
}

export function validateDailyQuantities(entries, module) {
  const policy = quantityPolicyForModule(module);
  entries.forEach((entry, index) => {
    const places = decimalPlaces(entry.quantity);
    if (policy.integer && !Number.isInteger(Number(entry.quantity))) {
      invalid("หมวดนี้รับเฉพาะจำนวนเต็มเท่านั้น", { field: `entries[${index}].quantity`, module: policy.module });
    }
    if (!policy.integer && places > policy.maximumFractionDigits) {
      invalid("ข้อมูลน้ำหนักมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง", { field: `entries[${index}].quantity`, module: policy.module });
    }
  });
  return entries;
}

export function monthRange(value) {
  const month = normalizeMonth(value);
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    month,
    start: `${month}-01`,
    end: `${month}-${String(daysInMonth).padStart(2, "0")}`,
    daysInMonth
  };
}

export function validateDailyModule(value) {
  const module = typeof value === "string" ? value.trim() : "";
  if (!DAILY_MODULES.includes(module)) {
    invalid("หมวดข้อมูลรายวันไม่ถูกต้อง", { field: "module", allowed: DAILY_MODULES });
  }
  return module;
}

export function validateDailyQuery(input = {}) {
  const categoryId = typeof input.categoryId === "string" ? input.categoryId.trim() : "";
  if (!categoryId) invalid("กรุณาระบุประเภทข้อมูล", { field: "categoryId" });
  return { categoryId, ...monthRange(input.month) };
}

export function validateDailyMonthInput(input) {
  const body = input && typeof input === "object" ? input : {};
  const query = validateDailyQuery({ categoryId: body.categoryId, month: body.month });
  if (!Array.isArray(body.entries)) invalid("entries ต้องเป็น Array", { field: "entries" });
  if (body.entries.length > query.daysInMonth) {
    invalid("จำนวนรายการเกินจำนวนวันในเดือน", { field: "entries", daysInMonth: query.daysInMonth });
  }

  const seenDates = new Set();
  const entries = body.entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") invalid("รูปแบบรายการรายวันไม่ถูกต้อง", { field: `entries[${index}]` });
    const date = typeof entry.date === "string" ? entry.date.trim() : "";
    if (!ISO_DATE.test(date)) invalid("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD", { field: `entries[${index}].date` });
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      invalid("วันที่ไม่ถูกต้อง", { field: `entries[${index}].date` });
    }
    if (date < query.start || date > query.end) {
      invalid("วันที่ไม่อยู่ในเดือนที่เลือก", { field: `entries[${index}].date`, date, month: query.month });
    }
    assertNotFutureDate(date, { field: `entries[${index}].date` });
    if (seenDates.has(date)) invalid("พบวันที่ซ้ำในข้อมูล", { field: `entries[${index}].date`, date });
    seenDates.add(date);

    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      invalid("จำนวนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป", { field: `entries[${index}].quantity` });
    }
    if (quantity > 999_999_999_999) {
      invalid("จำนวนมีค่ามากเกินไป", { field: `entries[${index}].quantity` });
    }
    if (decimalPlaces(entry.quantity) > 4) {
      invalid("จำนวนมีทศนิยมได้ไม่เกิน 4 ตำแหน่งก่อนตรวจตามหมวด", { field: `entries[${index}].quantity` });
    }

    const note = typeof entry.note === "string" ? entry.note.trim() : "";
    if (note.length > 500) invalid("หมายเหตุต้องไม่เกิน 500 ตัวอักษร", { field: `entries[${index}].note` });
    return { date, quantity, note: note || null };
  });

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { ...query, entries };
}
