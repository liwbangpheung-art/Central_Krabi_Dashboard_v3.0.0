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
