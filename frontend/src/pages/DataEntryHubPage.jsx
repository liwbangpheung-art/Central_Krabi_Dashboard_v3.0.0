import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { currentMonthValue, monthLabelThai } from "../lib/daily-entry.js";

// Helper to define each entry card
const ENTRY_CARDS = [
  {
    id: "tissue",
    title: "กระดาษทิชชู่ (รายเดือน)",
    description: "กรอกจำนวนกระดาษทิชชู่ม้วน, กระดาษเช็ดมือ และป๊อปอัพเป็นยอดรวมสะสมรายเดือน",
    path: "/entry/tissue",
    icon: "document",
    color: "purple",
    checkType: "module",
    checkKey: "tissue"
  },
  {
    id: "garbage_bag",
    title: "ถุงดำ/ถุงขยะ (รายเดือน)",
    description: "บันทึกข้อมูลถุงขยะขนาดต่างๆ (30x40, 28x36, 18x20) ที่ใช้งานจริงรายเดือน",
    path: "/entry/garbage-bag",
    icon: "box",
    color: "indigo",
    checkType: "module",
    checkKey: "garbage_bag"
  },
  {
    id: "rdf",
    title: "ขยะ RDF (รายวัน)",
    description: "กรอกปริมาณขยะเชื้อเพลิง RDF รายวัน (หน่วยกิโลกรัม) สำหรับการวิเคราะห์การผลิตพลังงาน",
    path: "/entry/rdf",
    icon: "currency",
    color: "green",
    checkType: "code",
    checkKey: "RDF"
  },
  {
    id: "dog_food",
    title: "อาหารหมา (รายวัน)",
    description: "บันทึกข้อมูลการแจกจ่ายหรือใช้งานอาหารสุนัขรายวัน (หน่วยกิโลกรัม)",
    path: "/entry/dog-food",
    icon: "layers",
    color: "orange",
    checkType: "code",
    checkKey: "DOG_FEED"
  },
  {
    id: "wet_waste",
    title: "ขยะเปียก & อาหารหมู",
    description: "บันทึกปริมาณขยะเปียกของเทศบาล และการนำไปทำเป็นอาหารหมูในแต่ละวัน",
    path: "/entry/wet-waste",
    icon: "layers",
    color: "pink",
    checkType: "special_wet_waste"
  },
  {
    id: "recycle",
    title: "ขยะรีไซเคิล (รายเดือน)",
    description: "จัดการรายการซื้อขาย ข้อมูลเศษวัสดุรีไซเคิลต่างๆ (กระดาษ สังกะสี PET อะลูมิเนียม แก้ว)",
    path: "/entry/recycle",
    icon: "recycle",
    color: "teal",
    checkType: "scrap_sales"
  }
];

const ICON_COLORS = {
  blue: { bg: "#c2e7ff", fg: "#004a77" },
  purple: { bg: "#e8def8", fg: "#4a0077" },
  indigo: { bg: "#d8e2ff", fg: "#002a77" },
  green: { bg: "#c4eed0", fg: "#005522" },
  orange: { bg: "#ffdfbe", fg: "#883300" },
  pink: { bg: "#ffd7f4", fg: "#880055" },
  teal: { bg: "#cbf0f8", fg: "#005566" },
  gray: { bg: "#e1e3e1", fg: "#333333" },
};

