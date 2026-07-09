-- Central Krabi Dashboard v2.9.0-c7-preview + UX-5
-- Supabase full database setup
-- ใช้รันใน Supabase SQL Editor ไฟล์เดียว
-- รวม migrations 001-019
-- ควร Backup ก่อนรันใน Production




-- ============================================================
-- 001_phase1_schema.sql
-- ============================================================

begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('admin', 'editor', 'viewer');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, description)
values
  ('organization_name', 'Central Krabi', 'ชื่อองค์กรที่แสดงในระบบ'),
  ('max_users', '10', 'จำนวนผู้ใช้สูงสุดของระบบ')
on conflict (key) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_normalized check (email = lower(trim(email)))
);

create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  configured_max integer;
  active_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('central_krabi_user_limit'));

  select coalesce(value::integer, 10)
    into configured_max
    from public.app_settings
   where key = 'max_users';

  configured_max := coalesce(configured_max, 10);

  select count(*)
    into active_count
    from public.profiles
   where active = true;

  if active_count >= configured_max then
    raise exception 'USER_LIMIT_REACHED: ระบบรองรับผู้ใช้งานสูงสุด % คน', configured_max;
  end if;

  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'viewer',
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill Auth Users ที่มีอยู่ก่อนรัน Migration โดยไม่เปลี่ยน Role เดิม
insert into public.profiles (id, email, full_name, role, active)
select
  u.id,
  lower(coalesce(u.email, '')),
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  'viewer'::public.user_role,
  true
from auth.users u
where u.email is not null
on conflict (id) do update
set email = excluded.email,
    updated_at = now();

commit;



-- ============================================================
-- 002_phase1_security.sql
-- ============================================================

begin;

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and active = true
  limit 1;
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

-- Policies are dropped before recreation so this migration can run repeatedly.
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_admin_select_all on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;

create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_admin_select_all
on public.profiles
for select
to authenticated
using (public.current_user_role() = 'admin');

create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- app_settings intentionally has no direct client policy in Phase 1.
-- Backend Service Role can still access it and bypass RLS.

revoke all on table public.app_settings from anon, authenticated;
grant select on table public.profiles to authenticated;

grant usage on type public.user_role to authenticated;

commit;



-- ============================================================
-- 003_phase2_master_data.sql
-- ============================================================

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



-- ============================================================
-- 004_phase2_security_and_functions.sql
-- ============================================================

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



-- ============================================================
-- 005_phase2_seed_master_data.sql
-- ============================================================

begin;

insert into public.master_categories
  (module, code, name_th, name_en, unit, color_hex, pattern, sort_order, active, metadata)
values
  ('waste', 'WET_WASTE', 'ขยะเปียก', 'Wet waste', 'กิโลกรัม', '#2E7D32', 'solid', 10, true, '{"semanticColor":"green"}'),
  ('waste', 'RECYCLE', 'Recycle', 'Recycle', 'กิโลกรัม', '#FFEB00', 'solid', 20, true, '{"semanticColor":"yellow"}'),
  ('waste', 'RDF', 'ขยะ RDF', 'RDF waste', 'กิโลกรัม', '#111111', 'solid', 30, true, '{"semanticColor":"black"}'),

  ('tissue', 'TISSUE_ROLL', 'ทิชชู่ม้วน', 'Tissue roll', 'ม้วน', '#8B5CF6', 'solid', 10, true, '{}'),
  ('tissue', 'HAND_TOWEL', 'กระดาษเช็ดมือ', 'Hand towel', 'แพ็ค', '#45B98A', 'solid', 20, true, '{}'),
  ('tissue', 'POPUP_TISSUE', 'กระดาษป๊อปอัพ', 'Pop-up tissue', 'แพ็ค', '#E979A8', 'solid', 30, true, '{}'),

  ('animal_feed', 'PIG_FEED', 'อาหารหมู', 'Pig feed', 'กิโลกรัม', '#D99058', 'solid', 10, true, '{}'),
  ('animal_feed', 'DOG_FEED', 'อาหารสุนัข', 'Dog feed', 'กิโลกรัม', '#6497C8', 'solid', 20, true, '{}'),

  ('garbage_bag', 'BAG_30X40_BLACK', '30×40 สีดำ', '30×40 black', 'กิโลกรัม', '#171717', 'solid', 10, true, '{"physicalColor":"black","size":"30x40"}'),
  ('garbage_bag', 'BAG_28X36_TEA', '28×36 สีชา', '28×36 tea', 'กิโลกรัม', '#C99562', 'solid', 20, true, '{"physicalColor":"tea","size":"28x36"}'),
  ('garbage_bag', 'BAG_18X20_BLACK', '18×20 สีดำ', '18×20 black', 'กิโลกรัม', '#454545', 'diagonal', 30, true, '{"physicalColor":"black","size":"18x20"}'),

  ('consumable', 'FOAM_SOAP', 'สบู่โฟม', 'Foam soap', 'แกลลอน', '#8B5CF6', 'solid', 10, true, '{}'),
  ('consumable', 'TOILET_LID_CLEANER', 'น้ำยาเช็ดฝาโถ', 'Toilet lid cleaner', 'แกลลอน', '#45B98A', 'solid', 20, true, '{}'),

  ('scrap_material', 'BROWN_PAPER', 'กระดาษน้ำตาล', 'Brown paper', 'กิโลกรัม', '#B66A2C', 'solid', 10, true, '{}'),
  ('scrap_material', 'WHITE_PAPER', 'กระดาษขาว', 'White paper', 'กิโลกรัม', '#D8D4C9', 'solid', 20, true, '{}'),
  ('scrap_material', 'TIN_CANS', 'สังกะสีและกระป๋อง', 'Tin and cans', 'กิโลกรัม', '#9AA3AD', 'solid', 30, true, '{}'),
  ('scrap_material', 'PET', 'PET', 'PET', 'กิโลกรัม', '#F1A15A', 'solid', 40, true, '{}'),
  ('scrap_material', 'MIXED_PLASTIC', 'พลาสติกรวม', 'Mixed plastic', 'กิโลกรัม', '#C77843', 'solid', 50, true, '{}'),
  ('scrap_material', 'ALUMINUM', 'อะลูมิเนียม', 'Aluminum', 'กิโลกรัม', '#4CA5C8', 'solid', 60, true, '{}'),
  ('scrap_material', 'MIXED_GLASS', 'แก้วรวมสี', 'Mixed glass', 'กิโลกรัม', '#4E9B75', 'solid', 70, true, '{}')
