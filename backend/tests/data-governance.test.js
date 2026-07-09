import { describe, expect, it } from "vitest";
import {
  assertNotFutureDate,
  bangkokDateValue,
  normalizePeriodRecord,
  PERIOD_STATUS_LABELS
} from "../src/domain/data-governance.js";

const bangkokMidnight = new Date("2026-07-03T17:30:00.000Z");

describe("Phase B data governance", () => {
  it("resolves the business date in Asia/Bangkok", () => {
    expect(bangkokDateValue(bangkokMidnight)).toBe("2026-07-04");
  });

  it("allows today and rejects a future operational date", () => {
    expect(assertNotFutureDate("2026-07-04", { now: bangkokMidnight })).toBe("2026-07-04");
    expect(() => assertNotFutureDate("2026-07-05", { now: bangkokMidnight })).toThrow(/อนาคต/u);
  });

  it("uses Thai labels while keeping stable internal status values", () => {
    const period = normalizePeriodRecord({ status: "locked" }, "2026-07");
    expect(period.status).toBe("locked");
    expect(period.status_label).toBe("ปิดงวดแล้ว");
    expect(PERIOD_STATUS_LABELS.reopened).toBe("เปิดแก้ไขอีกครั้ง");
  });
});
