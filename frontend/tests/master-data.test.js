import { describe, expect, it } from "vitest";
import { currentPriceAt, validateCategoryForm, validatePriceForm } from "../src/lib/master-data.js";

describe("Master Data frontend helpers", () => {
  it("chooses the latest price effective on the selected date", () => {
    const price = currentPriceAt([
      { price_per_kg: 3, effective_from: "2026-01-01", created_at: "2026-01-01" },
      { price_per_kg: 4, effective_from: "2026-06-01", created_at: "2026-06-01" },
      { price_per_kg: 5, effective_from: "2026-08-01", created_at: "2026-08-01" }
    ], "2026-07-01");
    expect(price.price_per_kg).toBe(4);
  });

  it("returns clear category form errors", () => {
    const errors = validateCategoryForm({ module: "waste", code: "bad code!", nameTh: "", unit: "", colorHex: "red", sortOrder: -1 });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it("validates price form", () => {
    expect(validatePriceForm({ pricePerKg: "6.50", effectiveFrom: "2026-07-01", note: "" })).toEqual([]);
    expect(validatePriceForm({ pricePerKg: "-1", effectiveFrom: "", note: "" }).length).toBe(2);
  });
});
