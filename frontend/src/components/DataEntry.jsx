import React, { useState } from 'react'

export default function DataEntry() {
  const [selectedModule, setSelectedModule] = useState('rdf')

  return (
    <div>
      <h2 className="text-3xl font-bold mb-2">Data Entry Workspace</h2>
      <p className="text-gray-600 mb-6">เลือก Module แล้วกรอกข้อมูลตามรูปแบบที่เหมาะสม</p>

      <div className="flex gap-3 mb-6">
        {['rdf', 'wet', 'tissue', 'scrap'].map(mod => (
          <button 
            key={mod}
            onClick={() => setSelectedModule(mod)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${selectedModule === mod ? 'bg-black text-white' : 'bg-white border hover:bg-gray-50'}`}
          >
            {mod.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-2xl p-8">
        {selectedModule === 'rdf' && <div>RDF Daily Entry Form (Calendar Style) - Coming Soon</div>}
        {selectedModule === 'wet' && <div>Wet Waste / Animal Feed - Matrix or Average - Coming Soon</div>}
        {selectedModule === 'tissue' && <div>Tissue Matrix Calendar - Coming Soon</div>}
        {selectedModule === 'scrap' && <div>Scrap Sales Dynamic Table - Coming Soon</div>}
        
        <div className="mt-8 text-sm text-gray-500">
          ระบบจะเชื่อม Supabase จริงและใช้ replace_daily_month function
        </div>
      </div>
    </div>
  )
}
