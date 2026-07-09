begin;
alter table public.export_logs enable row level security;
revoke all on table public.export_logs from anon, authenticated;
commit;
