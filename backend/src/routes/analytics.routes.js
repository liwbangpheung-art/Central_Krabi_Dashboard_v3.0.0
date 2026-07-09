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

  router.get("/analytics/status", async (req, res, next) => {
    try {
      const { data: categories, error: catError } = await supabaseAdmin
        .from("master_categories")
        .select("id, module");
      if (catError) throw catError;

      const categoryModuleMap = {};
      for (const cat of (categories || [])) {
        categoryModuleMap[cat.id] = cat.module;
      }

      // Load daily entries with quantity > 0
      const { data: entries, error: entryError } = await supabaseAdmin
        .from("daily_entries")
        .select("category_id, entry_date")
        .gt("quantity", 0);
      if (entryError) throw entryError;

      // Load scrap sales
      const { data: sales, error: salesError } = await supabaseAdmin
        .from("scrap_sales")
        .select("category_id, sale_date");
      if (salesError) throw salesError;

      const activeMonths = {
        waste: new Set(),
        tissue: new Set(),
        animal_feed: new Set(),
        garbage_bag: new Set(),
        consumable: new Set(),
        scrap_sales: new Set(),
      };

      for (const entry of (entries || [])) {
        const mod = categoryModuleMap[entry.category_id];
        if (mod && activeMonths[mod]) {
          activeMonths[mod].add(entry.entry_date.slice(0, 7));
        }
      }

      for (const sale of (sales || [])) {
        activeMonths.scrap_sales.add(sale.sale_date.slice(0, 7));
      }

      const response = {};
      for (const [key, set] of Object.entries(activeMonths)) {
        response[key] = [...set].sort();
      }

      res.json({ activeMonths: response });
    } catch (error) {
      next(error);
    }
  });

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

  // ──────────────────────────────────────────────────────
  // GET /api/analytics/compare — เปรียบเทียบข้อมูล 2 ช่วง
  // ──────────────────────────────────────────────────────
  router.get("/analytics/compare", async (req, res, next) => {
    try {
      const module = String(req.query.module || "waste").trim();
      const mode = String(req.query.mode || "year").trim();        // 'year' | 'quarter'
      const breakdown = String(req.query.breakdown || "month").trim(); // 'month' | 'category'
      const metric = String(req.query.metric || (module === "scrap_sales" ? "amount" : "quantity")).trim();
      const periodA = String(req.query.periodA || "").trim();
      const periodB = String(req.query.periodB || "").trim();

      if (!["waste", "tissue", "animal_feed", "garbage_bag", "consumable", "scrap_sales"].includes(module)) {
        throw new HttpError(400, "INVALID_MODULE", "หมวดข้อมูลไม่ถูกต้อง");
      }
      if (!["year", "quarter", "month"].includes(mode)) {
        throw new HttpError(400, "INVALID_MODE", "โหมดเปรียบเทียบต้องเป็น year, quarter หรือ month");
      }
      if (!["month", "category"].includes(breakdown)) {
        throw new HttpError(400, "INVALID_BREAKDOWN", "แจกแจงต้องเป็น month หรือ category");
      }

      const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

      // Parse periods
      function parsePeriod(str, modeType) {
        if (modeType === "year") {
          const y = Number(str);
          if (!y || y < 2000 || y > 2200) throw new HttpError(400, "INVALID_PERIOD", `ปีไม่ถูกต้อง: ${str}`);
          return { start: `${y}-01-01`, end: `${y}-12-31`, label: `ปี ${y + 543} (${y})`, key: String(y) };
        } else if (modeType === "quarter") {
          // Quarter: "2024-Q1" or "2024-1"
          const qMatch = /^(\d{4})-?Q?(\d)$/i.exec(str);
          if (!qMatch) throw new HttpError(400, "INVALID_PERIOD", `รูปแบบไตรมาสไม่ถูกต้อง: ${str}`);
          const y = Number(qMatch[1]);
          const q = Number(qMatch[2]);
          if (q < 1 || q > 4) throw new HttpError(400, "INVALID_PERIOD", `ไตรมาสต้องเป็น 1-4: ${str}`);
          const firstMonth = (q - 1) * 3 + 1;
          const lastMonth = firstMonth + 2;
          const lastDay = new Date(Date.UTC(y, lastMonth, 0)).getUTCDate();
          return {
            start: `${y}-${String(firstMonth).padStart(2, "0")}-01`,
            end: `${y}-${String(lastMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
            label: `Q${q}/${y + 543} (${y})`,
            key: `${y}-Q${q}`
          };
        } else {
          // Month: "2026-01" or "2026-1"
          const mMatch = /^(\d{4})-?(\d{2}|\d)$/.exec(str);
          if (!mMatch) throw new HttpError(400, "INVALID_PERIOD", `รูปแบบเดือนไม่ถูกต้อง: ${str}`);
          const y = Number(mMatch[1]);
          const m = Number(mMatch[2]);
          if (m < 1 || m > 12) throw new HttpError(400, "INVALID_PERIOD", `เดือนต้องเป็น 1-12: ${str}`);
          const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
          return {
            start: `${y}-${String(m).padStart(2, "0")}-01`,
            end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
            label: `${THAI_MONTHS[m - 1]} ${y + 543} (${y})`,
            key: `${y}-${String(m).padStart(2, "0")}`
          };
        }
      }

      const pA = parsePeriod(periodA, mode);
      const pB = parsePeriod(periodB, mode);

      const categories = await loadCategories(supabaseAdmin, module);
      const categoryMap = new Map(categories.map(c => [c.id, c]));

      // Determine value/date fields
      const isScrap = module === "scrap_sales";
      const valueField = isScrap ? (metric === "weight" ? "weight_kg" : "amount") : "quantity";
      const dateField = isScrap ? "sale_date" : "entry_date";

      // Load records for both periods at once
      const globalStart = pA.start < pB.start ? pA.start : pB.start;
      const globalEnd = pA.end > pB.end ? pA.end : pB.end;

      let allRecords;
      if (isScrap) {
        const { data, error } = await supabaseAdmin.from("scrap_sales")
          .select(`category_id,sale_date,${valueField}`)
          .gte("sale_date", globalStart).lte("sale_date", globalEnd);
        databaseFailure(error, "โหลดข้อมูลขายเพื่อเปรียบเทียบไม่สำเร็จ");
        allRecords = data ?? [];
      } else {
        const ids = categories.map(c => c.id);
        if (!ids.length) {
          return res.json({ mode, periodA: pA, periodB: pB, breakdown, unit: "หน่วย", rows: [], summary: { totalA: 0, totalB: 0, difference: 0, percent: null } });
        }
        const { data, error } = await supabaseAdmin.from("daily_entries")
          .select("category_id,entry_date,quantity")
          .in("category_id", ids)
          .gte("entry_date", globalStart).lte("entry_date", globalEnd);
        databaseFailure(error, "โหลดข้อมูลรายวันเพื่อเปรียบเทียบไม่สำเร็จ");
        allRecords = data ?? [];
      }

      const recordsA = allRecords.filter(r => r[dateField] >= pA.start && r[dateField] <= pA.end);
      const recordsB = allRecords.filter(r => r[dateField] >= pB.start && r[dateField] <= pB.end);

      function round(v) { return Math.round((Number(v) + Number.EPSILON) * 10000) / 10000; }
      function variance(a, b) {
        const diff = round(b - a);
        const pct = a === 0 ? null : round((diff / a) * 100);
        return { difference: diff, percent: pct };
      }

      let rows;

      if (breakdown === "month") {
        // Determine which months to show based on mode
        let monthSlots;
        if (mode === "year") {
          monthSlots = Array.from({ length: 12 }, (_, i) => i + 1);
        } else {
          // Quarter mode — 3 months
          const qA = /Q?(\d)/i.exec(periodA);
          const qNum = qA ? Number(qA[1]) : 1;
          const firstMonth = (qNum - 1) * 3 + 1;
          monthSlots = [firstMonth, firstMonth + 1, firstMonth + 2];
        }

        rows = monthSlots.map(m => {
          const mm = String(m).padStart(2, "0");
          const sumA = recordsA
            .filter(r => Number(r[dateField].slice(5, 7)) === m)
            .reduce((s, r) => s + Number(r[valueField] || 0), 0);
          const sumB = recordsB
            .filter(r => Number(r[dateField].slice(5, 7)) === m)
            .reduce((s, r) => s + Number(r[valueField] || 0), 0);
          const v = variance(sumA, sumB);
          return { label: THAI_MONTHS[m - 1], month: m, valueA: round(sumA), valueB: round(sumB), ...v };
        });
      } else {
        // breakdown === "category"
        rows = categories.map(cat => {
          const sumA = recordsA
            .filter(r => r.category_id === cat.id)
            .reduce((s, r) => s + Number(r[valueField] || 0), 0);
          const sumB = recordsB
            .filter(r => r.category_id === cat.id)
            .reduce((s, r) => s + Number(r[valueField] || 0), 0);
          const v = variance(sumA, sumB);
          return { label: cat.name_th, code: cat.code, color: cat.color_hex, valueA: round(sumA), valueB: round(sumB), ...v };
        });
      }

      const totalA = round(rows.reduce((s, r) => s + r.valueA, 0));
      const totalB = round(rows.reduce((s, r) => s + r.valueB, 0));
      const summaryVar = variance(totalA, totalB);

      const unit = isScrap ? (metric === "weight" ? "กก." : "บาท") : categories[0]?.unit || "หน่วย";

      res.json({
        mode,
        periodA: pA,
        periodB: pB,
        breakdown,
        unit,
        rows,
        summary: { totalA, totalB, ...summaryVar }
      });
    } catch (error) { next(error); }
  });

  return router;
}
