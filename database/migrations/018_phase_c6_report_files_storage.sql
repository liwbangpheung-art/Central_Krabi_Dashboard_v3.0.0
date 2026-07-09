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
