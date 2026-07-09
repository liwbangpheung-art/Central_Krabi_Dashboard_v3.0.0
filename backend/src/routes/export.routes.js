import { Router } from "express";
import { HttpError } from "../http/errors.js";
import { requirePermission } from "../middleware/auth.js";
import { hasPermission } from "../security/permissions.js";
import { validateExportLogInput, validateReportRunInput, validateBackendPowerPointInput } from "../validation/export-log.js";
import { validateReportPresetInput } from "../validation/report-preset.js";
import { writeAuditLog } from "../security/audit.js";
import { buildReportDataset, generatePowerPointBuffer, reportFileName, reportObjectPath, sha256 } from "../domain/report-generator.js";

function databaseFailure(error, message) {
  if (!error) return;
  if (error.code === "23505") throw new HttpError(409, "DUPLICATE_RECORD", "มีข้อมูลนี้อยู่แล้ว", { databaseMessage: error.message });
  if (error.code === "23514") throw new HttpError(400, "DATABASE_CONSTRAINT", "ข้อมูล Preset ไม่ผ่านกฎของระบบ", { databaseMessage: error.message });
  throw new HttpError(500, "DATABASE_ERROR", message, { databaseMessage: error.message, databaseCode: error.code });
}


function canManageTeamPreset(req, visibility = "private") {
  return visibility === "private" || hasPermission(req.auth, "manage_report_presets");
}

function serializePreset(row, userId) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    ownerId: row.owner_id,
    isOwner: row.owner_id === userId,
    config: row.config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    owner: row.profiles ? {
      id: row.profiles.id,
      fullName: row.profiles.full_name,
      email: row.profiles.email
    } : null
  };
}

