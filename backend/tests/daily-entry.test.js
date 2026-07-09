import { describe, expect, it } from "vitest";
import { summarizeDailyEntries } from "../src/domain/daily-summary.js";
import { monthRange, validateDailyMonthInput, validateDailyQuantities } from "../src/validation/daily-entry.js";

describe("Phase 3 daily entry validation and summary", () => {
  it("calculates leap-year month range", () => {
    expect(monthRange("2028-02")).toEqual({ month: "2028-02", start: "2028-02-01", end: "2028-02-29", daysInMonth: 29 });
  });

  it("keeps zero values and sorts dates", () => {
    const result = validateDailyMonthInput({
      categoryId: "category",
      month: "2026-05",
      entries: [
        { date: "2026-05-08", quantity: "2.5" },
        { date: "2026-05-01", quantity: 0 }
      ]
    });
    expect(result.entries[0]).toEqual({ date: "2026-05-01", quantity: 0, note: null });
    expect(result.entries[1].quantity).toBe(2.5);
  });

  it("rejects duplicate days", () => {
    expect(() => validateDailyMonthInput({
      categoryId: "category", month: "2026-05", entries: [{ date: "2026-05-01", quantity: 1 }, { date: "2026-05-01", quantity: 2 }]
    })).toThrow(/วันที่ซ้ำ/u);
  });

  it("enforces module quantity precision", () => {
    expect(() => validateDailyQuantities([{ quantity: 1.5 }], "tissue")).toThrow(/จำนวนเต็ม/u);
    expect(() => validateDailyQuantities([{ quantity: 1.234 }], "waste")).toThrow(/2 ตำแหน่ง/u);
    expect(validateDailyQuantities([{ quantity: 1.23 }], "waste")).toHaveLength(1);
  });

  it("summarizes fixed 1-7, 8-14, 15-21, 22-28 and remaining periods", () => {
    const summary = summarizeDailyEntries([
      { entry_date: "2026-05-01", quantity: 10 },
      { entry_date: "2026-05-08", quantity: 20 },
      { entry_date: "2026-05-29", quantity: 30 }
    ], { month: "2026-05", daysInMonth: 31 });
    expect(summary.total).toBe(60);
    expect(summary.weeks.map((item) => item.total)).toEqual([10, 20, 0, 0, 30]);
  });
});
