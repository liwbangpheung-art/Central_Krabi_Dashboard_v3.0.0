import { Router } from "express";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { summarizeDailyEntries } from "../domain/daily-summary.js";
import { assertPeriodWritable, bangkokDateValue, readPeriod } from "../domain/data-governance.js";
import { writeAuditLog } from "../security/audit.js";
import {
  DAILY_MODULES,
  monthRange,
  validateDailyMonthInput,
  validateDailyModule,
  validateDailyQuantities,
  validateDailyQuery
} from "../validation/daily-entry.js";

const CATEGORY_FIELDS = "id,module,code,name_th,name_en,unit,color_hex,pattern,sort_order,active,metadata";
const ENTRY_FIELDS = "id,category_id,entry_date,quantity,note,created_by,updated_by,created_at,updated_at";

function databaseFailure(error, fallbackMessage) {
  if (!error) return;
  const message = error.message || fallbackMessage;
  const known = [
    ["DAILY_CATEGORY_NOT_FOUND", 404, "DAILY_CATEGORY_NOT_FOUND"],
    ["DAILY_CATEGORY_INACTIVE", 409, "DAILY_CATEGORY_INACTIVE"],
    ["DAILY_CATEGORY_MODULE_INVALID", 400, "DAILY_CATEGORY_MODULE_INVALID"],
    ["DAILY_DATE_OUT_OF_MONTH", 400, "DAILY_DATE_OUT_OF_MONTH"],
    ["DAILY_DATE_DUPLICATE", 400, "DAILY_DATE_DUPLICATE"],
    ["DAILY_QUANTITY_NEGATIVE", 400, "DAILY_QUANTITY_NEGATIVE"],
    ["DAILY_QUANTITY_INTEGER_REQUIRED", 400, "DAILY_QUANTITY_INTEGER_REQUIRED"],
    ["DAILY_QUANTITY_SCALE", 400, "DAILY_QUANTITY_SCALE"],
    ["DAILY_ENTRY_INVALID", 400, "DAILY_ENTRY_INVALID"],
    ["FUTURE_DATE_NOT_ALLOWED", 400, "FUTURE_DATE_NOT_ALLOWED"],
    ["PERIOD_LOCKED", 409, "PERIOD_LOCKED"]
  ].find(([prefix]) => message.includes(prefix));
  if (known) {
    const [, status, code] = known;
    throw new HttpError(status, code, message.split(":").slice(1).join(":").trim() || fallbackMessage);
  }
  if (error.code === "23503") {
    throw new HttpError(409, "RECORD_IN_USE", "ประเภทข้อมูลหรือผู้ใช้งานที่อ้างอิงไม่ถูกต้อง", { databaseMessage: message });
  }
  throw new HttpError(500, "DATABASE_ERROR", fallbackMessage, { databaseMessage: message, databaseCode: error.code });
}

async function getCategoryOrThrow(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("master_categories")
    .select(CATEGORY_FIELDS)
    .eq("id", id)
    .maybeSingle();
  databaseFailure(error, "อ่านข้อมูลประเภทไม่สำเร็จ");
  if (!data) throw new HttpError(404, "CATEGORY_NOT_FOUND", "ไม่พบประเภทข้อมูลที่ระบุ");
  if (!DAILY_MODULES.includes(data.module)) {
    throw new HttpError(400, "CATEGORY_NOT_DAILY", "ประเภทนี้ไม่รองรับการบันทึกรายวัน");
  }
  return data;
}

async function readMonthEntries(supabaseAdmin, categoryId, range) {
  const { data, error } = await supabaseAdmin
    .from("daily_entries")
    .select(ENTRY_FIELDS)
    .eq("category_id", categoryId)
    .gte("entry_date", range.start)
    .lte("entry_date", range.end)
    .order("entry_date", { ascending: true });
  databaseFailure(error, "โหลดข้อมูลรายวันไม่สำเร็จ");
  return data ?? [];
}

