import React, { useState } from 'react'
import { BarChart3, CalendarDays, FileText, ShieldCheck } from 'lucide-react'
import Dashboard from './Dashboard.jsx'
import DataEntry from './DataEntry.jsx'
import PPTBuilder from './PPTBuilder.jsx'
import DataQuality from './DataQuality.jsx'

const modules = [
  { id: 'dashboard', label: 'แดชบอร์ด', icon: BarChart3, component: Dashboard },
  { id: 'data-entry', label: 'บันทึกข้อมูล', icon: CalendarDays, component: DataEntry },
  { id: 'quality', label: 'ตรวจคุณภาพข้อมูล', icon: ShieldCheck, component: DataQuality },
  { id: 'ppt', label: 'Export PowerPoint', icon: FileText, component: PPTBuilder }
]

export default function Workspace() {
  const [activeModule, setActiveModule] = useState('dashboard')
  const ActiveComponent = modules.find(item => item.id === activeModule)?.component || Dashboard

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CK</div>
          <div>
            <h1>Central Krabi</h1>
            <p>Waste & Resource Dashboard v3</p>
          </div>
        </div>

        <nav className="nav-list">
          {modules.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`nav-item ${activeModule === item.id ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          Render + Supabase Ready
        </div>
      </aside>

      <main className="main-panel">
        <ActiveComponent />
      </main>
    </div>
  )
}
