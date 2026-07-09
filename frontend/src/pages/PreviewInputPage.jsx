import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { buildMonthDays, currentMonthValue, monthLabelThai } from "../lib/daily-entry.js";
import { normalizeNumberText, parseNumberValue, validateNumberValue, numericPolicies } from "../lib/entry-validation.js";

const moduleOptions = [
  { id: "waste", label: "ขยะ RDF", mode: "daily", hint: "กรอกน้ำหนักรายวัน หน่วย kg" },
  { id: "animal_feed", label: "อาหารหมา / ขยะเปียก", mode: "daily", hint: "กรอกน้ำหนักรายวัน หน่วย kg" },
  { id: "tissue", label: "กระดาษทิชชู่", mode: "matrix", hint: "Matrix Calendar: ม้วน / เช็ดมือ / ป๊อบอัพ" },
  { id: "garbage_bag", label: "ถุงดำ", mode: "monthly", hint: "กรอกรายเดือนตามขนาดถุง" }
];

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return <div className={`inline-notice notice-${notice.type}`}><span>{notice.message}</span><button type="button" onClick={onClose}>×</button></div>;
}

function emptyRows(month, categories) {
  const days = buildMonthDays(month);
  return Object.fromEntries(categories.map((category) => [category.id, Object.fromEntries(days.map((day) => [day.date, ""]))]));
}

function summarize(rowsByCategory) {
  return Object.fromEntries(Object.entries(rowsByCategory).map(([id, rows]) => [id, Object.values(rows || {}).reduce((sum, value) => value === "" ? sum : sum + parseNumberValue(value, 0), 0)]));
}

