begin;

create table if not exists public.export_logs (
  id uuid primary key default gen_random_uuid(),
  export_format text not null,
  module text not null,
  view_mode text not null,
  period_label text not null,
  options jsonb not null default '{}'::jsonb,
  exported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint export_logs_format_check check (export_format in ('xlsx','pdf','png','pptx')),
  constraint export_logs_module_check check (module in ('waste','tissue','animal_feed','garbage_bag','consumable','scrap_sales')),
  constraint export_logs_view_check check (view_mode in ('monthly','quarterly','yearly','month_over_month')),
  constraint export_logs_period_check check (length(period_label) between 1 and 80)
);

create index if not exists export_logs_created_at_idx on public.export_logs (created_at desc);
create index if not exists export_logs_exported_by_idx on public.export_logs (exported_by, created_at desc);

insert into public.app_settings (key, value, description)
values ('export_version', '6', 'เวอร์ชันระบบ Export Excel PDF PNG และ PowerPoint')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;
