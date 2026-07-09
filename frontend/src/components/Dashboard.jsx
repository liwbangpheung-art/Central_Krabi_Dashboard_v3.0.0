import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const sampleData = [
  { month: 'Jan', waste: 1200, recycle: 450 },
  { month: 'Feb', waste: 980, recycle: 520 },
  { month: 'Mar', waste: 1450, recycle: 610 },
]

export default function Dashboard() {
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Dashboard • Analytics Engine</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <div className="text-sm text-gray-500">Total Waste (Kg)</div>
          <div className="text-4xl font-bold mt-2">12,450</div>
          <div className="text-emerald-600 text-sm mt-1">+8% จากเดือนที่แล้ว</div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <div className="text-sm text-gray-500">Data Quality Score</div>
          <div className="text-4xl font-bold mt-2 text-blue-600">87%</div>
          <div className="text-sm mt-1">ดีมาก • 3 Module สมบูรณ์</div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <div className="text-sm text-gray-500">Reports Generated</div>
          <div className="text-4xl font-bold mt-2">142</div>
          <div className="text-sm mt-1">เดือนนี้</div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border">
        <h3 className="font-semibold mb-4">Monthly Overview</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sampleData}>
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="waste" fill="#3b82f6" />
              <Bar dataKey="recycle" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
