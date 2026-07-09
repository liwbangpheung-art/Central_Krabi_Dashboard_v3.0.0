import { describe, expect, it } from "vitest";
import { reportFilename } from "../src/lib/export-report.js";

describe("Phase 6 export helpers", () => {
  it("creates a safe report filename", () => {
    expect(reportFilename({ organizationName:"Central Krabi", moduleLabel:"ขยะ", periodLabel:"2026-05" }, "pdf")).toContain(".pdf");
  });
});
