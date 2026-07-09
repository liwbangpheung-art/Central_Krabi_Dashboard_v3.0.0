select key, value from public.app_settings where key = 'export_version';
select count(*) as export_log_count from public.export_logs;
