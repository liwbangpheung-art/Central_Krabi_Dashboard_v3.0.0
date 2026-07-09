import { Router } from "express";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { summarizeScrapSales } from "../domain/scrap-sales-summary.js";
import { assertNotFutureDate, assertPeriodWritable } from "../domain/data-governance.js";
import { writeAuditLog } from "../security/audit.js";
import {
  validatePriceResolutionQuery,
  validateScrapSaleInput,
  validateScrapSalesQuery
} from "../validation/scrap-sale.js";

const CATEGORY_FIELDS = "id,module,code,name_th,name_en,unit,color_hex,pattern,sort_order,active,metadata";
const SALE_FIELDS = "id,sale_date,category_id,weight_kg,price_per_kg,amount,note,created_by,updated_by,created_at,updated_at";

function databaseFailure(error, fallbackMessage) {
  if (!error) return;
  const message = error.message || fallbackMessage;
  if (message.includes("SCRAP_SALE_CATEGORY_NOT_FOUND")) {
    throw new HttpError(404, "SCRAP_SALE_CATEGORY_NOT_FOUND", "ไม่พบประเภทเศษวัสดุ");
  }
  if (message.includes("FUTURE_DATE_NOT_ALLOWED")) throw new HttpError(400, "FUTURE_DATE_NOT_ALLOWED", "ไม่สามารถบันทึกรายการขายในอนาคตได้");
  if (message.includes("PERIOD_LOCKED")) throw new HttpError(409, "PERIOD_LOCKED", "งวดข้อมูลปิดแล้ว ไม่สามารถแก้ไขรายการขายได้");
  if (message.includes("SCRAP_SALE_CATEGORY_INVALID")) {
    throw new HttpError(400, "SCRAP_SALE_CATEGORY_INVALID", "ประเภทต้องอยู่ในหมวดเศษวัสดุ");
  }
  if (error.code === "23503") {
    throw new HttpError(409, "REFERENCE_INVALID", "ประเภทวัสดุหรือผู้ใช้งานที่อ้างอิงไม่ถูกต้อง", { databaseMessage: message });
  }
  if (error.code === "23514") {
    throw new HttpError(400, "CONSTRAINT_VIOLATION", "น้ำหนัก ราคา หรือหมายเหตุไม่ผ่านเงื่อนไขของระบบ", { databaseMessage: message });
  }
  throw new HttpError(500, "DATABASE_ERROR", fallbackMessage, { databaseMessage: message, databaseCode: error.code });
}

async function getCategoryOrThrow(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("master_categories")
    .select(CATEGORY_FIELDS)
    .eq("id", id)
    .maybeSingle();
  databaseFailure(error, "อ่านประเภทเศษวัสดุไม่สำเร็จ");
  if (!data) throw new HttpError(404, "CATEGORY_NOT_FOUND", "ไม่พบประเภทเศษวัสดุที่ระบุ");
  if (data.module !== "scrap_material") {
    throw new HttpError(400, "CATEGORY_NOT_SCRAP_MATERIAL", "ประเภทต้องอยู่ในหมวดเศษวัสดุ");
  }
  return data;
}

async function getSaleOrThrow(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("scrap_sales")
    .select(SALE_FIELDS)
    .eq("id", id)
    .maybeSingle();
  databaseFailure(error, "อ่านรายการขายไม่สำเร็จ");
  if (!data) throw new HttpError(404, "SCRAP_SALE_NOT_FOUND", "ไม่พบรายการขายที่ระบุ");
  return data;
}

async function resolvePrice(supabaseAdmin, categoryId, onDate) {
  const { data, error } = await supabaseAdmin.rpc("get_scrap_price_at", {
    p_category_id: categoryId,
    p_on_date: onDate
  });
  databaseFailure(error, "ค้นหาราคาตามวันที่ไม่สำเร็จ");
  return data === null || data === undefined ? null : Number(data);
}

async function attachCategories(supabaseAdmin, sales) {
  const ids = [...new Set(sales.map((item) => item.category_id))];
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin
    .from("master_categories")
    .select(CATEGORY_FIELDS)
    .in("id", ids);
  databaseFailure(error, "โหลดชื่อประเภทเศษวัสดุไม่สำเร็จ");
  const map = new Map((data ?? []).map((item) => [item.id, item]));
  return sales.map((item) => ({ ...item, category: map.get(item.category_id) ?? null }));
}

async function readMonthSales(supabaseAdmin, range) {
  const { data, error } = await supabaseAdmin
    .from("scrap_sales")
    .select(SALE_FIELDS)
    .gte("sale_date", range.start)
    .lte("sale_date", range.end)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });
  databaseFailure(error, "โหลดรายการขายเศษวัสดุไม่สำเร็จ");
  return attachCategories(supabaseAdmin, data ?? []);
}

