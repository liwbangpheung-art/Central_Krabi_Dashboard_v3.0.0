import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const config = { organizationName: "Central Krabi", allowedOrigins: ["http://localhost:5173"] };

function createFakeSupabase({ validToken = true, role = "admin", readyError = null, profileExists = true, active = true } = {}) {
  let sequence = 100;
  const db = {
    app_settings: [
      { key: "organization_name", value: "Central Krabi" },
      { key: "max_users", value: "10" },
      { key: "master_data_version", value: "2" },
      { key: "daily_entry_version", value: "3" }
    ],
    profiles: profileExists ? [{ id: "user-1", email: "admin@example.com", full_name: "Admin", role, active, status: "active", must_change_password: false, invited_at: null, last_login_at: null, created_at: "2026-01-01", updated_at: "2026-01-01" }] : [],
    master_categories: [
      { id: "cat-1", module: "waste", code: "RDF", name_th: "ขยะ RDF", name_en: "RDF", unit: "กิโลกรัม", color_hex: "#111111", pattern: "solid", sort_order: 30, active: true, metadata: {}, created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: "tissue-1", module: "tissue", code: "TISSUE_ROLL", name_th: "ทิชชู่ม้วน", name_en: "Tissue roll", unit: "ม้วน", color_hex: "#8B5CF6", pattern: "solid", sort_order: 10, active: true, metadata: {}, created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: "scrap-1", module: "scrap_material", code: "PET", name_th: "PET", name_en: "PET", unit: "กิโลกรัม", color_hex: "#F1A15A", pattern: "solid", sort_order: 40, active: true, metadata: {}, created_at: "2026-01-01", updated_at: "2026-01-01" }
    ],
    scrap_price_history: [
      { id: "price-1", category_id: "scrap-1", price_per_kg: 6, effective_from: "2026-01-01", note: null, created_by: "user-1", updated_by: "user-1", created_at: "2026-01-01", updated_at: "2026-01-01" }
    ],
    scrap_sales: [
      { id: "sale-1", sale_date: "2026-07-01", category_id: "scrap-1", weight_kg: 10, price_per_kg: 6, amount: 60, note: "รายการเดิม", created_by: "user-1", updated_by: "user-1", created_at: "2026-07-01", updated_at: "2026-07-01" }
    ],
    daily_entries: [
      { id: "daily-1", category_id: "cat-1", entry_date: "2026-07-01", quantity: 2700, note: null, created_by: "user-1", updated_by: "user-1", created_at: "2026-07-01", updated_at: "2026-07-01" }
    ],
    daily_entry_month_logs: [],
    data_periods: [],
    import_histories: [],
    import_history_errors: [],
    audit_logs: [],
    export_logs: [],
    permissions: [
      { code: "manage_users" },
      { code: "enter_daily_data" },
      { code: "view_audit_logs" },
      { code: "manage_master_data" },
      { code: "manage_prices" },
      { code: "manage_scrap_sales" },
      { code: "view_analytics" },
      { code: "export_reports" },
      { code: "manage_report_presets" },
      { code: "manage_data_governance" },
      { code: "import_data" },
      { code: "review_data" },
      { code: "lock_periods" },
      { code: "reopen_periods" },
      { code: "create_users" },
      { code: "invite_users" },
      { code: "edit_user_profile" },
      { code: "change_user_role" },
      { code: "disable_users" },
      { code: "reset_user_password" },
      { code: "manage_admins" }
    ],
    role_permissions: [
      { permission_code: "manage_users", role: "admin" },
      { permission_code: "manage_master_data", role: "admin" },
      { permission_code: "manage_prices", role: "admin" },
      { permission_code: "manage_scrap_sales", role: "admin" },
      { permission_code: "enter_daily_data", role: "admin" },
      { permission_code: "manage_daily_data", role: "admin" },
      { permission_code: "view_analytics", role: "admin" },
      { permission_code: "export_reports", role: "admin" },
      { permission_code: "manage_report_presets", role: "admin" },
      { permission_code: "manage_data_governance", role: "admin" },
      { permission_code: "import_data", role: "admin" },
      { permission_code: "review_data", role: "admin" },
      { permission_code: "lock_periods", role: "admin" },
      { permission_code: "reopen_periods", role: "admin" },
      { permission_code: "create_users", role: "admin" },
      { permission_code: "invite_users", role: "admin" },
      { permission_code: "edit_user_profile", role: "admin" },
      { permission_code: "change_user_role", role: "admin" },
      { permission_code: "disable_users", role: "admin" },
      { permission_code: "reset_user_password", role: "admin" },
      { permission_code: "manage_admins", role: "admin" },
      { permission_code: "view_audit_logs", role: "admin" },
      { permission_code: "enter_daily_data", role: "editor" },
      { permission_code: "manage_daily_data", role: "editor" },
      { permission_code: "manage_scrap_sales", role: "editor" },
      { permission_code: "view_analytics", role: "editor" },
      { permission_code: "export_reports", role: "editor" },
      { permission_code: "import_data", role: "editor" }
    ],
    user_permission_overrides: [],

    report_presets: [],
    report_runs: [],
    report_files: []
  };

  function matches(row, filters) {
    return filters.every(({ op, key, value }) => {
      if (op === "eq") return row[key] === value;
      if (op === "in") return value.includes(row[key]);
      if (op === "gte") return row[key] >= value;
      if (op === "lte") return row[key] <= value;
      return true;
    });
  }

  function execute(table, state, mode = "many") {
    if (readyError && ["app_settings", "master_categories", "scrap_price_history", "daily_entries", "daily_entry_month_logs", "scrap_sales", "export_logs", "permissions", "role_permissions", "audit_logs", "report_presets", "report_runs", "report_files"].includes(table) && state.operation === "select") {
      return { data: null, count: null, error: readyError };
    }
    const rows = db[table] ?? [];
    const filtered = rows.filter((row) => matches(row, state.filters));
    let result = filtered;

    if (state.operation === "insert" || state.operation === "upsert") {
      const entries = Array.isArray(state.payload) ? state.payload : [state.payload];
      result = entries.map((entry) => {
        const created = { id: entry.id || `new-${sequence++}`, created_at: "2026-07-02", updated_at: "2026-07-02", ...entry };
        if (table === "scrap_sales") created.amount = Number((Number(created.weight_kg) * Number(created.price_per_kg)).toFixed(2));
        return created;
      });
      if (state.operation === "upsert") {
        for (const created of result) {
          const conflictKey = state.onConflict || "id";
          const index = db[table].findIndex((row) => row[conflictKey] === created[conflictKey]);
          if (index >= 0) db[table][index] = { ...db[table][index], ...created };
          else db[table].push(created);
        }
      } else {
        db[table].push(...result);
      }
    } else if (state.operation === "update") {
      result = [];
      db[table] = rows.map((row) => {
        if (!matches(row, state.filters)) return row;
        const updated = { ...row, ...state.payload, updated_at: "2026-07-02" };
        if (table === "scrap_sales") updated.amount = Number((Number(updated.weight_kg) * Number(updated.price_per_kg)).toFixed(2));
        result.push(updated);
        return updated;
      });
    } else if (state.operation === "delete") {
      result = filtered;
      db[table] = rows.filter((row) => !matches(row, state.filters));
    }

    for (const { key, ascending } of [...state.orders].reverse()) {
      result = [...result].sort((a, b) => {
        if (a[key] === b[key]) return 0;
        return (a[key] < b[key] ? -1 : 1) * (ascending === false ? -1 : 1);
      });
    }

    if (state.head) return { data: null, count: filtered.length, error: null };
    if (mode === "single") return { data: result[0] ?? null, error: result[0] ? null : { code: "PGRST116", message: "not found" } };
    if (mode === "maybeSingle") return { data: result[0] ?? null, error: null };
    return { data: result, count: result.length, error: null };
  }

  function builder(table) {
    const state = { operation: "select", payload: null, filters: [], orders: [], head: false };
    const query = {
      select(_fields, options = {}) { state.head = Boolean(options.head); return query; },
      in(key, values) { state.filters.push({ op: "in", key, value: values }); return query; },
      eq(key, value) { state.filters.push({ op: "eq", key, value }); return query; },
      gte(key, value) { state.filters.push({ op: "gte", key, value }); return query; },
      lte(key, value) { state.filters.push({ op: "lte", key, value }); return query; },
      ilike(key, value) { state.filters.push({ op: "ilike", key, value }); return query; },
      range(from, to) { state.range = [from, to]; return query; },
      order(key, options = {}) { state.orders.push({ key, ascending: options.ascending !== false }); return query; },
      insert(payload) { state.operation = "insert"; state.payload = payload; return query; },
      upsert(payload, options = {}) { state.operation = "upsert"; state.payload = payload; state.onConflict = options.onConflict; return query; },
      update(payload) { state.operation = "update"; state.payload = payload; return query; },
      delete() { state.operation = "delete"; return query; },
      single() { return Promise.resolve(execute(table, state, "single")); },
      maybeSingle() { return Promise.resolve(execute(table, state, "maybeSingle")); },
      then(resolve, reject) { return Promise.resolve(execute(table, state)).then(resolve, reject); }
    };
    return query;
  }

  return {
    auth: {
      async getUser(token) {
        if (!validToken || token !== "valid-token") return { data: { user: null }, error: { message: "invalid" } };
        return { data: { user: { id: "user-1", email: "admin@example.com" } }, error: null };
      }
    },
    from: builder,
    async rpc(name, params) {
      if (name === "get_scrap_price_at") {
        const prices = db.scrap_price_history
          .filter((item) => item.category_id === params.p_category_id && item.effective_from <= params.p_on_date)
          .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
        return { data: prices[0]?.price_per_kg ?? null, error: null };
      }
      if (name !== "replace_daily_month") return { data: null, error: { message: "unknown rpc" } };
      const start = params.p_month_start;
      const [year, month] = start.split("-").map(Number);
      const end = `${start.slice(0, 7)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
      db.daily_entries = db.daily_entries.filter((row) => !(row.category_id === params.p_category_id && row.entry_date >= start && row.entry_date <= end));
      const inserted = params.p_entries.map((entry) => ({
        id: `daily-${sequence++}`,
        category_id: params.p_category_id,
        entry_date: entry.date,
        quantity: entry.quantity,
        note: entry.note ?? null,
        created_by: params.p_changed_by,
        updated_by: params.p_changed_by,
        created_at: "2026-07-02",
        updated_at: "2026-07-02"
      }));
      db.daily_entries.push(...inserted);
      const total = inserted.reduce((sum, item) => sum + Number(item.quantity), 0);
      db.daily_entry_month_logs.push({
        id: `log-${sequence++}`,
        category_id: params.p_category_id,
        month_start: start,
        action: inserted.length ? "replace" : "clear",
        saved_count: inserted.length,
        total_quantity: total,
        changed_by: params.p_changed_by,
        created_at: "2026-07-02"
      });
      return { data: { categoryId: params.p_category_id, month: start.slice(0, 7), savedCount: inserted.length, totalQuantity: total }, error: null };
    },
    storage: {
      getBucket(name) {
        if (readyError) return Promise.resolve({ data: null, error: readyError });
        return Promise.resolve({ data: { id: name, name, public: false }, error: null });
      },
      from() {
        return {
          upload() { return Promise.resolve({ data: { path: "test" }, error: null }); },
          getPublicUrl() { return { data: { publicUrl: "http://test" } }; }
        };
      }
    },
    __db: db
  };
}

function authorized(req) {
  return req.set("Authorization", "Bearer valid-token");
}

describe("Phase 4 API", () => {
  it("GET /health works without authentication", async () => {
    const response = await request(createApp({ config, supabaseAdmin: createFakeSupabase() })).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.version).toBe("3.0.0");
  });

  it("GET /ready verifies Phase 3 tables", async () => {
    const response = await request(createApp({ config, supabaseAdmin: createFakeSupabase() })).get("/ready");
    expect(response.status).toBe(200);
    expect(response.body.checks.masterData).toBe("ok");
    expect(response.body.checks.dailyEntries).toBe("ok");
    expect(response.body.checks.scrapSales).toBe("ok");
    expect(response.body.checks.dataGovernance).toBe("ok");
  });

  it("GET /ready returns 5xx when Phase tables are missing", async () => {
    const response = await request(createApp({ config, supabaseAdmin: createFakeSupabase({ readyError: { message: "missing" } }) })).get("/ready");
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.status).toBeLessThan(600);
  });

  it("GET /api/me rejects missing token", async () => {
    const response = await request(createApp({ config, supabaseAdmin: createFakeSupabase() })).get("/api/me");
    expect(response.status).toBe(401);
  });

  it("GET /api/me returns Supabase user, profile, and role", async () => {
    const response = await authorized(request(createApp({ config, supabaseAdmin: createFakeSupabase({ role: "editor" }) })).get("/api/me"));
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("admin@example.com");
    expect(response.body.profile.role).toBe("editor");
  });

  it("GET /api/me rejects an invalid token", async () => {
    const response = await request(createApp({ config, supabaseAdmin: createFakeSupabase({ validToken: false }) }))
      .get("/api/me")
      .set("Authorization", "Bearer invalid-token");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("GET /api/me rejects missing and inactive profiles", async () => {
    const missing = await authorized(request(createApp({ config, supabaseAdmin: createFakeSupabase({ profileExists: false }) })).get("/api/me"));
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("PROFILE_NOT_FOUND");

    const inactive = await authorized(request(createApp({ config, supabaseAdmin: createFakeSupabase({ active: false }) })).get("/api/me"));
    expect(inactive.status).toBe(403);
    expect(inactive.body.error.code).toBe("USER_INACTIVE");
  });

  it("CORS allows configured frontend and rejects other origins", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase() });
    const allowed = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const denied = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("CORS_ORIGIN_FORBIDDEN");
  });

  it("authenticated users can read Master Data", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase({ role: "viewer" }) });
    const response = await authorized(request(app).get("/api/master-data?module=waste"));
    expect(response.status).toBe(200);
    expect(response.body.items[0].code).toBe("RDF");
  });

  it("viewer cannot create Master Data", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase({ role: "viewer" }) });
    const response = await authorized(request(app).post("/api/master-data")).send({
      module: "waste", code: "NEW", nameTh: "ใหม่", nameEn: "New", unit: "กิโลกรัม", colorHex: "#123456", pattern: "solid", sortOrder: 1, active: true, metadata: {}
    });
    expect(response.status).toBe(403);
  });

  it("admin can create Master Data", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase() });
    const response = await authorized(request(app).post("/api/master-data")).send({
      module: "tissue", code: "NEW_TISSUE", nameTh: "ทิชชู่ใหม่", nameEn: "New tissue", unit: "แพ็ค", colorHex: "#8B5CF6", pattern: "solid", sortOrder: 40, active: true, metadata: {}
    });
    expect(response.status).toBe(201);
    expect(response.body.item.code).toBe("NEW_TISSUE");
  });

  it("invalid colors return a clear validation error", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase() });
    const response = await authorized(request(app).post("/api/master-data")).send({
      module: "waste", code: "BAD", nameTh: "สีผิด", unit: "กิโลกรัม", colorHex: "purple", pattern: "solid", sortOrder: 1, active: true, metadata: {}
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("admin can add price history and priced category cannot be deleted", async () => {
    const supabase = createFakeSupabase();
    const app = createApp({ config, supabaseAdmin: supabase });
    const priceResponse = await authorized(request(app).post("/api/scrap-prices")).send({
      categoryId: "scrap-1", pricePerKg: 6.5, effectiveFrom: "2026-07-01", note: "ราคารอบใหม่"
    });
    expect(priceResponse.status).toBe(201);
    const deleteResponse = await authorized(request(app).delete("/api/master-data/scrap-1"));
    expect(deleteResponse.status).toBe(409);
    expect(deleteResponse.body.error.code).toBe("CATEGORY_HAS_HISTORY");
  });

  it("daily overview summarizes active categories in a module", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase({ role: "viewer" }) });
    const response = await authorized(request(app).get("/api/daily-entry-overview?module=waste&month=2026-07"));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].summary.total).toBe(2700);
  });

  it("category with daily history cannot be deleted", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase() });
    const response = await authorized(request(app).delete("/api/master-data/cat-1"));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CATEGORY_HAS_HISTORY");
  });

  it("viewer can read a daily month with weekly summary", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase({ role: "viewer" }) });
    const response = await authorized(request(app).get("/api/daily-entries?categoryId=cat-1&month=2026-07"));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.summary.total).toBe(2700);
    expect(response.body.summary.weeks[0].total).toBe(2700);
  });

  it("editor can replace a complete month and zero is a valid saved value", async () => {
    const supabase = createFakeSupabase({ role: "editor" });
    const app = createApp({ config, supabaseAdmin: supabase });
    const response = await authorized(request(app).post("/api/daily-entries/month")).send({
      categoryId: "cat-1",
      month: "2026-07",
      entries: [
        { date: "2026-07-01", quantity: 100 },
        { date: "2026-07-02", quantity: 0 },
        { date: "2026-07-03", quantity: 50.5 }
      ]
    });
    expect(response.status).toBe(200);
    expect(response.body.summary.filledDays).toBe(3);
    expect(response.body.summary.total).toBe(150.5);
    expect(supabase.__db.daily_entry_month_logs).toHaveLength(1);
  });

  it("viewer cannot save daily entries", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase({ role: "viewer" }) });
    const response = await authorized(request(app).post("/api/daily-entries/month")).send({
      categoryId: "cat-1", month: "2026-07", entries: [{ date: "2026-07-01", quantity: 1 }]
    });
    expect(response.status).toBe(403);
  });

  it("daily payload rejects dates outside selected month", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase() });
    const response = await authorized(request(app).post("/api/daily-entries/month")).send({
      categoryId: "cat-1", month: "2026-07", entries: [{ date: "2026-08-01", quantity: 1 }]
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("editor can clear the saved month", async () => {
    const supabase = createFakeSupabase({ role: "editor" });
    const app = createApp({ config, supabaseAdmin: supabase });
    const response = await authorized(request(app).delete("/api/daily-entries/month?categoryId=cat-1&month=2026-07"));
    expect(response.status).toBe(200);
    expect(response.body.summary.filledDays).toBe(0);
    expect(supabase.__db.daily_entries).toHaveLength(0);
  });

  it("viewer can read monthly scrap sales and summary", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase({ role: "viewer" }) });
    const response = await authorized(request(app).get("/api/scrap-sales?month=2026-07"));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].category.name_th).toBe("PET");
    expect(response.body.summary.totalAmount).toBe(60);
  });

  it("resolves scrap price at sale date", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase({ role: "editor" }) });
    const response = await authorized(request(app).get("/api/scrap-sales/price?categoryId=scrap-1&date=2026-07-02"));
    expect(response.status).toBe(200);
    expect(response.body.pricePerKg).toBe(6);
  });

  it("editor can create scrap sale with a price snapshot and calculated amount", async () => {
    const supabase = createFakeSupabase({ role: "editor" });
    const app = createApp({ config, supabaseAdmin: supabase });
    const response = await authorized(request(app).post("/api/scrap-sales")).send({
      saleDate: "2026-07-02", categoryId: "scrap-1", weightKg: 12.5, pricePerKg: 6.5, note: "ราคาจริง"
    });
    expect(response.status).toBe(201);
    expect(response.body.item.amount).toBe(81.25);
    expect(response.body.item.price_per_kg).toBe(6.5);
  });

  it("existing scrap sale amount does not change when price history changes", async () => {
    const supabase = createFakeSupabase({ role: "admin" });
    supabase.__db.scrap_price_history.push({ id: "price-new", category_id: "scrap-1", price_per_kg: 9, effective_from: "2026-07-02" });
    const app = createApp({ config, supabaseAdmin: supabase });
    const response = await authorized(request(app).get("/api/scrap-sales?month=2026-07"));
    expect(response.status).toBe(200);
    expect(response.body.items[0].price_per_kg).toBe(6);
    expect(response.body.items[0].amount).toBe(60);
  });

  it("viewer cannot create scrap sale", async () => {
    const app = createApp({ config, supabaseAdmin: createFakeSupabase({ role: "viewer" }) });
    const response = await authorized(request(app).post("/api/scrap-sales")).send({
      saleDate: "2026-07-02", categoryId: "scrap-1", weightKg: 1, pricePerKg: 6
    });
    expect(response.status).toBe(403);
  });

  it("editor can update and delete scrap sale", async () => {
    const supabase = createFakeSupabase({ role: "editor" });
    const app = createApp({ config, supabaseAdmin: supabase });
    const update = await authorized(request(app).patch("/api/scrap-sales/sale-1")).send({ weightKg: 20, pricePerKg: 7 });
    expect(update.status).toBe(200);
    expect(update.body.item.amount).toBe(140);
    const remove = await authorized(request(app).delete("/api/scrap-sales/sale-1"));
    expect(remove.status).toBe(204);
  });

  it("returns a Thai period status and supports review, lock, and reopen", async () => {
    const supabase = createFakeSupabase({ role: "owner" });
    const app = createApp({ config, supabaseAdmin: supabase });
    const initial = await authorized(request(app).get("/api/period-status?month=2026-06"));
    expect(initial.status).toBe(200);
    expect(initial.body.period.status_label).toBe("กำลังบันทึก");

    const review = await authorized(request(app).post("/api/period-status/2026-06/transition")).send({ action: "review" });
    expect(review.status).toBe(200);
    expect(review.body.period.status).toBe("reviewed");

    const lock = await authorized(request(app).post("/api/period-status/2026-06/transition")).send({ action: "lock" });
    expect(lock.status).toBe(200);
    expect(lock.body.period.status_label).toBe("ปิดงวดแล้ว");

    const reopen = await authorized(request(app).post("/api/period-status/2026-06/transition")).send({ action: "reopen", reason: "แก้ข้อมูลวันที่ 2" });
    expect(reopen.status).toBe(200);
    expect(reopen.body.period.status).toBe("reopened");
    expect(reopen.body.period.reopen_reason).toBe("แก้ข้อมูลวันที่ 2");
  });

  it("blocks daily changes when the month is locked", async () => {
    const supabase = createFakeSupabase({ role: "editor" });
    supabase.__db.data_periods.push({ id: "period-1", month_start: "2026-07-01", status: "locked" });
    const response = await authorized(request(createApp({ config, supabaseAdmin: supabase })).post("/api/daily-entries/month")).send({
      categoryId: "cat-1", month: "2026-07", entries: [{ date: "2026-07-03", quantity: 1 }]
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PERIOD_LOCKED");
  });

  it("rejects future daily data with a dedicated error code", async () => {
    const response = await authorized(request(createApp({ config, supabaseAdmin: createFakeSupabase({ role: "editor" }) })).post("/api/daily-entries/month")).send({
      categoryId: "cat-1", month: "2026-07", entries: [{ date: "2026-07-31", quantity: 1 }]
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
  });

  it("stores import validation history and row errors", async () => {
    const supabase = createFakeSupabase({ role: "editor" });
    const response = await authorized(request(createApp({ config, supabaseAdmin: supabase })).post("/api/import-history")).send({
      month: "2026-07", module: "waste", categoryId: "cat-1", fileName: "daily.xlsx", sheetName: "Sheet1",
      totalRows: 2, validRows: 1, errorRows: 1,
      errors: [{ rowNumber: 3, column: "วันที่", value: "2026-07-31", code: "FUTURE_DATE_NOT_ALLOWED", message: "วันที่ในอนาคต" }]
    });
    expect(response.status).toBe(201);
    expect(response.body.item.status).toBe("validated_with_errors");
    expect(supabase.__db.import_history_errors).toHaveLength(1);
  });

  it("summarizes missing daily cells in the data quality endpoint", async () => {
    const response = await authorized(request(createApp({ config, supabaseAdmin: createFakeSupabase() })).get("/api/data-quality?month=2026-07"));
    expect(response.status).toBe(200);
    expect(response.body.summary.categories).toBeGreaterThan(0);
    expect(response.body.summary.missing_cells).toBeGreaterThan(0);
    expect(response.body.period.status_label).toBe("กำลังบันทึก");
  });

});
