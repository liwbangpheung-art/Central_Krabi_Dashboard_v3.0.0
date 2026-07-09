import React, { useState } from 'react'
import { BarChart3, Calendar, FileText, Users } from 'lucide-react'
import DataEntry from './DataEntry'
import Dashboard from './Dashboard'
import PPTBuilder from './PPTBuilder'
import DataQuality from './DataQuality'

const modules = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, component: Dashboard },
  { id: 'data-entry', label: 'Data Entry', icon: Calendar, component: DataEntry },
  { id: 'ppt', label: 'Quick PPT Builder', icon: FileText, component: PPTBuilder },
  { id: 'quality', label: 'Data Quality', icon: Users, component: DataQuality },
]

export default function Workspace() {
  const [activeModule, setActiveModule] = useState('dashboard')

  const ActiveComponent = modules.find(m => m.id === activeModule)?.component || Dashboard

  return (
    <div className="flex h-[calc(100vh-73px)]">
      {/* Small Hybrid Sidebar */}
      <div className="w-64 bg-white border-r p-4">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-1">Workspace</h2>
          <p className="text-xs text-gray-500">เลือก Module เพื่อทำงาน</p>
        </div>
        
        <nav className="space-y-1">
          {modules.map((mod) => {
            const Icon = mod.icon
            return (
              <button
                key={mod.id}
                onClick={() => setActiveModule(mod.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                  activeModule === mod.id 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{mod.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto pt-8 text-xs text-gray-400">
          Central Krabi Analytics Platform v3
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <ActiveComponent />
      </div>
    </div>
  )
}
