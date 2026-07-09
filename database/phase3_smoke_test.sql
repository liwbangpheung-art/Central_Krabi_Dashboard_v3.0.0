-- Phase 3 smoke test: ควรได้ true ทุกคอลัมน์ และมีประเภทข้อมูลรายวันมากกว่า 0
select
  to_regclass('public.daily_entries') is not null as daily_entries_table_ready,
  to_regclass('public.daily_entry_month_logs') is not null as daily_entry_logs_table_ready,
  to_regprocedure('public.replace_daily_month(uuid,date,jsonb,uuid)') is not null as replace_daily_month_ready;

select module, count(*) as active_categories
from public.master_categories
where active = true
  and module in ('waste', 'tissue', 'animal_feed', 'garbage_bag', 'consumable')
group by module
order by module;

select key, value
from public.app_settings
where key in ('daily_entry_version', 'daily_week_rule')
order by key;
