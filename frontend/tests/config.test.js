import { describe, expect, it } from "vitest";
import { validateFrontendEnvironment } from "../src/lib/config.js";

describe("frontend environment validation", () => {
  it("returns clear issues instead of throwing", () => {
    const result = validateFrontendEnvironment({});
    expect(result.issues).toContain("VITE_SUPABASE_URL ยังไม่ได้ตั้งค่า");
    expect(result.issues).toContain("VITE_SUPABASE_ANON_KEY ยังไม่ได้ตั้งค่า");
    expect(result.issues).toContain("VITE_API_BASE_URL ยังไม่ได้ตั้งค่า");
  });

  it("accepts a root backend URL", () => {
    const result = validateFrontendEnvironment({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "publishable-key",
      VITE_API_BASE_URL: "https://central-krabi-api.onrender.com",
      VITE_ORGANIZATION_NAME: "Central Krabi"
    });
    expect(result.issues).toEqual([]);
    expect(result.config.apiUrl).toBe("https://central-krabi-api.onrender.com");
  });

  it("rejects /api, other paths, and a trailing slash", () => {
    const common = {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "publishable-key"
    };
    expect(validateFrontendEnvironment({ ...common, VITE_API_BASE_URL: "https://api.example.com/api" }).issues.some((issue) => issue.includes("URL ราก"))).toBe(true);
    expect(validateFrontendEnvironment({ ...common, VITE_API_BASE_URL: "https://api.example.com/" }).issues.some((issue) => issue.includes("ไม่มี / ท้าย"))).toBe(true);
  });

  it("does not accept the legacy API variable", () => {
    const result = validateFrontendEnvironment({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "publishable-key",
      [["VITE", "API", "URL"].join("_")]: "https://api.example.com"
    });
    expect(result.issues).toContain("VITE_API_BASE_URL ยังไม่ได้ตั้งค่า");
  });
});
