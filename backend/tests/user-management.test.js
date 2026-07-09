import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { PERMISSIONS } from "../src/security/permissions.js";

const config = { organizationName: "Central Krabi", allowedOrigins: ["http://localhost:5173"] };

function createUserSupabase({ actorRole = "owner", actorPermissions = PERMISSIONS } = {}) {
  let seq = 10;
  const db = {
    profiles: [
      { id: "user-1", email: "owner@example.com", full_name: "Owner", role: actorRole, active: true, status: "active", must_change_password: false, invited_at: null, last_login_at: null, created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: "user-2", email: "editor@example.com", full_name: "Editor", role: "editor", active: true, status: "active", must_change_password: false, invited_at: null, last_login_at: null, created_at: "2026-01-02", updated_at: "2026-01-02" }
    ],
    permissions: PERMISSIONS.map((code, index) => ({ code, name_th: code, description_th: code, group_code: "test", sensitive: false, sort_order: index + 1 })),
    role_permissions: [
      ...actorPermissions.map((permission_code) => ({ role: actorRole, permission_code })),
      { role: "editor", permission_code: "manage_daily_data" },
      { role: "editor", permission_code: "export_reports" },
      { role: "viewer", permission_code: "export_reports" }
    ],
    user_permission_overrides: [],
    audit_logs: [],
    app_settings: [], master_categories: [], scrap_price_history: [], daily_entries: [], daily_entry_month_logs: [], scrap_sales: [], export_logs: []
  };

  function matches(row, filters) {
    return filters.every(({ key, value, op }) => op === "eq" ? row[key] === value : op === "in" ? value.includes(row[key]) : true);
  }

  function execute(table, state, mode = "many") {
    const rows = db[table] ?? [];
    const filtered = rows.filter((row) => matches(row, state.filters));
    let result = filtered;
    if (state.operation === "insert") {
      const entries = Array.isArray(state.payload) ? state.payload : [state.payload];
      result = entries.map((entry) => ({ id: entry.id || `row-${seq++}`, created_at: "2026-07-03", updated_at: "2026-07-03", ...entry }));
      db[table].push(...result);
    } else if (state.operation === "update") {
      result = [];
      db[table] = rows.map((row) => {
        if (!matches(row, state.filters)) return row;
        const updated = { ...row, ...state.payload, updated_at: "2026-07-03" };
        result.push(updated);
        return updated;
      });
    } else if (state.operation === "delete") {
      result = filtered;
      db[table] = rows.filter((row) => !matches(row, state.filters));
    }
    for (const { key, ascending } of [...state.orders].reverse()) {
      result = [...result].sort((a, b) => (a[key] === b[key] ? 0 : (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1)));
    }
    if (state.limit) result = result.slice(0, state.limit);
    if (state.head) return { data: null, count: filtered.length, error: null };
    if (mode === "single") return { data: result[0] ?? null, error: result[0] ? null : { code: "PGRST116", message: "not found" } };
    if (mode === "maybeSingle") return { data: result[0] ?? null, error: null };
    return { data: result, count: result.length, error: null };
  }

  function builder(table) {
    const state = { operation: "select", payload: null, filters: [], orders: [], head: false, limit: null };
    const query = {
      select(_fields, options = {}) { state.head = Boolean(options.head); return query; },
      eq(key, value) { state.filters.push({ op: "eq", key, value }); return query; },
      in(key, value) { state.filters.push({ op: "in", key, value }); return query; },
      order(key, options = {}) { state.orders.push({ key, ascending: options.ascending !== false }); return query; },
      limit(value) { state.limit = value; return query; },
      insert(payload) { state.operation = "insert"; state.payload = payload; return query; },
      update(payload) { state.operation = "update"; state.payload = payload; return query; },
      delete() { state.operation = "delete"; return query; },
      single() { return Promise.resolve(execute(table, state, "single")); },
      maybeSingle() { return Promise.resolve(execute(table, state, "maybeSingle")); },
      then(resolve, reject) { return Promise.resolve(execute(table, state)).then(resolve, reject); }
    };
    return query;
  }

  function createAuthUser(email, fullName) {
    const id = `user-${seq++}`;
    db.profiles.push({ id, email, full_name: fullName, role: "viewer", active: true, status: "active", must_change_password: false, invited_at: null, last_login_at: null, created_at: "2026-07-03", updated_at: "2026-07-03" });
    return { id, email };
  }

  return {
    auth: {
      async getUser(token) {
        if (token !== "valid-token") return { data: { user: null }, error: { message: "invalid" } };
        return { data: { user: { id: "user-1", email: "owner@example.com" } }, error: null };
      },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      admin: {
        async inviteUserByEmail(email, options) { return { data: { user: createAuthUser(email, options.data.full_name) }, error: null }; },
        async createUser(input) { return { data: { user: createAuthUser(input.email, input.user_metadata.full_name) }, error: null }; },
        async updateUserById() { return { data: { user: {} }, error: null }; },
        async deleteUser() { return { data: {}, error: null }; }
      }
    },
    from: builder,
    __db: db
  };
}

