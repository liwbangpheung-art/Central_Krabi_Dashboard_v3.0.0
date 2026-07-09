begin;

-- Release 2.5.2 quantity policy:
-- - tissue, garbage_bag, consumable: integer only
-- - waste, animal_feed: maximum 2 decimal places

do $$
declare
  v_invalid_count bigint;
begin
  select count(*) into v_invalid_count
  from public.daily_entries de
  join public.master_categories mc on mc.id = de.category_id
  where (mc.module in ('tissue', 'garbage_bag', 'consumable') and de.quantity <> trunc(de.quantity))
     or (mc.module in ('waste', 'animal_feed') and de.quantity <> round(de.quantity, 2));

  if v_invalid_count > 0 then
    raise exception 'DAILY_QUANTITY_EXISTING_DATA_INVALID: พบข้อมูลเดิม % รายการที่ไม่ผ่านกฎจำนวนของ Release 2.5.2 กรุณาแก้ข้อมูลก่อนรัน Migration', v_invalid_count;
  end if;
end;
$$;

create or replace function public.enforce_daily_quantity_policy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_module text;
begin
  select module into v_module
  from public.master_categories
  where id = new.category_id;

  if v_module in ('tissue', 'garbage_bag', 'consumable')
     and new.quantity <> trunc(new.quantity) then
    raise exception 'DAILY_QUANTITY_INTEGER_REQUIRED: หมวดทิชชู่ ถุงขยะ และวัสดุสิ้นเปลืองรับเฉพาะจำนวนเต็ม';
  end if;

  if v_module in ('waste', 'animal_feed')
     and new.quantity <> round(new.quantity, 2) then
    raise exception 'DAILY_QUANTITY_SCALE: ข้อมูลน้ำหนักมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_entries_quantity_policy_guard on public.daily_entries;
create trigger daily_entries_quantity_policy_guard
before insert or update of category_id, quantity on public.daily_entries
for each row execute function public.enforce_daily_quantity_policy();

insert into public.app_settings (key, value, description)
values (
  'daily_quantity_policy',
  'waste:2,animal_feed:2,tissue:0,garbage_bag:0,consumable:0',
  'จำนวนตำแหน่งทศนิยมสูงสุดของข้อมูลรายวันตามหมวด'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;
