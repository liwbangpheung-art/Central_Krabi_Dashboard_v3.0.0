import { describe, expect, it } from "vitest";
import { applySlideOutlineOverrides, buildReadabilityWarnings, buildReportSlideOutline, defaultReportBuilderSettings, reportThemeOptions, slideLayoutOptions } from "../src/lib/report-builder.js";

function sampleReport(rowCount = 10, categoryCount = 9) {
  const categories = Array.from({ length: categoryCount }, (_, index) => ({ code: `C${index + 1}`, name_th: `หมวด ${index + 1}`, total: 100 - index }));
  const rows = Array.from({ length: rowCount }, (_, index) => ({ label: `2026-${String(index + 1).padStart(2, "0")}`, total: index + 1, values: Object.fromEntries(categories.map((category) => [category.code, index + 1])) }));
  return { periodLabel: "2026", modules: [{ moduleInfo: { id: "waste", label: "ขยะ" }, data: { rows, categories, unit: "kg", kpis: { grandTotal: 100 } }, analysis: { insights: ["ข้อความบทวิเคราะห์ยาวมาก".repeat(20)], recommendations: ["ติดตามข้อมูลต่อเนื่อง"] } }] };
}

describe("Phase C7 report builder advanced wizard helpers", () => {
  it("builds a slide outline with table splits and layout metadata", () => {
    const settings = { ...defaultReportBuilderSettings(new Date(2026, 0, 1)), view: "yearly", includeSections: ["cover", "executive_summary", "module_charts", "data_table", "recommendations"], chartType: "bar" };
    const outline = buildReportSlideOutline(sampleReport(17, 3), settings);
    expect(outline[0].type).toBe("cover");
    expect(outline.some((slide) => slide.type === "module_chart" && slide.layout)).toBe(true);
    expect(outline.filter((slide) => slide.type === "data_table")).toHaveLength(3);
  });

  it("applies editable outline overrides for title, layout, disabled slides, and order", () => {
    const outline = [{ id: "a", no: 1, title: "A", layout: "auto", enabled: true }, { id: "b", no: 2, title: "B", layout: "auto", enabled: true }, { id: "c", no: 3, title: "C", layout: "auto", enabled: true }];
    const result = applySlideOutlineOverrides(outline, { a: { title: "ใหม่", layout: "chart_focus", order: 2 }, b: { enabled: false }, c: { order: 0 } });
    expect(result.map((slide) => slide.id)).toEqual(["c", "a"]);
    expect(result[1].title).toBe("ใหม่");
    expect(result[1].layout).toBe("chart_focus");
    expect(result.map((slide) => slide.no)).toEqual([1, 2]);
  });

  it("returns readability warnings for dense reports", () => {
    const warnings = buildReadabilityWarnings(sampleReport(12, 10), {});
    expect(warnings.some((warning) => warning.message.includes("ตาราง"))).toBe(true);
    expect(warnings.some((warning) => warning.message.includes("Top 7"))).toBe(true);
    expect(warnings.some((warning) => warning.level === "warning")).toBe(true);
  });

  it("exposes theme and layout options for the wizard UI", () => {
    expect(reportThemeOptions.map((item) => item.id)).toContain("eco_green");
    expect(slideLayoutOptions.map((item) => item.id)).toContain("table_focus");
  });
});
