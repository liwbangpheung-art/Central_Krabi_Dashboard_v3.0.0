export const analyticsModules = [
  { id: "waste", label: "ขยะ", metric: "quantity" },
  { id: "tissue", label: "กระดาษทิชชู่", metric: "quantity" },
  { id: "animal_feed", label: "อาหารสัตว์", metric: "quantity" },
  { id: "garbage_bag", label: "ถุงขยะ", metric: "quantity" },
  { id: "consumable", label: "วัสดุสิ้นเปลือง", metric: "quantity" },
  { id: "scrap_sales", label: "ขายเศษวัสดุ", metric: "amount" }
];

export const analyticsViews = [
  { id: "monthly", label: "รายเดือน" },
  { id: "quarterly", label: "รายไตรมาส" },
  { id: "yearly", label: "รายปี" },
  { id: "month_over_month", label: "เดือนต่อเดือน" }
];

export function analyticsPath(filters) {
  const params = new URLSearchParams({
    module: filters.module,
    view: filters.view,
    year: String(filters.year),
    month: String(filters.month),
    quarter: String(filters.quarter),
    metric: filters.metric
  });
  return `/api/analytics?${params.toString()}`;
}

export function defaultAnalyticsFilters(date = new Date()) {
  return {
    module: "waste",
    view: "monthly",
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    quarter: Math.floor(date.getMonth() / 3) + 1,
    metric: "quantity"
  };
}

export function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number(value || 0));
}

export function comparisonPercentText(comparison, { fallback = "—", suffix = "" } = {}) {
  const rawPercent = comparison?.percent;
  if (rawPercent === null || rawPercent === undefined || !Number.isFinite(Number(rawPercent))) return fallback;
  const percent = Number(rawPercent);
  return `${percent >= 0 ? "+" : ""}${formatNumber(percent)}%${suffix}`;
}

export function thaiMonthLabel(period) {
  const match = /^(\d{4})-(\d{2})$/u.exec(period || "");
  if (!match) return period;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit" }).format(date);
}

export function chartRows(data, { includeTotal = false } = {}) {
  return (data?.rows || []).map((row) => ({
    period: thaiMonthLabel(row.label),
    ...row.values,
    ...(includeTotal ? { TOTAL: row.total } : {})
  }));
}

export function weeklyRows(data, { includeTotal = false } = {}) {
  return (data?.weekly || []).map((row) => ({
    period: row.label,
    ...row.values,
    ...(includeTotal ? { TOTAL: row.total } : {})
  }));
}
