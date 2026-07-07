import { HttpError } from "../http/errors.js";

export const BANGKOK_TIMEZONE = "Asia/Bangkok";
export const PERIOD_STATUSES = Object.freeze(["draft", "reviewed", "locked", "reopened"]);
export const PERIOD_STATUS_LABELS = Object.freeze({
  draft: "กำลังบันทึก",
  reviewed: "ตรวจสอบแล้ว",
  locked: "ปิดงวดแล้ว",
  reopened: "เปิดแก้ไขอีกครั้ง"
});

export function bangkokDateValue(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function assertNotFutureDate(date, { now = new Date(), field = "date" } = {}) {
  const today = bangkokDateValue(now);
  if (date > today) {
    throw new HttpError(400, "FUTURE_DATE_NOT_ALLOWED", "ไม่สามารถบันทึกข้อมูลล่วงหน้าสำหรับวันที่ในอนาคตได้", {
      field,
      date,
      today,
      timezone: BANGKOK_TIMEZONE
    });
  }
  return date;
}

export function normalizePeriodMonth(value) {
  const month = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}$/u.test(month)) {
    throw new HttpError(400, "PERIOD_MONTH_INVALID", "เดือนต้องอยู่ในรูปแบบ YYYY-MM");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  if (year < 2000 || year > 2200 || monthNumber < 1 || monthNumber > 12) {
    throw new HttpError(400, "PERIOD_MONTH_INVALID", "เดือนไม่ถูกต้อง");
  }
  return month;
}

export function periodStart(month) {
  return `${normalizePeriodMonth(month)}-01`;
}

export function periodEnd(month) {
  const normalized = normalizePeriodMonth(month);
  const [year, monthNumber] = normalized.split("-").map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${normalized}-${String(day).padStart(2, "0")}`;
}

export function normalizePeriodRecord(record, month) {
  const status = PERIOD_STATUSES.includes(record?.status) ? record.status : "draft";
  return {
    id: record?.id ?? null,
    month: normalizePeriodMonth(month),
    month_start: record?.month_start ?? periodStart(month),
    status,
    status_label: PERIOD_STATUS_LABELS[status],
    reviewed_by: record?.reviewed_by ?? null,
    reviewed_at: record?.reviewed_at ?? null,
    locked_by: record?.locked_by ?? null,
    locked_at: record?.locked_at ?? null,
    reopened_by: record?.reopened_by ?? null,
    reopened_at: record?.reopened_at ?? null,
    reopen_reason: record?.reopen_reason ?? null,
    updated_at: record?.updated_at ?? null
  };
}

export async function readPeriod(supabaseAdmin, month) {
  const normalizedMonth = normalizePeriodMonth(month);
  const { data, error } = await supabaseAdmin
    .from("data_periods")
    .select("id,month_start,status,reviewed_by,reviewed_at,locked_by,locked_at,reopened_by,reopened_at,reopen_reason,created_at,updated_at")
    .eq("month_start", periodStart(normalizedMonth))
    .maybeSingle();
  if (error) throw new HttpError(500, "DATABASE_ERROR", "อ่านสถานะงวดไม่สำเร็จ", { databaseMessage: error.message });
  return normalizePeriodRecord(data, normalizedMonth);
}

export async function assertPeriodWritable(supabaseAdmin, month) {
  const period = await readPeriod(supabaseAdmin, month);
  if (period.status === "locked") {
    throw new HttpError(409, "PERIOD_LOCKED", `งวด ${month} ปิดงวดแล้ว ไม่สามารถเพิ่ม แก้ไข ลบ หรือ Import ข้อมูลได้`, { period });
  }
  return period;
}
