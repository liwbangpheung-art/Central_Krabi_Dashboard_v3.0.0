import { bangkokTodayValue } from "./daily-entry.js";
import { normalizeNumberText, numericPolicies, validateNumberValue } from "./entry-validation.js";

export function todayValue(date = new Date()) {
  return bangkokTodayValue(date);
}

export function currentMonthValue(date = new Date()) {
  return todayValue(date).slice(0, 7);
}


export function lastDateInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const day = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function firstDateInMonth(month) {
  const today = todayValue();
  return today.startsWith(`${month}-`) ? today : `${month}-01`;
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQuantity(value, maximumFractionDigits = 4) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits });
}

export function calculateAmount(weightKg, pricePerKg) {
  const weight = Number(normalizeNumberText(weightKg));
  const price = Number(normalizeNumberText(pricePerKg));
  if (!Number.isFinite(weight) || !Number.isFinite(price)) return 0;
  return Number((weight * price).toFixed(2));
}

export function validateScrapSaleForm(form, month) {
  if (!form.saleDate || !form.saleDate.startsWith(`${month}-`)) return "วันที่ขายต้องอยู่ในเดือนที่เลือก";
  if (form.saleDate > todayValue()) return "ไม่สามารถบันทึกรายการขายล่วงหน้าได้";
  if (!form.categoryId) return "กรุณาเลือกประเภทวัสดุ";

  const weightError = validateNumberValue(form.weightKg, numericPolicies.weight, {
    label: "น้ำหนัก",
    required: true,
    positive: true
  });
  if (weightError) return weightError;

  if (form.pricePerKg === "" || form.pricePerKg === null || form.pricePerKg === undefined) return "กรุณากรอกราคาต่อกิโลกรัม หรือกดใช้ราคาตามวันที่";
  const priceError = validateNumberValue(form.pricePerKg, numericPolicies.money, {
    label: "ราคาต่อกิโลกรัม",
    required: true,
    allowZero: true
  });
  if (priceError) return priceError;

  if ((form.note || "").trim().length > 500) return "หมายเหตุต้องไม่เกิน 500 ตัวอักษร";
  return null;
}
