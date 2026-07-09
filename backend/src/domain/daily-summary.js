export function createWeeklyBuckets(month, daysInMonth) {
  const ranges = [
    { key: "week1", startDay: 1, endDay: Math.min(7, daysInMonth), label: "Week 1" },
    { key: "week2", startDay: 8, endDay: Math.min(14, daysInMonth), label: "Week 2" },
    { key: "week3", startDay: 15, endDay: Math.min(21, daysInMonth), label: "Week 3" },
    { key: "week4", startDay: 22, endDay: Math.min(28, daysInMonth), label: "Week 4" }
  ].filter((item) => item.startDay <= daysInMonth);

  if (daysInMonth >= 29) {
    ranges.push({ key: "remaining", startDay: 29, endDay: daysInMonth, label: `วันที่ 29–${daysInMonth}` });
  }

  return ranges.map((range) => ({
    ...range,
    startDate: `${month}-${String(range.startDay).padStart(2, "0")}`,
    endDate: `${month}-${String(range.endDay).padStart(2, "0")}`,
    total: 0,
    filledDays: 0
  }));
}

export function summarizeDailyEntries(items, { month, daysInMonth }) {
  const weeks = createWeeklyBuckets(month, daysInMonth);
  let total = 0;
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity)) continue;
    total += quantity;
    const day = Number(String(item.entry_date).slice(-2));
    const bucket = weeks.find((week) => day >= week.startDay && day <= week.endDay);
    if (bucket) {
      bucket.total += quantity;
      bucket.filledDays += 1;
    }
  }
  return {
    daysInMonth,
    filledDays: items.length,
    missingDays: Math.max(0, daysInMonth - items.length),
    total,
    averagePerFilledDay: items.length ? total / items.length : 0,
    weeks
  };
}
