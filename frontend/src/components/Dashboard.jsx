import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiFetch, currentMonth, formatNumber } from '../api.js'

const moduleLabels = {
  rdf: 'RDF',
  dog_food: 'อาหารหมา',
  pig_feed: 'อาหารหมู',
  recycle: 'รีไซเคิล',
  tissue: 'กระดาษทิชชู่',
  black_bag: 'ถุงดำ'
}

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth())
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => apiFetch(`/api/dashboard?month=${month}`)
  })

  const modules = (data?.modules || []).map(row => ({
    ...row,
    label: moduleLabels[row.module] || row.module,
    weight_kg: Number(row.weight_kg || 0),
    amount: Number(row.amount || 0)
  }))

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">ภาพรวมระบบ</p>
          <h2>แดชบอร์ด</h2>
          <p className="muted">สรุปน้ำหนัก รายได้ และจำนวนข้อมูลจาก Supabase</p>
        </div>
        <label className="field small-field">
          <span>เลือกเดือน</span>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </label>
      </div>

      {error && <div className="alert error">เชื่อมต่อ API ไม่สำเร็จ: {error.message}</div>}
      {isLoading && <div className="alert">กำลังโหลดข้อมูล...</div>}

      <div className="kpi-grid">
        <div className="card kpi-card">
          <span>น้ำหนักรวม</span>
          <strong>{formatNumber(data?.totals?.total_weight_kg || 0)} kg</strong>
        </div>
        <div className="card kpi-card">
          <span>รายได้รวม</span>
          <strong>{formatNumber(data?.totals?.total_amount || 0)} บาท</strong>
        </div>
        <div className="card kpi-card">
          <span>จำนวนรายการ</span>
          <strong>{formatNumber(data?.totals?.entry_count || 0, 0)}</strong>
        </div>
        <div className="card kpi-card">
          <span>ขยะเปียกรวม</span>
          <strong>{formatNumber(data?.totals?.wet_waste_weight_kg || 0)} kg</strong>
        </div>
      </div>

      <div className="card chart-card">
        <div className="card-title-row">
          <h3>สรุปตามประเภทงาน</h3>
          <span>{month}</span>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={modules}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={value => formatNumber(value)} />
              <Bar dataKey="weight_kg" name="น้ำหนัก kg" fill="#2563eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}
