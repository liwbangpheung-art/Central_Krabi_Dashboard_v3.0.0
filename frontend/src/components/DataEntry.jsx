import React, { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, currentMonth, formatNumber, toNumber } from '../api.js'

const moduleOptions = [
  { id: 'rdf', label: 'RDF', unit: 'kg', mode: 'daily', defaultCategory: 'RDF' },
  { id: 'dog_food', label: 'อาหารหมา', unit: 'kg', mode: 'daily', defaultCategory: 'DOG_FOOD' },
  { id: 'pig_feed', label: 'อาหารหมู', unit: 'kg', mode: 'monthly', defaultCategory: 'PIG_FEED' },
  { id: 'wet_waste', label: 'ขยะเปียก', unit: 'kg', mode: 'readonly' },
  { id: 'recycle', label: 'รีไซเคิล', unit: 'kg', mode: 'daily', defaultCategory: 'RECYCLE' },
  { id: 'tissue', label: 'กระดาษทิชชู่', unit: 'kg', mode: 'daily_or_monthly', defaultCategory: 'TISSUE' },
  { id: 'black_bag', label: 'ถุงดำ', unit: 'ใบ', mode: 'monthly', defaultCategory: 'BLACK_BAG' }
]

function blankForm(module, month, entryMode) {
  const option = moduleOptions.find(item => item.id === module)
  const day = entryMode === 'monthly' ? '01' : '01'
  return {
    id: '',
    module,
    category_code: option?.defaultCategory || module.toUpperCase(),
    entry_date: `${month}-${day}`,
    material_name: option?.label || '',
    weight_kg: '',
    quantity: '',
    unit: option?.unit || 'kg',
    unit_price: '',
    amount: '',
    notes: ''
  }
}

function rowsToCsv(rows) {
  const headers = ['module','entry_date','material_name','category_code','weight_kg','quantity','unit','unit_price','amount','notes']
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [headers.join(','), ...rows.map(row => headers.map(key => escape(row[key])).join(','))].join('\n')
}

function parseCsv(text, module, month) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const split = line => line.match(/("([^"]|"")*"|[^,]+)/g)?.map(cell => cell.replace(/^"|"$/g, '').replaceAll('""', '"')) || []
  const headers = split(lines[0]).map(h => h.trim())
  return lines.slice(1).map(line => {
    const values = split(line)
    const row = {}
    headers.forEach((header, idx) => { row[header] = values[idx] ?? '' })
    return {
      module: row.module || module,
      entry_date: row.entry_date || `${month}-01`,
      month,
      material_name: row.material_name || row.material || '',
      category_code: row.category_code || module.toUpperCase(),
      weight_kg: row.weight_kg || row.weight || '',
      quantity: row.quantity || '',
      unit: row.unit || 'kg',
      unit_price: row.unit_price || '',
      amount: row.amount || '',
      notes: row.notes || ''
    }
  })
}

