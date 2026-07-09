import { describe, expect, it } from "vitest";
import { readEnvironment } from "../src/config/env.js";

const base = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  PORT: "3000"
};

describe("backend environment validation", () => {
  it("accepts one or more exact CORS origins", () => {
    const config = readEnvironment({ ...base, CORS_ORIGIN: "http://localhost:5173,https://central-krabi.example" });
    expect(config.allowedOrigins).toEqual(["http://localhost:5173", "https://central-krabi.example"]);
  });

  it("rejects CORS origins with trailing slash or path", () => {
    expect(() => readEnvironment({ ...base, CORS_ORIGIN: "https://central-krabi.example/" })).toThrow(/must not end with/u);
    expect(() => readEnvironment({ ...base, CORS_ORIGIN: "https://central-krabi.example/app" })).toThrow(/root origin/u);
  });
});
