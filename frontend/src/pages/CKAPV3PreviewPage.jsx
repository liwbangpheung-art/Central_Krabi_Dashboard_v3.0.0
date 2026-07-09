import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../context/AuthContext.jsx";
import { createApiClient } from "../lib/api.js";
import { analyticsPath, defaultAnalyticsFilters, formatNumber } from "../lib/analytics.js";
import { buildMonthDays, currentMonthValue, monthLabelThai, serializeDailyEntries, summarizeDailyValues, validateDailyGrid } from "../lib/daily-entry.js";

const MODULES = [
  { id: "rdf", label: "ขยะ RDF", module: "waste", categoryCode: "RDF", unit: "kg", tone: "orange", input: "calendar", icon: "RDF" },
  { id: "dog", label: "อาหารหมา", module: "animal_feed", categoryCode: "DOG_FEED", fallbackCode: "DOG_FOOD", unit: "kg", tone: "green", input: "calendar", icon: "DOG" },
  { id: "pig", label: "อาหารหมู", module: "animal_feed", categoryCode: "PIG_FEED", unit: "kg", tone: "pink", input: "average", icon: "PIG" },
  { id: "recycle", label: "วัสดุรีไซเคิล", module: "scrap_material", unit: "kg", tone: "blue", input: "dynamic", icon: "REC" },
  { id: "tissue", label: "กระดาษทิชชู่", module: "tissue", unit: "จำนวน", tone: "cyan", input: "matrix", icon: "TIS" },
  { id: "bag", label: "ถุงดำ", module: "garbage_bag", unit: "จำนวน", tone: "slate", input: "monthly", icon: "BAG" }
];

const TISSUE_TYPES = ["ม้วน", "เช็ดมือ", "ป๊อบอัพ"];
const BAG_SIZES = ["18x20", "24x28", "30x40"];
const RECYCLE_ROWS = [
  { material: "PET", kg: 120, price: 8.5 },
  { material: "กระดาษ", kg: 80, price: 3 },
  { material: "อลูมิเนียม", kg: 15, price: 35 }
];

