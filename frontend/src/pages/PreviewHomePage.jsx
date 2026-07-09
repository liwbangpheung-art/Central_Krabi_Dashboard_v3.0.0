import { Link, useOutletContext } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

const modules = [
  { key: "waste", title: "ขยะ RDF", detail: "กรอกข้อมูลรายวัน / kg", icon: "🟧", to: "/preview/input?module=waste" },
  { key: "animal_feed", title: "ขยะเปียก", detail: "อาหารหมา + อาหารหมู", icon: "🟩", to: "/preview/input?module=animal_feed" },
  { key: "scrap_sales", title: "วัสดุรีไซเคิล", detail: "น้ำหนัก ราคา มูลค่า", icon: "♻️", to: "/entry/recycle" },
  { key: "tissue", title: "กระดาษทิชชู่", detail: "ม้วน / เช็ดมือ / ป๊อบอัพ", icon: "🧻", to: "/preview/input?module=tissue" },
  { key: "garbage_bag", title: "ถุงดำ", detail: "18x20 / 24x28 / 30x40", icon: "🗑️", to: "/preview/input?module=garbage_bag" }
];

function monthName(value) {
  if (!value) return "—";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function PreviewHomePage() {
  const { api, profile } = useOutletContext();
  const [status, setStatus] = useState({ loading: true, activeMonths: {}, error: null });

  useEffect(() => {
    let alive = true;
    api.request("/api/analytics/status")
      .then((data) => alive && setStatus({ loading: false, activeMonths: data.activeMonths || {}, error: null }))
      .catch((error) => alive && setStatus({ loading: false, activeMonths: {}, error }));
    return () => { alive = false; };
  }, [api]);

  const activeCount = useMemo(() => Object.values(status.activeMonths || {}).reduce((sum, months) => sum + (months?.length ? 1 : 0), 0), [status.activeMonths]);

  return (
    <div className="preview-page">
      <section className="preview-hero">
        <div>
          <p className="eyebrow">CKAP v3 Real Working Preview</p>
          <h1>ศูนย์ควบคุมข้อมูลขยะและรายงาน</h1>
          <p>เวอร์ชันทดลองที่เชื่อมระบบจริง: ดึงข้อมูลจริง กรอกข้อมูลจริง Dashboard จริง และสร้าง PowerPoint ได้จริงจาก Engine เดิม</p>
          <div className="preview-actions">
            <Link className="primary-button" to="/preview/input">เริ่มกรอกข้อมูล</Link>
            <Link className="secondary-button" to="/preview/dashboard">ดู Dashboard</Link>
            <Link className="secondary-button" to="/preview/powerpoint">สร้าง PowerPoint</Link>
          </div>
        </div>
        <aside className="preview-hero-card">
          <span>ผู้ใช้งาน</span>
          <strong>{profile?.full_name || profile?.email || "CKAP User"}</strong>
          <small>ระบบนี้ใช้สิทธิ์และ Session จริง</small>
        </aside>
      </section>

      <section className="preview-kpis">
        <article><span>ระบบข้อมูลที่มีข้อมูลแล้ว</span><strong>{status.loading ? "…" : activeCount}</strong><small>โมดูล</small></article>
        <article><span>Analytics</span><strong>Live</strong><small>อ่านจาก API จริง</small></article>
        <article><span>Audit/Security</span><strong>On</strong><small>ใช้สิทธิ์ระบบเดิม</small></article>
        <article><span>Preview Mode</span><strong>Safe</strong><small>ไม่รื้อของเดิม</small></article>
      </section>

      {status.error && <div className="inline-notice notice-error">โหลดสถานะข้อมูลไม่สำเร็จ: {status.error.message}</div>}

      <section className="preview-module-grid">
        {modules.map((module) => {
          const months = status.activeMonths?.[module.key] || [];
          const lastMonth = months[months.length - 1];
          return (
            <Link to={module.to} className="preview-module-card" key={module.key}>
              <span className="preview-module-icon">{module.icon}</span>
              <strong>{module.title}</strong>
              <small>{module.detail}</small>
              <em>{months.length ? `ล่าสุด ${monthName(lastMonth)}` : "ยังไม่พบข้อมูล"}</em>
            </Link>
          );
        })}
      </section>

      <section className="preview-workflow">
        <div><strong>1</strong><span>กรอกข้อมูล</span><small>Calendar / Matrix / Dynamic</small></div>
        <div><strong>2</strong><span>Analytics Engine</span><small>สรุปข้อมูลชุดเดียว</small></div>
        <div><strong>3</strong><span>Dashboard</span><small>Bar / Line / Pie</small></div>
        <div><strong>4</strong><span>PowerPoint</span><small>สร้าง PPTX แก้ไขได้</small></div>
      </section>
    </div>
  );
}
