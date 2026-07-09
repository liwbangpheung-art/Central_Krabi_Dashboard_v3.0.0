import { Router } from "express";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { writeAuditLog } from "../security/audit.js";
import {
  MASTER_MODULES,
  validateMasterCategoryInput,
  validateScrapPriceInput
} from "../validation/master-data.js";

const CATEGORY_FIELDS = "id,module,code,name_th,name_en,unit,color_hex,pattern,sort_order,active,metadata,created_by,updated_by,created_at,updated_at";
const PRICE_FIELDS = "id,category_id,price_per_kg,effective_from,note,created_by,updated_by,created_at,updated_at";

function databaseFailure(error, fallbackMessage) {
  if (!error) return;
  if (error.code === "23505") {
    throw new HttpError(409, "DUPLICATE_RECORD", "มีรหัส ชื่อ หรือวันที่เริ่มใช้ราคานี้อยู่แล้ว", { databaseMessage: error.message });
  }
  if (error.code === "23503") {
    throw new HttpError(409, "RECORD_IN_USE", "รายการนี้ถูกใช้งานอยู่ จึงไม่สามารถลบหรือเปลี่ยนความสัมพันธ์ได้", { databaseMessage: error.message });
  }
  throw new HttpError(500, "DATABASE_ERROR", fallbackMessage, { databaseMessage: error.message, databaseCode: error.code });
}

async function getCategoryOrThrow(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("master_categories")
    .select(CATEGORY_FIELDS)
    .eq("id", id)
    .maybeSingle();
  databaseFailure(error, "อ่านข้อมูลประเภทไม่สำเร็จ");
  if (!data) throw new HttpError(404, "CATEGORY_NOT_FOUND", "ไม่พบประเภทข้อมูลที่ระบุ");
  return data;
}

async function countPriceHistory(supabaseAdmin, categoryId) {
  const { count, error } = await supabaseAdmin
    .from("scrap_price_history")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  databaseFailure(error, "ตรวจสอบประวัติราคาไม่สำเร็จ");
  return count ?? 0;
}

async function countDailyEntries(supabaseAdmin, categoryId) {
  const [entriesResult, logsResult] = await Promise.all([
    supabaseAdmin.from("daily_entries").select("id", { count: "exact", head: true }).eq("category_id", categoryId),
    supabaseAdmin.from("daily_entry_month_logs").select("id", { count: "exact", head: true }).eq("category_id", categoryId)
  ]);
  databaseFailure(entriesResult.error || logsResult.error, "ตรวจสอบประวัติข้อมูลรายวันไม่สำเร็จ");
  return (entriesResult.count ?? 0) + (logsResult.count ?? 0);
}


async function countScrapSales(supabaseAdmin, categoryId) {
  const { count, error } = await supabaseAdmin
    .from("scrap_sales")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  databaseFailure(error, "ตรวจสอบประวัติรายการขายไม่สำเร็จ");
  return count ?? 0;
}

