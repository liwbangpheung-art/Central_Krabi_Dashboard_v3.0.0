import { describe, expect, it } from "vitest";
import {
  buildMonthDays,
  getDaysInMonth,
  monthLabelThai,
  quantityPolicyForModule,
  serializeDailyEntries,
  summarizeDailyValues,
  validateDailyGrid
} from "../src/lib/daily-entry.js";

describe("Phase 3 frontend daily entry helpers", () => {
  it("builds every day for leap-year February", () => {
    expect(getDaysInMonth("2028-02")).toBe(29);
    expect(buildMonthDays("2028-02")).toHaveLength(29);
  });

  it("distinguishes blank from a real zero", () => {
    const days = buildMonthDays("2026-07");
    days[0].value = "0";
    const entries = serializeDailyEntries(days);
    expect(entries).toEqual([{ date: "2026-07-01", quantity: 0, note: null }]);
  });

  it("summarizes weekly periods and monthly total", () => {
    const days = buildMonthDays("2026-05");
    days[0].value = "10";
    days[7].value = "20";
    days[28].value = "30";
    const summary = summarizeDailyValues(days, "2026-05");
    expect(summary.total).toBe(60);
    expect(summary.weeks.map((item) => item.total)).toEqual([10, 20, 0, 0, 30]);
  });

  it("enforces integer modules and 2-decimal weight modules", () => {
    const integerDays = buildMonthDays("2026-07");
    integerDays[0].value = "1.5";
    expect(validateDailyGrid(integerDays, "tissue")[0]).toMatch(/จำนวนเต็ม/u);

    const weightDays = buildMonthDays("2026-07");
    weightDays[0].value = "1.234";
    expect(validateDailyGrid(weightDays, "waste")[0]).toMatch(/2 ตำแหน่ง/u);
    weightDays[0].value = "1.23";
    expect(validateDailyGrid(weightDays, "waste")).toEqual([]);
  });

  it("returns input policy per module", () => {
    expect(quantityPolicyForModule("garbage_bag")).toMatchObject({ integer: true, step: "1" });
    expect(quantityPolicyForModule("animal_feed")).toMatchObject({ integer: false, step: "0.01" });
  });

  it("formats Thai Buddhist year month label", () => {
    expect(monthLabelThai("2026-05")).toBe("พฤษภาคม 2569");
  });
});

describe("Phase B future-date UI policy", () => {
  it("keeps every day visible but marks future days", () => {
    const days = buildMonthDays("2026-07", [], { today: "2026-07-04" });
    expect(days).toHaveLength(31);
    expect(days[3].future).toBe(false);
    expect(days[4].future).toBe(true);
  });

  it("rejects a value entered for a future day", () => {
    const days = buildMonthDays("2026-07", [], { today: "2026-07-04" });
    days[4].value = "1";
    expect(validateDailyGrid(days, "waste", { today: "2026-07-04" })[0]).toMatch(/ล่วงหน้า/u);
  });
});
