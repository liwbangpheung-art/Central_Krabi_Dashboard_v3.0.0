import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import pptxgen from 'pptxgenjs'
import { apiFetch, currentMonth, formatNumber } from '../api.js'

export default function PPTBuilder() {
  const [month, setMonth] = useState(currentMonth())
  const [title, setTitle] = useState('รายงานขยะประจำเดือน')
  const { data, error } = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => apiFetch(`/api/dashboard?month=${month}`)
  })

  async function generatePPT() {
    const ppt = new pptxgen()
    ppt.layout = 'LAYOUT_WIDE'
    ppt.author = 'Central Krabi Analytics Platform'
    ppt.subject = `CKAP monthly report ${month}`
    ppt.title = title
    ppt.company = 'Central Krabi'
    ppt.theme = {
      headFontFace: 'Aptos Display',
      bodyFontFace: 'Aptos',
      lang: 'th-TH'
    }

    const slide1 = ppt.addSlide()
    slide1.background = { color: 'F8FAFC' }
    slide1.addText(title, { x: 0.7, y: 1.4, w: 11.6, h: 0.7, fontSize: 30, bold: true, color: '1E3A8A' })
    slide1.addText(`ประจำเดือน ${month}`, { x: 0.7, y: 2.2, w: 11.6, h: 0.35, fontSize: 16, color: '475569' })
    slide1.addText('Central Krabi Analytics Platform v3', { x: 0.7, y: 6.5, w: 11.6, h: 0.35, fontSize: 13, color: '64748B' })

    const slide2 = ppt.addSlide()
    slide2.addText('KPI Summary', { x: 0.5, y: 0.4, w: 12, h: 0.5, fontSize: 24, bold: true, color: '0F172A' })
    const totals = data?.totals || {}
    const kpis = [
      ['น้ำหนักรวม', `${formatNumber(totals.total_weight_kg || 0)} kg`],
      ['รายได้รวม', `${formatNumber(totals.total_amount || 0)} บาท`],
      ['จำนวนรายการ', `${formatNumber(totals.entry_count || 0, 0)} รายการ`],
      ['ขยะเปียกรวม', `${formatNumber(totals.wet_waste_weight_kg || 0)} kg`]
    ]
    kpis.forEach((item, idx) => {
      const x = 0.7 + (idx % 2) * 6.1
      const y = 1.3 + Math.floor(idx / 2) * 2.1
      slide2.addShape(ppt.ShapeType.roundRect, { x, y, w: 5.5, h: 1.5, fill: { color: 'EFF6FF' }, line: { color: 'BFDBFE' }, radius: 0.18 })
      slide2.addText(item[0], { x: x + 0.25, y: y + 0.25, w: 5, h: 0.3, fontSize: 13, color: '475569' })
      slide2.addText(item[1], { x: x + 0.25, y: y + 0.75, w: 5, h: 0.4, fontSize: 22, bold: true, color: '1D4ED8' })
    })

    const slide3 = ppt.addSlide()
    slide3.addText('Module Summary', { x: 0.5, y: 0.4, w: 12, h: 0.5, fontSize: 24, bold: true, color: '0F172A' })
    const rows = data?.modules || []
    const tableRows = [['Module', 'Weight kg', 'Amount', 'Entries'], ...rows.map(row => [row.module, formatNumber(row.weight_kg || 0), formatNumber(row.amount || 0), String(row.count || 0)])]
    slide3.addTable(tableRows, { x: 0.6, y: 1.2, w: 12, h: 4.8, border: { color: 'CBD5E1' }, fontSize: 12, color: '0F172A', fill: { color: 'FFFFFF' } })

    await ppt.writeFile({ fileName: `CKAP-${month}.pptx` })
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Report Export</p>
          <h2>Export PowerPoint</h2>
          <p className="muted">สร้างรายงาน PPTX ที่แก้ไขต่อได้จากข้อมูลเดือนที่เลือก</p>
        </div>
        <label className="field small-field">
          <span>เลือกเดือน</span>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </label>
      </div>

      {error && <div className="alert error">เชื่อมต่อ API ไม่สำเร็จ: {error.message}</div>}

      <div className="card report-card">
        <label className="field">
          <span>ชื่อรายงาน</span>
          <input value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <div className="report-preview">
          <div><span>น้ำหนักรวม</span><strong>{formatNumber(data?.totals?.total_weight_kg || 0)} kg</strong></div>
          <div><span>รายได้รวม</span><strong>{formatNumber(data?.totals?.total_amount || 0)} บาท</strong></div>
          <div><span>จำนวนรายการ</span><strong>{formatNumber(data?.totals?.entry_count || 0, 0)}</strong></div>
        </div>
        <div className="form-actions bottom-actions">
          <button type="button" className="primary" onClick={generatePPT}>Generate Editable PPTX</button>
        </div>
      </div>
    </section>
  )
}