function SidebarIcon({ name }) {
  return (
    <svg className="hub-svg-icon" viewBox="0 0 24 24" aria-hidden="true" style={{ width: "22px", height: "22px", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" }}>
      {name === "document" && <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5" /><path d="M9.5 17h4" /></>}
      {name === "box" && <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5" /><path d="M12 12v9" /></>}
      {name === "currency" && <><path d="M12 4v16" /><path d="M17 7.5c-.8-1.1-2.2-1.8-4-1.8-2.2 0-4 1.1-4 2.9 0 4.4 8 1.7 8 6 0 1.9-1.8 3-4.2 3-2 0-3.6-.8-4.8-2" /></>}
      {name === "layers" && <><path d="M12 4l9 5-9 5-9-5z" /><path d="M3 14l9 5 9-5" /></>}
      {name === "recycle" && <><path d="M7.5 7.5l2.2-3.1c.8-1.1 2.5-1.1 3.2.1l1 1.8" /><path d="M13 5.5h3.6l-1.3-3.3" /><path d="M17 12l2.2 3.1c.8 1.1.1 2.7-1.3 2.7h-2.2" /><path d="M17.8 17.8l-1.8 3.1" /><path d="M8 18H4.5c-1.4 0-2.1-1.6-1.3-2.7l1.2-1.8" /><path d="M4 17.8H8l-1.8 3.1" /></>}
    </svg>
  );
}

export function DataEntryHubPage() {
  const { api } = useOutletContext();
  const [month, setMonth] = useState(currentMonthValue());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [completenessData, setCompletenessData] = useState({});
  const [scrapSalesCount, setScrapSalesCount] = useState(0);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch completeness status from quality check API
      const qParams = new URLSearchParams();
      qParams.set("month", month);
      const quality = await api.request(`/api/data-quality?${qParams.toString()}`);

      // 2. Fetch scrap sales lists to count entries
      const sales = await api.request(`/api/scrap-sales?month=${month}`);

      setCompletenessData(quality || {});
      setScrapSalesCount(sales?.items?.length ?? 0);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [api, month]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  // Helper to resolve card completeness percent
  function getCompleteness(card) {
    if (loading) return null;
    const categories = completenessData.categories || [];
    if (categories.length === 0) return 0;

    if (card.checkType === "module") {
      const match = categories.filter(c => c.module === card.checkKey);
      if (match.length === 0) return 0;
      const total = match.reduce((sum, c) => sum + (c.completeness_percent || 0), 0);
      return Math.round(total / match.length);
    }

    if (card.checkType === "code") {
      const match = categories.find(c => c.code === card.checkKey);
      return match ? Math.round(match.completeness_percent || 0) : 0;
    }

    if (card.checkType === "special_wet_waste") {
      // Wet waste page inputs WET_WASTE and PIG_FEED
      const match = categories.filter(c => c.code === "WET_WASTE" || c.code === "PIG_FEED");
      if (match.length === 0) return 0;
      const total = match.reduce((sum, c) => sum + (c.completeness_percent || 0), 0);
      return Math.round(total / match.length);
    }

    if (card.checkType === "scrap_sales") {
      // Scrap sales don't have expected days, return 100 if count > 0, else 0
      return scrapSalesCount > 0 ? 100 : 0;
    }

    return 0;
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Data Collection</p>
          <h1>ศูนย์กรอกข้อมูล (Data Entry Hub)</h1>
          <p>เลือกเดือนที่ต้องการ และเริ่มต้นบันทึกข้อมูลปริมาณขยะ วัสดุสิ้นเปลือง และเศษรีไซเคิล</p>
        </div>
        <div className="hub-month-selector">
          <label htmlFor="hub-month">งวดข้อมูล: </label>
          <input
            id="hub-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={loading}
          />
        </div>
      </section>

      {error && (
        <section className="connection-error page-error" role="alert">
          <div>
            <h2>เกิดข้อผิดพลาดในการโหลดข้อมูลความคืบหน้า</h2>
            <p>{error.message}</p>
          </div>
          <button className="primary-button compact" type="button" onClick={loadProgress}>ลองใหม่</button>
        </section>
      )}

      <div className="hub-overview-status">
        <span className="hub-status-text">
          {loading ? "กำลังคำนวณความคืบหน้า..." : `งวดเดือน ${monthLabelThai(month)} — ตรวจสอบสถานะการบันทึกข้อมูลด้านล่าง`}
        </span>
      </div>

      <div className="entry-hub-grid">
        {ENTRY_CARDS.map((card) => {
          const percent = getCompleteness(card);
          const colors = ICON_COLORS[card.color] || ICON_COLORS.gray;
          
          let statusText = "";
          let statusClass = "hub-badge";
          if (loading) {
            statusText = "กำลังโหลด...";
          } else if (card.checkType === "scrap_sales") {
            statusText = scrapSalesCount > 0 ? `บันทึกแล้ว (${scrapSalesCount} รายการ)` : "ยังไม่มีข้อมูล";
            statusClass += scrapSalesCount > 0 ? " badge-success" : " badge-warning";
          } else {
            statusText = percent >= 100 ? "กรอกข้อมูลครบถ้วน" : percent > 0 ? `กรอกแล้ว ${percent}%` : "ยังไม่มีข้อมูล";
            statusClass += percent >= 100 ? " badge-success" : percent > 0 ? " badge-partial" : " badge-warning";
          }

          return (
            <div className="entry-hub-card" key={card.id}>
              <div className="entry-card-header">
                <div className="entry-card-icon" style={{ backgroundColor: colors.bg, color: colors.fg }}>
                  <SidebarIcon name={card.icon} />
                </div>
                <span className={statusClass}>{statusText}</span>
              </div>
              <div className="entry-card-body">
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>

              {!loading && card.checkType !== "scrap_sales" && (
                <div className="entry-card-progress">
                  <div className="progress-bar-bg">
                    <div 
                      className="progress-bar-fill" 
                      style={{ width: `${percent}%`, backgroundColor: percent >= 100 ? "var(--success)" : "var(--accent)" }} 
                    />
                  </div>
                </div>
              )}

              <div className="entry-card-action">
                <Link to={card.path} className="primary-button entry-card-btn">
                  {percent > 0 ? "แก้ไข/บันทึกเพิ่ม" : "เริ่มกรอกข้อมูล"} →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
