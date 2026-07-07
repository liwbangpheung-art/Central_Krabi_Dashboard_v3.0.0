import { Router } from "express";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { writeAuditLog } from "../security/audit.js";
import {
  PERIOD_STATUS_LABELS,
  assertPeriodWritable,
  bangkokDateValue,
  normalizePeriodMonth,
  periodEnd,
  periodStart,
  readPeriod
} from "../domain/data-governance.js";
import { validateImportHistoryInput, validatePeriodTransition } from "../validation/data-governance.js";
import { monthRange } from "../validation/daily-entry.js";

function databaseFailure(error, message) {
  if (!error) return;
  throw new HttpError(500, "DATABASE_ERROR", message, { databaseMessage: error.message, databaseCode: error.code });
}

async function transitionPeriod(supabaseAdmin, req, month, action, reason) {
  const before = await readPeriod(supabaseAdmin, month);
  const targetStatus = action === "review" ? "reviewed" : action === "lock" ? "locked" : "reopened";
  const allowed = {
    review: ["draft", "reopened", "reviewed"],
    lock: ["reviewed"],
    reopen: ["locked"]
  };
  if (action === "lock" && periodEnd(month) > bangkokDateValue()) {
    throw new HttpError(409, "PERIOD_NOT_COMPLETE", "ยังไม่สามารถปิดงวดที่วันสุดท้ายของเดือนยังมาไม่ถึงได้", { month, monthEnd: periodEnd(month), today: bangkokDateValue() });
  }
  if (!allowed[action].includes(before.status)) {
    throw new HttpError(409, "PERIOD_TRANSITION_INVALID", `ไม่สามารถเปลี่ยนจาก “${before.status_label}” เป็น “${PERIOD_STATUS_LABELS[targetStatus]}” ได้`, { before, targetStatus });
  }

  const now = new Date().toISOString();
  const payload = { month_start: periodStart(month), status: targetStatus, updated_by: req.auth.user.id };
  if (action === "review") Object.assign(payload, { reviewed_by: req.auth.user.id, reviewed_at: now });
  if (action === "lock") Object.assign(payload, { locked_by: req.auth.user.id, locked_at: now });
  if (action === "reopen") Object.assign(payload, { reopened_by: req.auth.user.id, reopened_at: now, reopen_reason: reason });

  const { data, error } = await supabaseAdmin
    .from("data_periods")
    .upsert(payload, { onConflict: "month_start" })
    .select("id,month_start,status,reviewed_by,reviewed_at,locked_by,locked_at,reopened_by,reopened_at,reopen_reason,created_at,updated_at")
    .single();
  databaseFailure(error, "เปลี่ยนสถานะงวดไม่สำเร็จ");
  const after = await readPeriod(supabaseAdmin, month);
  await writeAuditLog({
    supabaseAdmin, req, action: `period.${action}`, targetType: "data_period", targetId: data?.id ?? month,
    beforeData: before, afterData: after, metadata: { month, reason }
  });
  return after;
}

