# Database Migrations — v2.7.0

รันตามลำดับใน Supabase SQL Editor:

1. `001_phase1_schema.sql`
2. `002_phase1_security.sql`
3. `003_phase2_master_data.sql`
4. `004_phase2_security_and_functions.sql`
5. `005_phase2_seed_master_data.sql`
6. `006_phase3_daily_entries.sql`
7. `007_phase3_security_and_functions.sql`
8. `008_phase4_scrap_sales.sql`
9. `009_phase4_security.sql`
10. `010_phase5_analytics.sql`
11. `011_phase6_export_logs.sql`
12. `012_phase6_security.sql`
13. `013_v2_5_2_daily_quantity_policy.sql`
14. `014_phase_a_user_permissions.sql`
15. `015_phase_b_data_governance.sql`

ตรวจลำดับไฟล์ด้วย:

```bash
npm run check:migrations
```

## อัปเกรดจาก v2.6.0

1. Backup หรือใช้สำเนาฐานข้อมูล UAT
2. ตรวจว่าข้อมูล Scrap Sales เดิมไม่มีน้ำหนักหรือราคาที่มีทศนิยมเกิน 2 ตำแหน่ง
3. รัน:

```text
migrations/015_phase_b_data_governance.sql
release_2_7_0_smoke_test.sql
```

## Migration 015 เพิ่ม

- `data_periods`
- `import_histories`
- `import_history_errors`
- ฟังก์ชันวันที่ปัจจุบันตาม `Asia/Bangkok`
- ฟังก์ชันอ่านสถานะงวด
- Trigger ป้องกัน `daily_entries` และ `scrap_sales` วันที่อนาคต
- Trigger ป้องกันการเขียนข้อมูลในงวดที่ `locked`
- Trigger เปลี่ยนงวด `reviewed` กลับเป็น `draft` เมื่อข้อมูลเปลี่ยน
- อัปเดต `replace_daily_month` ให้ตรวจ Future Date, Locked Period และ Precision
- Constraint น้ำหนัก/ราคาขายเศษวัสดุไม่เกิน 2 ตำแหน่ง
- RLS และการจำกัดการเขียนตาราง Governance จาก Client
- App Settings สำหรับ Data Governance Version และ Business Timezone

## ติดตั้งใหม่

หลังรัน Migration 001–015 ให้รัน:

```text
release_2_7_0_smoke_test.sql
```

## Preflight ก่อน Production

```sql
select *
from scrap_sales
where round(weight_kg, 2) <> weight_kg
   or round(unit_price, 2) <> unit_price;
```

ผลต้องเป็นศูนย์แถวก่อนรัน Migration 015 หากพบข้อมูลให้ตรวจและแก้ด้วยกระบวนการที่อนุมัติแล้ว ห้ามปัดค่าทิ้งโดยอัตโนมัติ

## คำเตือน

- ห้ามแก้ Migration เก่าที่เคย Release แล้ว
- Migration ใหม่ถัดไปต้องเริ่มจาก `016_...sql`
- ควรทดสอบ Trigger กับข้อมูล UAT ก่อน Production
- Service Role Key ใช้เฉพาะ Backend และห้ามใส่ใน SQL/Repository
- Database เป็นชั้นป้องกันสุดท้าย แม้ Frontend จะ Disable วันอนาคตแล้วก็ตาม
