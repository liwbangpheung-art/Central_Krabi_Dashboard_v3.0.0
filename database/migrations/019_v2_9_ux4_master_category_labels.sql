begin;

-- UX-4: align master category labels/units with actual data-entry forms.
-- This migration is safe to rerun.

update public.master_categories
set unit = 'ใบ',
    updated_at = now()
where module = 'garbage_bag'
  and unit <> 'ใบ';

update public.master_categories
set unit = 'แผ่น',
    updated_at = now()
where module = 'tissue'
  and code = 'HAND_TOWEL'
  and unit <> 'แผ่น';

update public.master_categories
set unit = 'กล่อง',
    updated_at = now()
where module = 'tissue'
  and code = 'POPUP_TISSUE'
  and unit <> 'กล่อง';

update public.master_categories
set name_th = 'อาหารหมา',
    updated_at = now()
where module = 'animal_feed'
  and code = 'DOG_FEED'
  and name_th <> 'อาหารหมา';

insert into public.app_settings (key, value, description)
values (
  'ux4_category_label_alignment',
  'garbage_bag.unit=ใบ,tissue.hand=แผ่น,tissue.popup=กล่อง,animal_feed.dog=อาหารหมา',
  'ปรับชื่อและหน่วย Master Data ให้ตรงกับเมนูกรอกข้อมูลตามงานจริง UX-4'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

commit;