export function createScrapSalesRouter({ supabaseAdmin, authenticate }) {
  const router = Router();
  router.use(authenticate);

  router.get("/scrap-sales", async (req, res, next) => {
    try {
      const range = validateScrapSalesQuery(req.query);
      const items = await readMonthSales(supabaseAdmin, range);
      res.json({ month: range.month, items, summary: summarizeScrapSales(items) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/scrap-sales/price", async (req, res, next) => {
    try {
      const query = validatePriceResolutionQuery(req.query);
      const category = await getCategoryOrThrow(supabaseAdmin, query.categoryId);
      const price = await resolvePrice(supabaseAdmin, category.id, query.onDate);
      res.json({ category, date: query.onDate, pricePerKg: price });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scrap-sales", requirePermission("manage_scrap_sales"), async (req, res, next) => {
    try {
      const payload = validateScrapSaleInput(req.body);
      assertNotFutureDate(payload.sale_date, { field: "saleDate" });
      await assertPeriodWritable(supabaseAdmin, payload.sale_date.slice(0, 7));
      const category = await getCategoryOrThrow(supabaseAdmin, payload.category_id);
      if (!category.active) {
        throw new HttpError(409, "CATEGORY_INACTIVE", "ประเภทเศษวัสดุนี้ถูกปิดใช้งาน ไม่สามารถสร้างรายการใหม่ได้");
      }
      if (payload.price_per_kg === null) {
        payload.price_per_kg = await resolvePrice(supabaseAdmin, category.id, payload.sale_date);
        if (payload.price_per_kg === null) {
          throw new HttpError(422, "PRICE_NOT_FOUND", "ไม่พบราคาที่มีผลในวันที่ขาย กรุณากรอกราคาจริงหรือเพิ่มประวัติราคา");
        }
      }
      payload.created_by = req.auth.user.id;
      payload.updated_by = req.auth.user.id;

      const { data, error } = await supabaseAdmin
        .from("scrap_sales")
        .insert(payload)
        .select(SALE_FIELDS)
        .single();
      databaseFailure(error, "เพิ่มรายการขายเศษวัสดุไม่สำเร็จ");
      const [item] = await attachCategories(supabaseAdmin, [data]);
      await writeAuditLog({ supabaseAdmin, req, action: "scrap_sale.created", targetType: "scrap_sale", targetId: data.id, afterData: data });
      res.status(201).json({ item });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/scrap-sales/:id", requirePermission("manage_scrap_sales"), async (req, res, next) => {
    try {
      const existing = await getSaleOrThrow(supabaseAdmin, req.params.id);
      const payload = validateScrapSaleInput(req.body, { partial: true });
      const mergedCategoryId = payload.category_id ?? existing.category_id;
      const mergedSaleDate = payload.sale_date ?? existing.sale_date;
      assertNotFutureDate(mergedSaleDate, { field: "saleDate" });
      await assertPeriodWritable(supabaseAdmin, mergedSaleDate.slice(0, 7));
      const category = await getCategoryOrThrow(supabaseAdmin, mergedCategoryId);
      if (mergedCategoryId !== existing.category_id && !category.active) {
        throw new HttpError(409, "CATEGORY_INACTIVE", "ไม่สามารถเปลี่ยนเป็นประเภทที่ปิดใช้งานได้");
      }

      const combinationChanged = mergedCategoryId !== existing.category_id || mergedSaleDate !== existing.sale_date;
      if (payload.price_per_kg === null || (combinationChanged && !Object.hasOwn(payload, "price_per_kg"))) {
        payload.price_per_kg = await resolvePrice(supabaseAdmin, mergedCategoryId, mergedSaleDate);
        if (payload.price_per_kg === null) {
          throw new HttpError(422, "PRICE_NOT_FOUND", "ไม่พบราคาที่มีผลในวันที่ขาย กรุณากรอกราคาจริง");
        }
      }
      payload.updated_by = req.auth.user.id;

      const { data, error } = await supabaseAdmin
        .from("scrap_sales")
        .update(payload)
        .eq("id", existing.id)
        .select(SALE_FIELDS)
        .single();
      databaseFailure(error, "แก้ไขรายการขายเศษวัสดุไม่สำเร็จ");
      const [item] = await attachCategories(supabaseAdmin, [data]);
      await writeAuditLog({ supabaseAdmin, req, action: "scrap_sale.updated", targetType: "scrap_sale", targetId: data.id, beforeData: existing, afterData: data });
      res.json({ item });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/scrap-sales/:id", requirePermission("manage_scrap_sales"), async (req, res, next) => {
    try {
      const existing = await getSaleOrThrow(supabaseAdmin, req.params.id);
      await assertPeriodWritable(supabaseAdmin, existing.sale_date.slice(0, 7));
      const { error } = await supabaseAdmin.from("scrap_sales").delete().eq("id", existing.id);
      databaseFailure(error, "ลบรายการขายเศษวัสดุไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "scrap_sale.deleted", targetType: "scrap_sale", targetId: existing.id, beforeData: existing });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
