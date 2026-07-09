begin;

alter table public.master_categories enable row level security;
alter table public.scrap_price_history enable row level security;

-- Phase 2 uses Backend API + Service Role only for Master Data.
-- Do not expose these tables directly to browser clients.
revoke all on table public.master_categories from anon, authenticated;
revoke all on table public.scrap_price_history from anon, authenticated;

create or replace function public.get_scrap_price_at(
  p_category_id uuid,
  p_on_date date default current_date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select sph.price_per_kg
  from public.scrap_price_history sph
  join public.master_categories mc on mc.id = sph.category_id
  where sph.category_id = p_category_id
    and mc.module = 'scrap_material'
    and sph.effective_from <= p_on_date
  order by sph.effective_from desc, sph.created_at desc
  limit 1;
$$;

revoke all on function public.get_scrap_price_at(uuid, date) from public, anon, authenticated;
grant execute on function public.get_scrap_price_at(uuid, date) to service_role;

commit;