on conflict (module, code) do nothing;

commit;



-- ============================================================
-- 006_phase3_daily_entries.sql
-- ============================================================

begin;

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.master_categories(id) on delete restrict,
  entry_date date not null,
  quantity numeric(16, 4) not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_entries_quantity_non_negative check (quantity >= 0),
  constraint daily_entries_note_length check (note is null or length(note) <= 500),
  constraint daily_entries_category_date_unique unique (category_id, entry_date)
);

create index if not exists daily_entries_category_date_idx
  on public.daily_entries (category_id, entry_date);

create index if not exists daily_entries_date_idx
  on public.daily_entries (entry_date);

create table if not exists public.daily_entry_month_logs (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.master_categories(id) on delete restrict,
  month_start date not null,
  action text not null,
  saved_count integer not null default 0,
  total_quantity numeric(18, 4) not null default 0,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint daily_entry_logs_month_start_check check (month_start = date_trunc('month', month_start)::date),
  constraint daily_entry_logs_action_check check (action in ('replace', 'clear')),
  constraint daily_entry_logs_saved_count_check check (saved_count between 0 and 31),
  constraint daily_entry_logs_total_non_negative check (total_quantity >= 0)
);

create index if not exists daily_entry_month_logs_lookup_idx
  on public.daily_entry_month_logs (category_id, month_start desc, created_at desc);

create or replace function public.ensure_daily_entry_category()
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
    raise exception 'DAILY_CATEGORY_NOT_FOUND: ไม่พบประเภทข้อมูล';
  end if;

  if v_module not in ('waste', 'tissue', 'animal_feed', 'garbage_bag', 'consumable') then
    raise exception 'DAILY_CATEGORY_MODULE_INVALID: ประเภทนี้ไม่รองรับการบันทึกรายวัน';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_entry_category_guard on public.daily_entries;
create trigger daily_entry_category_guard
before insert or update of category_id on public.daily_entries
for each row execute function public.ensure_daily_entry_category();

drop trigger if exists daily_entries_set_updated_at on public.daily_entries;
create trigger daily_entries_set_updated_at
before update on public.daily_entries
for each row execute function public.set_updated_at();

create or replace function public.prevent_daily_category_module_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.module is distinct from old.module
     and (
       exists (select 1 from public.daily_entries where category_id = old.id)
       or exists (select 1 from public.daily_entry_month_logs where category_id = old.id)
     ) then
    raise exception 'CATEGORY_MODULE_LOCKED: ประเภทที่มีข้อมูลรายวันแล้วไม่สามารถย้ายหมวดได้';
  end if;
  return new;
end;
$$;

drop trigger if exists master_category_daily_module_guard on public.master_categories;
create trigger master_category_daily_module_guard
before update of module on public.master_categories
for each row execute function public.prevent_daily_category_module_change();

insert into public.app_settings (key, value, description)
values
  ('daily_entry_version', '3', 'เวอร์ชันโครงสร้างข้อมูลรายวัน'),
  ('daily_week_rule', '1-7,8-14,15-21,22-28,29-end', 'กติกาการรวมข้อมูลรายสัปดาห์')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;



-- ============================================================
-- 007_phase3_security_and_functions.sql
-- ============================================================

begin;

alter table public.daily_entries enable row level security;
alter table public.daily_entry_month_logs enable row level security;

-- ข้อมูลรายวันอ่านและเขียนผ่าน Backend API เท่านั้น
revoke all on table public.daily_entries from anon, authenticated;
revoke all on table public.daily_entry_month_logs from anon, authenticated;

