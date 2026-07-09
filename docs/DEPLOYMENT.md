# การติดตั้ง CKAP v3 บน Render + Supabase

## 1) Supabase
1. เปิด Supabase Project
2. ไปที่ SQL Editor
3. วางและรันไฟล์ `supabase/V3_FULL_SETUP_SUPABASE.sql`
4. คัดลอกค่า Project URL และ Service Role Key

## 2) GitHub
1. อัปโหลดโฟลเดอร์โปรเจกต์นี้ขึ้น GitHub
2. ตรวจให้แน่ใจว่าไฟล์ `render.yaml` อยู่ที่ root repository

## 3) Render Blueprint
1. New > Blueprint
2. เลือก GitHub repository
3. Render จะสร้าง 2 services:
   - `ckap-backend`
   - `ckap-frontend`

## 4) Environment Variables
Backend service:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `NODE_ENV=production`
- `FRONTEND_URL` = URL ของ frontend Render

Frontend static service:
- `VITE_API_BASE_URL` ระบบจะอ้างอิง hostname ของ `ckap-backend` ให้อัตโนมัติจาก `render.yaml`; ถ้าไม่ได้ใช้ Blueprint ให้ตั้งเองเป็น URL backend เช่น `https://ckap-backend.onrender.com`

## 5) ตรวจหลัง Deploy
- เปิด `https://<backend-url>/api/health`
- เปิดหน้า frontend แล้วลองบันทึกข้อมูล RDF 1 รายการ
- กลับไปดู Dashboard ว่าค่าขึ้นหรือไม่
