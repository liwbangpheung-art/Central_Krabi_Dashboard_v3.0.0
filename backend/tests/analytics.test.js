import { describe, expect, it } from "vitest";
import { buildAnalytics, calculateComparison, weeklyBreakdown } from "../src/domain/analytics.js";
import { validateAnalyticsQuery } from "../src/validation/analytics.js";

const categories = [
  { id: "a", code: "A", name_th: "A", unit: "กก." },
  { id: "b", code: "B", name_th: "B", unit: "กก." }
];

describe("Phase 5 analytics", () => {
  it("builds monthly and quarterly ranges", () => {
    expect(validateAnalyticsQuery({ module: "waste", view: "monthly", year: 2026, month: 2 }).end).toBe("2026-02-28");
    expect(validateAnalyticsQuery({ module: "waste", view: "quarterly", year: 2026, quarter: 2 }).buckets).toHaveLength(3);
  });

  it("aggregates records by period and category", () => {
    const query = validateAnalyticsQuery({ module: "waste", view: "month_over_month", year: 2026, month: 2 });
    const result = buildAnalytics({ categories, query, valueField: "quantity", dateField: "entry_date", records: [
      { category_id: "a", entry_date: "2026-01-02", quantity: 2 },
      { category_id: "b", entry_date: "2026-02-02", quantity: 3 }
    ] });
    expect(result.rows[0].total).toBe(2);
    expect(result.rows[1].values.B).toBe(3);
  });

  it("calculates comparison and weekly summary", () => {
    expect(calculateComparison(120, 100).percent).toBe(20);
    const weekly = weeklyBreakdown({ categories, monthStart: "2026-05-01", monthEnd: "2026-05-31", valueField: "quantity", dateField: "entry_date", records: [
      { category_id: "a", entry_date: "2026-05-01", quantity: 4 },
      { category_id: "a", entry_date: "2026-05-29", quantity: 6 }
    ] });
    expect(weekly[0].total).toBe(4);
    expect(weekly[4].total).toBe(6);
  });
});
