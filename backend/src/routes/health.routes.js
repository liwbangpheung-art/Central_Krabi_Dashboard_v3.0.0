import { Router } from "express";
import { APP_VERSION } from "../version.js";

export function createHealthRouter({ config, supabaseAdmin }) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "central-krabi-api",
      version: APP_VERSION,
      organization: config.organizationName,
      timestamp: new Date().toISOString()
    });
  });

  router.get("/ready", async (_req, res) => {
    const startedAt = Date.now();
    const [
      settingsResult,
      categoriesResult,
      pricesResult,
      dailyResult,
      logsResult,
      scrapSalesResult,
      exportLogsResult,
      permissionsResult,
      rolePermissionsResult,
      auditLogsResult,
      periodsResult,
      importHistoryResult,
      importErrorsResult,
      reportPresetsResult,
      reportRunsResult,
      reportFilesResult,
      reportBucketResult
    ] = await Promise.all([
      supabaseAdmin.from("app_settings").select("key,value").in("key", [
        "organization_name", "max_users", "master_data_version", "daily_entry_version",
        "scrap_sales_version", "analytics_version", "export_version", "daily_quantity_policy",
        "user_management_version", "permission_model", "data_governance_version", "business_timezone", "report_presets_version", "report_runs_version", "report_files_version"
      ]),
      supabaseAdmin.from("master_categories").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("scrap_price_history").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("daily_entries").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("daily_entry_month_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("scrap_sales").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("export_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("permissions").select("code", { count: "exact", head: true }),
      supabaseAdmin.from("role_permissions").select("permission_code", { count: "exact", head: true }),
      supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("data_periods").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("import_histories").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("import_history_errors").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("report_presets").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("report_runs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("report_files").select("id", { count: "exact", head: true }),
      supabaseAdmin.storage.getBucket(config.reportStorageBucket)
    ]);

    const baseFailure = [settingsResult, categoriesResult, pricesResult].find((result) => result.error);
    const dailyFailure = [dailyResult, logsResult].find((result) => result.error);
    const scrapFailure = scrapSalesResult.error ? scrapSalesResult : null;
    const exportFailure = exportLogsResult.error ? exportLogsResult : null;
    const userManagementFailure = [permissionsResult, rolePermissionsResult, auditLogsResult].find((result) => result.error);
    const dataGovernanceFailure = [periodsResult, importHistoryResult, importErrorsResult].find((result) => result.error);
    const reportPresetsFailure = reportPresetsResult.error ? reportPresetsResult : null;
    const reportRunsFailure = reportRunsResult.error ? reportRunsResult : null;
    const reportFilesFailure = reportFilesResult.error ? reportFilesResult : null;
    const reportBucketFailure = reportBucketResult.error ? reportBucketResult : null;
    const failure = baseFailure || dailyFailure || scrapFailure || exportFailure || userManagementFailure || dataGovernanceFailure || reportPresetsFailure || reportRunsFailure || reportFilesFailure || reportBucketFailure;

    if (failure) {
      return res.status(503).json({
        status: "not_ready",
        version: APP_VERSION,
        checks: {
          backend: "ok",
          database: baseFailure ? "failed" : "ok",
          masterData: baseFailure ? "failed" : "ok",
          dailyEntries: dailyFailure ? "failed" : "ok",
          scrapSales: scrapFailure ? "failed" : "ok",
          analytics: "ok",
          export: exportFailure ? "failed" : "ok",
          userManagement: userManagementFailure ? "failed" : "ok",
          dataGovernance: dataGovernanceFailure ? "failed" : "ok",
          reportPresets: reportPresetsFailure ? "failed" : "ok",
          reportRuns: reportRunsFailure ? "failed" : "ok",
          reportFiles: reportFilesFailure ? "failed" : "ok",
          reportStorage: reportBucketFailure ? "failed" : "ok"
        },
        message: reportBucketFailure
          ? "เชื่อมต่อ Supabase ได้ แต่ Storage bucket สำหรับ Report Files ยังไม่พร้อม"
          : reportFilesFailure
          ? "เชื่อมต่อ Supabase ได้ แต่ Migration 018 สำหรับ Report Files ยังไม่พร้อม"
          : reportRunsFailure
          ? "เชื่อมต่อ Supabase ได้ แต่ Migration 017 สำหรับ Report Runs ยังไม่พร้อม"
          : reportPresetsFailure
          ? "เชื่อมต่อ Supabase ได้ แต่ Migration 016 สำหรับ Report Presets ยังไม่พร้อม"
          : dataGovernanceFailure
          ? "เชื่อมต่อ Supabase ได้ แต่ Migration 015 สำหรับ Data Governance ยังไม่พร้อม"
          : userManagementFailure
          ? "เชื่อมต่อ Supabase ได้ แต่ Migration 014 สำหรับ User Management ยังไม่พร้อม"
          : exportFailure
            ? "เชื่อมต่อ Supabase ได้ แต่ Phase 6 Migration ยังไม่พร้อม"
            : scrapFailure
              ? "เชื่อมต่อ Supabase ได้ แต่ Phase 4 Migration ยังไม่พร้อม"
              : dailyFailure
                ? "เชื่อมต่อ Supabase ได้ แต่ Daily Entry Migration ยังไม่พร้อม"
                : "เชื่อมต่อ Supabase ได้ แต่ Phase 1/2 Migration ยังไม่พร้อม",
        supabaseError: failure.error.message,
        durationMs: Date.now() - startedAt
      });
    }

    return res.json({
      status: "ready",
      version: APP_VERSION,
      checks: {
        backend: "ok",
        database: "ok",
        masterData: "ok",
        dailyEntries: "ok",
        scrapSales: "ok",
        analytics: "ok",
        export: "ok",
        userManagement: "ok",
        dataGovernance: "ok",
        reportPresets: "ok",
        reportRuns: "ok",
        reportFiles: "ok",
        reportStorage: "ok"
      },
      settingsFound: settingsResult.data?.length ?? 0,
      categoryCount: categoriesResult.count ?? 0,
      priceHistoryCount: pricesResult.count ?? 0,
      dailyEntryCount: dailyResult.count ?? 0,
      dailyMonthLogCount: logsResult.count ?? 0,
      scrapSaleCount: scrapSalesResult.count ?? 0,
      exportLogCount: exportLogsResult.count ?? 0,
      permissionCount: permissionsResult.count ?? 0,
      rolePermissionCount: rolePermissionsResult.count ?? 0,
      auditLogCount: auditLogsResult.count ?? 0,
      periodCount: periodsResult.count ?? 0,
      importHistoryCount: importHistoryResult.count ?? 0,
      importErrorCount: importErrorsResult.count ?? 0,
      reportPresetCount: reportPresetsResult.count ?? 0,
      reportRunCount: reportRunsResult.count ?? 0,
      reportFileCount: reportFilesResult.count ?? 0,
      durationMs: Date.now() - startedAt
    });
  });

  return router;
}
