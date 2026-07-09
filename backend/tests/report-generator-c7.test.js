import { describe, expect, it } from "vitest";
import { __reportGeneratorTest } from "../src/domain/report-generator.js";

describe("Phase C7 backend report generator helpers", () => {
  it("splits rows for readable table slides", () => {
    const rows = Array.from({ length: 17 }, (_, index) => ({ label: String(index + 1), total: index + 1 }));
    const chunks = __reportGeneratorTest.chunkReportRows(rows);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(8);
  });

  it("builds backend outline with overrides and theme fallback", () => {
    const dataset = { settings: { includeSections: ["data_table", "recommendations"], theme: "eco_green", slideOutlineOverrides: { "module_chart:waste:2": { title: "Waste Custom", layout: "chart_focus" } } }, modules: [{ moduleId: "waste", label: "ขยะ", data: { rows: Array.from({ length: 9 }, (_, index) => ({ label: String(index), total: index })) } }] };
    const outline = __reportGeneratorTest.buildServerSlideOutline(dataset);
    expect(outline.some((slide) => slide.type === "data_table")).toBe(true);
    expect(__reportGeneratorTest.reportTheme("eco_green").id).toBe("eco_green");
  });

  it("shortens long bullets", () => {
    const bullets = __reportGeneratorTest.readableReportBullets(["ยาว".repeat(100)]);
    expect(bullets[0].length).toBeLessThanOrEqual(129);
  });

  it("respects outline override order and disabled slides in backend helper", () => {
    const dataset = { settings: { includeSections: ["data_table", "recommendations"], slideOutlineOverrides: { "module_chart:waste:2": { enabled: false }, "recommendations:global:4": { order: 0, title: "Final First" } } }, modules: [{ moduleId: "waste", label: "ขยะ", data: { rows: Array.from({ length: 3 }, (_, index) => ({ label: String(index), total: index })) } }] };
    const outline = __reportGeneratorTest.buildServerSlideOutline(dataset);
    expect(outline[0].title).toBe("Final First");
    expect(outline.some((slide) => slide.id === "module_chart:waste:2")).toBe(false);
    expect(outline.map((slide) => slide.no)).toEqual(outline.map((_, index) => index + 1));
  });
});
