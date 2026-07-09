import { moduleOptions } from "./master-data.js";
import { integerDailyModules, normalizeNumberText, policyForDailyModule, validateNumberValue } from "./entry-validation.js";

export const dailyModuleOptions = Object.freeze(
  moduleOptions.filter((item) => item.id !== "scrap_material")
);

export { integerDailyModules };

export function quantityPolicyForModule(module) {
  const policy = policyForDailyModule(module);
  return Object.freeze({
    ...policy,
    integer: policy.type === "count"
  });
}

export function bangkokTodayValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function currentMonthValue(date = new Date()) {
  return bangkokTodayValue(date).slice(0, 7);
}

export function isFutureDate(date, today = bangkokTodayValue()) {
  return String(date || "") > today;
}

export function getDaysInMonth(month) {
  if (!/^\d{4}-\d{2}$/u.test(String(month || ""))) return 0;
  const [year, monthNumber] = month.split("-").map(Number);
  if (year < 2000 || year > 2200 || monthNumber < 1 || monthNumber > 12) return 0;
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function buildMonthDays(month, initialItems = [], { today = bangkokTodayValue() } = {}) {
  const daysInMonth = getDaysInMonth(month);
  const itemMap = new Map(initialItems.map((item) => [String(item.entry_date).slice(0, 10), item]));
  const weekdays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const weekdayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();
    const item = itemMap.get(date);
    return {
      date,
      day,
      weekday: weekdays[weekdayIndex],
      weekend: weekdayIndex === 0 || weekdayIndex === 6,
      future: isFutureDate(date, today),
      value: item ? String(item.quantity) : "",
      note: item?.note || ""
    };
  });
}

export function monthLabelThai(month) {
  if (!/^\d{4}-\d{2}$/u.test(String(month || ""))) return "—";
  const [year, monthNumber] = month.split("-").map(Number);
  const names = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return `${names[monthNumber - 1]} ${year + 543}`;
}

export function weekRanges(month) {
  const daysInMonth = getDaysInMonth(month);
  const base = [
    { key: "week1", label: "Week 1", startDay: 1, endDay: Math.min(7, daysInMonth) },
    { key: "week2", label: "Week 2", startDay: 8, endDay: Math.min(14, daysInMonth) },
    { key: "week3", label: "Week 3", startDay: 15, endDay: Math.min(21, daysInMonth) },
    { key: "week4", label: "Week 4", startDay: 22, endDay: Math.min(28, daysInMonth) }
  ].filter((item) => item.startDay <= daysInMonth);
  if (daysInMonth >= 29) base.push({ key: "remaining", label: `วันที่ 29–${daysInMonth}`, startDay: 29, endDay: daysInMonth });
  return base;
}

export function summarizeDailyValues(days, month) {
  const eligibleDays = days.filter((item) => !item.future);
  const validDays = eligibleDays.filter((item) => item.value !== "" && Number.isFinite(Number(normalizeNumberText(item.value))) && Number(normalizeNumberText(item.value)) >= 0);
  const total = validDays.reduce((sum, item) => sum + Number(normalizeNumberText(item.value)), 0);
  const weeks = weekRanges(month).map((range) => {
    const entries = validDays.filter((item) => item.day >= range.startDay && item.day <= range.endDay);
    return {
      ...range,
      filledDays: entries.length,
      total: entries.reduce((sum, item) => sum + Number(normalizeNumberText(item.value)), 0)
    };
  });
  return {
    daysInMonth: days.length,
    availableDays: eligibleDays.length,
    futureDays: Math.max(0, days.length - eligibleDays.length),
    filledDays: validDays.length,
    missingDays: Math.max(0, eligibleDays.length - validDays.length),
    total,
    averagePerFilledDay: validDays.length ? total / validDays.length : 0,
    weeks
  };
}

export function validateDailyGrid(days, module = "waste", { today = bangkokTodayValue() } = {}) {
  const errors = [];
  const policy = quantityPolicyForModule(module);
  for (const day of days) {
    if (day.value === "") continue;
    if (isFutureDate(day.date, today)) {
      errors.push(`วันที่ ${day.day}: ไม่สามารถบันทึกข้อมูลล่วงหน้าได้`);
      continue;
    }
    const error = validateNumberValue(day.value, policy, {
      label: `วันที่ ${day.day}`,
      required: false,
      allowZero: true
    });
    if (error) errors.push(error);
  }
  return errors;
}

export function serializeDailyEntries(days, { today = bangkokTodayValue() } = {}) {
  return days
    .filter((item) => item.value !== "" && !isFutureDate(item.date, today))
    .map((item) => ({ date: item.date, quantity: Number(normalizeNumberText(item.value)), note: item.note?.trim() || null }));
}
