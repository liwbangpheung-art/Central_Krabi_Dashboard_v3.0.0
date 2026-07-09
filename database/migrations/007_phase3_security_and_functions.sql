begin;

alter table public.daily_entries enable row level security;
alter table public.daily_entry_month_logs enable row level security;

-- ข้อมูลรายวันอ่านและเขียนผ่าน Backend API เท่านั้น
revoke all on table public.daily_entries from anon, authenticated;
revoke all on table public.daily_entry_month_logs from anon, authenticated;

create or replace function public.replace_daily_month(
  p_category_id uuid,
  p_month_start date,
  p_entries jsonb,
  p_changed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date;
  v_month_end date;
  v_module text;
  v_active boolean;
  v_item jsonb;
  v_date date;
  v_quantity numeric(16, 4);
  v_note text;
  v_count integer := 0;
  v_total numeric(18, 4) := 0;
  v_action text := 'replace';
begin
  if p_category_id is null then
    raise exception 'DAILY_CATEGORY_REQUIRED: กรุณาระบุประเภทข้อมูล';
  end if;

  if p_month_start is null then
    raise exception 'DAILY_MONTH_REQUIRED: กรุณาระบุเดือน';
  end if;

  v_month_start := date_trunc('month', p_month_start)::date;
  if p_month_start <> v_month_start then
    raise exception 'DAILY_MONTH_INVALID: p_month_start ต้องเป็นวันแรกของเดือน';
  end if;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  select module, active
    into v_module, v_active
  from public.master_categories
  where id = p_category_id;

  if v_module is null then
    raise exception 'DAILY_CATEGORY_NOT_FOUND: ไม่พบประเภทข้อมูล';
  end if;
  if v_module not in ('waste', 'tissue', 'animal_feed', 'garbage_bag', 'consumable') then
    raise exception 'DAILY_CATEGORY_MODULE_INVALID: ประเภทนี้ไม่รองรับการบันทึกรายวัน';
  end if;
  if not v_active then
    raise exception 'DAILY_CATEGORY_INACTIVE: ประเภทนี้ถูกปิดใช้งาน';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'DAILY_ENTRIES_INVALID: entries ต้องเป็น JSON array';
  end if;

  if jsonb_array_length(p_entries) > extract(day from v_month_end)::integer then
    raise exception 'DAILY_ENTRIES_TOO_MANY: จำนวนรายการเกินจำนวนวันในเดือน';
  end if;

  if exists (
    select 1
    from (
      select item ->> 'date' as entry_date, count(*)
      from jsonb_array_elements(p_entries) item
      group by item ->> 'date'
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'DAILY_DATE_DUPLICATE: พบวันที่ซ้ำในข้อมูลที่ส่งมา';
  end if;

  -- Validate ทุกแถวก่อนลบข้อมูลเดิม เพื่อป้องกันข้อมูลสูญหายเมื่อ payload ผิด
  for v_item in select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'date', '') = ''
       or not (v_item ? 'quantity')
       or v_item -> 'quantity' = 'null'::jsonb then
      raise exception 'DAILY_ENTRY_INVALID: แต่ละรายการต้องมี date และ quantity';
    end if;

    begin
      v_date := (v_item ->> 'date')::date;
      v_quantity := (v_item ->> 'quantity')::numeric;
    exception when others then
      raise exception 'DAILY_ENTRY_INVALID: วันที่หรือจำนวนไม่ถูกต้อง';
    end;

    if v_date < v_month_start or v_date > v_month_end then
      raise exception 'DAILY_DATE_OUT_OF_MONTH: วันที่ % ไม่อยู่ในเดือนที่เลือก', v_date;
    end if;
    if v_quantity < 0 then
      raise exception 'DAILY_QUANTITY_NEGATIVE: จำนวนต้องไม่ติดลบ';
    end if;
    if scale(v_quantity) > 4 then
      raise exception 'DAILY_QUANTITY_SCALE: จำนวนมีทศนิยมได้ไม่เกิน 4 ตำแหน่ง';
    end if;
    v_note := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    if v_note is not null and length(v_note) > 500 then
      raise exception 'DAILY_NOTE_TOO_LONG: หมายเหตุต้องไม่เกิน 500 ตัวอักษร';
    end if;
  end loop;

  delete from public.daily_entries
  where category_id = p_category_id
    and entry_date between v_month_start and v_month_end;

  for v_item in select value from jsonb_array_elements(p_entries)
  loop
    v_date := (v_item ->> 'date')::date;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_note := nullif(trim(coalesce(v_item ->> 'note', '')), '');

    insert into public.daily_entries (
      category_id, entry_date, quantity, note, created_by, updated_by
    ) values (
      p_category_id, v_date, v_quantity, v_note, p_changed_by, p_changed_by
    );

    v_count := v_count + 1;
    v_total := v_total + v_quantity;
  end loop;

  if v_count = 0 then
    v_action := 'clear';
  end if;

  insert into public.daily_entry_month_logs (
    category_id, month_start, action, saved_count, total_quantity, changed_by
  ) values (
    p_category_id, v_month_start, v_action, v_count, v_total, p_changed_by
  );

  return jsonb_build_object(
    'categoryId', p_category_id,
    'month', to_char(v_month_start, 'YYYY-MM'),
    'savedCount', v_count,
    'totalQuantity', v_total,
    'action', v_action
  );
end;
$$;

revoke all on function public.replace_daily_month(uuid, date, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.replace_daily_month(uuid, date, jsonb, uuid) to service_role;

commit;
