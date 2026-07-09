-- Phase 4 smoke test: run after migrations 008 and 009.
select to_regclass('public.scrap_sales') as scrap_sales_table;

select key, value
from public.app_settings
where key = 'scrap_sales_version';

select
  c.module,
  c.code,
  c.name_th,
  c.active,
  public.get_scrap_price_at(c.id, current_date) as current_price
from public.master_categories c
where c.module = 'scrap_material'
order by c.sort_order, c.name_th;