export function createDataGovernanceRouter({ supabaseAdmin, authenticate }) {
  const router = Router();
  router.use(authenticate);

  router.get("/period-status", async (req, res, next) => {
    try {
      const month = normalizePeriodMonth(req.query.month);
      res.json({ period: await readPeriod(supabaseAdmin, month), today: bangkokDateValue(), timezone: "Asia/Bangkok" });
    } catch (error) { next(error); }
  });

  router.post("/period-status/:month/transition", async (req, res, next) => {
    try {
      const month = normalizePeriodMonth(req.params.month);
      const { action, reason } = validatePeriodTransition(req.body);
      const needed = action === "review" ? "review_data" : action === "lock" ? "lock_periods" : "reopen_periods";
      if (!req.auth.permissions.includes(needed)) throw new HttpError(403, "PERMISSION_FORBIDDEN", "คุณไม่มีสิทธิ์เปลี่ยนสถานะงวด", { requiredPermission: needed });
      const period = await transitionPeriod(supabaseAdmin, req, month, action, reason);
      res.json({ period });
    } catch (error) { next(error); }
  });

  router.post("/import-history", requirePermission("import_data"), async (req, res, next) => {
    try {
      const payload = validateImportHistoryInput(req.body);
      await assertPeriodWritable(supabaseAdmin, payload.month);
      const status = payload.errorRows > 0 ? (payload.validRows > 0 ? "validated_with_errors" : "rejected") : "validated";
      const { errors, ...historyInput } = payload;
      const { data, error } = await supabaseAdmin.from("import_histories").insert({
        month_start: periodStart(payload.month), category_id: payload.categoryId, module: payload.module,
        file_name: payload.fileName, sheet_name: payload.sheetName, status,
        total_rows: payload.totalRows, valid_rows: payload.validRows, error_rows: payload.errorRows,
        imported_by: req.auth.user.id
      }).select("*").single();
      databaseFailure(error, "บันทึกประวัติ Import ไม่สำเร็จ");
      if (errors.length) {
        const detailRows = errors.map((item) => ({ ...item, import_history_id: data.id }));
        const detailResult = await supabaseAdmin.from("import_history_errors").insert(detailRows);
        databaseFailure(detailResult.error, "บันทึกรายละเอียด Error ของ Import ไม่สำเร็จ");
      }
      await writeAuditLog({ supabaseAdmin, req, action: "import.validated", targetType: "import_history", targetId: data.id, afterData: data, metadata: { errorCount: errors.length } });
      res.status(201).json({ item: data, errors });
    } catch (error) { next(error); }
  });

  router.get("/import-history", async (req, res, next) => {
    try {
      const month = req.query.month ? normalizePeriodMonth(req.query.month) : null;
      let query = supabaseAdmin.from("import_histories").select("*").order("created_at", { ascending: false });
      if (month) query = query.eq("month_start", periodStart(month));
      const { data, error } = await query;
      databaseFailure(error, "โหลดประวัติ Import ไม่สำเร็จ");
      res.json({ items: data ?? [] });
    } catch (error) { next(error); }
  });

  router.get("/data-quality", async (req, res, next) => {
    try {
      const month = normalizePeriodMonth(req.query.month);
      const range = monthRange(month);
      const today = bangkokDateValue();
      const effectiveEnd = range.end < today ? range.end : today;
      const elapsedDays = effectiveEnd < range.start ? 0 : Number(effectiveEnd.slice(-2));
      const [period, categoriesResult] = await Promise.all([
        readPeriod(supabaseAdmin, month),
        supabaseAdmin.from("master_categories").select("id,module,code,name_th,unit,active").in("module", ["waste", "tissue", "animal_feed", "garbage_bag", "consumable"]).eq("active", true).order("module").order("sort_order")
      ]);
      databaseFailure(categoriesResult.error, "โหลดประเภทข้อมูลเพื่อตรวจคุณภาพไม่สำเร็จ");
      const categories = categoriesResult.data ?? [];
      let entries = [];
      if (categories.length && elapsedDays > 0) {
        const result = await supabaseAdmin.from("daily_entries").select("category_id,entry_date,quantity").in("category_id", categories.map((item) => item.id)).gte("entry_date", range.start).lte("entry_date", effectiveEnd);
        databaseFailure(result.error, "โหลดข้อมูลเพื่อตรวจคุณภาพไม่สำเร็จ");
        entries = result.data ?? [];
      }
      const issues = [];
      const categoryResults = categories.map((category) => {
        const actual = new Set(entries.filter((item) => item.category_id === category.id).map((item) => item.entry_date));
        const missingDates = [];
        for (let day = 1; day <= elapsedDays; day += 1) {
          const date = `${month}-${String(day).padStart(2, "0")}`;
          if (!actual.has(date)) missingDates.push(date);
        }
        if (missingDates.length) issues.push({ severity: "warning", code: "MISSING_DAILY_DATA", category_id: category.id, category_name: category.name_th, count: missingDates.length, dates: missingDates });
        return { ...category, expected_days: elapsedDays, filled_days: actual.size, missing_days: missingDates.length, completeness_percent: elapsedDays ? Math.round((actual.size / elapsedDays) * 10000) / 100 : 100 };
      });
      if (period.status !== "locked" && range.end < today) issues.push({ severity: "info", code: "PERIOD_NOT_LOCKED", message: "เดือนที่ผ่านมาแล้วยังไม่ได้ปิดงวด" });
      const expectedCells = categories.length * elapsedDays;
      const filledCells = categoryResults.reduce((sum, item) => sum + item.filled_days, 0);
      res.json({
        month, today, timezone: "Asia/Bangkok", period, elapsed_days: elapsedDays,
        summary: { categories: categories.length, expected_cells: expectedCells, filled_cells: filledCells, missing_cells: Math.max(0, expectedCells - filledCells), completeness_percent: expectedCells ? Math.round((filledCells / expectedCells) * 10000) / 100 : 100, issue_count: issues.length },
        categories: categoryResults, issues
      });
    } catch (error) { next(error); }
  });

  // GET /api/audit-logs — ดูประวัติ Audit Log (ต้องการสิทธิ์ view_audit_logs)
  router.get("/audit-logs", requirePermission("view_audit_logs"), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);
      const actionFilter = req.query.action ? String(req.query.action).trim() : null;
      const userFilter = req.query.user_id ? String(req.query.user_id).trim() : null;
      const targetTypeFilter = req.query.target_type ? String(req.query.target_type).trim() : null;
      const fromDate = req.query.from ? String(req.query.from).trim() : null;
      const toDate = req.query.to ? String(req.query.to).trim() : null;

      let query = supabaseAdmin
        .from("audit_logs")
        .select("id,action,target_type,target_id,before_data,after_data,metadata,performed_by,created_at,profiles!audit_logs_performed_by_fkey(id,full_name,email,role)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (actionFilter) query = query.ilike("action", `%${actionFilter}%`);
      if (userFilter) query = query.eq("performed_by", userFilter);
      if (targetTypeFilter) query = query.eq("target_type", targetTypeFilter);
      if (fromDate) query = query.gte("created_at", fromDate);
      if (toDate) query = query.lte("created_at", toDate + "T23:59:59.999Z");

      const { data, error, count } = await query;
      databaseFailure(error, "โหลดประวัติ Audit Log ไม่สำเร็จ");

      res.json({
        items: (data ?? []).map((item) => ({
          id: item.id,
          action: item.action,
          targetType: item.target_type,
          targetId: item.target_id,
          beforeData: item.before_data,
          afterData: item.after_data,
          metadata: item.metadata,
          performedBy: item.performed_by,
          performedByUser: item.profiles ? {
            id: item.profiles.id,
            fullName: item.profiles.full_name,
            email: item.profiles.email,
            role: item.profiles.role
          } : null,
          createdAt: item.created_at
        })),
        total: count ?? 0,
        limit,
        offset
      });
    } catch (error) { next(error); }
  });

  return router;
}
