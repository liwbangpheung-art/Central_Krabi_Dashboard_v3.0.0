begin;

create table if not exists public.master_categories (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  code text not null,
  name_th text not null,
  name_en text,
  unit text not null,
  color_hex text not null default '#8B5CF6',
  pattern text not null default 'solid',
  sort_order integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_categories_module_check check (
    module in ('waste', 'tissue', 'animal_feed', 'garbage_bag', 'consumable', 'scrap_material')
  ),
  constraint master_categories_code_check check (code ~ '^[A-Z0-9_]+$'),
  constraint master_categories_name_th_check check (length(trim(name_th)) between 1 and 120),
  constraint master_categories_unit_check check (length(trim(unit)) between 1 and 40),
  constraint master_categories_color_check check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  constraint master_categories_pattern_check check (pattern in ('solid', 'diagonal', 'dots', 'crosshatch')),
  constraint master_categories_sort_order_check check (sort_order between 0 and 9999),
  constraint master_categories_module_code_unique unique (module, code)
);

create unique index if not exists master_categories_module_name_th_unique_idx
  on public.master_categories (module, lower(trim(name_th)));

create index if not exists master_categories_module_active_sort_idx
  on public.master_categories (module, active, sort_order, name_th);

create table if not exists public.scrap_price_history (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.master_categories(id) on delete restrict,
  price_per_kg numeric(14, 4) not null,
  effective_from date not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scrap_price_non_negative check (price_per_kg >= 0),
  constraint scrap_price_effective_unique unique (category_id, effective_from)
);

create index if not exists scrap_price_category_effective_idx
  on public.scrap_price_history (category_id, effective_from desc);

create or replace function public.ensure_scrap_price_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.master_categories
    where id = new.category_id
      and module = 'scrap_material'
  ) then
    raise exception 'SCRAP_PRICE_CATEGORY_REQUIRED: category_id ต้องอยู่ในหมวด scrap_material';
  end if;
  return new;
end;
$$;

drop trigger if exists scrap_price_category_guard on public.scrap_price_history;
create trigger scrap_price_category_guard
before insert or update of category_id on public.scrap_price_history
for each row execute function public.ensure_scrap_price_category();

create or replace function public.prevent_priced_category_module_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.module is distinct from old.module
     and exists (select 1 from public.scrap_price_history where category_id = old.id) then
    raise exception 'CATEGORY_MODULE_LOCKED: ประเภทที่มีประวัติราคาไม่สามารถย้ายหมวดได้';
  end if;
  return new;
end;
$$;

drop trigger if exists master_category_module_guard on public.master_categories;
create trigger master_category_module_guard
before update of module on public.master_categories
for each row execute function public.prevent_priced_category_module_change();

-- Reuse the Phase 1 updated_at function.
drop trigger if exists master_categories_set_updated_at on public.master_categories;
create trigger master_categories_set_updated_at
before update on public.master_categories
for each row execute function public.set_updated_at();

drop trigger if exists scrap_price_history_set_updated_at on public.scrap_price_history;
create trigger scrap_price_history_set_updated_at
before update on public.scrap_price_history
for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description)
values
  ('waste_total_color', '#40B7E5', 'สีมาตรฐานของ Total (Kg) ในกราฟขยะ'),
  ('master_data_version', '2', 'เวอร์ชันข้อมูลตั้งต้นของ Master Data')
on conflict (key) do update
set description = excluded.description,
    updated_at = now();

commit;
