begin;

alter table public.scrap_sales enable row level security;
revoke all on table public.scrap_sales from anon, authenticated;

-- Browser clients access scrap sales through the Backend API only.
-- The Backend uses the Service Role and enforces Admin/Editor/Viewer permissions.

commit;
