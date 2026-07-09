-- Run after 015_phase_b_data_governance.sql
select to_regclass('public.data_periods') as data_periods,
       to_regclass('public.import_histories') as import_histories,
       to_regclass('public.import_history_errors') as import_history_errors;

select public.bangkok_current_date() as bangkok_today,
       public.get_period_status(current_date) as current_period_status;

select key, value from public.app_settings
where key in ('data_governance_version', 'business_timezone')
order by key;

select trigger_name, event_object_table
from information_schema.triggers
where trigger_name in ('daily_entries_governance_guard', 'scrap_sales_governance_guard')
order by trigger_name;
