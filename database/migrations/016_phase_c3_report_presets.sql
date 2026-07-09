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
