-- Phase 2 smoke test: this file is read-only.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('master_categories', 'scrap_price_history')
order by table_name;

select module, count(*) as total, count(*) filter (where active) as active
from public.master_categories
group by module
order by module;

select code, name_th, unit, color_hex, pattern
from public.master_categories
where module in ('waste', 'garbage_bag')
order by module, sort_order;

select public.get_scrap_price_at(
  (select id from public.master_categories where module = 'scrap_material' and code = 'PET'),
  current_date
) as pet_price_may_be_null_until_configured;