export default function DataEntry() {
  const [module, setModule] = useState('rdf')
  const [month, setMonth] = useState(currentMonth())
  const selected = moduleOptions.find(item => item.id === module)
  const [entryMode, setEntryMode] = useState('daily')
  const effectiveMode = selected?.mode === 'daily_or_monthly' ? entryMode : selected?.mode
  const [form, setForm] = useState(blankForm(module, month, effectiveMode))
  const fileRef = useRef(null)
  const queryClient = useQueryClient()

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['entries', module, month],
    queryFn: () => apiFetch(`/api/entries?module=${module}&month=${month}`)
  })

  const summary = useMemo(() => rows.reduce((acc, row) => {
    acc.weight += toNumber(row.weight_kg)
    acc.quantity += toNumber(row.quantity)
    acc.amount += toNumber(row.amount)
    acc.count += 1
    return acc
  }, { weight: 0, quantity: 0, amount: 0, count: 0 }), [rows])

  function resetForm(nextModule = module, nextMonth = month, nextMode = effectiveMode) {
    setForm(blankForm(nextModule, nextMonth, nextMode))
  }

  function changeModule(nextModule) {
    const next = moduleOptions.find(item => item.id === nextModule)
    const nextMode = next?.mode === 'daily_or_monthly' ? entryMode : next?.mode
    setModule(nextModule)
    resetForm(nextModule, month, nextMode)
  }

  function changeMonth(nextMonth) {
    setMonth(nextMonth)
    resetForm(module, nextMonth, effectiveMode)
  }

  function updateField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const saveMutation = useMutation({
    mutationFn: payload => payload.id
      ? apiFetch(`/api/entries/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : apiFetch('/api/entries', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', module, month] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      resetForm()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: id => apiFetch(`/api/entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entries', module, month] })
  })

  const importMutation = useMutation({
    mutationFn: entries => apiFetch('/api/entries/batch', { method: 'POST', body: JSON.stringify({ entries }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entries', module, month] })
  })

  function submitForm(e) {
    e.preventDefault()
    if (effectiveMode === 'readonly') return
    const payload = {
      ...form,
      module,
      month,
      entry_date: effectiveMode === 'monthly' ? `${month}-01` : form.entry_date,
      amount: form.amount || (toNumber(form.weight_kg) * toNumber(form.unit_price)) || ''
    }
    saveMutation.mutate(payload)
  }

  function editRow(row) {
    setForm({
      id: row.id,
      module: row.module,
      category_code: row.category_code || '',
      entry_date: row.entry_date || `${month}-01`,
      material_name: row.material_name || '',
      weight_kg: row.weight_kg ?? '',
      quantity: row.quantity ?? '',
      unit: row.unit || selected?.unit || 'kg',
      unit_price: row.unit_price ?? '',
      amount: row.amount ?? '',
      notes: row.notes || ''
    })
  }

  function exportCsv() {
    const csv = rowsToCsv(rows)
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ckap-${module}-${month}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importCsv(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const entries = parseCsv(text, module, month)
    if (entries.length) importMutation.mutate(entries)
    e.target.value = ''
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">บันทึกข้อมูลจริง</p>
          <h2>บันทึกข้อมูลแยกตามงาน</h2>
          <p className="muted">เลือกเดือนก่อนกรอกข้อมูล ปุ่ม Import / Export / Save อยู่ด้านล่าง</p>
        </div>
        <label className="field small-field">
          <span>เลือกเดือน</span>
          <input type="month" value={month} onChange={e => changeMonth(e.target.value)} />
        </label>
      </div>

      <div className="module-tabs">
        {moduleOptions.map(item => (
          <button key={item.id} type="button" className={module === item.id ? 'active' : ''} onClick={() => changeModule(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {selected?.mode === 'daily_or_monthly' && (
        <div className="inline-toggle">
          <span>รูปแบบกระดาษทิชชู่</span>
          <button type="button" className={entryMode === 'daily' ? 'active' : ''} onClick={() => { setEntryMode('daily'); resetForm(module, month, 'daily') }}>รายวัน</button>
          <button type="button" className={entryMode === 'monthly' ? 'active' : ''} onClick={() => { setEntryMode('monthly'); resetForm(module, month, 'monthly') }}>รายเดือน</button>
        </div>
      )}

      {error && <div className="alert error">เชื่อมต่อ API ไม่สำเร็จ: {error.message}</div>}
      {isLoading && <div className="alert">กำลังโหลดข้อมูล...</div>}
      {saveMutation.error && <div className="alert error">บันทึกไม่สำเร็จ: {saveMutation.error.message}</div>}
      {importMutation.error && <div className="alert error">Import ไม่สำเร็จ: {importMutation.error.message}</div>}

      <div className="content-grid">
        <div className="card table-card">
          <div className="card-title-row">
            <h3>ตารางข้อมูล {selected?.label}</h3>
            <span>{rows.length} รายการ</span>
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ประเภท/วัสดุ</th>
                  <th>น้ำหนัก</th>
                  <th>จำนวน</th>
                  <th>ราคา/หน่วย</th>
                  <th>ยอดเงิน</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan="7" className="empty-cell">ยังไม่มีข้อมูลเดือนนี้</td></tr>
                )}
                {rows.map(row => (
                  <tr key={row.id}>
                    <td>{row.entry_date}</td>
                    <td>{row.material_name || row.category_code || row.module}</td>
                    <td>{formatNumber(row.weight_kg || 0)} kg</td>
                    <td>{formatNumber(row.quantity || 0, 0)} {row.unit}</td>
                    <td>{formatNumber(row.unit_price || 0)}</td>
                    <td>{formatNumber(row.amount || 0)}</td>
                    <td className="actions-cell">
                      {effectiveMode !== 'readonly' && <button type="button" onClick={() => editRow(row)}>แก้ไข</button>}
                      <button type="button" className="danger" onClick={() => window.confirm('ยืนยันลบข้อมูลรายการนี้?') && deleteMutation.mutate(row.id)}>ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="summary-strip">
            <div><span>น้ำหนักรวม</span><strong>{formatNumber(summary.weight)} kg</strong></div>
            <div><span>จำนวนรวม</span><strong>{formatNumber(summary.quantity, 0)}</strong></div>
            <div><span>รายได้รวม</span><strong>{formatNumber(summary.amount)} บาท</strong></div>
            <div><span>รายการ</span><strong>{summary.count}</strong></div>
          </div>
        </div>

        <form className="card entry-form" onSubmit={submitForm}>
          <div className="card-title-row">
            <h3>{form.id ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}</h3>
            <span>{selected?.label}</span>
          </div>

          {effectiveMode === 'readonly' ? (
            <div className="readonly-box">
              หน้าขยะเปียกเป็นหน้ารวมข้อมูลจาก “อาหารหมา + อาหารหมู” โดยไม่กรอกซ้ำในหน้านี้
            </div>
          ) : (
            <>
              {effectiveMode !== 'monthly' && (
                <label className="field">
                  <span>วันที่</span>
                  <input type="date" value={form.entry_date} onChange={e => updateField('entry_date', e.target.value)} required />
                </label>
              )}
              {effectiveMode === 'monthly' && <div className="readonly-box">ข้อมูลรายเดือนจะบันทึกเป็นวันที่ {month}-01</div>}

              <label className="field">
                <span>ประเภท/วัสดุ</span>
                <input value={form.material_name} onChange={e => updateField('material_name', e.target.value)} placeholder="เช่น RDF, อาหารหมา, กระดาษทิชชู่" />
              </label>

              <div className="two-col">
                <label className="field">
                  <span>น้ำหนัก (kg)</span>
                  <input type="number" step="0.01" value={form.weight_kg} onChange={e => updateField('weight_kg', e.target.value)} />
                </label>
                <label className="field">
                  <span>จำนวน</span>
                  <input type="number" step="1" value={form.quantity} onChange={e => updateField('quantity', e.target.value)} />
                </label>
              </div>

              <div className="two-col">
                <label className="field">
                  <span>หน่วย</span>
                  <input value={form.unit} onChange={e => updateField('unit', e.target.value)} />
                </label>
                <label className="field">
                  <span>ราคา/หน่วย</span>
                  <input type="number" step="0.01" value={form.unit_price} onChange={e => updateField('unit_price', e.target.value)} />
                </label>
              </div>

              <label className="field">
                <span>ยอดเงิน</span>
                <input type="number" step="0.01" value={form.amount || (toNumber(form.weight_kg) * toNumber(form.unit_price) || '')} onChange={e => updateField('amount', e.target.value)} />
              </label>

              <label className="field">
                <span>หมายเหตุ</span>
                <textarea rows="3" value={form.notes} onChange={e => updateField('notes', e.target.value)} />
              </label>
            </>
          )}

          <div className="form-actions bottom-actions">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden-input" onChange={importCsv} />
            <button type="button" className="secondary" onClick={() => fileRef.current?.click()} disabled={effectiveMode === 'readonly'}>Import CSV</button>
            <button type="button" className="secondary" onClick={exportCsv}>Export CSV</button>
            {form.id && <button type="button" className="secondary" onClick={() => resetForm()}>ยกเลิกแก้ไข</button>}
            <button type="submit" className="primary" disabled={effectiveMode === 'readonly' || saveMutation.isPending}>{saveMutation.isPending ? 'กำลังบันทึก...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </section>
  )
}
