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
