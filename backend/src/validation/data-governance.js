import { HttpError } from "../http/errors.js";
import { normalizePeriodMonth } from "../domain/data-governance.js";

function bodyObject(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

export function validatePeriodTransition(input) {
  const body = bodyObject(input);
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!['review', 'lock', 'reopen'].includes(action)) {
    throw new HttpError(400, "PERIOD_ACTION_INVALID", "การเปลี่ยนสถานะงวดไม่ถูกต้อง");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (action === "reopen" && reason.length < 5) {
    throw new HttpError(400, "REOPEN_REASON_REQUIRED", "กรุณาระบุเหตุผลในการเปิดแก้ไขอีกครั้งอย่างน้อย 5 ตัวอักษร");
  }
  if (reason.length > 500) throw new HttpError(400, "VALIDATION_ERROR", "เหตุผลต้องไม่เกิน 500 ตัวอักษร");
  return { action, reason: reason || null };
}

export function validateImportHistoryInput(input) {
  const body = bodyObject(input);
  const month = normalizePeriodMonth(body.month);
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  if (!fileName || fileName.length > 255) throw new HttpError(400, "VALIDATION_ERROR", "ชื่อไฟล์ Import ไม่ถูกต้อง");
  const sheetName = typeof body.sheetName === "string" ? body.sheetName.trim().slice(0, 120) : null;
  const module = typeof body.module === "string" ? body.module.trim() : "";
  const categoryId = typeof body.categoryId === "string" && body.categoryId.trim() ? body.categoryId.trim() : null;
  const totalRows = Number(body.totalRows ?? 0);
  const validRows = Number(body.validRows ?? 0);
  const errorRows = Number(body.errorRows ?? 0);
  for (const [field, value] of Object.entries({ totalRows, validRows, errorRows })) {
    if (!Number.isInteger(value) || value < 0 || value > 100000) throw new HttpError(400, "VALIDATION_ERROR", `${field} ไม่ถูกต้อง`);
  }
  if (validRows + errorRows > totalRows) throw new HttpError(400, "VALIDATION_ERROR", "จำนวนแถว Import ไม่สอดคล้องกัน");
  const errors = Array.isArray(body.errors) ? body.errors.slice(0, 1000).map((item, index) => ({
    row_number: Number.isInteger(Number(item?.rowNumber)) ? Number(item.rowNumber) : index + 1,
    column_name: typeof item?.column === "string" ? item.column.slice(0, 120) : null,
    raw_value: item?.value === undefined ? null : String(item.value).slice(0, 500),
    error_code: typeof item?.code === "string" ? item.code.slice(0, 80) : "IMPORT_ROW_INVALID",
    error_message: typeof item?.message === "string" ? item.message.slice(0, 1000) : "ข้อมูลไม่ถูกต้อง"
  })) : [];
  return { month, fileName, sheetName, module, categoryId, totalRows, validRows, errorRows, errors };
}
