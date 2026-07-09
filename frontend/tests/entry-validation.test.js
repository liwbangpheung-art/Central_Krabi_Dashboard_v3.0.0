import { describe, expect, it } from "vitest";
import {
  numericPolicies,
  parseNumberValue,
  policyForDailyModule,
  validateNumberValue
} from "../src/lib/entry-validation.js";
import { validateDailyGrid } from "../src/lib/daily-entry.js";
import { calculateAmount, validateScrapSaleForm } from "../src/lib/scrap-sales.js";

describe("UX-1 central data entry validation", () => {
  it("requires integer values for tissue and garbage bag style modules", () => {
    expect(policyForDailyModule("tissue").type).toBe("count");
    expect(validateNumberValue("1.5", numericPolicies.count, { label: "ทิชชู่" })).toMatch(/จำนวนเต็ม/u);
    expect(validateNumberValue("12", numericPolicies.count, { label: "ถุงขยะ" })).toBeNull();
  });

  it("allows decimals for weight and money but limits to two places", () => {
    expect(validateNumberValue("12.25", numericPolicies.weight, { label: "น้ำหนัก" })).toBeNull();
    expect(validateNumberValue("12.256", numericPolicies.weight, { label: "น้ำหนัก" })).toMatch(/ไม่เกิน 2/u);
    expect(validateNumberValue("-1", numericPolicies.money, { label: "ราคา" })).toMatch(/ห้ามติดลบ/u);
  });

  it("normalizes comma-separated numbers", () => {
    expect(parseNumberValue("1,234.50")).toBe(1234.5);
    expect(calculateAmount("1,000.50", "2")).toBe(2001);
  });

  it("daily grid rejects decimals for integer modules but accepts zero", () => {
    const errors = validateDailyGrid([{ date: "2026-01-01", day: 1, value: "1.5" }], "garbage_bag", { today: "2026-01-31" });
    expect(errors[0]).toMatch(/จำนวนเต็ม/u);
    expect(validateDailyGrid([{ date: "2026-01-01", day: 1, value: "0" }], "garbage_bag", { today: "2026-01-31" })).toEqual([]);
  });

  it("scrap sales validates weight and price as decimal fields", () => {
    const valid = { saleDate: "2026-01-01", categoryId: "pet", weightKg: "12.5", pricePerKg: "6.50", note: "" };
    expect(validateScrapSaleForm(valid, "2026-01")).toBeNull();
    expect(validateScrapSaleForm({ ...valid, weightKg: "12.555" }, "2026-01")).toMatch(/ไม่เกิน 2/u);
    expect(validateScrapSaleForm({ ...valid, pricePerKg: "-1" }, "2026-01")).toMatch(/ห้ามติดลบ/u);
  });
});
