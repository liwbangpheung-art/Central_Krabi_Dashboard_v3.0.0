import { describe, expect, it } from "vitest";
import { analyticsPath, chartRows, defaultAnalyticsFilters, thaiMonthLabel } from "../src/lib/analytics.js";

describe("Phase 5 frontend analytics helpers", () => {
  it("creates API path", () => { expect(analyticsPath({ module:"waste", view:"monthly", year:2026, month:5, quarter:2, metric:"quantity" })).toContain("module=waste"); });
  it("converts rows for charts", () => { expect(chartRows({ rows:[{ label:"2026-05", values:{A:2}, total:2 }] }, { includeTotal:true })[0].TOTAL).toBe(2); });
  it("formats Thai month and defaults", () => { expect(thaiMonthLabel("2026-05")).toBeTruthy(); expect(defaultAnalyticsFilters(new Date(2026,4,1)).month).toBe(5); });
});

import { comparisonPercentText } from "../src/lib/analytics.js";

describe("comparisonPercentText", () => {
  it("does not throw while analytics data is still loading", () => {
    expect(comparisonPercentText(undefined)).toBe("—");
    expect(comparisonPercentText(null)).toBe("—");
  });

  it("formats positive, negative and missing comparison values", () => {
    expect(comparisonPercentText({ percent: 12.5 })).toBe("+12.5%");
    expect(comparisonPercentText({ percent: -2 })).toBe("-2%");
    expect(comparisonPercentText({ percent: null }, { fallback: "ไม่มีฐานเปรียบเทียบ" })).toBe("ไม่มีฐานเปรียบเทียบ");
  });
});
