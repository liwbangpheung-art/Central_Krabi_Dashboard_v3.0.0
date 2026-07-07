import { Router } from "express";
import { buildAnalytics, calculateComparison, weeklyBreakdown } from "../domain/analytics.js";
import { validateAnalyticsQuery } from "../validation/analytics.js";
import { HttpError } from "../http/errors.js";

const CATEGORY_FIELDS = "id,module,code,name_th,name_en,unit,color_hex,pattern,sort_order,active,metadata";

function databaseFailure(error, fallbackMessage) {
  if (!error) return;
  throw new HttpError(500, "DATABASE_ERROR", fallbackMessage, { databaseMessage: error.message, databaseCode: error.code });
}

async function loadCategories(supabaseAdmin, module) {
  const categoryModule = module === "scrap_sales" ? "scrap_material" : module;
  const { data, error } = await supabaseAdmin
    .from("master_categories")
    .select(CATEGORY_FIELDS)
    .eq("module", categoryModule)
    .order("sort_order", { ascending: true })
    .order("name_th", { ascending: true });
  databaseFailure(error, "โหลดประเภทข้อมูลสำหรับการวิเคราะห์ไม่สำเร็จ");
  return data ?? [];
}

async function loadRecords(supabaseAdmin, query, start, end) {
  if (query.module === "scrap_sales") {
    const field = query.metric === "weight" ? "weight_kg" : "amount";
    const { data, error } = await supabaseAdmin.from("scrap_sales")
      .select(`category_id,sale_date,${field}`)
      .gte("sale_date", start).lte("sale_date", end).order("sale_date", { ascending: true });
    databaseFailure(error, "โหลดข้อมูลการขายเพื่อวิเคราะห์ไม่สำเร็จ");
    return { records: data ?? [], valueField: field, dateField: "sale_date" };
  }
  const categories = await loadCategories(supabaseAdmin, query.module);
  const ids = categories.map((item) => item.id);
  if (!ids.length) return { records: [], valueField: "quantity", dateField: "entry_date", categories };
  const { data, error } = await supabaseAdmin.from("daily_entries")
    .select("category_id,entry_date,quantity")
    .in("category_id", ids).gte("entry_date", start).lte("entry_date", end).order("entry_date", { ascending: true });
  databaseFailure(error, "โหลดข้อมูลรายวันเพื่อวิเคราะห์ไม่สำเร็จ");
  return { records: data ?? [], valueField: "quantity", dateField: "entry_date", categories };
}

export function createAnalyticsRouter({ supabaseAdmin, authenticate }) {
  const router = Router();
  router.use(authenticate);

  router.get("/analytics", async (req, res, next) => {
    try {
      const query = validateAnalyticsQuery(req.query);
      const categories = await loadCategories(supabaseAdmin, query.module);
      const fullStart = query.comparison && query.comparison.start < query.start ? query.comparison.start : query.start;
      const fullEnd = query.comparison && query.comparison.end > query.end ? query.comparison.end : query.end;
      const loaded = await loadRecords(supabaseAdmin, query, fullStart, fullEnd);
      const currentRecords = loaded.records.filter((item) => item[loaded.dateField] >= query.start && item[loaded.dateField] <= query.end);
      const analysis = buildAnalytics({ categories, records: currentRecords, query, valueField: loaded.valueField, dateField: loaded.dateField });
      const previousRecords = query.comparison
        ? loaded.records.filter((item) => item[loaded.dateField] >= query.comparison.start && item[loaded.dateField] <= query.comparison.end)
        : [];
      const previousTotal = previousRecords.reduce((sum, item) => sum + Number(item[loaded.valueField] || 0), 0);
      const weekly = query.view === "monthly" && query.module !== "scrap_sales"
        ? weeklyBreakdown({ categories, records: currentRecords, monthStart: query.start, monthEnd: query.end, valueField: loaded.valueField, dateField: loaded.dateField })
        : [];
      res.json({
        query,
        unit: query.module === "scrap_sales" ? (query.metric === "weight" ? "กก." : "บาท") : categories[0]?.unit || "หน่วย",
        ...analysis,
        comparison: calculateComparison(analysis.kpis.grandTotal, previousTotal),
        weekly
      });
    } catch (error) { next(error); }
  });

  return router;
}
