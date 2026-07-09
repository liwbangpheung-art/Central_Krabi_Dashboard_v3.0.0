select 'tables' as section, table_name as item
from information_schema.tables
where table_schema = 'public'
  and table_name in ('app_settings', 'profiles')

union all

select 'trigger' as section, trigger_name as item
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
  and trigger_name = 'on_auth_user_created'

union all

select 'setting' as section, key || '=' || value as item
from public.app_settings
where key in ('organization_name', 'max_users')

order by section, item;
