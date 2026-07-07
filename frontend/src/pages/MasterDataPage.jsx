import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  currentPriceAt,
  moduleLabel,
  moduleOptions,
  todayIso,
  validateCategoryForm,
  validatePriceForm
} from "../lib/master-data.js";

const patterns = [
  { id: "solid", label: "สีทึบ" },
  { id: "diagonal", label: "ลายเฉียง" },
  { id: "dots", label: "ลายจุด" },
  { id: "crosshatch", label: "ลายตาราง" }
];

function blankCategory(module = "waste") {
  return {
    module,
    code: "",
    nameTh: "",
    nameEn: "",
    unit: module === "consumable" ? "แกลลอน" : "กิโลกรัม",
    colorHex: "#8B5CF6",
    pattern: "solid",
    sortOrder: 10,
    active: true,
    metadata: {}
  };
}

function mapCategoryToForm(item) {
  return {
    module: item.module,
    code: item.code,
    nameTh: item.name_th,
    nameEn: item.name_en || "",
    unit: item.unit,
    colorHex: item.color_hex,
    pattern: item.pattern,
    sortOrder: item.sort_order,
    active: item.active,
    metadata: item.metadata || {}
  };
}

function blankPrice() {
  return { pricePerKg: "", effectiveFrom: todayIso(), note: "" };
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`inline-notice notice-${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="ปิดข้อความ">×</button>
    </div>
  );
}

function EmptyState({ admin, onAdd }) {
  return (
    <div className="empty-state">
      <strong>ยังไม่มีประเภทข้อมูลในหมวดนี้</strong>
      <p>หากเพิ่งติดตั้งระบบ กรุณารัน `005_phase2_seed_master_data.sql` ก่อน</p>
      {admin && <button className="primary-button compact" type="button" onClick={onAdd}>เพิ่มประเภทแรก</button>}
    </div>
  );
}

export function MasterDataPage() {
  const { api, permissions } = useOutletContext();
  const isAdmin = permissions?.includes("manage_master_data");
  const [module, setModule] = useState("waste");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [state, setState] = useState({ loading: true, items: [], prices: [], error: null });
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(() => blankCategory("waste"));
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [priceForm, setPriceForm] = useState(blankPrice);
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [priceSubmitting, setPriceSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const categoryResult = await api.request(`/api/master-data?module=${encodeURIComponent(module)}&status=${encodeURIComponent(status)}`);
      const priceResult = module === "scrap_material"
        ? await api.request("/api/scrap-prices")
        : { items: [] };
      setState({ loading: false, items: categoryResult.items, prices: priceResult.items, error: null });
      setSelectedId((current) => categoryResult.items.some((item) => item.id === current) ? current : null);
    } catch (error) {
      setState({ loading: false, items: [], prices: [], error });
    }
  }, [api, module, status]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    setSelectedId(null);
    setEditing(false);
    setForm(blankCategory(module));
    setPriceForm(blankPrice());
    setEditingPriceId(null);
  }, [module]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return state.items;
    return state.items.filter((item) => [item.code, item.name_th, item.name_en, item.unit]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)));
  }, [state.items, search]);

  const selectedItem = useMemo(
    () => state.items.find((item) => item.id === selectedId) ?? null,
    [state.items, selectedId]
  );
  const selectedPrices = useMemo(
    () => state.prices.filter((price) => price.category_id === selectedId),
    [state.prices, selectedId]
  );
  const currentPrice = useMemo(() => currentPriceAt(selectedPrices), [selectedPrices]);

  function startAdd() {
    setEditing(true);
    setSelectedId(null);
    setForm(blankCategory(module));
    setPriceForm(blankPrice());
    setEditingPriceId(null);
    setNotice(null);
  }

  function selectItem(item) {
    setSelectedId(item.id);
    setEditing(false);
    setForm(mapCategoryToForm(item));
    setPriceForm(blankPrice());
    setEditingPriceId(null);
    setNotice(null);
  }

  function startEdit() {
    if (!selectedItem) {
      setNotice({ type: "error", text: "กรุณาเลือกประเภทที่ต้องการแก้ไข" });
      return;
    }
    setForm(mapCategoryToForm(selectedItem));
    setEditing(true);
    setNotice(null);
  }

  async function submitCategory(event) {
    event.preventDefault();
    const errors = validateCategoryForm(form);
    if (errors.length) {
      setNotice({ type: "error", text: errors.join(" • ") });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    const body = {
      module: form.module,
      code: form.code.trim().toUpperCase().replaceAll(/\s+/gu, "_"),
      nameTh: form.nameTh.trim(),
      nameEn: form.nameEn.trim(),
      unit: form.unit.trim(),
      colorHex: form.colorHex.toUpperCase(),
      pattern: form.pattern,
      sortOrder: Number(form.sortOrder),
      active: Boolean(form.active),
      metadata: form.metadata || {}
    };
    try {
      const result = selectedItem
        ? await api.request(`/api/master-data/${selectedItem.id}`, { method: "PATCH", body })
        : await api.request("/api/master-data", { method: "POST", body });
      setNotice({ type: "success", text: selectedItem ? "แก้ไขประเภทข้อมูลแล้ว" : "เพิ่มประเภทข้อมูลแล้ว" });
      setEditing(false);
      await loadData();
      setSelectedId(result.item.id);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive() {
    if (!selectedItem) return;
    const nextActive = !selectedItem.active;
    const message = nextActive ? "เปิดใช้งานประเภทนี้หรือไม่" : "ปิดใช้งานประเภทนี้หรือไม่ ข้อมูลย้อนหลังจะยังคงอยู่";
    if (!window.confirm(message)) return;
    setSubmitting(true);
    try {
      await api.request(`/api/master-data/${selectedItem.id}`, { method: "PATCH", body: { active: nextActive } });
      setNotice({ type: "success", text: nextActive ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว" });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteCategory() {
    if (!selectedItem) return;
    if (!window.confirm(`ลบ “${selectedItem.name_th}” ถาวรหรือไม่\n\nหากรายการเคยมีประวัติราคา ระบบจะไม่อนุญาตให้ลบ`)) return;
    setSubmitting(true);
    try {
      await api.request(`/api/master-data/${selectedItem.id}`, { method: "DELETE" });
      setNotice({ type: "success", text: "ลบประเภทข้อมูลแล้ว" });
      setSelectedId(null);
      setEditing(false);
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  function editPrice(price) {
    setEditingPriceId(price.id);
    setPriceForm({
      pricePerKg: String(Number(price.price_per_kg)),
      effectiveFrom: price.effective_from,
      note: price.note || ""
    });
    setNotice(null);
  }

  async function submitPrice(event) {
    event.preventDefault();
    if (!selectedItem) {
      setNotice({ type: "error", text: "กรุณาเลือกประเภทเศษวัสดุก่อนเพิ่มราคา" });
      return;
    }
    const errors = validatePriceForm(priceForm);
    if (errors.length) {
      setNotice({ type: "error", text: errors.join(" • ") });
      return;
    }
    setPriceSubmitting(true);
    try {
      const body = {
        categoryId: selectedItem.id,
        pricePerKg: Number(priceForm.pricePerKg),
        effectiveFrom: priceForm.effectiveFrom,
        note: priceForm.note.trim()
      };
      if (editingPriceId) {
        delete body.categoryId;
        await api.request(`/api/scrap-prices/${editingPriceId}`, { method: "PATCH", body });
      } else {
        await api.request("/api/scrap-prices", { method: "POST", body });
      }
      setNotice({ type: "success", text: editingPriceId ? "แก้ไขประวัติราคาแล้ว" : "เพิ่มราคาใหม่แล้ว โดยไม่เขียนทับราคาเดิม" });
      setPriceForm(blankPrice());
      setEditingPriceId(null);
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setPriceSubmitting(false);
    }
  }

  async function deletePrice(price) {
    if (!window.confirm(`ลบราคาวันที่ ${price.effective_from} จำนวน ${Number(price.price_per_kg).toLocaleString("th-TH")} บาท/กก. หรือไม่`)) return;
    setPriceSubmitting(true);
    try {
      await api.request(`/api/scrap-prices/${price.id}`, { method: "DELETE" });
      setNotice({ type: "success", text: "ลบประวัติราคาแล้ว" });
      if (editingPriceId === price.id) {
        setEditingPriceId(null);
        setPriceForm(blankPrice());
      }
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setPriceSubmitting(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Phase 2</p>
          <h1>Master Data และประวัติราคา</h1>
          <p>จัดการประเภท หน่วย สีกราฟ สถานะ และราคาต่อกิโลกรัม โดยไม่ต้องแก้ Source Code</p>
        </div>
        {isAdmin && <button className="primary-button compact" type="button" onClick={startAdd}>+ เพิ่มประเภท</button>}
      </section>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {state.error && (
        <section className="connection-error" role="alert">
          <div><h2>โหลด Master Data ไม่สำเร็จ</h2><p>{state.error.message}</p><code>{state.error.url}</code></div>
          <button className="primary-button compact" type="button" onClick={loadData}>ลองใหม่</button>
        </section>
      )}

      <section className="master-summary">
        <article><small>หมวดปัจจุบัน</small><strong>{moduleLabel[module]}</strong></article>
        <article><small>ประเภททั้งหมด</small><strong>{state.items.length}</strong></article>
        <article><small>เปิดใช้งาน</small><strong>{state.items.filter((item) => item.active).length}</strong></article>
        <article><small>สิทธิ์ของคุณ</small><strong>{isAdmin ? "จัดการได้" : "ดูข้อมูลเท่านั้น"}</strong></article>
      </section>

      <section className="master-toolbar">
        <label>หมวดข้อมูล
          <select value={module} onChange={(event) => setModule(event.target.value)}>
            {moduleOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>สถานะ
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทั้งหมด</option><option value="active">เปิดใช้งาน</option><option value="inactive">ปิดใช้งาน</option>
          </select>
        </label>
        <label className="search-field">ค้นหา
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="รหัส ชื่อ หรือหน่วย" />
        </label>
        <button className="secondary-button toolbar-refresh" type="button" onClick={loadData} disabled={state.loading}>{state.loading ? "กำลังโหลด..." : "รีเฟรช"}</button>
      </section>

      <section className={`master-workspace ${isAdmin ? "with-editor" : "read-only"}`}>
        <article className="master-list-card">
          <div className="card-heading"><div><p className="eyebrow">{moduleLabel[module]}</p><h2>รายการประเภท</h2></div><span>{filteredItems.length} รายการ</span></div>
          {state.loading ? <div className="table-loading">กำลังโหลดข้อมูล...</div> : filteredItems.length === 0 ? (
            <EmptyState admin={isAdmin} onAdd={startAdd} />
          ) : (
            <div className="responsive-table">
              <table>
                <thead><tr><th>ลำดับ</th><th>สี</th><th>รหัส / ชื่อ</th><th>หน่วย</th><th>สถานะ</th>{module === "scrap_material" && <th>ราคาปัจจุบัน</th>}</tr></thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const itemPrices = state.prices.filter((price) => price.category_id === item.id);
                    const price = currentPriceAt(itemPrices);
                    return (
                      <tr key={item.id} className={selectedId === item.id ? "selected-row" : ""} onClick={() => selectItem(item)} tabIndex="0" onKeyDown={(event) => { if (event.key === "Enter") selectItem(item); }}>
                        <td>{item.sort_order}</td>
                        <td><span className={`color-swatch pattern-${item.pattern}`} style={{ "--swatch": item.color_hex }} title={item.color_hex} /></td>
                        <td><strong>{item.name_th}</strong><small>{item.code}{item.name_en ? ` • ${item.name_en}` : ""}</small></td>
                        <td>{item.unit}</td>
                        <td><span className={`status-pill ${item.active ? "active" : "inactive"}`}>{item.active ? "ใช้งาน" : "ปิดใช้งาน"}</span></td>
                        {module === "scrap_material" && <td>{price ? `${Number(price.price_per_kg).toLocaleString("th-TH", { maximumFractionDigits: 4 })} บาท` : "ยังไม่กำหนด"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {isAdmin && (
          <aside className="master-editor-card">
            {!editing && !selectedItem ? (
              <div className="editor-placeholder"><strong>เลือกประเภทจากตาราง</strong><p>จากนั้นสามารถแก้ไข ปิดใช้งาน ลบ หรือจัดการราคาได้</p><button className="primary-button compact" type="button" onClick={startAdd}>เพิ่มประเภทใหม่</button></div>
            ) : editing ? (
              <form className="master-form" onSubmit={submitCategory} noValidate>
                <div className="card-heading"><div><p className="eyebrow">{selectedItem ? "Edit" : "Create"}</p><h2>{selectedItem ? "แก้ไขประเภท" : "เพิ่มประเภทใหม่"}</h2></div></div>
                <div className="form-grid two-columns">
                  <label>หมวดข้อมูล<select value={form.module} onChange={(event) => setForm({ ...form, module: event.target.value })}>{moduleOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                  <label>รหัสประเภท<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="เช่น PET" /></label>
                  <label className="span-2">ชื่อภาษาไทย<input value={form.nameTh} onChange={(event) => setForm({ ...form, nameTh: event.target.value })} /></label>
                  <label className="span-2">ชื่อภาษาอังกฤษ<input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></label>
                  <label>หน่วย<input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
                  <label>ลำดับ<input type="number" min="0" max="9999" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label>
                  <label>สีกราฟ<div className="color-input"><input type="color" value={form.colorHex} onChange={(event) => setForm({ ...form, colorHex: event.target.value.toUpperCase() })} /><input value={form.colorHex} onChange={(event) => setForm({ ...form, colorHex: event.target.value.toUpperCase() })} /></div></label>
                  <label>รูปแบบลาย<select value={form.pattern} onChange={(event) => setForm({ ...form, pattern: event.target.value })}>{patterns.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                  <label className="checkbox-label span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> เปิดใช้งาน</label>
                </div>
                <div className="form-actions"><button className="secondary-button" type="button" onClick={() => { setEditing(false); if (selectedItem) setForm(mapCategoryToForm(selectedItem)); }} disabled={submitting}>ยกเลิก</button><button className="primary-button compact" type="submit" disabled={submitting}>{submitting ? "กำลังบันทึก..." : "บันทึกประเภท"}</button></div>
              </form>
            ) : (
              <div className="category-detail">
                <div className="detail-title"><span className={`large-swatch pattern-${selectedItem.pattern}`} style={{ "--swatch": selectedItem.color_hex }} /><div><p className="eyebrow">{moduleLabel[selectedItem.module]}</p><h2>{selectedItem.name_th}</h2><p>{selectedItem.code} • {selectedItem.unit}</p></div></div>
                <dl className="detail-list"><div><dt>ชื่ออังกฤษ</dt><dd>{selectedItem.name_en || "—"}</dd></div><div><dt>สี / ลาย</dt><dd>{selectedItem.color_hex} • {selectedItem.pattern}</dd></div><div><dt>ลำดับ</dt><dd>{selectedItem.sort_order}</dd></div><div><dt>สถานะ</dt><dd>{selectedItem.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</dd></div></dl>
                <div className="detail-actions"><button className="secondary-button" type="button" onClick={startEdit}>แก้ไข</button><button className="secondary-button" type="button" onClick={toggleActive} disabled={submitting}>{selectedItem.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button><button className="danger-button" type="button" onClick={deleteCategory} disabled={submitting}>ลบถาวร</button></div>

                {selectedItem.module === "scrap_material" && (
                  <section className="price-section">
                    <div className="price-current"><small>ราคาที่มีผล ณ วันนี้</small><strong>{currentPrice ? `${Number(currentPrice.price_per_kg).toLocaleString("th-TH", { maximumFractionDigits: 4 })} บาท/กก.` : "ยังไม่กำหนด"}</strong><span>{currentPrice ? `เริ่มใช้ ${currentPrice.effective_from}` : "เพิ่มราคาแรกด้านล่าง"}</span></div>
                    <form className="price-form" onSubmit={submitPrice} noValidate>
                      <h3>{editingPriceId ? "แก้ไขประวัติราคา" : "เพิ่มราคาใหม่"}</h3>
                      <div className="form-grid two-columns"><label>ราคา/กก.<input type="number" min="0" step="0.0001" value={priceForm.pricePerKg} onChange={(event) => setPriceForm({ ...priceForm, pricePerKg: event.target.value })} /></label><label>วันที่เริ่มใช้<input type="date" value={priceForm.effectiveFrom} onChange={(event) => setPriceForm({ ...priceForm, effectiveFrom: event.target.value })} /></label><label className="span-2">หมายเหตุ<input value={priceForm.note} onChange={(event) => setPriceForm({ ...priceForm, note: event.target.value })} placeholder="เช่น ราคาตามรอบรับซื้อเดือนนี้" /></label></div>
                      <div className="form-actions"><button className="secondary-button" type="button" onClick={() => { setEditingPriceId(null); setPriceForm(blankPrice()); }}>ล้างฟอร์ม</button><button className="primary-button compact" type="submit" disabled={priceSubmitting}>{priceSubmitting ? "กำลังบันทึก..." : editingPriceId ? "บันทึกการแก้ไข" : "เพิ่มราคาใหม่"}</button></div>
                    </form>
                    <div className="price-history"><h3>ประวัติราคา</h3>{selectedPrices.length === 0 ? <p className="muted">ยังไม่มีประวัติราคา</p> : selectedPrices.map((price) => <div className="price-row" key={price.id}><div><strong>{Number(price.price_per_kg).toLocaleString("th-TH", { maximumFractionDigits: 4 })} บาท/กก.</strong><small>{price.effective_from}{price.note ? ` • ${price.note}` : ""}</small></div><div><button type="button" onClick={() => editPrice(price)}>แก้ไข</button><button className="text-danger" type="button" onClick={() => deletePrice(price)}>ลบ</button></div></div>)}</div>
                  </section>
                )}
              </div>
            )}
          </aside>
        )}
      </section>
    </>
  );
}
