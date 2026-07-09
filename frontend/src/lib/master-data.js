export const moduleOptions = Object.freeze([
  { id: "waste", label: "ขยะ" },
  { id: "tissue", label: "กระดาษทิชชู่" },
  { id: "animal_feed", label: "อาหารสัตว์" },
  { id: "garbage_bag", label: "ถุงขยะ" },
  { id: "consumable", label: "วัสดุสิ้นเปลือง" },
  { id: "scrap_material", label: "เศษวัสดุ" }
]);

export const moduleLabel = Object.fromEntries(moduleOptions.map((item) => [item.id, item.label]));

export function todayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentPriceAt(prices, onDate = todayIso()) {
  return [...prices]
    .filter((item) => item.effective_from <= onDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function validateCategoryForm(form) {
  const errors = [];
  if (!moduleOptions.some((item) => item.id === form.module)) errors.push("กรุณาเลือกหมวดข้อมูล");
  if (!/^[A-Z0-9_]+$/u.test(String(form.code || "").trim().toUpperCase())) errors.push("รหัสประเภทใช้ได้เฉพาะ A-Z, 0-9 และ _");
  if (!String(form.nameTh || "").trim()) errors.push("กรุณากรอกชื่อภาษาไทย");
  if (!String(form.unit || "").trim()) errors.push("กรุณากรอกหน่วย");
  if (!/^#[0-9A-F]{6}$/u.test(String(form.colorHex || "").trim().toUpperCase())) errors.push("สีต้องอยู่ในรูปแบบ #RRGGBB");
  const sortOrder = Number(form.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) errors.push("ลำดับต้องเป็นจำนวนเต็ม 0–9999");
  return errors;
}

export function validatePriceForm(form) {
  const errors = [];
  const price = Number(form.pricePerKg);
  if (!Number.isFinite(price) || price < 0) errors.push("ราคาต่อกิโลกรัมต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(form.effectiveFrom || ""))) errors.push("กรุณาระบุวันที่เริ่มใช้ราคา");
  if (String(form.note || "").length > 500) errors.push("หมายเหตุต้องไม่เกิน 500 ตัวอักษร");
  return errors;
}