export function createExportRouter({ supabaseAdmin, authenticate }) {
  const router = Router();
  router.use(authenticate);

  router.get("/export-logs", async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
      let query = supabaseAdmin.from("export_logs").select("id,export_format,module,view_mode,period_label,options,exported_by,created_at").order("created_at", { ascending: false }).limit(limit);
      if (!hasPermission(req.auth, "view_audit_logs")) query = query.eq("exported_by", req.auth.user.id);
      const { data, error } = await query;
      databaseFailure(error, "โหลดประวัติการ Export ไม่สำเร็จ");
      res.json({ items: data ?? [] });
    } catch (error) { next(error); }
  });



  router.get("/report-presets", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
      let query = supabaseAdmin
        .from("report_presets")
        .select("id,name,description,visibility,owner_id,config,created_at,updated_at,profiles:owner_id(id,email,full_name)")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (!hasPermission(req.auth, "manage_report_presets")) {
        query = query.or(`owner_id.eq.${req.auth.user.id},visibility.eq.team`);
      }
      const { data, error } = await query;
      databaseFailure(error, "โหลด Saved Report Presets ไม่สำเร็จ");
      res.json({ items: (data ?? []).map((row) => serializePreset(row, req.auth.user.id)) });
    } catch (error) { next(error); }
  });

  router.post("/report-presets", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const input = validateReportPresetInput(req.body);
      if (!canManageTeamPreset(req, input.visibility)) {
        throw new HttpError(403, "REPORT_PRESET_VISIBILITY_FORBIDDEN", "คุณไม่มีสิทธิ์สร้าง Preset สำหรับทีม", { requiredPermission: "manage_report_presets" });
      }
      const { data, error } = await supabaseAdmin
        .from("report_presets")
        .insert({ ...input, owner_id: req.auth.user.id })
        .select("id,name,description,visibility,owner_id,config,created_at,updated_at,profiles:owner_id(id,email,full_name)")
        .single();
      databaseFailure(error, "บันทึก Saved Report Preset ไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "report_preset.created", targetType: "report_preset", targetId: data.id, afterData: data, metadata: { visibility: data.visibility } });
      res.status(201).json({ item: serializePreset(data, req.auth.user.id) });
    } catch (error) { next(error); }
  });

  router.patch("/report-presets/:id", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const presetId = req.params.id;
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("report_presets")
        .select("id,name,description,visibility,owner_id,config,created_at,updated_at")
        .eq("id", presetId)
        .maybeSingle();
      databaseFailure(existingError, "อ่าน Saved Report Preset ไม่สำเร็จ");
      if (!existing) throw new HttpError(404, "REPORT_PRESET_NOT_FOUND", "ไม่พบ Preset ที่ระบุ");
      const isOwner = existing.owner_id === req.auth.user.id;
      const canManage = hasPermission(req.auth, "manage_report_presets");
      if (!isOwner && !canManage) throw new HttpError(403, "REPORT_PRESET_FORBIDDEN", "คุณไม่มีสิทธิ์แก้ไข Preset นี้");

      const input = validateReportPresetInput(req.body, { partial: true });
      const nextVisibility = input.visibility ?? existing.visibility;
      if (!canManageTeamPreset(req, nextVisibility)) {
        throw new HttpError(403, "REPORT_PRESET_VISIBILITY_FORBIDDEN", "คุณไม่มีสิทธิ์ตั้ง Preset เป็นของทีม", { requiredPermission: "manage_report_presets" });
      }
      const { data, error } = await supabaseAdmin
        .from("report_presets")
        .update(input)
        .eq("id", presetId)
        .select("id,name,description,visibility,owner_id,config,created_at,updated_at,profiles:owner_id(id,email,full_name)")
        .single();
      databaseFailure(error, "แก้ไข Saved Report Preset ไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "report_preset.updated", targetType: "report_preset", targetId: presetId, beforeData: existing, afterData: data, metadata: { visibility: data.visibility } });
      res.json({ item: serializePreset(data, req.auth.user.id) });
    } catch (error) { next(error); }
  });

  router.delete("/report-presets/:id", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const presetId = req.params.id;
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("report_presets")
        .select("id,name,description,visibility,owner_id,config,created_at,updated_at")
        .eq("id", presetId)
        .maybeSingle();
      databaseFailure(existingError, "อ่าน Saved Report Preset ไม่สำเร็จ");
      if (!existing) throw new HttpError(404, "REPORT_PRESET_NOT_FOUND", "ไม่พบ Preset ที่ระบุ");
      const isOwner = existing.owner_id === req.auth.user.id;
      const canManage = hasPermission(req.auth, "manage_report_presets");
      if (!isOwner && !canManage) throw new HttpError(403, "REPORT_PRESET_FORBIDDEN", "คุณไม่มีสิทธิ์ลบ Preset นี้");

      const { error } = await supabaseAdmin.from("report_presets").delete().eq("id", presetId);
      databaseFailure(error, "ลบ Saved Report Preset ไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "report_preset.deleted", targetType: "report_preset", targetId: presetId, beforeData: existing, metadata: { visibility: existing.visibility } });
      res.json({ deleted: true, id: presetId });
    } catch (error) { next(error); }
  });


  router.get("/report-runs", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
      let query = supabaseAdmin
        .from("report_runs")
        .select("id,preset_id,export_log_id,report_type,title,period_label,config,metadata,status,generated_by,generated_at,profiles:generated_by(id,email,full_name)")
        .order("generated_at", { ascending: false })
        .limit(limit);
      if (!hasPermission(req.auth, "view_audit_logs")) query = query.eq("generated_by", req.auth.user.id);
      const { data, error } = await query;
      databaseFailure(error, "โหลดประวัติการสร้างรายงานไม่สำเร็จ");
      res.json({ items: data ?? [] });
    } catch (error) { next(error); }
  });

  router.post("/report-runs", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const input = validateReportRunInput(req.body);
      const { data, error } = await supabaseAdmin
        .from("report_runs")
        .insert({ ...input, generated_by: req.auth.user.id })
        .select("id,preset_id,export_log_id,report_type,title,period_label,config,metadata,status,generated_by,generated_at")
        .single();
      databaseFailure(error, "บันทึกประวัติการสร้างรายงานไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "report_run.created", targetType: "report_run", targetId: data.id, afterData: data, metadata: { reportType: data.report_type, status: data.status } });
      res.status(201).json({ item: data });
    } catch (error) { next(error); }
  });



  router.get("/report-files", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
      let query = supabaseAdmin
        .from("report_files")
        .select("id,report_run_id,export_log_id,bucket,object_path,file_name,mime_type,file_size_bytes,file_sha256,metadata,generated_by,created_at,profiles:generated_by(id,email,full_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!hasPermission(req.auth, "view_audit_logs")) query = query.eq("generated_by", req.auth.user.id);
      const { data, error } = await query;
      databaseFailure(error, "โหลดไฟล์รายงานไม่สำเร็จ");
      res.json({ items: data ?? [] });
    } catch (error) { next(error); }
  });

  router.post("/report-files/:id/download", requirePermission("export_reports"), async (req, res, next) => {
    try {
      let query = supabaseAdmin
        .from("report_files")
        .select("id,bucket,object_path,file_name,generated_by")
        .eq("id", req.params.id)
        .maybeSingle();
      const { data: file, error } = await query;
      databaseFailure(error, "อ่านไฟล์รายงานไม่สำเร็จ");
      if (!file) throw new HttpError(404, "REPORT_FILE_NOT_FOUND", "ไม่พบไฟล์รายงาน");
      if (file.generated_by !== req.auth.user.id && !hasPermission(req.auth, "view_audit_logs")) {
        throw new HttpError(403, "REPORT_FILE_FORBIDDEN", "คุณไม่มีสิทธิ์ดาวน์โหลดไฟล์รายงานนี้");
      }
      const { data, error: signedError } = await supabaseAdmin.storage.from(file.bucket).createSignedUrl(file.object_path, 60 * 10, { download: file.file_name });
      databaseFailure(signedError, "สร้างลิงก์ดาวน์โหลดรายงานไม่สำเร็จ");
      res.json({ url: data.signedUrl, expiresIn: 600, fileName: file.file_name });
    } catch (error) { next(error); }
  });

  router.post("/reports/powerpoint", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const input = validateBackendPowerPointInput(req.body);
      const dataset = await buildReportDataset({ supabaseAdmin, settings: input.config });
      const { buffer, metadata } = await generatePowerPointBuffer({
        dataset,
        context: { organizationName: req.app?.locals?.organizationName || "Central Krabi", title: input.title }
      });
      const filename = reportFileName({ title: input.title, periodLabel: dataset.periodLabel });
      const bucket = req.app?.locals?.reportStorageBucket || "report-files";
      const objectPath = reportObjectPath({ userId: req.auth.user.id, filename });
      const mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(objectPath, buffer, { contentType: mimeType, upsert: false });
      databaseFailure(uploadError, "อัปโหลดไฟล์ PowerPoint ไปยัง Storage ไม่สำเร็จ");

      const { data: exportLog, error: exportLogError } = await supabaseAdmin.from("export_logs").insert({
        export_format: "pptx",
        module: input.config.modules[0] || "waste",
        view_mode: input.config.view || "monthly",
        period_label: dataset.periodLabel,
        options: { reportBuilder: true, backendGenerated: true, config: input.config, metadata },
        exported_by: req.auth.user.id
      }).select("id,export_format,module,view_mode,period_label,options,exported_by,created_at").single();
      databaseFailure(exportLogError, "บันทึก Export Log ไม่สำเร็จ");

      const { data: reportRun, error: runError } = await supabaseAdmin.from("report_runs").insert({
        preset_id: input.presetId,
        export_log_id: exportLog.id,
        report_type: "powerpoint_builder",
        title: input.title,
        period_label: dataset.periodLabel,
        config: input.config,
        metadata: { ...metadata, stored: true, backendGenerated: true },
        status: "generated",
        generated_by: req.auth.user.id
      }).select("id,preset_id,export_log_id,report_type,title,period_label,config,metadata,status,generated_by,generated_at").single();
      databaseFailure(runError, "บันทึก Report Run ไม่สำเร็จ");

      const { data: reportFile, error: fileError } = await supabaseAdmin.from("report_files").insert({
        report_run_id: reportRun.id,
        export_log_id: exportLog.id,
        bucket,
        object_path: objectPath,
        file_name: filename,
        mime_type: mimeType,
        file_size_bytes: buffer.length,
        file_sha256: sha256(buffer),
        metadata,
        generated_by: req.auth.user.id
      }).select("id,report_run_id,export_log_id,bucket,object_path,file_name,mime_type,file_size_bytes,file_sha256,metadata,generated_by,created_at").single();
      databaseFailure(fileError, "บันทึกข้อมูลไฟล์รายงานไม่สำเร็จ");

      const { data: signed, error: signedError } = await supabaseAdmin.storage.from(bucket).createSignedUrl(objectPath, 60 * 10, { download: filename });
      databaseFailure(signedError, "สร้างลิงก์ดาวน์โหลด PowerPoint ไม่สำเร็จ");
      await writeAuditLog({ supabaseAdmin, req, action: "report_file.generated", targetType: "report_file", targetId: reportFile.id, afterData: reportFile, metadata: { reportRunId: reportRun.id, exportLogId: exportLog.id, slideCount: metadata.slideCount } });
      res.status(201).json({ item: reportFile, reportRun, exportLog, downloadUrl: signed.signedUrl, expiresIn: 600, metadata });
    } catch (error) { next(error); }
  });

  router.post("/export-logs", requirePermission("export_reports"), async (req, res, next) => {
    try {
      const input = validateExportLogInput(req.body);
      const { data, error } = await supabaseAdmin.from("export_logs").insert({ ...input, exported_by: req.auth.user.id }).select("id,export_format,module,view_mode,period_label,options,exported_by,created_at").single();
      databaseFailure(error, "บันทึกประวัติการ Export ไม่สำเร็จ");
      res.status(201).json({ item: data });
    } catch (error) { next(error); }
  });

  return router;
}