export function createDailyEntryRouter({ supabaseAdmin, authenticate }) {
  const router = Router();
  router.use(authenticate);

  router.get("/daily-entry/modules", (_req, res) => {
    res.json({ modules: DAILY_MODULES });
  });

  router.get("/daily-entries", async (req, res, next) => {
    try {
      const query = validateDailyQuery(req.query);
      const category = await getCategoryOrThrow(supabaseAdmin, query.categoryId);
      const items = await readMonthEntries(supabaseAdmin, category.id, query);
      const period = await readPeriod(supabaseAdmin, query.month);
      res.json({
        category,
        month: query.month,
        today: bangkokDateValue(),
        timezone: "Asia/Bangkok",
        period,
        items,
        summary: summarizeDailyEntries(items, query)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/daily-entry-overview", async (req, res, next) => {
    try {
      const module = validateDailyModule(req.query.module);
      const range = monthRange(req.query.month);
      const { data: categories, error: categoryError } = await supabaseAdmin
        .from("master_categories")
        .select(CATEGORY_FIELDS)
        .eq("module", module)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name_th", { ascending: true });
      databaseFailure(categoryError, "โหลดประเภทข้อมูลรายวันไม่สำเร็จ");

      const categoryIds = (categories ?? []).map((item) => item.id);
      let entries = [];
      if (categoryIds.length) {
        const result = await supabaseAdmin
          .from("daily_entries")
          .select(ENTRY_FIELDS)
          .in("category_id", categoryIds)
          .gte("entry_date", range.start)
          .lte("entry_date", range.end)
          .order("entry_date", { ascending: true });
        databaseFailure(result.error, "โหลดภาพรวมข้อมูลรายวันไม่สำเร็จ");
        entries = result.data ?? [];
      }

      const items = (categories ?? []).map((category) => {
        const categoryEntries = entries.filter((entry) => entry.category_id === category.id);
        return { category, summary: summarizeDailyEntries(categoryEntries, range) };
      });
      res.json({ module, month: range.month, items });
    } catch (error) {
      next(error);
    }
  });

  router.post("/daily-entries/month", requirePermission("manage_daily_data"), async (req, res, next) => {
    try {
      const payload = validateDailyMonthInput(req.body);
      const periodBefore = await assertPeriodWritable(supabaseAdmin, payload.month);
      const category = await getCategoryOrThrow(supabaseAdmin, payload.categoryId);
      if (!category.active) {
        throw new HttpError(409, "CATEGORY_INACTIVE", "ประเภทนี้ถูกปิดใช้งาน กรุณาเลือกประเภทที่เปิดใช้งาน");
      }
      validateDailyQuantities(payload.entries, category.module);

      const { data: result, error } = await supabaseAdmin.rpc("replace_daily_month", {
        p_category_id: category.id,
        p_month_start: payload.start,
        p_entries: payload.entries,
        p_changed_by: req.auth.user.id
      });
      databaseFailure(error, "บันทึกข้อมูลรายเดือนไม่สำเร็จ");

      const items = await readMonthEntries(supabaseAdmin, category.id, payload);
      const periodAfter = await readPeriod(supabaseAdmin, payload.month);
      if (req.body?.importHistoryId) {
        await supabaseAdmin.from("import_histories").update({ status: "committed", committed_at: new Date().toISOString() }).eq("id", req.body.importHistoryId).eq("imported_by", req.auth.user.id);
      }
      await writeAuditLog({
        supabaseAdmin, req, action: "daily_month.saved", targetType: "daily_month", targetId: `${category.id}:${payload.month}`,
        afterData: { categoryId: category.id, month: payload.month, entries: payload.entries, result }, metadata: { periodStatusBefore: periodBefore.status, periodStatusAfter: periodAfter.status, importHistoryId: req.body?.importHistoryId ?? null }
      });
      res.json({
        result,
        category,
        month: payload.month,
        period: periodAfter,
        items,
        summary: summarizeDailyEntries(items, payload)
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/daily-entries/month", requirePermission("manage_daily_data"), async (req, res, next) => {
    try {
      const query = validateDailyQuery(req.query);
      const periodBefore = await assertPeriodWritable(supabaseAdmin, query.month);
      const category = await getCategoryOrThrow(supabaseAdmin, query.categoryId);
      const { data: result, error } = await supabaseAdmin.rpc("replace_daily_month", {
        p_category_id: category.id,
        p_month_start: query.start,
        p_entries: [],
        p_changed_by: req.auth.user.id
      });
      databaseFailure(error, "ล้างข้อมูลรายเดือนไม่สำเร็จ");
      const periodAfter = await readPeriod(supabaseAdmin, query.month);
      await writeAuditLog({
        supabaseAdmin, req, action: "daily_month.cleared", targetType: "daily_month", targetId: `${category.id}:${query.month}`,
        beforeData: { categoryId: category.id, month: query.month }, metadata: { periodStatusBefore: periodBefore.status, periodStatusAfter: periodAfter.status }
      });
      res.json({ result, category, month: query.month, period: periodAfter, items: [], summary: summarizeDailyEntries([], query) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
