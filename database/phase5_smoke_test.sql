select key, value from public.app_settings where key = 'analytics_version';
select module, count(*) as category_count from public.master_categories group by module order by module;
select count(*) as daily_entry_count from public.daily_entries;
select count(*) as scrap_sale_count from public.scrap_sales;
