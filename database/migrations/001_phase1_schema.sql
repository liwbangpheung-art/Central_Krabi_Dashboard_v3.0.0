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
