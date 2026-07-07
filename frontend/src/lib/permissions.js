export const roleLabels = Object.freeze({
  owner: "เจ้าของระบบ",
  admin: "ผู้ดูแลระบบ",
  editor: "ผู้บันทึกข้อมูล",
  viewer: "ผู้ดูข้อมูล"
});

export const statusLabels = Object.freeze({
  invited: "ส่งคำเชิญแล้ว",
  pending: "เตรียมบัญชีไว้แล้ว",
  active: "ใช้งาน",
  suspended: "ระงับชั่วคราว",
  disabled: "ปิดใช้งาน"
});

export function hasPermission(permissions, code) {
  return Array.isArray(permissions) && permissions.includes(code);
}

export function permissionState(overrides, code) {
  return overrides?.[code] || "inherit";
}

export const periodStatusLabels = Object.freeze({
  draft: "กำลังบันทึก",
  reviewed: "ตรวจสอบแล้ว",
  locked: "ปิดงวดแล้ว",
  reopened: "เปิดแก้ไขอีกครั้ง"
});
