import { HttpError } from "../http/errors.js";
import { monthRange } from "./daily-entry.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function invalid(message, details) {
  throw new HttpError(400, "VALIDATION_ERROR", message, details);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value) {
  const normalized = text(value);
  return normalized || null;
}

function validDate(value, field) {
  const date = text(value);
  if (!ISO_DATE.test(date)) invalid("วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD", { field });
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    invalid("วันที่ไม่ถูกต้อง", { field });
  }
  return date;
}

function numberValue(value, { field, label, min = 0, max = 999_999_999_999, decimals = 4, positive = false }) {
  const number = Number(value);
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < min) || number > max) {
    invalid(`${label}${positive ? "ต้องมากกว่า 0" : "ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป"}`, { field });
  }
  const decimalPart = String(value).split(".")[1] || "";
  if (decimalPart.length > decimals) invalid(`${label}มีทศนิยมได้ไม่เกิน ${decimals} ตำแหน่ง`, { field });
  return Number(number.toFixed(decimals));
}

export function validateScrapSalesQuery(input = {}) {
  return monthRange(input.month);
}

export function validatePriceResolutionQuery(input = {}) {
  const categoryId = text(input.categoryId);
  if (!categoryId) invalid("กรุณาเลือกประเภทเศษวัสดุ", { field: "categoryId" });
  return { categoryId, onDate: validDate(input.date, "date") };
}

export function validateScrapSaleInput(input, { partial = false } = {}) {
  const body = input && typeof input === "object" ? input : {};
  const output = {};

  if (!partial || Object.hasOwn(body, "saleDate")) {
    output.sale_date = validDate(body.saleDate, "saleDate");
  }

  if (!partial || Object.hasOwn(body, "categoryId")) {
    const categoryId = text(body.categoryId);
    if (!categoryId) invalid("กรุณาเลือกประเภทเศษวัสดุ", { field: "categoryId" });
    output.category_id = categoryId;
  }

  if (!partial || Object.hasOwn(body, "weightKg")) {
    output.weight_kg = numberValue(body.weightKg, {
      field: "weightKg", label: "น้ำหนัก", positive: true, decimals: 2
    });
  }

  if (Object.hasOwn(body, "pricePerKg")) {
    if (body.pricePerKg === "" || body.pricePerKg === null || body.pricePerKg === undefined) {
      output.price_per_kg = null;
    } else {
      output.price_per_kg = numberValue(body.pricePerKg, {
        field: "pricePerKg", label: "ราคาต่อกิโลกรัม", min: 0, max: 9_999_999_999, decimals: 2
      });
    }
  } else if (!partial) {
    output.price_per_kg = null;
  }

  if (!partial || Object.hasOwn(body, "note")) {
    const note = optionalText(body.note);
    if (note && note.length > 500) invalid("หมายเหตุต้องไม่เกิน 500 ตัวอักษร", { field: "note" });
    output.note = note;
  }

  if (partial && Object.keys(output).length === 0) invalid("ไม่มีข้อมูลรายการขายที่ต้องการแก้ไข");
  return output;
}
