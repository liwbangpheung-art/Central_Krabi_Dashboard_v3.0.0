begin;

create table if not exists public.scrap_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  category_id uuid not null references public.master_categories(id) on delete restrict,
  weight_kg numeric(16, 4) not null,
  price_per_kg numeric(14, 4) not null,
  amount numeric(18, 2) generated always as (round(weight_kg * price_per_kg, 2)) stored,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scrap_sales_weight_positive check (weight_kg > 0),
  constraint scrap_sales_price_non_negative check (price_per_kg >= 0),
  constraint scrap_sales_note_length check (note is null or length(note) <= 500)
);

create index if not exists scrap_sales_sale_date_idx
  on public.scrap_sales (sale_date desc);

create index if not exists scrap_sales_category_date_idx
  on public.scrap_sales (category_id, sale_date desc);

create or replace function public.ensure_scrap_sale_category()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_module text;
begin
  select module into v_module
  from public.master_categories
  where id = new.category_id;

  if v_module is null then
    raise exception 'SCRAP_SALE_CATEGORY_NOT_FOUND: ไม่พบประเภทเศษวัสดุ';
  end if;
  if v_module <> 'scrap_material' then
    raise exception 'SCRAP_SALE_CATEGORY_INVALID: ประเภทต้องอยู่ในหมวด scrap_material';
  end if;
  return new;
end;
$$;

drop trigger if exists scrap_sales_category_guard on public.scrap_sales;
create trigger scrap_sales_category_guard
before insert or update of category_id on public.scrap_sales
for each row execute function public.ensure_scrap_sale_category();

drop trigger if exists scrap_sales_set_updated_at on public.scrap_sales;
create trigger scrap_sales_set_updated_at
before update on public.scrap_sales
for each row execute function public.set_updated_at();

create or replace function public.prevent_sold_category_module_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.module is distinct from old.module
     and exists (select 1 from public.scrap_sales where category_id = old.id) then
    raise exception 'CATEGORY_MODULE_LOCKED: ประเภทที่มีรายการขายแล้วไม่สามารถย้ายหมวดได้';
  end if;
  return new;
end;
$$;

drop trigger if exists master_category_scrap_sale_module_guard on public.master_categories;
create trigger master_category_scrap_sale_module_guard
before update of module on public.master_categories
for each row execute function public.prevent_sold_category_module_change();

insert into public.app_settings (key, value, description)
values ('scrap_sales_version', '4', 'เวอร์ชันโครงสร้างรายการขายเศษวัสดุ')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;
