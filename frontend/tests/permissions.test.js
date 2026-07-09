import { describe, expect, it } from "vitest";
import { hasPermission, permissionState, roleLabels, statusLabels } from "../src/lib/permissions.js";

describe("frontend permission helpers", () => {
  it("checks explicit permissions without inferring from role", () => {
    expect(hasPermission(["manage_users"], "manage_users")).toBe(true);
    expect(hasPermission(["manage_master_data"], "manage_users")).toBe(false);
  });

  it("uses inherit when a user has no override", () => {
    expect(permissionState({}, "manage_users")).toBe("inherit");
    expect(permissionState({ manage_users: "deny" }, "manage_users")).toBe("deny");
  });

  it("provides Thai labels for roles and statuses", () => {
    expect(roleLabels.owner).toBe("เจ้าของระบบ");
    expect(statusLabels.disabled).toBe("ปิดใช้งาน");
  });
});
