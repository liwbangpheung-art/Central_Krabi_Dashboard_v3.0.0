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
