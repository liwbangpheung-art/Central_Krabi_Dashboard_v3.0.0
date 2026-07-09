# Render Build Fix

ถ้า Render ขึ้น error:

```text
npm error Missing script: "build"
```

ให้ใช้ชุดไฟล์นี้แทน เพราะแก้ไว้แล้ว 3 จุด:

1. เพิ่ม `package.json` ที่ root repository พร้อม script `build`
2. เพิ่ม `build` script ใน `backend/package.json`
3. แก้ `render.yaml` ให้ใช้ `rootDir` แยกชัดเจน:
   - backend ใช้ `rootDir: backend`
   - frontend ใช้ `rootDir: frontend`

## ตั้งค่า Render ที่ถูกต้อง

### วิธีแนะนำ: Blueprint
ใช้ `render.yaml` จาก root repository แล้ว Render จะสร้าง 2 services ให้เอง

### ถ้าสร้าง Manual Backend Service
- Root Directory: `backend`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

### ถ้าสร้าง Manual Frontend Static Site
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

หรือถ้า Render ชี้มาที่ root repository โดยตรง:
- Build Command: `npm install && npm run build`
- Publish Directory: `frontend/dist`