export function createMasterDataRouter({ supabaseAdmin, authenticate }) {
  const router = Router();

  router.use(authenticate);

  router.get("/master-data/modules", (_req, res) => {
    res.json({ modules: MASTER_MODULES });
  });

  router.get("/master-data", async (req, res, next) => {
    try {
      const module = typeof req.query.module === "string" ? req.query.module : null;
      const status = typeof req.query.status === "string" ? req.query.status : "all";
      if (module && !MASTER_MODULES.includes(module)) {
        throw new HttpError(400, "INVALID_MODULE", "หมวดข้อมูลไม่ถูกต้อง", { allowed: MASTER_MODULES });
      }
      if (!new Set(["all", "active", "inactive"]).has(status)) {
        throw new HttpError(400, "INVALID_STATUS", "สถานะต้องเป็น all, active หรือ inactive");
      }

      let query = supabaseAdmin
        .from("master_categories")
        .select(CATEGORY_FIELDS)
        .order("module", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name_th", { ascending: true });
      if (module) query = query.eq("module", module);
      if (status !== "all") query = query.eq("active", status === "active");

      const { data, error } = await query;
      databaseFailure(error, "โหลด Master Data ไม่สำเร็จ");
      res.json({ items: data ?? [], module, status });
    } catch (error) {
      next(error);
    }
  });

  router.post("/master-data", requirePermission("manage_master_data"), async (req, res, next) => {
    try {
      const payload = validateMasterCategoryInput(req.body);
      payload.created_by = req.auth.user.id;
      payload.updated_by = req.auth.user.id;

      const { data, error } = await supabaseAdmin
        .from("master_categories")
        .insert(payload)
        .select(CATEGORY_FIELDS)
        .single();
      databaseFailure(error, "เพิ่มประเภทข้อมูลไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "master_data.created", targetType: "master_category", targetId: data.id, afterData: data });
      res.status(201).json({ item: data });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/master-data/:id", requirePermission("manage_master_data"), async (req, res, next) => {
    try {
      const existing = await getCategoryOrThrow(supabaseAdmin, req.params.id);
      const payload = validateMasterCategoryInput(req.body, { partial: true });

      if (payload.module && payload.module !== existing.module) {
        const [priceCount, dailyCount, saleCount] = await Promise.all([
          countPriceHistory(supabaseAdmin, existing.id),
          countDailyEntries(supabaseAdmin, existing.id),
          countScrapSales(supabaseAdmin, existing.id)
        ]);
        if (priceCount > 0 || dailyCount > 0 || saleCount > 0) {
          throw new HttpError(
            409,
            "CATEGORY_MODULE_LOCKED",
            "ประเภทที่มีข้อมูลย้อนหลังแล้วไม่สามารถย้ายหมวดได้ ให้สร้างประเภทใหม่แทน",
            { priceHistoryCount: priceCount, dailyEntryCount: dailyCount, scrapSaleCount: saleCount }
          );
        }
      }

      payload.updated_by = req.auth.user.id;
      const { data, error } = await supabaseAdmin
        .from("master_categories")
        .update(payload)
        .eq("id", existing.id)
        .select(CATEGORY_FIELDS)
        .single();
      databaseFailure(error, "แก้ไขประเภทข้อมูลไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "master_data.updated", targetType: "master_category", targetId: data.id, beforeData: existing, afterData: data });
      res.json({ item: data });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/master-data/:id", requirePermission("manage_master_data"), async (req, res, next) => {
    try {
      const existing = await getCategoryOrThrow(supabaseAdmin, req.params.id);
      const [priceCount, dailyCount, saleCount] = await Promise.all([
        countPriceHistory(supabaseAdmin, existing.id),
        countDailyEntries(supabaseAdmin, existing.id),
        countScrapSales(supabaseAdmin, existing.id)
      ]);
      if (priceCount > 0 || dailyCount > 0 || saleCount > 0) {
        throw new HttpError(
          409,
          "CATEGORY_HAS_HISTORY",
          "ประเภทนี้มีข้อมูลย้อนหลังแล้ว กรุณาปิดการใช้งานแทนการลบ",
          { priceHistoryCount: priceCount, dailyEntryCount: dailyCount, scrapSaleCount: saleCount }
        );
      }

      const { error } = await supabaseAdmin.from("master_categories").delete().eq("id", existing.id);
      databaseFailure(error, "ลบประเภทข้อมูลไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "master_data.deleted", targetType: "master_category", targetId: existing.id, beforeData: existing });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/scrap-prices", async (req, res, next) => {
    try {
      const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : null;
      let query = supabaseAdmin
        .from("scrap_price_history")
        .select(PRICE_FIELDS)
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false });
      if (categoryId) query = query.eq("category_id", categoryId);
      const { data, error } = await query;
      databaseFailure(error, "โหลดประวัติราคาไม่สำเร็จ");
      res.json({ items: data ?? [], categoryId });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scrap-prices", requirePermission("manage_prices"), async (req, res, next) => {
    try {
      const payload = validateScrapPriceInput(req.body);
      const category = await getCategoryOrThrow(supabaseAdmin, payload.category_id);
      if (category.module !== "scrap_material") {
        throw new HttpError(400, "CATEGORY_NOT_SCRAP_MATERIAL", "กำหนดราคาได้เฉพาะประเภทในหมวดเศษวัสดุ");
      }
      payload.created_by = req.auth.user.id;
      payload.updated_by = req.auth.user.id;

      const { data, error } = await supabaseAdmin
        .from("scrap_price_history")
        .insert(payload)
        .select(PRICE_FIELDS)
        .single();
      databaseFailure(error, "เพิ่มประวัติราคาไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "scrap_price.created", targetType: "scrap_price", targetId: data.id, afterData: data });
      res.status(201).json({ item: data });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/scrap-prices/:id", requirePermission("manage_prices"), async (req, res, next) => {
    try {
      const { data: existing, error: existingError } = await supabaseAdmin.from("scrap_price_history").select(PRICE_FIELDS).eq("id", req.params.id).maybeSingle();
      databaseFailure(existingError, "อ่านประวัติราคาไม่สำเร็จ");
      if (!existing) throw new HttpError(404, "PRICE_NOT_FOUND", "ไม่พบประวัติราคาที่ระบุ");
      const payload = validateScrapPriceInput(req.body, { partial: true });
      delete payload.category_id;
      if (Object.keys(payload).length === 0) {
        throw new HttpError(400, "VALIDATION_ERROR", "ไม่มีข้อมูลราคาที่ต้องการแก้ไข");
      }
      payload.updated_by = req.auth.user.id;

      const { data, error } = await supabaseAdmin
        .from("scrap_price_history")
        .update(payload)
        .eq("id", req.params.id)
        .select(PRICE_FIELDS)
        .maybeSingle();
      databaseFailure(error, "แก้ไขประวัติราคาไม่สำเร็จ");
      if (!data) throw new HttpError(404, "PRICE_NOT_FOUND", "ไม่พบประวัติราคาที่ระบุ");
      await writeAuditLog({ supabaseAdmin, req, action: "scrap_price.updated", targetType: "scrap_price", targetId: data.id, beforeData: existing, afterData: data });
      res.json({ item: data });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/scrap-prices/:id", requirePermission("manage_prices"), async (req, res, next) => {
    try {
      const { data: existing, error: existingError } = await supabaseAdmin.from("scrap_price_history").select(PRICE_FIELDS).eq("id", req.params.id).maybeSingle();
      databaseFailure(existingError, "อ่านประวัติราคาไม่สำเร็จ");
      if (!existing) throw new HttpError(404, "PRICE_NOT_FOUND", "ไม่พบประวัติราคาที่ระบุ");
      const { data, error } = await supabaseAdmin
        .from("scrap_price_history")
        .delete()
        .eq("id", req.params.id)
        .select("id")
        .maybeSingle();
      databaseFailure(error, "ลบประวัติราคาไม่สำเร็จ");
      if (!data) throw new HttpError(404, "PRICE_NOT_FOUND", "ไม่พบประวัติราคาที่ระบุ");
      await writeAuditLog({ supabaseAdmin, req, action: "scrap_price.deleted", targetType: "scrap_price", targetId: existing.id, beforeData: existing });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
