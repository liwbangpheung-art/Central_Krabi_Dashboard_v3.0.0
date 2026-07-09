begin;

insert into public.master_categories
  (module, code, name_th, name_en, unit, color_hex, pattern, sort_order, active, metadata)
values
  ('waste', 'WET_WASTE', 'ขยะเปียก', 'Wet waste', 'กิโลกรัม', '#2E7D32', 'solid', 10, true, '{"semanticColor":"green"}'),
  ('waste', 'RECYCLE', 'Recycle', 'Recycle', 'กิโลกรัม', '#FFEB00', 'solid', 20, true, '{"semanticColor":"yellow"}'),
  ('waste', 'RDF', 'ขยะ RDF', 'RDF waste', 'กิโลกรัม', '#111111', 'solid', 30, true, '{"semanticColor":"black"}'),

  ('tissue', 'TISSUE_ROLL', 'ทิชชู่ม้วน', 'Tissue roll', 'ม้วน', '#8B5CF6', 'solid', 10, true, '{}'),
  ('tissue', 'HAND_TOWEL', 'กระดาษเช็ดมือ', 'Hand towel', 'แพ็ค', '#45B98A', 'solid', 20, true, '{}'),
  ('tissue', 'POPUP_TISSUE', 'กระดาษป๊อปอัพ', 'Pop-up tissue', 'แพ็ค', '#E979A8', 'solid', 30, true, '{}'),

  ('animal_feed', 'PIG_FEED', 'อาหารหมู', 'Pig feed', 'กิโลกรัม', '#D99058', 'solid', 10, true, '{}'),
  ('animal_feed', 'DOG_FEED', 'อาหารสุนัข', 'Dog feed', 'กิโลกรัม', '#6497C8', 'solid', 20, true, '{}'),

  ('garbage_bag', 'BAG_30X40_BLACK', '30×40 สีดำ', '30×40 black', 'กิโลกรัม', '#171717', 'solid', 10, true, '{"physicalColor":"black","size":"30x40"}'),
  ('garbage_bag', 'BAG_28X36_TEA', '28×36 สีชา', '28×36 tea', 'กิโลกรัม', '#C99562', 'solid', 20, true, '{"physicalColor":"tea","size":"28x36"}'),
  ('garbage_bag', 'BAG_18X20_BLACK', '18×20 สีดำ', '18×20 black', 'กิโลกรัม', '#454545', 'diagonal', 30, true, '{"physicalColor":"black","size":"18x20"}'),

  ('consumable', 'FOAM_SOAP', 'สบู่โฟม', 'Foam soap', 'แกลลอน', '#8B5CF6', 'solid', 10, true, '{}'),
  ('consumable', 'TOILET_LID_CLEANER', 'น้ำยาเช็ดฝาโถ', 'Toilet lid cleaner', 'แกลลอน', '#45B98A', 'solid', 20, true, '{}'),

  ('scrap_material', 'BROWN_PAPER', 'กระดาษน้ำตาล', 'Brown paper', 'กิโลกรัม', '#B66A2C', 'solid', 10, true, '{}'),
  ('scrap_material', 'WHITE_PAPER', 'กระดาษขาว', 'White paper', 'กิโลกรัม', '#D8D4C9', 'solid', 20, true, '{}'),
  ('scrap_material', 'TIN_CANS', 'สังกะสีและกระป๋อง', 'Tin and cans', 'กิโลกรัม', '#9AA3AD', 'solid', 30, true, '{}'),
  ('scrap_material', 'PET', 'PET', 'PET', 'กิโลกรัม', '#F1A15A', 'solid', 40, true, '{}'),
  ('scrap_material', 'MIXED_PLASTIC', 'พลาสติกรวม', 'Mixed plastic', 'กิโลกรัม', '#C77843', 'solid', 50, true, '{}'),
  ('scrap_material', 'ALUMINUM', 'อะลูมิเนียม', 'Aluminum', 'กิโลกรัม', '#4CA5C8', 'solid', 60, true, '{}'),
  ('scrap_material', 'MIXED_GLASS', 'แก้วรวมสี', 'Mixed glass', 'กิโลกรัม', '#4E9B75', 'solid', 70, true, '{}')
on conflict (module, code) do nothing;

commit;
