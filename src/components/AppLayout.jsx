import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { createApiClient } from "../lib/api.js";
import { LoadingScreen } from "./LoadingScreen.jsx";
import { hasPermission, roleLabels } from "../lib/permissions.js";



const dashboardNavItem = { to: "/", label: "แดชบอร์ดภาพรวม", icon: "chart", end: true, color: "blue" };
const dataEntryNavItem = { to: "/entry", label: "กรอกข้อมูล", icon: "edit", color: "orange" };
const previewNavItem = { to: "/preview", label: "CKAP v3 Preview", icon: "layers", color: "green" };

const navigationGroups = [
  {
    id: "reports",
    label: "รายงาน",
    icon: "report",
    defaultOpen: false,
    items: [
      { to: "/analytics", label: "วิเคราะห์และกราฟ", icon: "trend", color: "blue" },
      { to: "/comparison", label: "เปรียบเทียบข้อมูล", icon: "trend", color: "teal" },
      { to: "/export", label: "สร้างรายงาน PowerPoint", icon: "download", color: "purple" },
      { to: "/data-quality", label: "ตรวจคุณภาพข้อมูล", icon: "check", color: "green" }
    ]
  },
  {
    id: "system",
    label: "จัดการระบบ",
    icon: "settings",
    defaultOpen: false,
    items: [
      { to: "/master-data", label: "จัดการประเภทข้อมูล", icon: "folder", color: "orange" },
      { to: "/bulk-data", label: "นำเข้า/ส่งออกข้อมูล (CSV)", icon: "document", color: "purple", permission: "manage_master_data" },
      { to: "/users", label: "จัดการผู้ใช้", icon: "users", color: "pink", permission: "manage_users" },
      { to: "/audit-logs", label: "ประวัติการกระทำ", icon: "shield", color: "teal", permission: "view_audit_logs" },
      { to: "/permission-matrix", label: "Permission Matrix", icon: "matrix", color: "indigo", permission: "manage_users" }
    ]
  }
];

const ICON_COLORS = {
  blue: { bg: "#c2e7ff", fg: "#004a77" },
  purple: { bg: "#e8def8", fg: "#4a0077" },
  indigo: { bg: "#d8e2ff", fg: "#002a77" },
  green: { bg: "#c4eed0", fg: "#005522" },
  orange: { bg: "#ffdfbe", fg: "#883300" },
  pink: { bg: "#ffd7f4", fg: "#880055" },
  teal: { bg: "#cbf0f8", fg: "#005566" },
  gray: { bg: "#e1e3e1", fg: "#333333" },
};

