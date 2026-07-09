begin;

insert into public.app_settings (key, value, description)
values ('analytics_version', '5', 'เวอร์ชัน Dashboard และระบบวิเคราะห์ข้อมูล')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;
