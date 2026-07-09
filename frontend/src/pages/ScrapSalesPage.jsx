import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  calculateAmount,
  currentMonthValue,
  firstDateInMonth,
  lastDateInMonth,
  todayValue,
  formatMoney,
  formatQuantity,
  validateScrapSaleForm
} from "../lib/scrap-sales.js";

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`inline-notice notice-${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
      <span>{notice.message}</span>
      <button type="button" aria-label="ปิดข้อความ" onClick={onClose}>×</button>
    </div>
  );
}

function blankForm(month) {
  return { saleDate: firstDateInMonth(month), categoryId: "", weightKg: "", pricePerKg: "", note: "" };
}

function mapSaleToForm(item) {
  return {
    saleDate: item.sale_date,
    categoryId: item.category_id,
    weightKg: String(item.weight_kg),
    pricePerKg: String(item.price_per_kg),
    note: item.note || ""
  };
}

function ErrorDetails({ error }) {
  if (!error) return null;
  return (
    <div className="connection-error scrap-error" role="alert">
      <div>
        <p className="eyebrow">Scrap Sales Error</p>
        <h2>ดำเนินการไม่สำเร็จ</h2>
        <p>{error.message}</p>
        {error.url && <code>{error.url}</code>}
        {error.requestId && <small>Request ID: {error.requestId}</small>}
      </div>
    </div>
  );
}

export function ScrapSalesPage({
  headingTitle = "ขายเศษวัสดุ",
  headingDescription = "บันทึกรายการขายเศษวัสดุ เลือกประเภทวัสดุ น้ำหนัก และราคาต่อกิโลกรัม"
}) {
  const { api, permissions } = useOutletContext();
  const canEdit = permissions?.includes("manage_scrap_sales");
  const [month, setMonth] = useState(currentMonthValue());
  const [categories, setCategories] = useState([]);
  const [salesState, setSalesState] = useState({ loading: true, items: [], summary: null, error: null });
  const [form, setForm] = useState(() => blankForm(currentMonthValue()));
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceMessage, setPriceMessage] = useState("");
  const [notice, setNotice] = useState(null);
  const [period, setPeriod] = useState({ status: "draft", status_label: "กำลังบันทึก" });

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === form.categoryId) || null,
    [categories, form.categoryId]
  );
  const amountPreview = calculateAmount(form.weightKg, form.pricePerKg);
  const canWrite = Boolean(canEdit && period.status !== "locked");
  const maximumSaleDate = lastDateInMonth(month) < todayValue() ? lastDateInMonth(month) : todayValue();

  const loadPage = useCallback(async () => {
    setSalesState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [categoryData, saleData, periodData] = await Promise.all([
        api.request("/api/master-data?module=scrap_material&status=all"),
        api.request(`/api/scrap-sales?month=${encodeURIComponent(month)}`),
        api.request(`/api/period-status?month=${encodeURIComponent(month)}`)
      ]);
      setCategories(categoryData.items || []);
      setPeriod(periodData.period || { status: "draft", status_label: "กำลังบันทึก" });
      setSalesState({ loading: false, items: saleData.items || [], summary: saleData.summary, error: null });
    } catch (error) {
      setSalesState({ loading: false, items: [], summary: null, error });
    }
  }, [api, month]);

  useEffect(() => { loadPage(); }, [loadPage]);

  useEffect(() => {
    setEditingId(null);
    setForm(blankForm(month));
    setPriceMessage("");
  }, [month]);

  async function usePriceAtDate() {
    if (!form.categoryId) {
      setNotice({ type: "error", message: "กรุณาเลือกประเภทวัสดุก่อนค้นหาราคา" });
      return;
    }
    if (!form.saleDate) {
      setNotice({ type: "error", message: "กรุณาเลือกวันที่ขายก่อนค้นหาราคา" });
      return;
    }
    setPriceLoading(true);
    setPriceMessage("");
    try {
      const data = await api.request(`/api/scrap-sales/price?categoryId=${encodeURIComponent(form.categoryId)}&date=${encodeURIComponent(form.saleDate)}`);
      if (data.pricePerKg === null) {
        setPriceMessage("ไม่พบราคาที่มีผล ณ วันที่เลือก กรุณากรอกราคาจริง");
      } else {
        setForm((current) => ({ ...current, pricePerKg: String(data.pricePerKg) }));
        setPriceMessage(`ใช้ราคาตามประวัติ ${formatQuantity(data.pricePerKg)} บาท/กก.`);
      }
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setPriceLoading(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm(mapSaleToForm(item));
    setPriceMessage("กำลังใช้ราคาที่บันทึกไว้ในรายการเดิม");
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(blankForm(month));
    setPriceMessage("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!canWrite) { setNotice({ type: "error", message: "งวดนี้ปิดงวดแล้ว ไม่สามารถแก้ไขรายการขายได้" }); return; }
    const validationMessage = validateScrapSaleForm(form, month);
    if (validationMessage) {
      setNotice({ type: "error", message: validationMessage });
      return;
    }
    if (!selectedCategory) {
      setNotice({ type: "error", message: "ไม่พบประเภทวัสดุ กรุณารีเฟรช Master Data" });
      return;
    }
    if (!editingId && !selectedCategory.active) {
      setNotice({ type: "error", message: "ประเภทวัสดุนี้ถูกปิดใช้งาน ไม่สามารถเพิ่มรายการใหม่ได้" });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const body = {
        saleDate: form.saleDate,
        categoryId: form.categoryId,
        weightKg: Number(form.weightKg),
        pricePerKg: Number(form.pricePerKg),
        note: form.note
      };
      if (editingId) {
        await api.request(`/api/scrap-sales/${editingId}`, { method: "PATCH", body });
      } else {
        await api.request("/api/scrap-sales", { method: "POST", body });
      }
      setNotice({ type: "success", message: editingId ? "แก้ไขรายการขายเรียบร้อยแล้ว" : "เพิ่มรายการขายเรียบร้อยแล้ว" });
      cancelEdit();
      await loadPage();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSale(item) {
    if (!canWrite) { setNotice({ type: "error", message: "งวดนี้ปิดงวดแล้ว ไม่สามารถลบรายการขายได้" }); return; }
    if (!window.confirm(`ยืนยันลบรายการ ${item.category?.name_th || "เศษวัสดุ"} วันที่ ${item.sale_date} หรือไม่`)) return;
    setDeletingId(item.id);
    setNotice(null);
    try {
      await api.request(`/api/scrap-sales/${item.id}`, { method: "DELETE" });
      setNotice({ type: "success", message: "ลบรายการขายเรียบร้อยแล้ว" });
      if (editingId === item.id) cancelEdit();
      await loadPage();
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className="page-heading scrap-heading">
        <div>
          <p className="eyebrow">Phase 4</p>
          <h1>{headingTitle}</h1>
          <p>{headingDescription}</p>
        </div>
        <Link className="secondary-link" to="/master-data">จัดการประเภทและราคา</Link>
      </section>

      <Notice notice={notice} onClose={() => setNotice(null)} />
      <ErrorDetails error={salesState.error} />

      <section className="scrap-filter-card">
        <label>เดือนที่แสดง
          <input type="month" max={currentMonthValue()} value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <div className="filter-copy"><strong>ข้อมูลรายเดือน</strong><span>รายการขาย ตารางสรุป และยอดรวมจะเปลี่ยนตามเดือนที่เลือก</span></div>
        <button className="secondary-button" type="button" onClick={loadPage} disabled={salesState.loading}>{salesState.loading ? "กำลังโหลด..." : "รีเฟรชข้อมูล"}</button>
      </section>

      {period.status === "locked" && <section className="period-status-panel period-locked"><div><p className="eyebrow">สถานะงวดข้อมูล</p><div className="period-status-line"><strong>{period.status_label}</strong><span>รายการขายแสดงได้ แต่แก้ไขไม่ได้จนกว่าจะเปิดงวดจากหน้าบันทึกข้อมูลรายวัน</span></div></div></section>}

      <section className="scrap-summary-grid">
        <article><small>จำนวนรายการ</small><strong>{salesState.summary?.itemCount ?? 0}</strong><span>รายการ</span></article>
        <article><small>น้ำหนักรวม</small><strong>{formatQuantity(salesState.summary?.totalWeightKg)}</strong><span>กิโลกรัม</span></article>
        <article><small>รายได้รวม</small><strong>{formatMoney(salesState.summary?.totalAmount)}</strong><span>บาท</span></article>
        <article><small>ราคาเฉลี่ยถ่วงน้ำหนัก</small><strong>{formatQuantity(salesState.summary?.averagePricePerKg)}</strong><span>บาท/กก.</span></article>
      </section>

      {canWrite && (
        <section className="scrap-form-card">
          <div className="card-heading scrap-form-heading">
            <div><p className="eyebrow">{editingId ? "Edit transaction" : "New transaction"}</p><h2>{editingId ? "แก้ไขรายการขาย" : "เพิ่มรายการขาย"}</h2></div>
            {editingId && <span className="status-pill active">กำลังแก้ไข</span>}
          </div>
          {categories.filter((item) => item.active).length === 0 && (
            <div className="empty-inline-warning">ยังไม่มีประเภทเศษวัสดุที่เปิดใช้งาน กรุณาไปที่ Master Data ก่อนเพิ่มรายการ</div>
          )}
          <form className="scrap-sale-form" onSubmit={submit} noValidate>
            <div className="scrap-primary-fields">
              <label>วันที่ขาย
                <input type="date" value={form.saleDate} min={`${month}-01`} max={maximumSaleDate} onChange={(event) => { setForm({ ...form, saleDate: event.target.value }); setPriceMessage(""); }} />
              </label>
              <label>ประเภทวัสดุ
                <select value={form.categoryId} onChange={(event) => { setForm({ ...form, categoryId: event.target.value, pricePerKg: "" }); setPriceMessage(""); }}>
                  <option value="">เลือกประเภทวัสดุ</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id} disabled={!item.active && item.id !== form.categoryId}>
                      {item.name_th}{item.active ? "" : " (ปิดใช้งาน)"}
                    </option>
                  ))}
                </select>
              </label>
              <label>น้ำหนัก
                <div className="unit-input"><input type="number" min="0" step="0.01" value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} placeholder="0.00" /><span>กก.</span></div>
              </label>
              <label>ราคาจริงต่อกิโลกรัม
                <div className="unit-input"><input type="number" min="0" step="0.01" value={form.pricePerKg} onChange={(event) => { setForm({ ...form, pricePerKg: event.target.value }); setPriceMessage("ราคาที่กรอกเอง"); }} placeholder="0.00" /><span>บาท</span></div>
              </label>
            </div>

            <div className="scrap-price-tools">
              <button className="secondary-button" type="button" onClick={usePriceAtDate} disabled={priceLoading || !form.categoryId || !form.saleDate}>{priceLoading ? "กำลังค้นหาราคา..." : "ใช้ราคาตามวันที่"}</button>
              <div><strong>จำนวนเงินอัตโนมัติ: {formatMoney(amountPreview)} บาท</strong><span>{priceMessage || "ระบบคำนวณจากน้ำหนัก × ราคาจริง"}</span></div>
            </div>

            <label className="scrap-note-field">หมายเหตุ
              <textarea rows="3" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="รายละเอียดเพิ่มเติม (ไม่เกิน 500 ตัวอักษร)" />
            </label>

            <div className="scrap-form-actions">
              {editingId && <button className="secondary-button" type="button" onClick={cancelEdit} disabled={saving}>ยกเลิกการแก้ไข</button>}
              <button className="primary-button" type="submit" disabled={saving || categories.length === 0}>{saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "เพิ่มรายการขาย"}</button>
            </div>
          </form>
        </section>
      )}

      <section className="scrap-list-card">
        <div className="card-heading"><div><p className="eyebrow">Monthly transactions</p><h2>รายการขายในเดือน</h2></div><span>{salesState.items.length} รายการ</span></div>
        {salesState.loading ? <div className="table-loading">กำลังโหลดรายการขาย...</div> : salesState.items.length === 0 ? (
          <div className="empty-state spacious"><strong>ยังไม่มีรายการขายในเดือนนี้</strong><p>{canWrite ? "ใช้ฟอร์มด้านบนเพื่อเพิ่มรายการแรก" : "ยังไม่มีข้อมูลสำหรับแสดงผล"}</p></div>
        ) : (
          <div className="responsive-table">
            <table className="scrap-table">
              <thead><tr><th>วันที่ขาย</th><th>ประเภทวัสดุ</th><th className="numeric">น้ำหนัก</th><th className="numeric">ราคา/กก.</th><th className="numeric">จำนวนเงิน</th><th>หมายเหตุ</th>{canWrite && <th className="actions-column">จัดการ</th>}</tr></thead>
              <tbody>
                {salesState.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.sale_date}</td>
                    <td><div className="category-cell"><span className={`color-swatch pattern-${item.category?.pattern || "solid"}`} style={{ "--swatch": item.category?.color_hex || "#9CA3AF" }} /><div><strong>{item.category?.name_th || "ไม่พบประเภท"}</strong><small>{item.category?.active === false ? "ปิดใช้งาน • ข้อมูลย้อนหลัง" : item.category?.code}</small></div></div></td>
                    <td className="numeric">{formatQuantity(item.weight_kg)} กก.</td>
                    <td className="numeric">{formatQuantity(item.price_per_kg)} บาท</td>
                    <td className="numeric money-cell">{formatMoney(item.amount)} บาท</td>
                    <td>{item.note || "—"}</td>
                    {canWrite && <td><div className="row-actions"><button type="button" onClick={() => startEdit(item)}>แก้ไข</button><button className="text-danger" type="button" disabled={deletingId === item.id} onClick={() => deleteSale(item)}>{deletingId === item.id ? "กำลังลบ..." : "ลบ"}</button></div></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan="2"><strong>รวมประจำเดือน</strong></td><td className="numeric"><strong>{formatQuantity(salesState.summary?.totalWeightKg)} กก.</strong></td><td></td><td className="numeric"><strong>{formatMoney(salesState.summary?.totalAmount)} บาท</strong></td><td></td>{canWrite && <td></td>}</tr></tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
