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
