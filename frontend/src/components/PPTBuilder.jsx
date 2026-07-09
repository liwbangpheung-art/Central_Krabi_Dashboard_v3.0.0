import React, { useState } from 'react'
import pptxgen from 'pptxgenjs'

export default function PPTBuilder() {
  const [title, setTitle] = useState('รายงานขยะประจำเดือน')

  const generatePPT = async () => {
    const ppt = new pptxgen()
    ppt.layout = 'LAYOUT_16x9'
    ppt.author = 'Central Krabi Analytics Platform'

    // Slide 1 - Title
    let slide1 = ppt.addSlide()
    slide1.addText(title, { x: 0.5, y: 2.5, w: 9, h: 1.5, fontSize: 40, bold: true, color: '1E40AF' })
    slide1.addText('Central Krabi Analytics Platform v3', { x: 0.5, y: 4.2, w: 9, h: 0.5, fontSize: 18, color: '64748b' })

    // Slide 2 - KPI
    let slide2 = ppt.addSlide()
    slide2.addText('KPI Summary', { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 28, bold: true })
    slide2.addText('Total Waste: 12,450 kg  |  Data Quality: 87%', { x: 0.5, y: 2, w: 9, h: 1, fontSize: 24 })

    // Slide 3 - Chart placeholder
    let slide3 = ppt.addSlide()
    slide3.addText('Analytics Chart (เชื่อม Recharts)', { x: 0.5, y: 2, w: 9, h: 1, fontSize: 24, color: '64748b' })

    await ppt.writeFile({ fileName: `${title}.pptx` })
    alert('สร้าง PPTX สำเร็จ! ไฟล์ถูกดาวน์โหลดแล้ว')
  }

  return (
    <div>
      <h2 className="text-3xl font-bold mb-2">Quick PPT Builder</h2>
      <p className="text-gray-600 mb-6">สร้างสไลด์รายงานแบบ Editable ได้ทันที</p>

      <div className="max-w-md bg-white border rounded-2xl p-8">
        <input 
          type="text" 
          value={title} 
          onChange={e => setTitle(e.target.value)}
          className="w-full border rounded-lg px-4 py-3 text-lg mb-6"
        />
        
        <button 
          onClick={generatePPT}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-all"
        >
          Generate Editable PPTX
        </button>
        
        <p className="text-xs text-gray-500 mt-4 text-center">
          ใช้ pptxgenjs • Native Chart + Theme • แก้ไขได้ใน PowerPoint
        </p>
      </div>
    </div>
  )
}
