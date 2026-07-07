import { HttpError } from "../http/errors.js";

export const MASTER_MODULES = Object.freeze([
  "waste",
  "tissue",
  "animal_feed",
  "garbage_bag",
  "consumable",
  "scrap_material"
]);

const PATTERNS = new Set(["solid", "diagonal", "dots", "crosshatch"]);
const HEX_COLOR = /^#[0-9A-F]{6}$/u;
const CODE = /^[A-Z0-9_]+$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value) {
  const normalized = text(value);
  return normalized || null;
}

function normalizeColor(value) {
  const normalized = text(value).toUpperCase();
  return normalized;
}

function invalid(message, details) {
  throw new HttpError(400, "VALIDATION_ERROR", message, details);
}

export function validateMasterCategoryInput(input, { partial = false } = {}) {
  const body = input && typeof input === "object" ? input : {};
  const output = {};

  if (!partial || Object.hasOwn(body, "module")) {
    const module = text(body.module);
    if (!MASTER_MODULES.includes(module)) invalid("หมวดข้อมูลไม่ถูกต้อง", { field: "module", allowed: MASTER_MODULES });
    output.module = module;
  }

  if (!partial || Object.hasOwn(body, "code")) {
    const code = text(body.code).toUpperCase().replaceAll(/\s+/gu, "_");
    if (!CODE.test(code)) invalid("รหัสประเภทใช้ได้เฉพาะ A-Z, 0-9 และ _", { field: "code" });
    output.code = code;
  }

  if (!partial || Object.hasOwn(body, "nameTh")) {
    const nameTh = text(body.nameTh);
    if (!nameTh || nameTh.length > 120) invalid("ชื่อภาษาไทยต้องมี 1–120 ตัวอักษร", { field: "nameTh" });
    output.name_th = nameTh;
  }

  if (!partial || Object.hasOwn(body, "nameEn")) {
    output.name_en = optionalText(body.nameEn);
  }

  if (!partial || Object.hasOwn(body, "unit")) {
    const unit = text(body.unit);
    if (!unit || unit.length > 40) invalid("หน่วยต้องมี 1–40 ตัวอักษร", { field: "unit" });
    output.unit = unit;
  }

  if (!partial || Object.hasOwn(body, "colorHex")) {
    const colorHex = normalizeColor(body.colorHex || "#8B5CF6");
    if (!HEX_COLOR.test(colorHex)) invalid("สีต้องอยู่ในรูปแบบ #RRGGBB", { field: "colorHex" });
    output.color_hex = colorHex;
  }

  if (!partial || Object.hasOwn(body, "pattern")) {
    const pattern = text(body.pattern || "solid");
    if (!PATTERNS.has(pattern)) invalid("รูปแบบลายกราฟไม่ถูกต้อง", { field: "pattern" });
    output.pattern = pattern;
  }

  if (!partial || Object.hasOwn(body, "sortOrder")) {
    const sortOrder = Number(body.sortOrder ?? 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
      invalid("ลำดับการแสดงผลต้องเป็นจำนวนเต็ม 0–9999", { field: "sortOrder" });
    }
    output.sort_order = sortOrder;
  }

  if (!partial || Object.hasOwn(body, "active")) {
    if (typeof body.active !== "boolean") invalid("สถานะ active ต้องเป็น true หรือ false", { field: "active" });
    output.active = body.active;
  }

  if (!partial || Object.hasOwn(body, "metadata")) {
    if (body.metadata !== undefined && (body.metadata === null || Array.isArray(body.metadata) || typeof body.metadata !== "object")) {
      invalid("metadata ต้องเป็น JSON object", { field: "metadata" });
    }
    output.metadata = body.metadata ?? {};
  }

  if (partial && Object.keys(output).length === 0) invalid("ไม่มีข้อมูลที่ต้องการแก้ไข");
  return output;
}

export function validateScrapPriceInput(input, { partial = false } = {}) {
  const body = input && typeof input === "object" ? input : {};
  const output = {};

  if (!partial || Object.hasOwn(body, "categoryId")) {
    const categoryId = text(body.categoryId);
    if (!categoryId) invalid("กรุณาเลือกประเภทเศษวัสดุ", { field: "categoryId" });
    output.category_id = categoryId;
  }

  if (!partial || Object.hasOwn(body, "pricePerKg")) {
    const price = Number(body.pricePerKg);
    if (!Number.isFinite(price) || price < 0 || price > 9999999999) {
      invalid("ราคาต่อกิโลกรัมต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป", { field: "pricePerKg" });
    }
    output.price_per_kg = Number(price.toFixed(4));
  }

  if (!partial || Object.hasOwn(body, "effectiveFrom")) {
    const effectiveFrom = text(body.effectiveFrom);
    const validDate = ISO_DATE.test(effectiveFrom) && !Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`));
    if (!validDate) invalid("วันที่เริ่มใช้ราคาต้องเป็น YYYY-MM-DD", { field: "effectiveFrom" });
    output.effective_from = effectiveFrom;
  }

  if (!partial || Object.hasOwn(body, "note")) {
    const note = optionalText(body.note);
    if (note && note.length > 500) invalid("หมายเหตุต้องไม่เกิน 500 ตัวอักษร", { field: "note" });
    output.note = note;
  }

  if (partial && Object.keys(output).length === 0) invalid("ไม่มีข้อมูลราคาที่ต้องการแก้ไข");
  return output;
}
