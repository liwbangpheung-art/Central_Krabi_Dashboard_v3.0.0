-- Run after migrations 001-013.
select key, value
from public.app_settings
where key in ('organization_name', 'max_users', 'daily_quantity_policy')
order by key;

select module, code, name_th, unit, color_hex, active
from public.master_categories
where module in ('waste', 'tissue', 'garbage_bag', 'consumable')
order by module, sort_order;

select trigger_name, event_object_table
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name = 'daily_entries_quantity_policy_guard';