create or replace function public.replace_daily_month(
  p_category_id uuid,
  p_month_start date,
  p_entries jsonb,
  p_changed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date;
  v_month_end date;
  v_module text;
  v_active boolean;
  v_item jsonb;
  v_date date;
  v_quantity numeric(16, 4);
  v_note text;
  v_count integer := 0;
  v_total numeric(18, 4) := 0;
  v_action text := 'replace';
begin
  if p_category_id is null then
    raise exception 'DAILY_CATEGORY_REQUIRED: กรุณาระบุประเภทข้อมูล';
  end if;

  if p_month_start is null then
    raise exception 'DAILY_MONTH_REQUIRED: กรุณาระบุเดือน';
  end if;

  v_month_start := date_trunc('month', p_month_start)::date;
  if p_month_start <> v_month_start then
    raise exception 'DAILY_MONTH_INVALID: p_month_start ต้องเป็นวันแรกของเดือน';
  end if;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  select module, active
    into v_module, v_active
  from public.master_categories
  where id = p_category_id;

  if v_module is null then
    raise exception 'DAILY_CATEGORY_NOT_FOUND: ไม่พบประเภทข้อมูล';
  end if;
  if v_module not in ('waste', 'tissue', 'animal_feed', 'garbage_bag', 'consumable') then
    raise exception 'DAILY_CATEGORY_MODULE_INVALID: ประเภทนี้ไม่รองรับการบันทึกรายวัน';
  end if;
  if not v_active then
    raise exception 'DAILY_CATEGORY_INACTIVE: ประเภทนี้ถูกปิดใช้งาน';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'DAILY_ENTRIES_INVALID: entries ต้องเป็น JSON array';
  end if;

  if jsonb_array_length(p_entries) > extract(day from v_month_end)::integer then
    raise exception 'DAILY_ENTRIES_TOO_MANY: จำนวนรายการเกินจำนวนวันในเดือน';
  end if;

  if exists (
    select 1
    from (
      select item ->> 'date' as entry_date, count(*)
      from jsonb_array_elements(p_entries) item
      group by item ->> 'date'
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'DAILY_DATE_DUPLICATE: พบวันที่ซ้ำในข้อมูลที่ส่งมา';
  end if;

  -- Validate ทุกแถวก่อนลบข้อมูลเดิม เพื่อป้องกันข้อมูลสูญหายเมื่อ payload ผิด
  for v_item in select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'date', '') = ''
       or not (v_item ? 'quantity')
       or v_item -> 'quantity' = 'null'::jsonb then
      raise exception 'DAILY_ENTRY_INVALID: แต่ละรายการต้องมี date และ quantity';
    end if;

    begin
      v_date := (v_item ->> 'date')::date;
      v_quantity := (v_item ->> 'quantity')::numeric;
    exception when others then
      raise exception 'DAILY_ENTRY_INVALID: วันที่หรือจำนวนไม่ถูกต้อง';
    end;

    if v_date < v_month_start or v_date > v_month_end then
      raise exception 'DAILY_DATE_OUT_OF_MONTH: วันที่ % ไม่อยู่ในเดือนที่เลือก', v_date;
    end if;
    if v_quantity < 0 then
      raise exception 'DAILY_QUANTITY_NEGATIVE: จำนวนต้องไม่ติดลบ';
    end if;
    if scale(v_quantity) > 4 then
      raise exception 'DAILY_QUANTITY_SCALE: จำนวนมีทศนิยมได้ไม่เกิน 4 ตำแหน่ง';
    end if;
    v_note := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    if v_note is not null and length(v_note) > 500 then
      raise exception 'DAILY_NOTE_TOO_LONG: หมายเหตุต้องไม่เกิน 500 ตัวอักษร';
    end if;
  end loop;

  delete from public.daily_entries
  where category_id = p_category_id
    and entry_date between v_month_start and v_month_end;

  for v_item in select value from jsonb_array_elements(p_entries)
  loop
    v_date := (v_item ->> 'date')::date;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_note := nullif(trim(coalesce(v_item ->> 'note', '')), '');

    insert into public.daily_entries (
      category_id, entry_date, quantity, note, created_by, updated_by
    ) values (
      p_category_id, v_date, v_quantity, v_note, p_changed_by, p_changed_by
    );

    v_count := v_count + 1;
    v_total := v_total + v_quantity;
  end loop;

  if v_count = 0 then
    v_action := 'clear';
  end if;

  insert into public.daily_entry_month_logs (
    category_id, month_start, action, saved_count, total_quantity, changed_by
  ) values (
    p_category_id, v_month_start, v_action, v_count, v_total, p_changed_by
  );

  return jsonb_build_object(
    'categoryId', p_category_id,
    'month', to_char(v_month_start, 'YYYY-MM'),
    'savedCount', v_count,
    'totalQuantity', v_total,
    'action', v_action
  );
end;
$$;

revoke all on function public.replace_daily_month(uuid, date, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.replace_daily_month(uuid, date, jsonb, uuid) to service_role;

commit;



-- ============================================================
-- 008_phase4_scrap_sales.sql
-- ============================================================

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



-- ============================================================
-- 009_phase4_security.sql
-- ============================================================

begin;

alter table public.scrap_sales enable row level security;
revoke all on table public.scrap_sales from anon, authenticated;

-- Browser clients access scrap sales through the Backend API only.
-- The Backend uses the Service Role and enforces Admin/Editor/Viewer permissions.

commit;



-- ============================================================
-- 010_phase5_analytics.sql
-- ============================================================

begin;

insert into public.app_settings (key, value, description)
values ('analytics_version', '5', 'เวอร์ชัน Dashboard และระบบวิเคราะห์ข้อมูล')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;



-- ============================================================
-- 011_phase6_export_logs.sql
-- ============================================================

begin;

create table if not exists public.export_logs (
  id uuid primary key default gen_random_uuid(),
  export_format text not null,
  module text not null,
  view_mode text not null,
  period_label text not null,
  options jsonb not null default '{}'::jsonb,
  exported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint export_logs_format_check check (export_format in ('xlsx','pdf','png','pptx')),
  constraint export_logs_module_check check (module in ('waste','tissue','animal_feed','garbage_bag','consumable','scrap_sales')),
  constraint export_logs_view_check check (view_mode in ('monthly','quarterly','yearly','month_over_month')),
  constraint export_logs_period_check check (length(period_label) between 1 and 80)
);

create index if not exists export_logs_created_at_idx on public.export_logs (created_at desc);
create index if not exists export_logs_exported_by_idx on public.export_logs (exported_by, created_at desc);

insert into public.app_settings (key, value, description)
values ('export_version', '6', 'เวอร์ชันระบบ Export Excel PDF PNG และ PowerPoint')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;



-- ============================================================
-- 012_phase6_security.sql
-- ============================================================

begin;
alter table public.export_logs enable row level security;
revoke all on table public.export_logs from anon, authenticated;
commit;



-- ============================================================
-- 013_v2_5_2_daily_quantity_policy.sql
-- ============================================================

begin;

-- Release 2.5.2 quantity policy:
-- - tissue, garbage_bag, consumable: integer only
-- - waste, animal_feed: maximum 2 decimal places

do $$
declare
  v_invalid_count bigint;
begin
  select count(*) into v_invalid_count
  from public.daily_entries de
  join public.master_categories mc on mc.id = de.category_id
  where (mc.module in ('tissue', 'garbage_bag', 'consumable') and de.quantity <> trunc(de.quantity))
     or (mc.module in ('waste', 'animal_feed') and de.quantity <> round(de.quantity, 2));

  if v_invalid_count > 0 then
    raise exception 'DAILY_QUANTITY_EXISTING_DATA_INVALID: พบข้อมูลเดิม % รายการที่ไม่ผ่านกฎจำนวนของ Release 2.5.2 กรุณาแก้ข้อมูลก่อนรัน Migration', v_invalid_count;
  end if;
end;
$$;

create or replace function public.enforce_daily_quantity_policy()
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

  if v_module in ('tissue', 'garbage_bag', 'consumable')
     and new.quantity <> trunc(new.quantity) then
    raise exception 'DAILY_QUANTITY_INTEGER_REQUIRED: หมวดทิชชู่ ถุงขยะ และวัสดุสิ้นเปลืองรับเฉพาะจำนวนเต็ม';
  end if;

  if v_module in ('waste', 'animal_feed')
     and new.quantity <> round(new.quantity, 2) then
    raise exception 'DAILY_QUANTITY_SCALE: ข้อมูลน้ำหนักมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_entries_quantity_policy_guard on public.daily_entries;
create trigger daily_entries_quantity_policy_guard
before insert or update of category_id, quantity on public.daily_entries
for each row execute function public.enforce_daily_quantity_policy();

insert into public.app_settings (key, value, description)
values (
  'daily_quantity_policy',
  'waste:2,animal_feed:2,tissue:0,garbage_bag:0,consumable:0',
  'จำนวนตำแหน่งทศนิยมสูงสุดของข้อมูลรายวันตามหมวด'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;



-- ============================================================
-- 014_phase_a_user_permissions.sql
-- ============================================================

begin;
-- Phase A: flexible user management, Owner role, permissions, and audit log.
-- The enum value is committed before it is used by later statements.
alter type public.user_role add value if not exists 'owner' before 'admin';
commit;

begin;

alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists must_change_password boolean not null default false,
  add column if not exists invited_at timestamptz,
  add column if not exists last_login_at timestamptz;

alter table public.profiles drop constraint if exists profiles_status_valid;
alter table public.profiles
  add constraint profiles_status_valid
  check (status in ('invited', 'pending', 'active', 'suspended', 'disabled'));

update public.profiles
set status = case when active then 'active' else 'disabled' end
where status is null
   or status not in ('invited', 'pending', 'active', 'suspended', 'disabled')
   or (active = false and status = 'active');

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  configured_max integer;
  profile_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('central_krabi_user_limit'));

  select coalesce(value::integer, 10)
    into configured_max
    from public.app_settings
   where key = 'max_users';
  configured_max := coalesce(configured_max, 10);

  select count(*) into profile_count from public.profiles;
  if profile_count >= configured_max then
    raise exception 'USER_LIMIT_REACHED: ระบบรองรับผู้ใช้งานสูงสุด % คน', configured_max;
  end if;

  insert into public.profiles (id, email, full_name, role, active, status)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'viewer',
    true,
    'active'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end,
        updated_at = now();

  return new;
end;
$$;

create table if not exists public.permissions (
  code text primary key,
  name_th text not null,
  description_th text not null default '',
  group_code text not null,
  sensitive boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role public.user_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_code)
);

create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  effect text not null check (effect in ('allow', 'deny')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_code)
);

create index if not exists user_permission_overrides_user_idx
  on public.user_permission_overrides(user_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  ip_address text,
  user_agent text,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_user_id, created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs(target_type, target_id, created_at desc);

insert into public.permissions (code, name_th, description_th, group_code, sensitive, sort_order)
values
  ('manage_users', 'ดูและจัดการผู้ใช้งาน', 'เปิดหน้าจัดการผู้ใช้และดูรายชื่อผู้ใช้', 'users', true, 10),
  ('invite_users', 'ส่งคำเชิญผู้ใช้', 'เชิญผู้ใช้ผ่านอีเมล', 'users', true, 20),
  ('create_users', 'สร้างบัญชีผู้ใช้', 'สร้างบัญชีด้วยรหัสผ่านชั่วคราวหรือเตรียมบัญชีไว้ก่อน', 'users', true, 30),
  ('edit_user_profile', 'แก้ไขข้อมูลผู้ใช้', 'แก้ไขชื่อและข้อมูลพื้นฐานของผู้ใช้', 'users', true, 40),
  ('change_user_role', 'เปลี่ยนบทบาทผู้ใช้', 'เปลี่ยน Owner, Admin, Editor หรือ Viewer', 'users', true, 50),
  ('disable_users', 'ปิดหรือเปิดบัญชีผู้ใช้', 'ระงับ ปิดใช้งาน หรือเปิดใช้งานบัญชี', 'users', true, 60),
  ('delete_users', 'ลบผู้ใช้', 'สงวนไว้สำหรับการลบถาวรเมื่อไม่มีข้อมูลอ้างอิง', 'users', true, 70),
  ('reset_user_password', 'จัดการการรีเซ็ตรหัสผ่าน', 'ส่งคำขอหรือกำหนดให้ผู้ใช้เปลี่ยนรหัสผ่าน', 'users', true, 80),
  ('manage_admins', 'จัดการ Owner และ Admin', 'แต่งตั้งหรือแก้ไขผู้ดูแลระดับสูง', 'users', true, 90),
  ('view_audit_logs', 'ดูประวัติการใช้งาน', 'ดู Audit Log ของเหตุการณ์สำคัญ', 'security', true, 110),
  ('manage_system_settings', 'จัดการตั้งค่าระบบ', 'แก้ไขการตั้งค่าระบบที่สำคัญ', 'security', true, 120),
  ('manage_master_data', 'จัดการ Master Data', 'เพิ่ม แก้ไข ปิดใช้งาน และลบ Master Data ตามกฎ', 'data', false, 210),
  ('manage_prices', 'จัดการราคาขายเศษวัสดุ', 'เพิ่มและแก้ไขประวัติราคา', 'data', false, 220),
  ('manage_daily_data', 'จัดการข้อมูลรายวัน', 'เพิ่ม แก้ไข ล้าง และ Import ข้อมูลรายวัน', 'data', false, 230),
  ('manage_scrap_sales', 'จัดการรายการขายเศษวัสดุ', 'เพิ่ม แก้ไข และลบรายการขาย', 'data', false, 240),
  ('import_data', 'Import ข้อมูล', 'Import Excel เข้าสู่ระบบ', 'data', false, 250),
  ('export_reports', 'Export รายงาน', 'สร้าง Excel, PDF, PNG และ PowerPoint', 'reports', false, 310),
  ('review_data', 'ตรวจสอบข้อมูล', 'ทำเครื่องหมายว่าข้อมูลผ่านการตรวจสอบ', 'governance', false, 410),
  ('lock_periods', 'ปิดงวดข้อมูล', 'ปิดงวดเพื่อป้องกันการแก้ไข', 'governance', true, 420),
  ('reopen_periods', 'เปิดงวดเพื่อแก้ไข', 'เปิดงวดที่เคยปิดพร้อมระบุเหตุผล', 'governance', true, 430),
  ('manage_report_presets', 'จัดการชุดรายงาน', 'สร้างและดูแล Saved Report Presets', 'reports', false, 320)
on conflict (code) do update
set name_th = excluded.name_th,
    description_th = excluded.description_th,
    group_code = excluded.group_code,
    sensitive = excluded.sensitive,
    sort_order = excluded.sort_order;

-- Owner receives every permission.
insert into public.role_permissions(role, permission_code)
select 'owner'::public.user_role, code from public.permissions
on conflict do nothing;

-- Admin manages operational data but does not automatically manage users or system security.
insert into public.role_permissions(role, permission_code)
select 'admin'::public.user_role, code
from public.permissions
where code in (
  'manage_master_data', 'manage_prices', 'manage_daily_data', 'manage_scrap_sales',
  'import_data', 'export_reports', 'review_data', 'lock_periods', 'manage_report_presets'
)
on conflict do nothing;

insert into public.role_permissions(role, permission_code)
select 'editor'::public.user_role, code
from public.permissions
where code in ('manage_daily_data', 'manage_scrap_sales', 'import_data', 'export_reports')
on conflict do nothing;

insert into public.role_permissions(role, permission_code)
values ('viewer'::public.user_role, 'export_reports')
on conflict do nothing;

-- Bootstrap exactly one Owner from the oldest active Admin. Existing additional Admins remain Admin.
with first_admin as (
  select id
  from public.profiles
  where role = 'admin' and active = true
  order by created_at asc, id asc
  limit 1
)
update public.profiles p
set role = 'owner', updated_at = now()
from first_admin f
where p.id = f.id
  and not exists (select 1 from public.profiles where role = 'owner');

-- If no Admin exists, promote the oldest active user to keep the system manageable.
with first_active_user as (
  select id
  from public.profiles
  where active = true
  order by created_at asc, id asc
  limit 1
)
update public.profiles p
set role = 'owner', updated_at = now()
from first_active_user f
where p.id = f.id
  and not exists (select 1 from public.profiles where role = 'owner');

create or replace function public.has_permission(p_permission_code text, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with selected_profile as (
    select id, role
    from public.profiles
    where id = p_user_id and active = true and status not in ('suspended', 'disabled')
  ), base_permission as (
    select exists(
      select 1
      from selected_profile p
      join public.role_permissions rp on rp.role = p.role
      where rp.permission_code = p_permission_code
    ) as allowed
  ), override_permission as (
    select effect
    from public.user_permission_overrides
    where user_id = p_user_id and permission_code = p_permission_code
  )
  select case
    when (select effect from override_permission) = 'deny' then false
    when (select effect from override_permission) = 'allow' then true
    else coalesce((select allowed from base_permission), false)
  end;
$$;

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owner_count integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      select count(*) into remaining_owner_count
      from public.profiles
      where role = 'owner'
        and active = true
        and status not in ('suspended', 'disabled')
        and id <> old.id;
      if remaining_owner_count < 1 then
        raise exception 'LAST_OWNER_PROTECTED: ระบบต้องมี Owner ที่ใช้งานได้อย่างน้อยหนึ่งคน';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'owner' and (
    new.role <> 'owner'
    or new.active = false
    or new.status in ('suspended', 'disabled')
  ) then
    select count(*) into remaining_owner_count
    from public.profiles
    where role = 'owner'
      and active = true
      and status not in ('suspended', 'disabled')
      and id <> old.id;

    if remaining_owner_count < 1 then
      raise exception 'LAST_OWNER_PROTECTED: ระบบต้องมี Owner ที่ใช้งานได้อย่างน้อยหนึ่งคน';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_last_owner on public.profiles;
create trigger profiles_protect_last_owner
before update or delete on public.profiles
for each row execute function public.protect_last_owner();

drop trigger if exists user_permission_overrides_set_updated_at on public.user_permission_overrides;
create trigger user_permission_overrides_set_updated_at
before update on public.user_permission_overrides
for each row execute function public.set_updated_at();

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists permissions_authenticated_read on public.permissions;
create policy permissions_authenticated_read on public.permissions
for select to authenticated using (true);

drop policy if exists role_permissions_authenticated_read on public.role_permissions;
create policy role_permissions_authenticated_read on public.role_permissions
for select to authenticated using (true);

drop policy if exists user_permission_overrides_self_read on public.user_permission_overrides;
create policy user_permission_overrides_self_read on public.user_permission_overrides
for select to authenticated using (user_id = auth.uid());

drop policy if exists profiles_admin_select_all on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_privileged_select_all on public.profiles;
create policy profiles_privileged_select_all on public.profiles
for select to authenticated
using (public.has_permission('manage_users'));

-- Direct client updates remain intentionally disabled. All privileged writes use Backend Service Role.
revoke all on table public.permissions, public.role_permissions, public.user_permission_overrides, public.audit_logs from anon;
grant select on table public.permissions, public.role_permissions to authenticated;
grant select on table public.user_permission_overrides to authenticated;
revoke insert, update, delete on table public.profiles from authenticated;

revoke all on function public.has_permission(text, uuid) from public;
grant execute on function public.has_permission(text, uuid) to authenticated, service_role;

insert into public.app_settings(key, value, description)
values
  ('user_management_version', '2.6.0', 'เวอร์ชันระบบจัดการผู้ใช้และ Permission'),
  ('permission_model', 'role_plus_override', 'Role defaults ร่วมกับ Permission override รายบุคคล')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

commit;



-- ============================================================
-- 015_phase_b_data_governance.sql
-- ============================================================

begin;

-- Phase B: monthly governance, future-date protection, import history, and data quality support.

-- Enforce the existing business requirement that scrap weight and price use at most 2 decimal places.
do $$
declare
  v_invalid_count bigint;
begin
  select count(*) into v_invalid_count
  from public.scrap_sales
  where weight_kg <> round(weight_kg, 2)
     or price_per_kg <> round(price_per_kg, 2);
  if v_invalid_count > 0 then
    raise exception 'SCRAP_SALE_EXISTING_SCALE_INVALID: พบรายการขายเดิม % รายการที่เกิน 2 ตำแหน่ง กรุณาแก้ข้อมูลก่อนรัน Migration', v_invalid_count;
  end if;
end;
$$;

alter table public.scrap_sales drop constraint if exists scrap_sales_weight_scale;
alter table public.scrap_sales add constraint scrap_sales_weight_scale check (weight_kg = round(weight_kg, 2));
alter table public.scrap_sales drop constraint if exists scrap_sales_price_scale;
alter table public.scrap_sales add constraint scrap_sales_price_scale check (price_per_kg = round(price_per_kg, 2));


create table if not exists public.data_periods (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'locked', 'reopened')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  reopen_reason text check (reopen_reason is null or char_length(reopen_reason) between 5 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_periods_first_day check (month_start = date_trunc('month', month_start)::date)
);

create index if not exists data_periods_status_month_idx on public.data_periods(status, month_start desc);

drop trigger if exists data_periods_set_updated_at on public.data_periods;
create trigger data_periods_set_updated_at
before update on public.data_periods
for each row execute function public.set_updated_at();

create table if not exists public.import_histories (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  category_id uuid references public.master_categories(id) on delete set null,
  module text not null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  sheet_name text check (sheet_name is null or char_length(sheet_name) <= 120),
  status text not null check (status in ('validated', 'validated_with_errors', 'rejected', 'committed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  imported_by uuid references public.profiles(id) on delete set null,
  committed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_history_row_counts check (valid_rows + error_rows <= total_rows),
  constraint import_histories_first_day check (month_start = date_trunc('month', month_start)::date)
);

create index if not exists import_histories_month_idx on public.import_histories(month_start desc, created_at desc);
create index if not exists import_histories_user_idx on public.import_histories(imported_by, created_at desc);

drop trigger if exists import_histories_set_updated_at on public.import_histories;
create trigger import_histories_set_updated_at
before update on public.import_histories
for each row execute function public.set_updated_at();

create table if not exists public.import_history_errors (
  id bigint generated always as identity primary key,
  import_history_id uuid not null references public.import_histories(id) on delete cascade,
  row_number integer not null check (row_number >= 1),
  column_name text,
  raw_value text,
  error_code text not null,
  error_message text not null,
  created_at timestamptz not null default now()
);

create index if not exists import_history_errors_history_idx on public.import_history_errors(import_history_id, row_number);

create or replace function public.bangkok_current_date()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

create or replace function public.get_period_status(p_date date)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select status from public.data_periods where month_start = date_trunc('month', p_date)::date),
    'draft'
  );
$$;

create or replace function public.enforce_daily_entry_governance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_date date;
  v_status text;
begin
  v_date := case when tg_op = 'DELETE' then old.entry_date else new.entry_date end;

  if tg_op <> 'DELETE' and v_date > public.bangkok_current_date() then
    raise exception 'FUTURE_DATE_NOT_ALLOWED: ไม่สามารถบันทึกข้อมูลล่วงหน้าสำหรับวันที่ในอนาคตได้';
  end if;

  v_status := public.get_period_status(v_date);
  if v_status = 'locked' then
    raise exception 'PERIOD_LOCKED: งวดข้อมูลปิดแล้ว ไม่สามารถเพิ่ม แก้ไข หรือลบข้อมูลได้';
  end if;
  if v_status = 'reviewed' then
    update public.data_periods
      set status = 'draft', reviewed_by = null, reviewed_at = null
      where month_start = date_trunc('month', v_date)::date;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists daily_entries_governance_guard on public.daily_entries;
create trigger daily_entries_governance_guard
before insert or update or delete on public.daily_entries
for each row execute function public.enforce_daily_entry_governance();

create or replace function public.enforce_scrap_sale_governance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_date date;
  v_status text;
begin
  v_date := case when tg_op = 'DELETE' then old.sale_date else new.sale_date end;
  if tg_op <> 'DELETE' and v_date > public.bangkok_current_date() then
    raise exception 'FUTURE_DATE_NOT_ALLOWED: ไม่สามารถบันทึกรายการขายล่วงหน้าสำหรับวันที่ในอนาคตได้';
  end if;
  v_status := public.get_period_status(v_date);
  if v_status = 'locked' then
    raise exception 'PERIOD_LOCKED: งวดข้อมูลปิดแล้ว ไม่สามารถแก้ไขรายการขายได้';
  end if;
  if v_status = 'reviewed' then
    update public.data_periods
      set status = 'draft', reviewed_by = null, reviewed_at = null
      where month_start = date_trunc('month', v_date)::date;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists scrap_sales_governance_guard on public.scrap_sales;
create trigger scrap_sales_governance_guard
before insert or update or delete on public.scrap_sales
for each row execute function public.enforce_scrap_sale_governance();

-- Replace the month function so service-role calls still obey future-date and locked-period rules.
create or replace function public.replace_daily_month(
  p_category_id uuid,
  p_month_start date,
  p_entries jsonb,
  p_changed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date;
  v_month_end date;
  v_module text;
  v_active boolean;
  v_item jsonb;
  v_date date;
  v_quantity numeric(16, 4);
  v_note text;
  v_count integer := 0;
  v_total numeric(18, 4) := 0;
  v_action text := 'replace';
  v_period_status text;
begin
  if p_category_id is null then raise exception 'DAILY_CATEGORY_REQUIRED: กรุณาระบุประเภทข้อมูล'; end if;
  if p_month_start is null then raise exception 'DAILY_MONTH_REQUIRED: กรุณาระบุเดือน'; end if;

  v_month_start := date_trunc('month', p_month_start)::date;
  if p_month_start <> v_month_start then raise exception 'DAILY_MONTH_INVALID: p_month_start ต้องเป็นวันแรกของเดือน'; end if;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;
  v_period_status := public.get_period_status(v_month_start);
  if v_period_status = 'locked' then raise exception 'PERIOD_LOCKED: งวดข้อมูลปิดแล้ว ไม่สามารถแก้ไขข้อมูลได้'; end if;

  select module, active into v_module, v_active from public.master_categories where id = p_category_id;
  if v_module is null then raise exception 'DAILY_CATEGORY_NOT_FOUND: ไม่พบประเภทข้อมูล'; end if;
  if v_module not in ('waste', 'tissue', 'animal_feed', 'garbage_bag', 'consumable') then raise exception 'DAILY_CATEGORY_MODULE_INVALID: ประเภทนี้ไม่รองรับการบันทึกรายวัน'; end if;
  if not v_active then raise exception 'DAILY_CATEGORY_INACTIVE: ประเภทนี้ถูกปิดใช้งาน'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'DAILY_ENTRIES_INVALID: entries ต้องเป็น JSON array'; end if;
  if jsonb_array_length(p_entries) > extract(day from v_month_end)::integer then raise exception 'DAILY_ENTRIES_TOO_MANY: จำนวนรายการเกินจำนวนวันในเดือน'; end if;

  if exists (
    select 1 from (
      select item ->> 'date' as entry_date, count(*)
      from jsonb_array_elements(p_entries) item
      group by item ->> 'date' having count(*) > 1
    ) duplicates
  ) then raise exception 'DAILY_DATE_DUPLICATE: พบวันที่ซ้ำในข้อมูลที่ส่งมา'; end if;

  for v_item in select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'date', '') = '' or not (v_item ? 'quantity') or v_item -> 'quantity' = 'null'::jsonb then
      raise exception 'DAILY_ENTRY_INVALID: แต่ละรายการต้องมี date และ quantity';
    end if;
    begin
      v_date := (v_item ->> 'date')::date;
      v_quantity := (v_item ->> 'quantity')::numeric;
    exception when others then
      raise exception 'DAILY_ENTRY_INVALID: วันที่หรือจำนวนไม่ถูกต้อง';
    end;
    if v_date < v_month_start or v_date > v_month_end then raise exception 'DAILY_DATE_OUT_OF_MONTH: วันที่ % ไม่อยู่ในเดือนที่เลือก', v_date; end if;
    if v_date > public.bangkok_current_date() then raise exception 'FUTURE_DATE_NOT_ALLOWED: ไม่สามารถบันทึกข้อมูลล่วงหน้าสำหรับวันที่ในอนาคตได้'; end if;
    if v_quantity < 0 then raise exception 'DAILY_QUANTITY_NEGATIVE: จำนวนต้องไม่ติดลบ'; end if;
    if v_module in ('tissue', 'garbage_bag', 'consumable') and v_quantity <> trunc(v_quantity) then raise exception 'DAILY_QUANTITY_INTEGER_REQUIRED: หมวดนี้รับเฉพาะจำนวนเต็ม'; end if;
    if v_module in ('waste', 'animal_feed') and v_quantity <> round(v_quantity, 2) then raise exception 'DAILY_QUANTITY_SCALE: ข้อมูลน้ำหนักมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง'; end if;
    v_note := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    if v_note is not null and length(v_note) > 500 then raise exception 'DAILY_NOTE_TOO_LONG: หมายเหตุต้องไม่เกิน 500 ตัวอักษร'; end if;
  end loop;

  insert into public.data_periods(month_start, status, created_by, updated_by)
  values (v_month_start, 'draft', p_changed_by, p_changed_by)
  on conflict (month_start) do nothing;

  delete from public.daily_entries where category_id = p_category_id and entry_date between v_month_start and v_month_end;

  for v_item in select value from jsonb_array_elements(p_entries)
  loop
    v_date := (v_item ->> 'date')::date;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_note := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    insert into public.daily_entries(category_id, entry_date, quantity, note, created_by, updated_by)
    values (p_category_id, v_date, v_quantity, v_note, p_changed_by, p_changed_by);
    v_count := v_count + 1;
    v_total := v_total + v_quantity;
  end loop;

  if v_count = 0 then v_action := 'clear'; end if;
  insert into public.daily_entry_month_logs(category_id, month_start, action, saved_count, total_quantity, changed_by)
  values (p_category_id, v_month_start, v_action, v_count, v_total, p_changed_by);

  return jsonb_build_object('categoryId', p_category_id, 'month', to_char(v_month_start, 'YYYY-MM'), 'savedCount', v_count, 'totalQuantity', v_total, 'action', v_action);
end;
$$;

alter table public.data_periods enable row level security;
alter table public.import_histories enable row level security;
alter table public.import_history_errors enable row level security;
revoke all on table public.data_periods, public.import_histories, public.import_history_errors from anon, authenticated;
revoke all on function public.bangkok_current_date(), public.get_period_status(date) from public;
grant execute on function public.bangkok_current_date(), public.get_period_status(date) to authenticated, service_role;
revoke all on function public.replace_daily_month(uuid, date, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.replace_daily_month(uuid, date, jsonb, uuid) to service_role;

insert into public.app_settings(key, value, description) values
  ('data_governance_version', '2.7.0', 'Phase B period status, future-date guard, import history, and data quality'),
  ('business_timezone', 'Asia/Bangkok', 'Timezone used for operational date validation')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

commit;



-- ============================================================
-- 016_phase_c3_report_presets.sql
-- ============================================================

begin;

create table if not exists public.report_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  visibility text not null default 'private',
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_presets_name_check check (length(trim(name)) between 1 and 100),
  constraint report_presets_description_check check (length(description) <= 500),
  constraint report_presets_visibility_check check (visibility in ('private','team')),
  constraint report_presets_config_check check (jsonb_typeof(config) = 'object')
);

create index if not exists report_presets_owner_idx on public.report_presets(owner_id, updated_at desc);
create index if not exists report_presets_visibility_idx on public.report_presets(visibility, updated_at desc);
create unique index if not exists report_presets_owner_name_unique_idx
  on public.report_presets(owner_id, lower(trim(name)));

alter table public.report_presets enable row level security;

-- Direct client reads are limited. Backend Service Role remains the authoritative writer.
drop policy if exists report_presets_select_visible on public.report_presets;
create policy report_presets_select_visible on public.report_presets
for select to authenticated
using (
  owner_id = auth.uid()
  or visibility = 'team'
  or public.has_permission('manage_report_presets')
);

revoke all on table public.report_presets from anon;
grant select on table public.report_presets to authenticated;
revoke insert, update, delete on table public.report_presets from authenticated;

-- Keep updated_at consistent with the rest of the app.
drop trigger if exists report_presets_set_updated_at on public.report_presets;
create trigger report_presets_set_updated_at
before update on public.report_presets
for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description)
values ('report_presets_version', '2.7.0-c3', 'Enterprise Saved Report Presets สำหรับ PowerPoint Report Builder')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;



-- ============================================================
-- 017_phase_c5_report_runs.sql
-- ============================================================

begin;

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid references public.report_presets(id) on delete set null,
  export_log_id uuid references public.export_logs(id) on delete set null,
  report_type text not null default 'powerpoint_builder',
  title text not null,
  period_label text not null,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'generated',
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  constraint report_runs_type_check check (report_type in ('powerpoint_builder','single_export')),
  constraint report_runs_status_check check (status in ('generated','failed')),
  constraint report_runs_title_check check (length(trim(title)) between 1 and 140),
  constraint report_runs_period_check check (length(period_label) between 1 and 80),
  constraint report_runs_config_check check (jsonb_typeof(config) = 'object'),
  constraint report_runs_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists report_runs_generated_at_idx on public.report_runs(generated_at desc);
create index if not exists report_runs_generated_by_idx on public.report_runs(generated_by, generated_at desc);
create index if not exists report_runs_preset_idx on public.report_runs(preset_id, generated_at desc);

alter table public.report_runs enable row level security;

drop policy if exists report_runs_select_own_or_audit on public.report_runs;
create policy report_runs_select_own_or_audit on public.report_runs
for select to authenticated
using (
  generated_by = auth.uid()
  or public.has_permission('view_audit_logs')
);

revoke all on table public.report_runs from anon;
grant select on table public.report_runs to authenticated;
revoke insert, update, delete on table public.report_runs from authenticated;

insert into public.app_settings (key, value, description)
values ('report_runs_version', '2.7.0-c5', 'Report run metadata สำหรับติดตามการสร้างรายงาน PowerPoint')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;



-- ============================================================
-- 018_phase_c6_report_files_storage.sql
-- ============================================================

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-files',
  'report-files',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.report_files (
  id uuid primary key default gen_random_uuid(),
  report_run_id uuid references public.report_runs(id) on delete set null,
  export_log_id uuid references public.export_logs(id) on delete set null,
  bucket text not null default 'report-files',
  object_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  file_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint report_files_path_unique unique (bucket, object_path),
  constraint report_files_name_check check (length(trim(file_name)) between 1 and 180),
  constraint report_files_mime_check check (length(trim(mime_type)) between 1 and 140),
  constraint report_files_size_check check (file_size_bytes >= 0),
  constraint report_files_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists report_files_created_at_idx on public.report_files(created_at desc);
create index if not exists report_files_generated_by_idx on public.report_files(generated_by, created_at desc);
create index if not exists report_files_run_idx on public.report_files(report_run_id);

alter table public.report_files enable row level security;

drop policy if exists report_files_select_own_or_audit on public.report_files;
create policy report_files_select_own_or_audit on public.report_files
for select to authenticated
using (
  generated_by = auth.uid()
  or public.has_permission('view_audit_logs')
);

revoke all on table public.report_files from anon;
grant select on table public.report_files to authenticated;
revoke insert, update, delete on table public.report_files from authenticated;

insert into public.app_settings (key, value, description)
values ('report_files_version', '2.7.0-c6', 'Report file storage metadata และ Supabase Storage bucket สำหรับรายงานที่สร้างแล้ว')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;



-- ============================================================
-- 019_v2_9_ux4_master_category_labels.sql
-- ============================================================

begin;

-- UX-4: align master category labels/units with actual data-entry forms.
-- This migration is safe to rerun.

update public.master_categories
set unit = 'ใบ',
    updated_at = now()
where module = 'garbage_bag'
  and unit <> 'ใบ';

update public.master_categories
set unit = 'แผ่น',
    updated_at = now()
where module = 'tissue'
  and code = 'HAND_TOWEL'
  and unit <> 'แผ่น';

update public.master_categories
set unit = 'กล่อง',
    updated_at = now()
where module = 'tissue'
  and code = 'POPUP_TISSUE'
  and unit <> 'กล่อง';

update public.master_categories
set name_th = 'อาหารหมา',
    updated_at = now()
where module = 'animal_feed'
  and code = 'DOG_FEED'
  and name_th <> 'อาหารหมา';

insert into public.app_settings (key, value, description)
values (
  'ux4_category_label_alignment',
  'garbage_bag.unit=ใบ,tissue.hand=แผ่น,tissue.popup=กล่อง,animal_feed.dog=อาหารหมา',
  'ปรับชื่อและหน่วย Master Data ให้ตรงกับเมนูกรอกข้อมูลตามงานจริง UX-4'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;


-- Verification helper
select
  'central_krabi_dashboard_v2_9_0_c7_preview_ux5_setup_complete' as status,
  now() as completed_at;
