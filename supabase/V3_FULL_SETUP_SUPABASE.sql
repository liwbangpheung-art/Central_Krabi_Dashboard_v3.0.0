-- Central Krabi Analytics Platform v3.0.0
-- Render + Supabase production-ready base schema

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text not null default 'System User',
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_categories (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  code text not null,
  name_th text not null,
  unit text not null default 'kg',
  color text default '#2563eb',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (module, code),
  unique (module, name_th)
);

create table if not exists public.data_entries (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('rdf','dog_food','pig_feed','wet_waste','recycle','tissue','black_bag')),
  category_code text,
  entry_date date not null,
  period_month date not null,
  material_name text,
  weight_kg numeric(14,2),
  quantity numeric(14,2),
  unit text not null default 'kg',
  unit_price numeric(14,2),
  amount numeric(14,2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_data_entries_module_month on public.data_entries(module, period_month);
create index if not exists idx_data_entries_entry_date on public.data_entries(entry_date);
create index if not exists idx_master_categories_module on public.master_categories(module, active, sort_order);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_data_entries_updated_at on public.data_entries;
create trigger trg_data_entries_updated_at before update on public.data_entries
for each row execute function public.set_updated_at();

insert into public.master_categories (module, code, name_th, unit, color, sort_order) values
  ('rdf', 'RDF', 'RDF', 'kg', '#f97316', 10),
  ('dog_food', 'DOG_FOOD', 'อาหารหมา', 'kg', '#22c55e', 20),
  ('pig_feed', 'PIG_FEED', 'อาหารหมู', 'kg', '#84cc16', 30),
  ('wet_waste', 'WET_WASTE', 'ขยะเปียก', 'kg', '#14b8a6', 40),
  ('recycle', 'RECYCLE', 'รีไซเคิล', 'kg', '#3b82f6', 50),
  ('tissue', 'TISSUE', 'กระดาษทิชชู่', 'kg', '#a855f7', 60),
  ('black_bag', 'BLACK_BAG', 'ถุงดำ', 'ใบ', '#334155', 70)
on conflict (module, code) do update set
  name_th = excluded.name_th,
  unit = excluded.unit,
  color = excluded.color,
  sort_order = excluded.sort_order,
  active = true;

insert into public.profiles (email, display_name, role)
values ('owner@central-krabi.local', 'System Owner', 'owner')
on conflict (email) do update set display_name = excluded.display_name, role = excluded.role, active = true;

alter table public.profiles enable row level security;
alter table public.master_categories enable row level security;
alter table public.data_entries enable row level security;
alter table public.audit_logs enable row level security;

-- Frontend never connects to Supabase directly. Backend uses SUPABASE_SERVICE_ROLE_KEY and bypasses RLS.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY in frontend variables.
