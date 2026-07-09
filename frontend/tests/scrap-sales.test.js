import { describe, expect, it } from "vitest";
import {
  calculateAmount,
  firstDateInMonth,
  validateScrapSaleForm
} from "../src/lib/scrap-sales.js";

describe("Phase 4 scrap sales frontend helpers", () => {
  it("calculates amount to two decimals", () => {
    expect(calculateAmount("12.5", "6.5")).toBe(81.25);
  });

  it("uses first day when selected month is not current", () => {
    expect(firstDateInMonth("2020-01")).toBe("2020-01-01");
  });

  it("returns clear form validation messages", () => {
    expect(validateScrapSaleForm({ saleDate: "2026-07-01", categoryId: "", weightKg: "1", pricePerKg: "2", note: "" }, "2026-07")).toMatch(/เลือกประเภท/u);
    expect(validateScrapSaleForm({ saleDate: "2026-07-01", categoryId: "a", weightKg: "1", pricePerKg: "2", note: "" }, "2026-07")).toBeNull();
    expect(validateScrapSaleForm({ saleDate: "2026-07-01", categoryId: "a", weightKg: "1.234", pricePerKg: "2", note: "" }, "2026-07")).toMatch(/2 ตำแหน่ง/u);
  });
});