export function PreviewInputPage() {
  const { api, permissions } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const canEdit = permissions?.includes("manage_daily_data");
  const moduleId = params.get("module") || "waste";
  const selectedModule = moduleOptions.find((item) => item.id === moduleId) || moduleOptions[0];
  const [month, setMonth] = useState(currentMonthValue());
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [rows, setRows] = useState({});
  const [monthly, setMonthly] = useState({});
  const [state, setState] = useState({ loading: true, saving: false, error: null });
  const [notice, setNotice] = useState(null);
  const days = useMemo(() => buildMonthDays(month), [month]);
  const totals = useMemo(() => selectedModule.mode === "monthly" ? monthly : summarize(rows), [rows, monthly, selectedModule.mode]);

  const loadData = useCallback(async () => {
    setState({ loading: true, saving: false, error: null });
    setNotice(null);
    try {
      const categoryData = await api.request(`/api/master-data?module=${encodeURIComponent(moduleId)}&status=active`);
      const items = categoryData.items || [];
      setCategories(items);
      const nextRows = emptyRows(month, items);
      const nextMonthly = Object.fromEntries(items.map((item) => [item.id, "0"]));

      if (selectedModule.mode === "monthly") {
        const overview = await api.request(`/api/daily-entry-overview?module=${encodeURIComponent(moduleId)}&month=${encodeURIComponent(month)}`);
        (overview.items || []).forEach((item) => {
          if (item.category?.id) nextMonthly[item.category.id] = String(item.summary?.total || 0);
        });
      } else {
        await Promise.all(items.map(async (category) => {
          const detail = await api.request(`/api/daily-entries?categoryId=${encodeURIComponent(category.id)}&month=${encodeURIComponent(month)}`);
          (detail.items || []).forEach((entry) => {
            const date = String(entry.entry_date).slice(0, 10);
            if (nextRows[category.id]?.[date] !== undefined) nextRows[category.id][date] = String(entry.quantity ?? "");
          });
        }));
      }

      setRows(nextRows);
      setMonthly(nextMonthly);
      setSelectedCategoryId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || "");
      setState({ loading: false, saving: false, error: null });
    } catch (error) {
      setState({ loading: false, saving: false, error });
      setNotice({ type: "error", message: error.message });
    }
  }, [api, moduleId, month, selectedModule.mode]);

  useEffect(() => { loadData(); }, [loadData]);

  function changeModule(nextModule) {
    const next = new URLSearchParams(params);
    next.set("module", nextModule);
    setParams(next);
  }

  function updateDaily(categoryId, date, value) {
    setRows((current) => ({ ...current, [categoryId]: { ...(current[categoryId] || {}), [date]: value } }));
  }

  function updateMonthly(categoryId, value) {
    setMonthly((current) => ({ ...current, [categoryId]: value }));
  }

  function validatePayload() {
    const policy = selectedModule.mode === "matrix" || selectedModule.mode === "monthly" ? numericPolicies.count : numericPolicies.decimal;
    if (selectedModule.mode === "monthly") {
      for (const category of categories) {
        const error = validateNumberValue(monthly[category.id], policy, { label: category.name_th, required: true, allowZero: true });
        if (error) return error;
      }
      return null;
    }
    const targetCategories = selectedModule.mode === "daily" ? categories.filter((cat) => cat.id === selectedCategoryId) : categories;
    for (const category of targetCategories) {
      for (const day of days) {
        const value = rows[category.id]?.[day.date] ?? "";
        if (value === "") continue;
        const error = validateNumberValue(value, policy, { label: `${category.name_th} วันที่ ${day.day}`, allowZero: true });
        if (error) return error;
      }
    }
    return null;
  }

  async function save() {
    if (!canEdit) return setNotice({ type: "error", message: "คุณไม่มีสิทธิ์บันทึกข้อมูล" });
    const error = validatePayload();
    if (error) return setNotice({ type: "error", message: error });
    setState((current) => ({ ...current, saving: true }));
    try {
      if (selectedModule.mode === "monthly") {
        await Promise.all(categories.map((category) => api.request("/api/daily-entries/month", {
          method: "POST",
          body: { categoryId: category.id, month, entries: [{ date: `${month}-01`, quantity: parseNumberValue(monthly[category.id], 0), note: "บันทึกจาก CKAP v3 Preview" }] }
        })));
      } else {
        const targetCategories = selectedModule.mode === "daily" ? categories.filter((cat) => cat.id === selectedCategoryId) : categories;
        await Promise.all(targetCategories.map((category) => api.request("/api/daily-entries/month", {
          method: "POST",
          body: {
            categoryId: category.id,
            month,
            entries: days
              .map((day) => ({ date: day.date, quantity: rows[category.id]?.[day.date] ?? "" }))
              .filter((item) => item.quantity !== "")
              .map((item) => ({ date: item.date, quantity: Number(normalizeNumberText(item.quantity)), note: "บันทึกจาก CKAP v3 Preview" }))
          }
        })));
      }
      setNotice({ type: "success", message: `บันทึกข้อมูล ${selectedModule.label} เดือน ${monthLabelThai(month)} สำเร็จ` });
      await loadData();
    } catch (saveError) {
      setState((current) => ({ ...current, saving: false }));
      setNotice({ type: "error", message: saveError.message });
    }
  }

  return (
    <div className="preview-page">
      <div className="preview-toolbar-card">
        <div>
          <p className="eyebrow">Real Data Entry Preview</p>
          <h1>กรอกข้อมูลแบบ v3</h1>
          <p>{selectedModule.hint}</p>
        </div>
        <Link to="/preview" className="secondary-button">กลับ Home Preview</Link>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      <section className="preview-filter-bar">
        <label>โมดูล<select value={moduleId} onChange={(event) => changeModule(event.target.value)}>{moduleOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>เดือน<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        {selectedModule.mode === "daily" && <label>ประเภท<select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name_th}</option>)}</select></label>}
        <button className="primary-button" type="button" onClick={save} disabled={state.loading || state.saving || categories.length === 0}>{state.saving ? "กำลังบันทึก..." : "บันทึกจริง"}</button>
      </section>

      {state.loading ? <div className="daily-loading"><span className="spinner" /> กำลังโหลดข้อมูลจริง...</div> : categories.length === 0 ? <div className="task-empty-state"><strong>ยังไม่มี Master Data</strong><span>กรุณาเพิ่มประเภทข้อมูลของโมดูลนี้ก่อน</span></div> : (
        <>
          <section className="preview-kpis compact">
            <article><span>เดือน</span><strong>{monthLabelThai(month)}</strong><small>ช่วงข้อมูล</small></article>
            <article><span>รายการ</span><strong>{categories.length}</strong><small>ประเภทใน Master</small></article>
            <article><span>ยอดรวม</span><strong>{Object.values(totals).reduce((s, v) => s + Number(v || 0), 0).toLocaleString("th-TH")}</strong><small>{categories[0]?.unit || "หน่วย"}</small></article>
            <article><span>สิทธิ์</span><strong>{canEdit ? "แก้ไขได้" : "ดูอย่างเดียว"}</strong><small>จาก Permission จริง</small></article>
          </section>

          {selectedModule.mode === "monthly" ? (
            <section className="preview-monthly-form">
              {categories.map((category) => <label key={category.id}>{category.name_th}<input type="number" min="0" value={monthly[category.id] ?? "0"} onChange={(event) => updateMonthly(category.id, event.target.value)} disabled={!canEdit || state.saving} /><small>{category.unit}</small></label>)}
            </section>
          ) : selectedModule.mode === "daily" ? (
            <section className="preview-calendar-table">
              {days.map((day) => <label key={day.date} className={day.future ? "future" : ""}><span>{day.day}</span><input type="number" min="0" step="0.01" value={rows[selectedCategoryId]?.[day.date] ?? ""} onChange={(event) => updateDaily(selectedCategoryId, day.date, event.target.value)} disabled={!canEdit || state.saving || day.future} /><em>{day.future ? "future" : "kg"}</em></label>)}
            </section>
          ) : (
            <div className="preview-matrix-wrap"><table className="preview-matrix"><thead><tr><th>วันที่</th>{categories.map((category) => <th key={category.id}>{category.name_th}<small>{category.unit}</small></th>)}</tr></thead><tbody>{days.map((day) => <tr key={day.date}><td>{day.day}</td>{categories.map((category) => <td key={category.id}><input type="number" min="0" step="1" value={rows[category.id]?.[day.date] ?? ""} onChange={(event) => updateDaily(category.id, day.date, event.target.value)} disabled={!canEdit || state.saving || day.future} /></td>)}</tr>)}</tbody><tfoot><tr><td>รวม</td>{categories.map((category) => <td key={category.id}>{Number(totals[category.id] || 0).toLocaleString("th-TH")}</td>)}</tr></tfoot></table></div>
          )}
        </>
      )}
    </div>
  );
}
