import { Router } from "express";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { writeAuditLog } from "../security/audit.js";

function databaseFailure(error, fallbackMessage) {
  if (!error) return;
  const message = error.message || fallbackMessage;
  if (message.includes("PERIOD_LOCKED")) {
    throw new HttpError(409, "PERIOD_LOCKED", "งวดข้อมูลสำหรับวันที่ดังกล่าวถูกปิดล็อกแล้ว ไม่สามารถแก้ไขได้");
  }
  throw new HttpError(500, "DATABASE_ERROR", fallbackMessage, { databaseMessage: message, databaseCode: error.code });
}

export function createBulkDataRouter({ supabaseAdmin, authenticate }) {
  const router = Router();
  router.use(authenticate);

  // ตรวจสอบสิทธิ์เฉพาะ Admin และ Owner
  router.use((req, res, next) => {
    const userRole = req.auth?.profile?.role;
    if (userRole !== "owner" && userRole !== "admin") {
      return next(new HttpError(403, "ADMIN_OWNER_REQUIRED", "ฟังก์ชันนี้สงวนสิทธิ์สำหรับแอดมินและเจ้าของระบบเท่านั้น"));
    }
    next();
  });

  // GET /api/bulk-entries - ดึงข้อมูลปริมาณขยะรายปีสำหรับส่งออก CSV
  router.get("/bulk-entries", async (req, res, next) => {
    try {
      const year = Number(req.query.year);
      if (!year || year < 2000 || year > 2100) {
        throw new HttpError(400, "INVALID_YEAR", "กรุณาระบุปีงบประมาณที่ถูกต้อง (ค.ศ.)");
      }

      const categoryId = req.query.categoryId ? String(req.query.categoryId).trim() : null;

      let query = supabaseAdmin
        .from("daily_entries")
        .select("entry_date, quantity, note, master_categories(id, code, name_th, module)")
        .gte("entry_date", `${year}-01-01`)
        .lte("entry_date", `${year}-12-31`)
        .order("entry_date", { ascending: true });

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query;
      databaseFailure(error, "ดึงข้อมูลสำหรับการส่งออกแบบกลุ่มไม่สำเร็จ");

      res.json({
        items: (data ?? []).map((item) => ({
          date: item.entry_date,
          categoryCode: item.master_categories?.code || "",
          categoryName: item.master_categories?.name_th || "",
          module: item.master_categories?.module || "",
          quantity: Number(item.quantity),
          note: item.note || ""
        }))
      });
    } catch (error) { next(error); }
  });

  // POST /api/bulk-entries/import - นำเข้าข้อมูลรายวันหลายเดือนผ่าน CSV
  router.post("/bulk-entries/import", async (req, res, next) => {
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows) || !rows.length) {
        throw new HttpError(400, "INVALID_PAYLOAD", "ไม่พบข้อมูลที่ส่งเข้ามานำเข้า");
      }

      // 1. ดึงข้อมูล Master Categories ทั้งหมดเพื่อตรวจสอบรหัสและนำไป map เป็น UUID
      const { data: categories, error: catError } = await supabaseAdmin
        .from("master_categories")
        .select("id, code, module, active");
      databaseFailure(catError, "โหลดข้อมูลประเภทวัสดุขยะล้มเหลว");

      const categoryMap = new Map();
      for (const cat of (categories ?? [])) {
        categoryMap.set(cat.code.toUpperCase(), cat);
      }

      // 2. ตรวจสอบข้อมูลเบื้องต้นและแปลงข้อมูล
      const parsedRows = [];
      const validationErrors = [];
      const bangkokToday = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })).toISOString().slice(0, 10);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const line = i + 1;
        const dateStr = String(row.date || "").trim();
        const codeStr = String(row.categoryCode || "").trim().toUpperCase();
        const qtyVal = Number(row.quantity);
        const noteStr = row.note ? String(row.note).trim() : null;

        // ตรวจสอบรูปแบบวันที่
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          validationErrors.push(`แถวที่ ${line}: รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD เช่น 2026-07-08)`);
          continue;
        }

        // ห้ามระบุวันที่ในอนาคต
        if (dateStr > bangkokToday) {
          validationErrors.push(`แถวที่ ${line}: วันที่ ${dateStr} อยู่ในอนาคต ไม่สามารถป้อนข้อมูลได้`);
          continue;
        }

        // ตรวจสอบประเภทขยะในระบบ
        const catObj = categoryMap.get(codeStr);
        if (!catObj) {
          validationErrors.push(`แถวที่ ${line}: ไม่พบประเภทวัสดุ/ขยะรหัส "${codeStr}" ในระบบ`);
          continue;
        }

        if (!catObj.active) {
          validationErrors.push(`แถวที่ ${line}: ประเภทวัสดุ/ขยะรหัส "${codeStr}" ถูกปิดใช้งานชั่วคราว`);
          continue;
        }

        // ตรวจสอบจำนวนปริมาณ
        if (isNaN(qtyVal) || qtyVal < 0) {
          validationErrors.push(`แถวที่ ${line}: จำนวนต้องเป็นตัวเลขที่ไม่ติดลบ`);
          continue;
        }

        // หาจุดเริ่มต้นเดือนเพื่อใช้คัดแยกงวดข้อมูล
        const monthStart = `${dateStr.slice(0, 7)}-01`;

        parsedRows.push({
          date: dateStr,
          categoryId: catObj.id,
          categoryCode: catObj.code,
          module: catObj.module,
          quantity: qtyVal,
          note: noteStr,
          monthStart,
          line
        });
      }

      if (validationErrors.length) {
        throw new HttpError(400, "VALIDATION_FAILED", "ข้อมูลที่ส่งมามีข้อผิดพลาดบางจุด", { errors: validationErrors });
      }

      // 3. ดึงเดือนทั้งหมดมาตรวจสอบสถานะการปิดงวดในตาราง data_periods
      const uniqueMonths = [...new Set(parsedRows.map((r) => r.monthStart))];
      const { data: periods, error: periodError } = await supabaseAdmin
        .from("data_periods")
        .select("month_start, status")
        .in("month_start", uniqueMonths);
      databaseFailure(periodError, "ตรวจสอบงวดข้อมูลผิดพลาด");

      const lockedMonths = new Set(
        (periods ?? [])
          .filter((p) => p.status === "locked")
          .map((p) => p.month_start)
      );

      // ค้นหาแถวที่อยู่งวดล็อกเพื่อแสดงให้ผู้ใช้งานทราบ
      const lockedErrors = [];
      for (const row of parsedRows) {
        if (lockedMonths.has(row.monthStart)) {
          lockedErrors.push(`แถวที่ ${row.line}: วันที่ ${row.date} อยู่ในงวดล็อก (${row.monthStart.slice(0, 7)}) ที่ปิดการบันทึกแล้ว`);
        }
      }

      if (lockedErrors.length) {
        throw new HttpError(409, "PERIOD_LOCKED", "ไม่สามารถนำเข้าได้เนื่องจากมีงวดข้อมูลที่ถูกล็อกอยู่", { errors: lockedErrors });
      }

      // 4. จัดกลุ่มข้อมูลตาม categoryId และ monthStart เพื่อทะยอยเขียนข้อมูลทีละเดือนประเภทขยะแบบปลอดภัย
      const groups = {};
      for (const r of parsedRows) {
        const key = `${r.categoryId}:${r.monthStart}`;
        if (!groups[key]) {
          groups[key] = {
            categoryId: r.categoryId,
            monthStart: r.monthStart,
            module: r.module,
            entries: []
          };
        }
        groups[key].entries.push({
          date: r.date,
          quantity: r.quantity,
          note: r.note
        });
      }

      // 5. บันทึกข้อมูลเข้า DB (วนลูป replace รายเดือนขยะ)
      for (const key of Object.keys(groups)) {
        const grp = groups[key];
        const { error: rpcError } = await supabaseAdmin.rpc("replace_daily_month", {
          p_category_id: grp.categoryId,
          p_month_start: grp.monthStart,
          p_entries: grp.entries,
          p_changed_by: req.auth.user.id
        });
        databaseFailure(rpcError, `เขียนข้อมูลรายเดือนล้มเหลวสำหรับประเภท ${grp.categoryId} เดือน ${grp.monthStart}`);

        // สร้างบันทึกประวัติการนำเข้าในตาราง import_histories
        await supabaseAdmin.from("import_histories").insert({
          month_start: grp.monthStart,
          category_id: grp.categoryId,
          module: grp.module,
          file_name: "bulk_csv_import",
          status: "committed",
          total_rows: grp.entries.length,
          valid_rows: grp.entries.length,
          error_rows: 0,
          imported_by: req.auth.user.id,
          committed_at: new Date().toISOString()
        });
      }

      // 6. เขียนประวัติลงใน Audit Logs
      await writeAuditLog({
        supabaseAdmin,
        req,
        action: "bulk_import.committed",
        targetType: "bulk_import",
        targetId: req.auth.user.id,
        afterData: {
          totalRows: parsedRows.length,
          monthsAffected: uniqueMonths,
          categoriesCount: Object.keys(groups).length
        },
        metadata: {}
      });

      res.json({
        success: true,
        importedRowsCount: parsedRows.length,
        monthsAffected: uniqueMonths
      });
    } catch (error) { next(error); }
  });

  return router;
}
