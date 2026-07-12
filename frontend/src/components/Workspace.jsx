import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Bot, CalendarDays, FileText, UsersRound, SlidersHorizontal, Settings, UploadCloud, Table } from 'lucide-react'
import { apiFetch } from '../api.js'
import Dashboard from './Dashboard.jsx'
import DataEntry from './DataEntry.jsx'
import PPTBuilder from './PPTBuilder.jsx'
import ChartBuilder from './ChartBuilder.jsx'
import UsersRoles from './UsersRoles.jsx'
import Automation from './Automation.jsx'
import Login from './Login.jsx'
import SettingsPage from './SettingsPage.jsx'
import FMHYImport from './FMHYImport.jsx'
import AnnualLedger from './AnnualLedger.jsx'

const modules = [
  { id: 'dashboard', label: 'แดชบอร์ด', icon: BarChart3, component: Dashboard, permission: 'dashboard.read' },
  { id: 'data-entry', label: 'บันทึกข้อมูล', icon: CalendarDays, component: DataEntry, permission: 'entries.read' },
  { id: 'fmhy-import', label: 'นำเข้าข้อมูล FM-HY', icon: UploadCloud, component: FMHYImport, permission: 'entries.create' },
  { id: 'ledger', label: 'ค้นหาและวิเคราะห์ (Ledger)', icon: Table, component: AnnualLedger, permission: 'entries.read' },

  { id: 'charts', label: 'สร้างกราฟ', icon: BarChart3, component: ChartBuilder, permission: 'charts.read' },
  { id: 'ppt', label: 'Export PowerPoint', icon: FileText, component: PPTBuilder, permission: 'reports.preview' },
  { id: 'users', label: 'Users / Roles', icon: UsersRound, component: UsersRoles, permission: 'users.read' },
  { id: 'automation', label: 'Automation', icon: Bot, component: Automation, permission: 'automation.read' },
  { id: 'settings', label: 'ตั้งค่าระบบ', icon: Settings, component: SettingsPage, permission: 'settings.manage' }
]

export default function Workspace() {
  const [activeModule, setActiveModule] = useState('dashboard')
  const [theme, setTheme] = useState(() => localStorage.getItem('ckap_theme') || 'classic')
  const { data: me, isLoading, refetch } = useQuery({ queryKey: ['me'], queryFn: () => apiFetch('/api/me') })

  React.useEffect(() => {
    const rootEl = document.querySelector('.app-shell')
    if (rootEl) {
      rootEl.classList.remove('theme-gold-mint', 'theme-central-gold')
      if (theme === 'gold-mint') {
        rootEl.classList.add('theme-gold-mint')
      } else if (theme === 'central-gold') {
        rootEl.classList.add('theme-central-gold')
      }
    }
  }, [theme])

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    localStorage.setItem('ckap_theme', newTheme)
  }

  if (isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#f1f5f9' }}>
        <div>กำลังยืนยันตัวตน...</div>
      </div>
    )
  }

  if (!me || me.role === 'blocked') {
    return <Login onLoginSuccess={refetch} />
  }

  const permissions = me?.permissions || []
  const can = permission => !permissions.length || permissions.includes(permission)
  const visibleModules = modules.filter(item => can(item.permission))
  const ActiveComponent = visibleModules.find(item => item.id === activeModule)?.component || visibleModules[0]?.component || Dashboard

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand" style={{ justifyContent: 'center', padding: '10px 0', marginBottom: '24px' }}>
          <img src="/central-krabi-logo.png" alt="Central Krabi" style={{ maxWidth: '100%', height: 'auto', maxHeight: '56px', objectFit: 'contain' }} />
        </div>

        <nav className="nav-list">
          {visibleModules.map(item => {
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

        {/* Theme Toggle Switcher */}
        <div style={{
          marginTop: 'auto',
          padding: '12px',
          background: 'rgba(255, 255, 255, 0.5)',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          display: 'grid',
          gap: '8px'
        }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>ธีมของระบบ (Theme)</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleThemeChange('classic')}
              style={{
                padding: '6px 2px',
                fontSize: '10.5px',
                fontWeight: 'bold',
                borderRadius: '8px',
                border: '1.5px solid',
                borderColor: theme === 'classic' ? 'var(--primary-color)' : '#cbd5e1',
                background: theme === 'classic' ? 'white' : 'transparent',
                color: theme === 'classic' ? 'var(--primary-color)' : '#64748b'
              }}
            >
              Classic Blue
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange('gold-mint')}
              style={{
                padding: '6px 2px',
                fontSize: '10.5px',
                fontWeight: 'bold',
                borderRadius: '8px',
                border: '1.5px solid',
                borderColor: theme === 'gold-mint' ? '#0f766e' : '#cbd5e1',
                background: theme === 'gold-mint' ? 'white' : 'transparent',
                color: theme === 'gold-mint' ? '#0f766e' : '#64748b'
              }}
            >
              Minty Gold
            </button>
            <button
              type="button"
              onClick={() => handleThemeChange('central-gold')}
              style={{
                gridColumn: '1 / -1',
                padding: '6px 2px',
                fontSize: '10.5px',
                fontWeight: 'bold',
                borderRadius: '8px',
                border: '1.5px solid',
                borderColor: theme === 'central-gold' ? '#b8924b' : '#cbd5e1',
                background: theme === 'central-gold' ? 'white' : 'transparent',
                color: theme === 'central-gold' ? '#9c793a' : '#64748b'
              }}
            >
              Central Gold ✨
            </button>
          </div>
        </div>

        <div className="user-profile-card" style={{
          background: 'var(--primary-light)',
          border: '1px solid var(--primary-color)',
          opacity: 0.95,
          borderRadius: '16px',
          padding: '12px',
          margin: '16px 0',
          display: 'grid',
          gap: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--primary-color)',
              color: 'white',
              display: 'grid',
              placeItems: 'center',
              fontWeight: '700',
              fontSize: '14px'
            }}>
              {(me?.display_name || me?.email || 'O')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#1e293b' }}>
                {me?.display_name || me?.email?.split('@')[0]}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {me?.email || 'owner@central-krabi.local'}
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1.5px solid rgba(255, 255, 255, 0.5)', marginTop: '8px', paddingTop: '8px', fontSize: '11px', display: 'grid', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#475569', fontWeight: 'bold' }}>บทบาท:</span>
              <span style={{
                background: 'white',
                color: 'var(--primary-color)',
                border: '1px solid var(--primary-color)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: '900',
                fontSize: '10px',
                textTransform: 'uppercase'
              }}>{me?.role || 'owner'}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '2px' }}>สิทธิ์เข้าถึง ({permissions.length || visibleModules.length}):</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '60px', overflowY: 'auto' }}>
                {(permissions.length ? permissions : visibleModules.map(m => m.permission)).map(p => (
                  <span key={p} style={{
                    background: '#f1f5f9',
                    color: '#475569',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    border: '1px solid #e2e8f0'
                  }}>{p}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          Render + Supabase Ready
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('ckap_token')
              refetch()
            }}
            style={{
              background: 'transparent',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '6px 10px',
              marginTop: '12px',
              fontSize: '12px',
              fontWeight: '700',
              color: '#dc2626',
              width: '100%',
              cursor: 'pointer'
            }}
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <ActiveComponent permissions={permissions} user={me} />
      </main>
    </div>
  )
}
