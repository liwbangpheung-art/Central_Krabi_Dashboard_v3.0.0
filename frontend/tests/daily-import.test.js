import { describe, expect, it } from "vitest";
import { importDailyCsvPreview, inspectImportedDailyRows, normalizeImportedDailyRows, normalizeImportedDate } from "../src/lib/daily-import.js";

describe("daily Excel import", () => {
  it("supports ISO, Thai Buddhist DD/MM/YYYY, and Excel serial dates", () => {
    expect(normalizeImportedDate("2026-07-01")).toBe("2026-07-01");
    expect(normalizeImportedDate("02/07/2569")).toBe("2026-07-02");
    expect(normalizeImportedDate(46204)).toBe("2026-07-01");
  });

  it("normalizes imported rows for the selected month", () => {
    const rows = normalizeImportedDailyRows([
      { rowNumber: 2, date: "01/07/2569", quantity: "1,200.25", note: "ตัวอย่าง" },
      { rowNumber: 3, date: "2026-07-02", quantity: 0 }
    ], { month: "2026-07", module: "waste" });
    expect(rows).toEqual([
      { entry_date: "2026-07-01", quantity: 1200.25, note: "ตัวอย่าง" },
      { entry_date: "2026-07-02", quantity: 0, note: null }
    ]);
  });

  it("rejects decimal values for integer-only modules", () => {
    expect(() => normalizeImportedDailyRows([
      { rowNumber: 2, date: "2026-07-01", quantity: 1.5 }
    ], { month: "2026-07", module: "garbage_bag" })).toThrow(/จำนวนเต็ม/u);
  });

  it("accepts CSV files exported by older versions with a value column", async () => {
    const csv = "date,day,value,unit,note\n2026-07-01,1,12.5,กิโลกรัม,นำกลับเข้า";
    const file = new File([csv], "animal_feed_DOG_FEED_2026-07.csv", { type: "text/csv" });
    const result = await importDailyCsvPreview(file, { month: "2026-07", module: "animal_feed", today: "2026-07-31" });
    expect(result.validRows).toBe(1);
    expect(result.items[0]).toEqual({ entry_date: "2026-07-01", quantity: 12.5, note: "นำกลับเข้า" });
  });
});


describe("Phase B import preview", () => {
  it("keeps valid rows and reports a future row separately", () => {
    const result = inspectImportedDailyRows([
      { rowNumber: 2, date: "2026-07-03", quantity: 10 },
      { rowNumber: 3, date: "2026-07-31", quantity: 20 }
    ], { month: "2026-07", module: "waste", today: "2026-07-04" });
    expect(result.validRows).toBe(1);
    expect(result.errorRows).toBe(1);
    expect(result.errors[0].code).toBe("FUTURE_DATE_NOT_ALLOWED");
  });
});
