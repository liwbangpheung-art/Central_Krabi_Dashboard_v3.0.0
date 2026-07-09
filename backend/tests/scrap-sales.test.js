import { describe, expect, it } from "vitest";
import { summarizeScrapSales } from "../src/domain/scrap-sales-summary.js";
import {
  validatePriceResolutionQuery,
  validateScrapSaleInput,
  validateScrapSalesQuery
} from "../src/validation/scrap-sale.js";

describe("Phase 4 scrap sales validation and summary", () => {
  it("validates month and sale payload", () => {
    expect(validateScrapSalesQuery({ month: "2026-07" }).start).toBe("2026-07-01");
    const value = validateScrapSaleInput({
      saleDate: "2026-07-02", categoryId: "category", weightKg: "12.5", pricePerKg: "6.25", note: " test "
    });
    expect(value.weight_kg).toBe(12.5);
    expect(value.price_per_kg).toBe(6.25);
    expect(value.note).toBe("test");
  });

  it("allows omitted price for backend resolution", () => {
    const value = validateScrapSaleInput({ saleDate: "2026-07-02", categoryId: "category", weightKg: 1 });
    expect(value.price_per_kg).toBeNull();
  });

  it("rejects zero weight", () => {
    expect(() => validateScrapSaleInput({ saleDate: "2026-07-02", categoryId: "category", weightKg: 0, pricePerKg: 1 })).toThrow(/มากกว่า 0/u);
  });

  it("enforces two decimal places for weight and price", () => {
    expect(() => validateScrapSaleInput({ saleDate: "2026-07-02", categoryId: "category", weightKg: 1.234, pricePerKg: 1 })).toThrow(/2 ตำแหน่ง/u);
    expect(() => validateScrapSaleInput({ saleDate: "2026-07-02", categoryId: "category", weightKg: 1, pricePerKg: 1.234 })).toThrow(/2 ตำแหน่ง/u);
  });

  it("validates price resolution query", () => {
    expect(validatePriceResolutionQuery({ categoryId: "category", date: "2026-07-02" })).toEqual({ categoryId: "category", onDate: "2026-07-02" });
  });

  it("summarizes monthly totals and weighted average", () => {
    const summary = summarizeScrapSales([
      { category_id: "a", weight_kg: 10, amount: 50 },
      { category_id: "b", weight_kg: 20, amount: 200 }
    ]);
    expect(summary.totalWeightKg).toBe(30);
    expect(summary.totalAmount).toBe(250);
    expect(summary.averagePricePerKg).toBe(8.3333);
  });
});
