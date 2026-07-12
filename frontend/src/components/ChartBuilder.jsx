import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { apiFetch, currentMonth, formatNumber, MODULE_LABELS, MODULE_ORDER } from '../api.js'
import MonthPicker from './MonthPicker.jsx'


const chartColors = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#0f766e', '#db2777', '#475569', '#ea580c']

function getBarColor(label, index) {
  const cleanLabel = (label || '').trim().toLowerCase();
  
  if (cleanLabel === 'rdf' || cleanLabel.includes('ขยะ rdf')) return '#18181b'; // Black
  if (cleanLabel.includes('อาหารหมา') || cleanLabel.includes('dog_food')) return '#388e3c'; // Green
  if (cleanLabel.includes('อาหารหมู') || cleanLabel.includes('pig_feed')) return '#4ade80'; // Lime Green
  if (cleanLabel.includes('ขยะเปียก') || cleanLabel.includes('wet_waste')) return '#388e3c'; // Green
  if (cleanLabel.includes('รีไซเคิล') || cleanLabel.includes('recycle')) return '#ffd600'; // Yellow
  if (cleanLabel.includes('ทิชชู่') || cleanLabel.includes('tissue')) return '#3b82f6'; // Blue
  if (cleanLabel.includes('ถุงดำ') || cleanLabel.includes('black_bag')) return '#64748b'; // Slate Gray
  if (cleanLabel.includes('ของใช้') || cleanLabel.includes('consumable')) return '#8b5cf6'; // Violet/Purple

  // Recycle Materials
  if (cleanLabel.includes('กระดาษน้ำตาล')) return '#b85d1d';
  if (cleanLabel.includes('กระดาษจับจั้ว')) return '#a8a29e';
  if (cleanLabel.includes('สังกะสี')) return '#d59a7a';
  if (cleanLabel.includes('pet')) return '#e28743';
  if (cleanLabel.includes('พลาสติก')) return '#5c3a21';
  if (cleanLabel.includes('อลู')) return '#3a9ad9';
  if (cleanLabel.includes('แก้ว')) return '#1b4f72';
  if (cleanLabel.includes('รวมเงิน') || cleanLabel.includes('ยอดรวม')) return '#dc2626'; // Red

  return chartColors[index % chartColors.length];
}

function makeLineData(chart) {
  const series = chart?.series || []
  const days = series[0]?.data?.map(point => point.day) || []
  return days.map(day => {
    const item = { day }
    for (const serie of series) {
      const found = (serie.data || []).find(point => point.day === day)
      item[serie.name] = Number(found?.value || 0)
    }
    return item
  })
}

function ChartPreview({ chart }) {
  const chartType = chart?.chart_type
  const data = chart?.data || []
  const lineData = useMemo(() => makeLineData(chart), [chart])
  const series = chart?.series || []
  const metric = chart?.metric === 'amount' ? 'amount' : 'value'

  return (
    <div className="chart-preview-card card">
      <div className="card-title-row">
        <div>
          <h3>{chart.title}</h3>
          <p className="muted no-margin">{chart.subtitle}</p>
        </div>
        <span className="chart-type-badge">{chartType}</span>
      </div>

      <div className="chart-preview-box">
        {chartType === 'line' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip formatter={value => formatNumber(value)} />
              {series.slice(0, 8).map((serie, index) => (
                <Line 
                  key={serie.name} 
                  type="monotone" 
                  dataKey={serie.name} 
                  stroke={getBarColor(serie.name, index)} 
                  strokeWidth={2.5} 
                  dot={false} 
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}

        {chartType === 'pie' && (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={105} label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}>
                {data.map((entry, index) => (
                  <Cell key={entry.label || index} fill={getBarColor(entry.label, index)} />
                ))}
              </Pie>
              <Tooltip formatter={value => `${formatNumber(value)} ${chart.unit || ''}`} />
            </PieChart>
          </ResponsiveContainer>
        )}

        {chartType !== 'line' && chartType !== 'pie' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={value => `${formatNumber(value)} ${chart.unit || ''}`} />
              <Bar dataKey={metric} name={chart.unit || 'ค่า'} radius={[8, 8, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={entry.label || index} fill={getBarColor(entry.label, index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="chart-takeaway">
        <strong>สรุปจากกราฟ</strong>
        <span>{chart.takeaway || 'ใช้กราฟนี้ประกอบการพรีวิวรายงานและสร้างสไลด์ PowerPoint'}</span>
      </div>
    </div>
  )
}

export default function ChartBuilder() {
  const [month, setMonth] = useState(currentMonth())
  const [selectedModules, setSelectedModules] = useState(MODULE_ORDER)
  const moduleQuery = selectedModules.join(',')

  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['charts-preview', month, moduleQuery],
    queryFn: () => apiFetch(`/api/charts/preview?month=${month}&modules=${moduleQuery}`)
  })

  const charts = data?.charts || []

  function toggleModule(module) {
    setSelectedModules(prev => prev.includes(module) ? prev.filter(item => item !== module) : [...prev, module])
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Chart Builder</p>
          <h2>สร้างกราฟรายงาน</h2>
          <p className="muted">พรีวิวกราฟจากข้อมูลจริงก่อนนำไปสร้าง PowerPoint โดยไม่กระทบฟอร์มกรอกข้อมูลเดิม</p>
        </div>
        <label className="field small-field">
          <span>เลือกเดือน</span>
          <MonthPicker value={month} onChange={setMonth} />
        </label>
      </div>

      {error && <div className="alert error">โหลดกราฟไม่สำเร็จ: {error.message}</div>}
      {isLoading && <div className="alert">กำลังสร้าง Preview กราฟ...</div>}

      <div className="card chart-control-card">
        <div className="section-title-row">
          <div>
            <h3>ข้อมูลที่จะใช้สร้างกราฟ</h3>
            <p className="muted no-margin">เลือกประเภทข้อมูล แล้วระบบจะสร้างกราฟ Preview ให้อัตโนมัติ</p>
          </div>
          <button type="button" className="ghost" onClick={() => refetch()} disabled={isFetching}>รีเฟรชกราฟ</button>
        </div>
        <div className="check-grid chart-module-grid">
          {MODULE_ORDER.map(module => (
            <label key={module} className="check-pill">
              <input type="checkbox" checked={selectedModules.includes(module)} onChange={() => toggleModule(module)} />
              <span>{MODULE_LABELS[module]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="chart-builder-grid">
        {charts.map(chart => <ChartPreview key={chart.id} chart={chart} />)}
        {!charts.length && !isLoading && <div className="card empty-state">ยังไม่มีกราฟ Preview สำหรับเดือนนี้</div>}
      </div>

      <div className="alert chart-note">
        กราฟชุดนี้จะถูกใส่ใน <strong>Export PowerPoint</strong> อัตโนมัติเป็นสไลด์กราฟ และยังเปิด/ปิดสไลด์กราฟได้ในหน้า Preview Slide Outline ก่อน Generate จริง
      </div>
    </section>
  )
}
