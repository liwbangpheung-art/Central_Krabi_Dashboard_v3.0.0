import { describe, expect, it } from "vitest";
import { validateExportLogInput } from "../src/validation/export-log.js";

describe("Phase 6 export validation", () => {
  it("accepts supported formats", () => {
    expect(validateExportLogInput({ format:"pptx", module:"waste", view:"monthly", periodLabel:"2026-05", options:{ legend:true } }).export_format).toBe("pptx");
  });
  it("rejects unsupported formats", () => {
    expect(() => validateExportLogInput({ format:"docx", module:"waste", view:"monthly", periodLabel:"2026-05" })).toThrow(/รูปแบบ/u);
  });
});
