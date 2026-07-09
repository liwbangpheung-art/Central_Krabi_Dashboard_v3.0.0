-- Central Krabi Dashboard v2.6.0 smoke test
-- Run after migrations 001-014.

do $$
declare
  permission_count integer;
  owner_count integer;
  active_count integer;
  total_user_count integer;
  max_users integer;
begin
  if to_regclass('public.profiles') is null then
    raise exception 'profiles table is missing';
  end if;
  if to_regclass('public.permissions') is null then
    raise exception 'permissions table is missing; run Migration 014';
  end if;
  if to_regclass('public.role_permissions') is null then
    raise exception 'role_permissions table is missing; run Migration 014';
  end if;
  if to_regclass('public.user_permission_overrides') is null then
    raise exception 'user_permission_overrides table is missing; run Migration 014';
  end if;
  if to_regclass('public.audit_logs') is null then
    raise exception 'audit_logs table is missing; run Migration 014';
  end if;

  select count(*) into permission_count from public.permissions;
  if permission_count < 21 then
    raise exception 'Expected at least 21 permissions, found %', permission_count;
  end if;

  select count(*) into owner_count
  from public.profiles
  where role = 'owner' and active = true and status not in ('suspended', 'disabled');

  select count(*) into active_count
  from public.profiles
  where active = true and status not in ('suspended', 'disabled');

  select count(*) into total_user_count from public.profiles;

  select coalesce(value::integer, 10) into max_users
  from public.app_settings
  where key = 'max_users';
  max_users := coalesce(max_users, 10);

  if active_count > 0 and owner_count < 1 then
    raise exception 'At least one active Owner is required when users exist';
  end if;
  if total_user_count > max_users then
    raise exception 'Total user count % exceeds configured maximum %', total_user_count, max_users;
  end if;
  if not exists (
    select 1 from public.role_permissions
    where role = 'owner' and permission_code = 'manage_users'
  ) then
    raise exception 'Owner role is missing manage_users permission';
  end if;
  if not exists (
    select 1 from public.app_settings
    where key = 'user_management_version' and value = '2.6.0'
  ) then
    raise exception 'user_management_version setting is missing or incorrect';
  end if;

  raise notice 'v2.6.0 smoke test passed: permissions=%, total_users=%, active_users=%, active_owners=%', permission_count, total_user_count, active_count, owner_count;
end
$$;

select role, count(*) as user_count
from public.profiles
group by role
order by role;

select role, count(*) as permission_count
from public.role_permissions
group by role
order by role;
