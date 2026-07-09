import { Link } from "react-router-dom";
import { PreviewDashboardPage } from "./PreviewDashboardPage.jsx";

export function PreviewPowerPointPage() {
  return (
    <div className="preview-page">
      <section className="preview-hero ppt-hero">
        <div>
          <p className="eyebrow">PowerPoint Builder Preview</p>
          <h1>สร้างสไลด์จากข้อมูลจริง</h1>
          <p>รอบ Preview นี้ใช้ Export PPTX จริงจาก Dashboard Engine เดิมก่อน เพื่อพิสูจน์ว่าเส้นทางข้อมูล → กราฟ → รายงาน ทำงานได้จริง</p>
          <div className="preview-actions"><Link to="/preview/dashboard" className="primary-button">ไป Dashboard แล้วกด Export PPTX</Link><Link to="/export" className="secondary-button">เปิด Report Builder เดิม</Link></div>
        </div>
      </section>
      <section className="preview-workflow">
        <div><strong>1</strong><span>เลือกช่วงข้อมูล</span><small>เดือน/ปี/โมดูล</small></div>
        <div><strong>2</strong><span>ดู Preview</span><small>KPI + Chart + Insight</small></div>
        <div><strong>3</strong><span>Export PPTX</span><small>เปิดแก้ใน PowerPoint ได้</small></div>
      </section>
    </div>
  );
}
