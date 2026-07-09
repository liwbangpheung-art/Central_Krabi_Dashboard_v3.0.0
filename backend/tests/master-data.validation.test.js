import { describe, expect, it } from "vitest";
import { validateMasterCategoryInput, validateScrapPriceInput } from "../src/validation/master-data.js";

describe("Master Data validation", () => {
  it("normalizes code and color", () => {
    const value = validateMasterCategoryInput({
      module: "scrap_material", code: "pet bottle", nameTh: "ขวด PET", nameEn: "PET bottle", unit: "กิโลกรัม", colorHex: "#aabbcc", pattern: "solid", sortOrder: 5, active: true, metadata: {}
    });
    expect(value.code).toBe("PET_BOTTLE");
    expect(value.color_hex).toBe("#AABBCC");
  });

  it("rejects unknown module", () => {
    expect(() => validateMasterCategoryInput({ module: "unknown", code: "A", nameTh: "A", unit: "kg", colorHex: "#000000", pattern: "solid", sortOrder: 0, active: true })).toThrow("หมวดข้อมูลไม่ถูกต้อง");
  });

  it("accepts zero scrap price with effective date", () => {
    const value = validateScrapPriceInput({ categoryId: "category", pricePerKg: 0, effectiveFrom: "2026-07-01", note: "ไม่มีมูลค่า" });
    expect(value.price_per_kg).toBe(0);
  });
});