function SidebarIcon({ name }) {
  return (
    <svg className="nav-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "shield" && <><path d="M12 3l7 4v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V7z" /><path d="M9 12l2 2 4-4" /></>}
      {name === "chart" && <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-5" /><path d="M12 16V8" /><path d="M16 16v-9" /></>}
      {name === "edit" && <><path d="M5 19h14" /><path d="M7 16l1.2-4.8L16.5 3l4.5 4.5-8.2 8.3L8 17z" /></>}
      {name === "document" && <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5" /><path d="M9.5 17h4" /></>}
      {name === "box" && <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5" /><path d="M12 12v9" /></>}
      {name === "currency" && <><path d="M12 4v16" /><path d="M17 7.5c-.8-1.1-2.2-1.8-4-1.8-2.2 0-4 1.1-4 2.9 0 4.4 8 1.7 8 6 0 1.9-1.8 3-4.2 3-2 0-3.6-.8-4.8-2" /></>}
      {name === "layers" && <><path d="M12 4l9 5-9 5-9-5z" /><path d="M3 14l9 5 9-5" /></>}
      {name === "recycle" && <><path d="M7.5 7.5l2.2-3.1c.8-1.1 2.5-1.1 3.2.1l1 1.8" /><path d="M13 5.5h3.6l-1.3-3.3" /><path d="M17 12l2.2 3.1c.8 1.1.1 2.7-1.3 2.7h-2.2" /><path d="M17.8 17.8l-1.8 3.1" /><path d="M8 18H4.5c-1.4 0-2.1-1.6-1.3-2.7l1.2-1.8" /><path d="M4 17.8H8l-1.8 3.1" /></>}
      {name === "report" && <><path d="M5 4h14v16H5z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></>}
      {name === "trend" && <><path d="M4 18h16" /><path d="M6 15l4-4 3 3 5-7" /><path d="M15 7h3v3" /></>}
      {name === "download" && <><path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M5 20h14" /></>}
      {name === "check" && <><path d="M20 6L9 17l-5-5" /></>}
      {name === "settings" && <><path d="M12 8a4 4 0 100 8 4 4 0 000-8z" /><path d="M4 12h2" /><path d="M18 12h2" /><path d="M12 4v2" /><path d="M12 18v2" /><path d="M6.3 6.3l1.4 1.4" /><path d="M16.3 16.3l1.4 1.4" /><path d="M17.7 6.3l-1.4 1.4" /><path d="M7.7 16.3l-1.4 1.4" /></>}
      {name === "folder" && <><path d="M3 6h7l2 2h9v10H3z" /><path d="M3 10h18" /></>}
      {name === "users" && <><path d="M9 11a3 3 0 100-6 3 3 0 000 6z" /><path d="M3.5 20c.6-3.1 2.6-5 5.5-5s4.9 1.9 5.5 5" /><path d="M17 11a2.5 2.5 0 100-5" /><path d="M15.5 15.5c2.2.4 3.8 1.9 4.3 4.5" /></>}
      {name === "matrix" && <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>}
    </svg>
  );
}
export function AppLayout({ config }) {
  const location = useLocation();
  const { session, signOut, accessToken, refreshAccessToken } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("ck-theme") || "mint";
    } catch {
      return "mint";
    }
  });
  const [openGroups, setOpenGroups] = useState(() => {
    const defaults = Object.fromEntries(navigationGroups.map((group) => [group.id, group.defaultOpen]));
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem("ck-sidebar-open-groups") || "{}") };
    } catch {
      return defaults;
    }
  });
  const [profileState, setProfileState] = useState({ loading: true, profile: null, permissions: [], error: null });
  const api = useMemo(
    () => createApiClient({ apiUrl: config.apiUrl, getAccessToken: accessToken, refreshAccessToken }),
    [config.apiUrl, accessToken, refreshAccessToken]
  );

  const loadProfile = useCallback(async () => {
    setProfileState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await api.request("/api/me");
      setProfileState({ loading: false, profile: data.profile, permissions: data.permissions || [], error: null });
    } catch (error) {
      setProfileState({ loading: false, profile: null, permissions: [], error });
    }
  }, [api]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (theme === "gold") {
      document.documentElement.setAttribute("data-theme", "gold");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("ck-theme", theme);
    } catch {}
  }, [theme]);



  useEffect(() => {
    try {
      localStorage.setItem("ck-sidebar-open-groups", JSON.stringify(openGroups));
    } catch {
      // ignore storage failures
    }
  }, [openGroups]);

  function isGroupActive(group) {
    return group.items.some((item) => {
      if (item.end) return location.pathname === item.to;
      return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    });
  }

  function toggleGroup(groupId) {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  if (profileState.loading) return <LoadingScreen />;

  return (
    <div className="app-shell">
      {/* Mobile toggle button */}
      <button
        className={`sidebar-mobile-toggle ${mobileSidebarOpen ? "open" : ""}`}
        type="button"
        aria-label={mobileSidebarOpen ? "ปิดเมนู" : "เปิดเมนู"}
        onClick={() => setMobileSidebarOpen((open) => !open)}
      >
        <span /><span /><span />
      </button>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${mobileSidebarOpen ? "visible" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden="true"
      />
      
      {/* Collapsible Sidebar */}
      <aside className={`sidebar ${mobileSidebarOpen ? "mobile-open" : ""} ${!sidebarOpen ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo" aria-label="Central Krabi">
            {sidebarOpen ? (
              <img src="/central-krabi-logo.png" alt="Central Krabi" className="sidebar-logo-image" />
            ) : (
              <div className="sidebar-logo-initial">CK</div>
            )}
          </div>
          <p className="sidebar-brand-subtitle">Waste & Resource Management</p>
        </div>
        <nav aria-label="เมนูหลัก" className="sidebar-nav-grouped">
          <NavLink
            end={dashboardNavItem.end}
            className={({ isActive }) => `nav-item dashboard-nav-item ${isActive ? "active" : ""}`}
            to={dashboardNavItem.to}
            style={dashboardNavItem.color ? { "--icon-bg": ICON_COLORS[dashboardNavItem.color].bg, "--icon-fg": ICON_COLORS[dashboardNavItem.color].fg } : {}}
          >
            <span className="nav-icon" aria-hidden="true"><SidebarIcon name={dashboardNavItem.icon} /></span>
            <span className="nav-label">{dashboardNavItem.label}</span>
          </NavLink>
          
          <NavLink
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            to={dataEntryNavItem.to}
            style={dataEntryNavItem.color ? { "--icon-bg": ICON_COLORS[dataEntryNavItem.color].bg, "--icon-fg": ICON_COLORS[dataEntryNavItem.color].fg } : {}}
          >
            <span className="nav-icon" aria-hidden="true"><SidebarIcon name={dataEntryNavItem.icon} /></span>
            <span className="nav-label">{dataEntryNavItem.label}</span>
          </NavLink>

          <NavLink
            className={({ isActive }) => `nav-item preview-nav-item ${isActive ? "active" : ""}`}
            to={previewNavItem.to}
            style={previewNavItem.color ? { "--icon-bg": ICON_COLORS[previewNavItem.color].bg, "--icon-fg": ICON_COLORS[previewNavItem.color].fg } : {}}
          >
            <span className="nav-icon" aria-hidden="true"><SidebarIcon name={previewNavItem.icon} /></span>
            <span className="nav-label">{previewNavItem.label}</span>
          </NavLink>

          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter((item) => !item.permission || hasPermission(profileState.permissions, item.permission));
            if (visibleItems.length === 0) return null;
            const activeGroup = isGroupActive({ ...group, items: visibleItems });
            const isOpen = Boolean(openGroups[group.id] || activeGroup);
            return (
              <section className={`nav-group ${activeGroup ? "active-group" : ""}`} key={group.id}>
                <button
                  className="nav-group-toggle"
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="nav-group-title">
                    <span className="nav-icon"><SidebarIcon name={group.icon} /></span>
                    <span>{group.label}</span>
                  </span>
                  <span className="nav-group-chevron" aria-hidden="true">›</span>
                </button>
                {isOpen && (
                  <div className="nav-group-items">
                    {visibleItems.map((item) => (
                      <NavLink
                        key={item.to}
                        end={item.end}
                        className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                        to={item.to}
                        style={item.color ? { "--icon-bg": ICON_COLORS[item.color].bg, "--icon-fg": ICON_COLORS[item.color].fg } : {}}
                      >
                        <span className="nav-icon" aria-hidden="true"><SidebarIcon name={item.icon} /></span>
                        <span className="nav-label">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        <div className="sidebar-note">ผู้พัฒนา<br /><strong>TongserviceIT</strong></div>
        <div className="sidebar-version">v3.0.0</div>
      </aside>

      <main className="dashboard-main">
        {/* Header Topbar */}
        <header className="global-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={sidebarOpen ? "ย่อเมนู" : "ขยายเมนู"}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <h1 className="topbar-title">{config.organizationName}</h1>
          </div>

          <div className="topbar-middle-text">
            ระบบจัดการข้อมูลวัสดุ ขยะ และออกรายงาน
          </div>

          <div className="global-actions">


            <div className="theme-switch" aria-label="เลือกธีมสี">
              <button
                type="button"
                className={theme === "mint" ? "selected" : ""}
                onClick={() => setTheme("mint")}
                aria-label="ธีมสีมิ้นท์"
              >
                Mint
              </button>
              <button
                type="button"
                className={theme === "gold" ? "selected" : ""}
                onClick={() => setTheme("gold")}
                aria-label="ธีมสีทอง"
              >
                Gold
              </button>
            </div>

            <div className="account-chip">
              <span>{(profileState.profile?.full_name || session?.user?.email || "U").slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{profileState.profile?.full_name || session?.user?.email}</strong>
                <small>{roleLabels[profileState.profile?.role] || profileState.profile?.role || "ไม่ทราบสิทธิ์"}</small>
              </div>
            </div>

            <button className="logout-button" type="button" onClick={() => signOut()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </header>

        {profileState.error ? (
          <section className="connection-error page-error" role="alert">
            <div>
              <p className="eyebrow">Profile Error</p>
              <h2>โหลด Profile และสิทธิ์ไม่สำเร็จ</h2>
              <p>{profileState.error.message}</p>
              <code>{profileState.error.url || `${config.apiUrl}/api/me`}</code>
            </div>
            <button className="primary-button compact" type="button" onClick={loadProfile}>ลองใหม่</button>
          </section>
        ) : (
          <Outlet context={{ config, api, profile: profileState.profile, permissions: profileState.permissions, refreshProfile: loadProfile, theme }} />
        )}
      </main>
    </div>
  );
}