function authorized(req) {
  return req.set("Authorization", "Bearer valid-token");
}

describe("Phase A user management and permissions", () => {
  it("returns effective permissions in /api/me", async () => {
    const response = await authorized(request(createApp({ config, supabaseAdmin: createUserSupabase() })).get("/api/me"));
    expect(response.status).toBe(200);
    expect(response.body.profile.role).toBe("owner");
    expect(response.body.permissions).toContain("manage_users");
  });

  it("owner can list users with effective permissions", async () => {
    const response = await authorized(request(createApp({ config, supabaseAdmin: createUserSupabase() })).get("/api/users"));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].effective_permissions).toContain("manage_users");
  });

  it("admin without manage_users cannot open user management", async () => {
    const app = createApp({ config, supabaseAdmin: createUserSupabase({ actorRole: "admin", actorPermissions: ["manage_master_data"] }) });
    const response = await authorized(request(app).get("/api/users"));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PERMISSION_FORBIDDEN");
  });

  it("owner can create a user with temporary password", async () => {
    const supabase = createUserSupabase();
    const app = createApp({ config, supabaseAdmin: supabase });
    const response = await authorized(request(app).post("/api/users")).send({
      mode: "temporary_password",
      fullName: "New Editor",
      email: "new@example.com",
      role: "editor",
      temporaryPassword: "Strong-Password1!"
    });
    expect(response.status).toBe(201);
    expect(response.body.item.role).toBe("editor");
    expect(response.body.item.must_change_password).toBe(true);
    expect(supabase.__db.audit_logs.some((item) => item.action === "user.created")).toBe(true);
  });

  it("prevents changing own role", async () => {
    const app = createApp({ config, supabaseAdmin: createUserSupabase() });
    const response = await authorized(request(app).patch("/api/users/user-1")).send({ role: "viewer" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("SELF_ROLE_CHANGE_FORBIDDEN");
  });

  it("owner can add a per-user permission override", async () => {
    const app = createApp({ config, supabaseAdmin: createUserSupabase() });
    const response = await authorized(request(app).patch("/api/users/user-2")).send({
      permissionOverrides: { manage_master_data: "allow", manage_prices: "deny" }
    });
    expect(response.status).toBe(200);
    expect(response.body.item.permission_overrides.manage_master_data).toBe("allow");
    expect(response.body.item.effective_permissions).toContain("manage_master_data");
    expect(response.body.item.effective_permissions).not.toContain("manage_prices");
  });

  it("soft-disables users instead of destroying history", async () => {
    const supabase = createUserSupabase();
    const app = createApp({ config, supabaseAdmin: supabase });
    const response = await authorized(request(app).delete("/api/users/user-2"));
    expect(response.status).toBe(200);
    expect(response.body.deletionMode).toBe("soft_disable");
    expect(response.body.item.status).toBe("disabled");
    expect(supabase.__db.profiles.find((item) => item.id === "user-2").active).toBe(false);
  });
});
