function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function inRange(date, start, end) { return date >= start && date <= end; }

export function buildAnalytics({ categories, records, query, valueField, dateField }) {
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const rows = query.buckets.map((bucket) => {
    const values = {};
    for (const category of categories) values[category.code] = 0;
    for (const record of records) {
      if (!inRange(record[dateField], bucket.start, bucket.end)) continue;
      const category = categoryMap.get(record.category_id);
      if (!category) continue;
      values[category.code] = round((values[category.code] || 0) + Number(record[valueField] || 0));
    }
    const total = round(Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0));
    return { period: bucket.key, label: bucket.label, start: bucket.start, end: bucket.end, values, total };
  });

  const categoryTotals = categories.map((category) => ({
    ...category,
    total: round(rows.reduce((sum, row) => sum + Number(row.values[category.code] || 0), 0))
  }));
  const grandTotal = round(rows.reduce((sum, row) => sum + row.total, 0));
  const populated = rows.filter((row) => row.total !== 0);
  const average = round(populated.length ? grandTotal / populated.length : 0);
  const maxRow = rows.reduce((best, row) => (!best || row.total > best.total ? row : best), null);
  const minRow = rows.reduce((best, row) => (!best || row.total < best.total ? row : best), null);

  return { rows, categories: categoryTotals, kpis: { grandTotal, average, maximum: maxRow?.total || 0, maximumPeriod: maxRow?.label || null, minimum: minRow?.total || 0, minimumPeriod: minRow?.label || null } };
}

export function calculateComparison(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  const difference = round(currentValue - previousValue);
  const percent = previousValue === 0 ? null : round((difference / previousValue) * 100, 2);
  return { current: currentValue, previous: previousValue, difference, percent };
}

export function weeklyBreakdown({ categories, records, monthStart, monthEnd, valueField, dateField }) {
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const weeks = [
    { key: "week1", label: "Week 1", from: 1, to: 7 },
    { key: "week2", label: "Week 2", from: 8, to: 14 },
    { key: "week3", label: "Week 3", from: 15, to: 21 },
    { key: "week4", label: "Week 4", from: 22, to: 28 },
    { key: "week5", label: "29–สิ้นเดือน", from: 29, to: 31 }
  ];
  return weeks.map((week) => {
    const values = Object.fromEntries(categories.map((category) => [category.code, 0]));
    for (const record of records) {
      const date = record[dateField];
      if (!inRange(date, monthStart, monthEnd)) continue;
      const day = Number(date.slice(8, 10));
      if (day < week.from || day > week.to) continue;
      const category = categoryMap.get(record.category_id);
      if (!category) continue;
      values[category.code] = round(values[category.code] + Number(record[valueField] || 0));
    }
    return { ...week, values, total: round(Object.values(values).reduce((sum, value) => sum + value, 0)) };
  });
}
