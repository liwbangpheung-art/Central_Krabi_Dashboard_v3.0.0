-- Migration 020: v3.0.0 Performance indexes
-- Central Krabi Dashboard v3.0.0
-- Run after: 019_v2_9_ux4_master_category_labels.sql

-- 1. Performance indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs (target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs (action, created_at DESC);

-- 2. Performance indexes for daily_entries
CREATE INDEX IF NOT EXISTS idx_daily_entries_category_date ON daily_entries (category_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_daily_entries_entry_date ON daily_entries (entry_date DESC);

-- 3. Performance indexes for scrap_sales
CREATE INDEX IF NOT EXISTS idx_scrap_sales_sale_date ON scrap_sales (sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_scrap_sales_category_date ON scrap_sales (category_id, sale_date DESC);

-- 4. Performance indexes for report_runs
CREATE INDEX IF NOT EXISTS idx_report_runs_generated_by ON report_runs (generated_by);
CREATE INDEX IF NOT EXISTS idx_report_runs_generated_at ON report_runs (generated_at DESC);

-- Smoke test
SELECT 'migration_020_ok' AS status;
