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
