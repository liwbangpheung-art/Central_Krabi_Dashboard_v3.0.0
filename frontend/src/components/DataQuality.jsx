import React from 'react'

export default function DataQuality() {
  const scores = [
    { module: 'RDF Waste', score: 92, status: 'ดีเยี่ยม' },
    { module: 'Tissue Paper', score: 78, status: 'ดี' },
    { module: 'Scrap Sales', score: 65, status: 'ปานกลาง' },
    { module: 'Animal Feed', score: 95, status: 'ดีเยี่ยม' },
  ]

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">Data Quality Score</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {scores.map((item, idx) => (
          <div key={idx} className="bg-white border rounded-2xl p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-lg">{item.module}</div>
                <div className="text-5xl font-bold mt-3 text-blue-600">{item.score}<span className="text-2xl">%</span></div>
              </div>
              <div className={`px-4 py-1 rounded-full text-sm ${item.score > 85 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {item.status}
              </div>
            </div>
            <div className="mt-6 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${item.score}%` }}></div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-sm text-gray-500">
        * คำนวณจากจำนวนวันที่มีข้อมูล / จำนวนวันทั้งหมด + ความสมบูรณ์ของฟิลด์
      </div>
    </div>
  )
}