const MONTH_NAMES = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function thaiMonthShort(monthValue) {
  const match = /^(\d{4})-(\d{2})$/u.exec(monthValue || "");
  if (!match) return monthValue || "เดือนนี้";
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${Number(match[1]) + 543}`;
}

function dayNumber(date) {
  return Number(String(date || "").slice(-2));
}

function moduleCss(tone) {
  return `v3-tone-${tone}`;
}

function StatCard({ label, value, sub, tone = "blue" }) {
  return (
    <article className={`v3-stat ${moduleCss(tone)}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="v3-empty">
      <div>!</div>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="v3-section-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function CKAPV3PreviewPage({ config }) {
  const { session, signOut, accessToken, refreshAccessToken } = useAuth();
  const api = useMemo(() => createApiClient({ apiUrl: config.apiUrl, getAccessToken: accessToken, refreshAccessToken }), [config.apiUrl, accessToken, refreshAccessToken]);
  const [activeView, setActiveView] = useState("home");
  const [activeModuleId, setActiveModuleId] = useState("rdf");
  const [month, setMonth] = useState(currentMonthValue());
  const [profile, setProfile] = useState(null);
  const [systemNotice, setSystemNotice] = useState(null);
  const [categoryState, setCategoryState] = useState({ loading: true, items: [], selected: null, error: null });
  const [days, setDays] = useState(() => buildMonthDays(currentMonthValue()));
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState({ loading: true, data: null, error: null });
  const [chartType, setChartType] = useState("bar");
  const [pptTheme, setPptTheme] = useState("Executive Dark");

  const activeModule = useMemo(() => MODULES.find((item) => item.id === activeModuleId) || MODULES[0], [activeModuleId]);
  const dailySummary = useMemo(() => summarizeDailyValues(days, month), [days, month]);

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.request("/api/me");
      setProfile(data.profile || null);
    } catch (error) {
      setSystemNotice({ type: "error", message: `โหลด Profile ไม่สำเร็จ: ${error.message}` });
    }
  }, [api]);

  const loadAnalytics = useCallback(async () => {
    setAnalytics({ loading: true, data: null, error: null });
    try {
      const filters = { ...defaultAnalyticsFilters(), module: "waste", view: "monthly", year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)), metric: "quantity" };
      const data = await api.request(analyticsPath(filters));
      setAnalytics({ loading: false, data, error: null });
    } catch (error) {
      setAnalytics({ loading: false, data: null, error });
    }
  }, [api, month]);

  const loadDailyModule = useCallback(async () => {
    if (!activeModule.module || !["calendar"].includes(activeModule.input)) {
      setCategoryState({ loading: false, items: [], selected: null, error: null });
      setDays(buildMonthDays(month));
      return;
    }
    setCategoryState({ loading: true, items: [], selected: null, error: null });
    try {
      const data = await api.request(`/api/master-data?module=${encodeURIComponent(activeModule.module)}&status=active`);
      const items = data.items || [];
      const selected = items.find((item) => String(item.code).toUpperCase() === activeModule.categoryCode)
        || items.find((item) => String(item.code).toUpperCase() === activeModule.fallbackCode)
        || items[0]
        || null;
      setCategoryState({ loading: false, items, selected, error: null });
      if (selected?.id) {
        const result = await api.request(`/api/daily-entries?categoryId=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`);
        setDays(buildMonthDays(month, result.items || [], { today: result.today }));
      } else {
        setDays(buildMonthDays(month));
        setSystemNotice({ type: "error", message: `ไม่พบ Master Data สำหรับ ${activeModule.label}` });
      }
    } catch (error) {
      setCategoryState({ loading: false, items: [], selected: null, error });
      setDays(buildMonthDays(month));
    }
  }, [activeModule, api, month]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => { loadDailyModule(); }, [loadDailyModule]);

  function updateDay(index, value) {
    setDays((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item));
  }

  async function saveDailyEntries() {
    if (!categoryState.selected?.id) {
      setSystemNotice({ type: "error", message: "ยังไม่พบประเภทข้อมูลสำหรับบันทึก" });
      return;
    }
    const errors = validateDailyGrid(days, activeModule.module);
    if (errors.length) {
      setSystemNotice({ type: "error", message: errors.slice(0, 3).join(" / ") });
      return;
    }
    setSaving(true);
    try {
      const entries = serializeDailyEntries(days);
      await api.request("/api/daily-entries/month", {
        method: "POST",
        body: { categoryId: categoryState.selected.id, month, entries }
      });
      setSystemNotice({ type: "success", message: `บันทึก ${activeModule.label} เดือน ${thaiMonthShort(month)} สำเร็จ` });
      await Promise.all([loadDailyModule(), loadAnalytics()]);
    } catch (error) {
      setSystemNotice({ type: "error", message: `บันทึกไม่สำเร็จ: ${error.message}` });
    } finally {
      setSaving(false);
    }
  }

  const chartData = useMemo(() => {
    const rows = analytics.data?.rows || [];
    if (rows.length) {
      return rows.slice(-6).map((row) => ({ name: row.label || row.period || "ช่วงเวลา", value: Number(row.total || Object.values(row.values || {})[0] || 0) }));
    }
    return [
      { name: "ขยะ RDF", value: 15200 },
      { name: "ขยะเปียก", value: 8100 },
      { name: "รีไซเคิล", value: 3250 },
      { name: "ทิชชู่", value: 420 },
      { name: "ถุงดำ", value: 180 }
    ];
  }, [analytics.data]);

  const totalChartValue = chartData.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const topChartItem = chartData.reduce((top, item) => Number(item.value || 0) > Number(top.value || 0) ? item : top, chartData[0] || { name: "—", value: 0 });

  return (
    <div className="v3-preview-shell">
      <header className="v3-hero-topbar">
        <div className="v3-brand-block">
          <div className="v3-brand-mark">CK</div>
          <div>
            <span>Central Krabi Analytics Platform</span>
            <strong>v3 Real Working Preview</strong>
          </div>
        </div>
        <div className="v3-top-filters">
          <label>
            <span>เดือนทำงาน</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label>
            <span>โมดูล</span>
            <select value={activeModuleId} onChange={(event) => setActiveModuleId(event.target.value)}>
              {MODULES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="v3-account">
          <span>{(profile?.full_name || session?.user?.email || "CK").slice(0, 2).toUpperCase()}</span>
          <div><strong>{profile?.full_name || session?.user?.email || "ผู้ใช้งาน"}</strong><small>{profile?.role || "role"}</small></div>
          <button type="button" onClick={signOut}>ออก</button>
        </div>
      </header>

      <nav className="v3-command-dock" aria-label="เมนู CKAP v3 Preview">
        {[
          ["home", "Home", "ศูนย์ควบคุม"],
          ["input", "Input", "กรอกข้อมูล"],
          ["dashboard", "Dashboard", "กราฟและ KPI"],
          ["powerpoint", "PowerPoint", "สร้างสไลด์"]
        ].map(([id, label, sub]) => (
          <button key={id} type="button" className={activeView === id ? "active" : ""} onClick={() => setActiveView(id)}>
            <strong>{label}</strong><span>{sub}</span>
          </button>
        ))}
      </nav>

      {systemNotice && (
        <div className={`v3-toast ${systemNotice.type}`}>
          <span>{systemNotice.message}</span>
          <button type="button" onClick={() => setSystemNotice(null)}>×</button>
        </div>
      )}

      <main className="v3-workspace">
        <aside className="v3-module-rail">
          <span className="v3-rail-title">Modules</span>
          {MODULES.map((item) => (
            <button type="button" key={item.id} className={`${moduleCss(item.tone)} ${activeModuleId === item.id ? "active" : ""}`} onClick={() => setActiveModuleId(item.id)}>
              <b>{item.icon}</b><span>{item.label}</span><small>{item.input}</small>
            </button>
          ))}
        </aside>

        <section className="v3-main-canvas">
          {activeView === "home" && (
            <div className="v3-home-grid">
              <section className="v3-welcome-card">
                <div>
                  <p>Real Working Preview</p>
                  <h1>หน้าใหม่ ไม่ถอดแบบของเดิม</h1>
                  <span>เมนูแบบ Command Center, กรอกข้อมูลแบบ Calendar/Matrix, Dashboard และ PowerPoint อยู่ในประสบการณ์เดียวกัน</span>
                </div>
                <button type="button" onClick={() => setActiveView("input")}>เริ่มกรอกข้อมูล</button>
              </section>
              <div className="v3-stat-grid">
                <StatCard label="เดือนที่เลือก" value={thaiMonthShort(month)} sub="ใช้ร่วมทั้ง Input / Dashboard / Report" tone="blue" />
                <StatCard label="ข้อมูลรายวัน" value={`${dailySummary.filledDays}/${dailySummary.availableDays}`} sub="จำนวนวันที่มีข้อมูลในโมดูลที่เลือก" tone={activeModule.tone} />
                <StatCard label="ยอดรวมโมดูล" value={`${formatNumber(dailySummary.total)} ${activeModule.unit}`} sub={activeModule.label} tone="green" />
                <StatCard label="Chart Source" value={analytics.error ? "Fallback" : "API"} sub={analytics.error ? "API ยังไม่พร้อม จึงใช้ข้อมูลตัวอย่าง" : "ใช้ Analytics API จริง"} tone={analytics.error ? "pink" : "cyan"} />
              </div>
              <section className="v3-flow-card">
                <SectionTitle eyebrow="Architecture" title="ข้อมูลไหลแบบ v3" description="Input → Database → Analytics Engine → Dashboard / PowerPoint" />
                <div className="v3-flow-steps">
                  {['Input จริง', 'Audit Log', 'Analytics API', 'Chart', 'PPTX'].map((step, index) => <span key={step}>{index + 1}. {step}</span>)}
                </div>
              </section>
            </div>
          )}

          {activeView === "input" && (
            <div className="v3-panel-grid">
              <section className="v3-glass-panel v3-span-2">
                <SectionTitle eyebrow="Data Entry" title={`${activeModule.label} — ${monthLabelThai(month)}`} description="ออกแบบใหม่ให้เห็นภาพรวมทั้งเดือน ใช้บนมือถือได้ และไม่ต้องหาเมนูหลายชั้น" />
                {activeModule.input === "calendar" && (
                  <>
                    <div className="v3-entry-summary">
                      <StatCard label="ยอดรวม" value={`${formatNumber(dailySummary.total)} ${activeModule.unit}`} sub="รวมเฉพาะวันที่กรอก" tone={activeModule.tone} />
                      <StatCard label="วันที่กรอกแล้ว" value={`${dailySummary.filledDays} วัน`} sub={`ยังว่าง ${dailySummary.missingDays} วัน`} tone="blue" />
                      <StatCard label="ค่าเฉลี่ย" value={`${formatNumber(dailySummary.averagePerFilledDay)} ${activeModule.unit}`} sub="เฉลี่ยจากวันที่กรอก" tone="cyan" />
                    </div>
                    {categoryState.error && <EmptyState title="โหลดข้อมูลเดิมไม่สำเร็จ" message={categoryState.error.message} />}
                    <div className="v3-calendar-grid">
                      {days.map((item, index) => (
                        <label key={item.date} className={`v3-day-card ${item.value !== "" ? "filled" : ""} ${item.future ? "future" : ""}`}>
                          <span><b>{item.day}</b><small>{item.weekday}</small></span>
                          <input value={item.value} disabled={item.future} inputMode="decimal" placeholder="0" onChange={(event) => updateDay(index, event.target.value)} />
                        </label>
                      ))}
                    </div>
                    <div className="v3-action-bar">
                      <button type="button" onClick={() => setDays((current) => current.map((item) => item.future ? item : { ...item, value: "" }))}>ล้างหน้าจอ</button>
                      <button type="button" className="primary" onClick={saveDailyEntries} disabled={saving || !categoryState.selected}>{saving ? "กำลังบันทึก..." : "บันทึกข้อมูลจริง"}</button>
                    </div>
                  </>
                )}

                {activeModule.input === "matrix" && (
                  <div className="v3-matrix-wrap">
                    <table className="v3-matrix-table">
                      <thead><tr><th>วันที่</th>{TISSUE_TYPES.map((type) => <th key={type}>{type}</th>)}<th>สถานะ</th></tr></thead>
                      <tbody>{days.map((item) => <tr key={item.date}><td>{item.day} {item.weekday}</td>{TISSUE_TYPES.map((type) => <td key={type}><input inputMode="numeric" placeholder="0" /></td>)}<td><span className="v3-pill">Draft</span></td></tr>)}</tbody>
                    </table>
                    <div className="v3-action-bar"><button>Import CSV</button><button>Export CSV</button><button className="primary">บันทึก Matrix</button></div>
                  </div>
                )}

                {activeModule.input === "dynamic" && (
                  <div className="v3-dynamic-list">
                    <div className="v3-dynamic-head"><strong>วันที่ 3 {thaiMonthShort(month)}</strong><button type="button">+ เพิ่มรายการ</button></div>
                    {RECYCLE_ROWS.map((row) => <div className="v3-dynamic-row" key={row.material}><span>{row.material}</span><input defaultValue={row.kg} /><input defaultValue={row.price} /><strong>{formatNumber(row.kg * row.price)} บาท</strong></div>)}
                    <div className="v3-action-bar"><button>Import CSV</button><button>Export CSV</button><button className="primary">บันทึกรีไซเคิล</button></div>
                  </div>
                )}

                {activeModule.input === "monthly" && (
                  <div className="v3-monthly-form">
                    {BAG_SIZES.map((size) => <label key={size}><span>{size}</span><input placeholder="จำนวน" /><select defaultValue="ใบ"><option>ใบ</option><option>แพ็ค</option><option>ม้วน</option></select></label>)}
                    <div className="v3-action-bar"><button>Export CSV</button><button className="primary">บันทึกถุงดำ</button></div>
                  </div>
                )}

                {activeModule.input === "average" && (
                  <div className="v3-average-mode">
                    <label><span>Input Mode</span><select><option>ค่าเฉลี่ยรายวัน</option><option>รายวันจริงแบบ Calendar</option></select></label>
                    <label><span>ค่าเฉลี่ยรายวัน kg/day</span><input placeholder="เช่น 120" /></label>
                    <div className="v3-calc-preview">ระบบคำนวณรายเดือนอัตโนมัติจากจำนวนวันของเดือนที่เลือก</div>
                    <div className="v3-action-bar"><button>เปลี่ยนเป็นรายวันจริง</button><button className="primary">บันทึกอาหารหมู</button></div>
                  </div>
                )}
              </section>

              <aside className="v3-insight-panel">
                <SectionTitle eyebrow="Inspector" title="สรุปหน้ากรอก" description="บอกสถานะทันที ไม่ต้องเลื่อนหา" />
                <ul>
                  <li>โมดูล: <b>{activeModule.label}</b></li>
                  <li>รูปแบบ: <b>{activeModule.input}</b></li>
                  <li>หน่วย: <b>{activeModule.unit}</b></li>
                  <li>Master: <b>{categoryState.selected?.name_th || "รอตั้งค่า"}</b></li>
                </ul>
              </aside>
            </div>
          )}

          {activeView === "dashboard" && (
            <div className="v3-panel-grid">
              <section className="v3-glass-panel v3-span-2">
                <SectionTitle eyebrow="Dashboard" title="KPI + Chart จาก Analytics Engine" description="เปลี่ยน Bar / Line / Pie โดยใช้ข้อมูลสรุปชุดเดียวกัน ไม่กระทบกัน" />
                <div className="v3-chart-toolbar">
                  {['bar', 'line', 'pie'].map((type) => <button key={type} type="button" className={chartType === type ? 'active' : ''} onClick={() => setChartType(type)}>{type.toUpperCase()}</button>)}
                </div>
                <div className="v3-stat-grid compact">
                  <StatCard label="ยอดรวม" value={formatNumber(totalChartValue)} sub="ตามข้อมูลสรุป" tone="blue" />
                  <StatCard label="มากที่สุด" value={topChartItem?.name || "—"} sub={formatNumber(topChartItem?.value)} tone="orange" />
                  <StatCard label="กราฟที่เหมาะ" value={chartType === 'line' ? 'Trend' : chartType === 'pie' ? 'Share' : 'Compare'} sub="ระบบช่วยแนะนำได้ภายหลัง" tone="green" />
                </div>
                <div className="v3-chart-card">
                  <ResponsiveContainer width="100%" height={360}>
                    {chartType === "line" ? (
                      <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Line type="monotone" dataKey="value" strokeWidth={3} dot={{ r: 5 }} /></LineChart>
                    ) : chartType === "pie" ? (
                      <PieChart><Tooltip /><Pie data={chartData} dataKey="value" nameKey="name" outerRadius={130} label>{chartData.map((_, index) => <Cell key={index} />)}</Pie></PieChart>
                    ) : (
                      <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" radius={[14, 14, 0, 0]}>{chartData.map((_, index) => <Cell key={index} />)}</Bar></BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </section>
              <aside className="v3-insight-panel">
                <SectionTitle eyebrow="Insight" title="อ่านผลเร็ว" description="เน้นผู้บริหาร ไม่ใช่ตารางรก" />
                <p>เดือน {thaiMonthShort(month)} รายการที่สูงสุดคือ <b>{topChartItem?.name}</b> จำนวน <b>{formatNumber(topChartItem?.value)}</b></p>
                <p>ถ้าเลือก Line Chart ระบบควรใช้ข้อมูลรายเดือน/รายวันเพื่อดูแนวโน้ม ไม่ใช้ข้อมูลสัดส่วนคงที่</p>
              </aside>
            </div>
          )}

          {activeView === "powerpoint" && (
            <div className="v3-panel-grid">
              <section className="v3-glass-panel v3-span-2">
                <SectionTitle eyebrow="PowerPoint Builder" title="สร้างสไลด์จากข้อมูลจริง" description="หน้าตาใหม่แบบ Builder ไม่ใช่แค่หน้าส่งออกไฟล์" />
                <div className="v3-builder-grid">
                  <div className="v3-builder-controls">
                    <label><span>ช่วงรายงาน</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
                    <label><span>Theme</span><select value={pptTheme} onChange={(event) => setPptTheme(event.target.value)}><option>Executive Dark</option><option>Clean Government</option><option>Eco Green</option></select></label>
                    <label><span>Chart</span><select value={chartType} onChange={(event) => setChartType(event.target.value)}><option value="bar">Bar Chart</option><option value="line">Line Chart</option><option value="pie">Pie Chart</option></select></label>
                    <button type="button" className="primary">Generate PPTX</button>
                  </div>
                  <div className="v3-slide-preview">
                    <div className="v3-slide-frame">
                      <span>{pptTheme}</span>
                      <h3>รายงานข้อมูลขยะและทรัพยากร</h3>
                      <p>{thaiMonthShort(month)}</p>
                      <div className="v3-slide-bars"><i /><i /><i /><i /></div>
                    </div>
                    <ol>
                      <li>Cover</li><li>Executive Summary</li><li>Dashboard Chart</li><li>Recommendations</li>
                    </ol>
                  </div>
                </div>
              </section>
              <aside className="v3-insight-panel">
                <SectionTitle eyebrow="PPT Rules" title="ต้องแก้ไขได้" description="ไม่ใช่ภาพแปะทั้งสไลด์" />
                <ul><li>ข้อความเป็น Text</li><li>กราฟเป็น Native Chart</li><li>ตารางแบ่งหน้าอัตโนมัติ</li><li>ใช้สีเดียวกับ Dashboard</li></ul>
              </aside>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
