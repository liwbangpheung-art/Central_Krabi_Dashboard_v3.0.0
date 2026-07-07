import { HttpError } from "../http/errors.js";

export const ANALYTICS_MODULES = ["waste", "tissue", "animal_feed", "garbage_bag", "consumable", "scrap_sales"];
export const ANALYTICS_VIEWS = ["monthly", "quarterly", "yearly", "month_over_month"];

function bad(message) {
  throw new HttpError(400, "ANALYTICS_QUERY_INVALID", message);
}

function pad(value) { return String(value).padStart(2, "0"); }
function isoDate(year, month, day = 1) { return `${year}-${pad(month)}-${pad(day)}`; }
function endOfMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function shiftMonth(year, month, delta) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
function monthLabel(year, month) { return `${year}-${pad(month)}`; }

export function validateAnalyticsQuery(query = {}) {
  const module = String(query.module || "waste").trim();
  const view = String(query.view || "monthly").trim();
  const metric = String(query.metric || (module === "scrap_sales" ? "amount" : "quantity")).trim();
  if (!ANALYTICS_MODULES.includes(module)) bad("หมวดวิเคราะห์ไม่ถูกต้อง");
  if (!ANALYTICS_VIEWS.includes(view)) bad("มุมมองวิเคราะห์ไม่ถูกต้อง");
  if (module === "scrap_sales" && !["amount", "weight"].includes(metric)) bad("ตัวชี้วัดการขายต้องเป็น amount หรือ weight");
  if (module !== "scrap_sales" && metric !== "quantity") bad("หมวดข้อมูลรายวันรองรับ metric=quantity เท่านั้น");

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const year = Number(query.year || currentYear);
  const month = Number(query.month || currentMonth);
  const quarter = Number(query.quarter || Math.floor((month - 1) / 3) + 1);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) bad("ปีไม่ถูกต้อง");
  if (!Number.isInteger(month) || month < 1 || month > 12) bad("เดือนไม่ถูกต้อง");
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) bad("ไตรมาสไม่ถูกต้อง");

  let start;
  let end;
  let buckets = [];
  let comparison = null;

  if (view === "monthly") {
    start = isoDate(year, month, 1);
    end = isoDate(year, month, endOfMonth(year, month));
    buckets = [{ key: monthLabel(year, month), label: monthLabel(year, month), start, end }];
    const prev = shiftMonth(year, month, -1);
    comparison = {
      key: monthLabel(prev.year, prev.month),
      label: monthLabel(prev.year, prev.month),
      start: isoDate(prev.year, prev.month, 1),
      end: isoDate(prev.year, prev.month, endOfMonth(prev.year, prev.month))
    };
  } else if (view === "quarterly") {
    const firstMonth = (quarter - 1) * 3 + 1;
    start = isoDate(year, firstMonth, 1);
    end = isoDate(year, firstMonth + 2, endOfMonth(year, firstMonth + 2));
    buckets = Array.from({ length: 3 }, (_, index) => {
      const m = firstMonth + index;
      return { key: monthLabel(year, m), label: monthLabel(year, m), start: isoDate(year, m, 1), end: isoDate(year, m, endOfMonth(year, m)) };
    });
    const prevQuarterEnd = shiftMonth(year, firstMonth, -1);
    const prevQuarterStart = shiftMonth(prevQuarterEnd.year, prevQuarterEnd.month, -2);
    comparison = {
      key: `${prevQuarterStart.year}-Q${Math.floor((prevQuarterStart.month - 1) / 3) + 1}`,
      label: `${prevQuarterStart.year}-Q${Math.floor((prevQuarterStart.month - 1) / 3) + 1}`,
      start: isoDate(prevQuarterStart.year, prevQuarterStart.month, 1),
      end: isoDate(prevQuarterEnd.year, prevQuarterEnd.month, endOfMonth(prevQuarterEnd.year, prevQuarterEnd.month))
    };
  } else if (view === "yearly") {
    start = isoDate(year, 1, 1);
    end = isoDate(year, 12, 31);
    buckets = Array.from({ length: 12 }, (_, index) => {
      const m = index + 1;
      return { key: monthLabel(year, m), label: monthLabel(year, m), start: isoDate(year, m, 1), end: isoDate(year, m, endOfMonth(year, m)) };
    });
    comparison = { key: String(year - 1), label: String(year - 1), start: isoDate(year - 1, 1, 1), end: isoDate(year - 1, 12, 31) };
  } else {
    const previous = shiftMonth(year, month, -1);
    const older = shiftMonth(year, month, -2);
    start = isoDate(previous.year, previous.month, 1);
    end = isoDate(year, month, endOfMonth(year, month));
    buckets = [previous, { year, month }].map(({ year: y, month: m }) => ({
      key: monthLabel(y, m), label: monthLabel(y, m), start: isoDate(y, m, 1), end: isoDate(y, m, endOfMonth(y, m))
    }));
    comparison = {
      key: monthLabel(older.year, older.month),
      label: monthLabel(older.year, older.month),
      start: isoDate(older.year, older.month, 1),
      end: isoDate(older.year, older.month, endOfMonth(older.year, older.month))
    };
  }

  return { module, view, metric, year, month, quarter, start, end, buckets, comparison };
}
