import { useState, useEffect, useCallback, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { BarChart3, TrendingUp, Calendar, Award } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { analyticsModules, formatNumber } from "../lib/analytics.js";

const currentYear = new Date().getFullYear();

const REDUCTION_MODULES = ["waste", "tissue", "animal_feed", "garbage_bag", "consumable"];

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function yearOptions() {
  return Array.from({ length: 8 }, (_, i) => currentYear - 5 + i);
}

export function ComparisonPage() {
  const { api } = useOutletContext();

  // Selected module (e.g. waste, tissue)
  const [module, setModule] = useState("waste");

  // ControlLayout States
  const [currentMode, setCurrentMode] = useState("A"); // 'A' | 'B' | 'C' | 'D'
  const [currentChartType, setCurrentChartType] = useState("bar"); // 'line' | 'bar'
  
  // Base parameters
  const [selectedYearA, setSelectedYearA] = useState(currentYear - 1);
  const [selectedYearB, setSelectedYearB] = useState(currentYear);
  
  const [selectedMonthA, setSelectedMonthA] = useState(1); // 1-12
  const [selectedMonthB, setSelectedMonthB] = useState(2); // 1-12

  const [quarterA, setQuarterA] = useState(1); // 1-4
  const [quarterB, setQuarterB] = useState(2); // 1-4

  // Collapsible widget states
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  // Admin Override States
  const [sourceMapping, setSourceMapping] = useState("daily_entries -> master_categories");
  const [multiplier, setMultiplier] = useState("1.0");
  const [adminLogs, setAdminLogs] = useState([
    { time: "21:30:12", user: "Tong (Owner)", action: "สลับโหมดการดูข้อมูลเปรียบเทียบเชิงลึก" },
    { time: "20:15:45", user: "Admin", action: "อัปเดต Source Mapping ประจำเดือน" }
  ]);

  const [state, setState] = useState({ loading: false, data: null, error: null });

  const isReductionModule = REDUCTION_MODULES.includes(module);

  // Map modes A, B, C, D to API endpoints and parameters
  const apiParams = useMemo(() => {
    let modeParam = "month";
    let breakdownParam = "category";
    let periodAParam = "";
    let periodBParam = "";

    if (currentMode === "A") {
      // Month vs Month
      modeParam = "month";
      breakdownParam = "category";
      periodAParam = `${selectedYearA}-${String(selectedMonthA).padStart(2, "0")}`;
      periodBParam = `${selectedYearB}-${String(selectedMonthB).padStart(2, "0")}`;
    } else if (currentMode === "B") {
      // Quarter vs Quarter
      modeParam = "quarter";
      breakdownParam = "category";
      periodAParam = `${selectedYearA}-Q${quarterA}`;
      periodBParam = `${selectedYearB}-Q${quarterB}`;
    } else if (currentMode === "C") {
      // Year vs Year
      modeParam = "year";
      breakdownParam = "category";
      periodAParam = String(selectedYearA);
      periodBParam = String(selectedYearB);
    } else if (currentMode === "D") {
      // Macro Overview of selectedYearB
      modeParam = "year";
      breakdownParam = "month";
      periodAParam = String(selectedYearB);
      periodBParam = String(selectedYearB);
    }

    return {
      mode: modeParam,
      breakdown: breakdownParam,
      periodA: periodAParam,
      periodB: periodBParam
    };
  }, [currentMode, selectedYearA, selectedYearB, selectedMonthA, selectedMonthB, quarterA, quarterB]);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const metric = module === "scrap_sales" ? "amount" : "quantity";
      let rawData;

      if (currentMode === "D") {
        // Mode D fetches the yearly analytics breakdown of selectedYearB
        const params = new URLSearchParams({
          module,
          view: "yearly",
          year: String(selectedYearB),
          metric
        });
        rawData = await api.request(`/api/analytics?${params.toString()}`);
      } else {
        // Mode A, B, C fetch from compare endpoint
        const params = new URLSearchParams({
          module,
          mode: apiParams.mode,
          breakdown: apiParams.breakdown,
          periodA: apiParams.periodA,
          periodB: apiParams.periodB,
          metric
        });
        rawData = await api.request(`/api/analytics/compare?${params.toString()}`);
      }

      // Apply Admin manual multiplier override
      const mult = parseFloat(multiplier) || 1.0;
      if (mult !== 1.0) {
        if (rawData?.rows) {
          rawData.rows = rawData.rows.map(row => {
            if (currentMode === "D") {
              const newValues = {};
              Object.keys(row.values || {}).forEach(k => {
                newValues[k] = Math.round(row.values[k] * mult * 100) / 100;
              });
              return {
                ...row,
                values: newValues,
                total: Math.round(row.total * mult * 100) / 100
              };
            } else {
              return {
                ...row,
                valueA: Math.round(row.valueA * mult * 100) / 100,
                valueB: Math.round(row.valueB * mult * 100) / 100,
                difference: Math.round((row.valueB * mult - row.valueA * mult) * 100) / 100,
              };
            }
          });
        }
        if (rawData.summary) {
          rawData.summary.totalA = Math.round(rawData.summary.totalA * mult * 100) / 100;
          rawData.summary.totalB = Math.round(rawData.summary.totalB * mult * 100) / 100;
          rawData.summary.difference = Math.round((rawData.summary.totalB - rawData.summary.totalA) * 100) / 100;
        }
        if (rawData.categories) {
          rawData.categories = rawData.categories.map(c => ({
            ...c,
            total: Math.round(c.total * mult * 100) / 100
          }));
        }
      }

      setState({ loading: false, data: rawData, error: null });
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
  }, [api, module, currentMode, apiParams, selectedYearB, multiplier]);

  useEffect(() => {
    load();
  }, [load]);

  const moduleLabel = analyticsModules.find(m => m.id === module)?.label || module;

  // Chart Data preparation
  const chartData = useMemo(() => {
    if (!state.data?.rows) return [];
    if (currentMode === "D") {
      // Map Mode D rows to Recharts friendly format
      return state.data.rows.map(row => {
        // label format: "2026-01"
        const mPart = parseInt(row.label.split("-")[1], 10);
        return {
          label: THAI_MONTHS_SHORT[mPart - 1] || row.label,
          TOTAL: row.total,
          ...row.values
        };
      });
    }
    return state.data.rows;
  }, [state.data, currentMode]);

  // Pie Chart Data (Used in Mode D for Quarter comparison)
  const pieData = useMemo(() => {
    if (currentMode !== "D" || !state.data?.rows) return [];
    
    let q1 = 0, q2 = 0, q3 = 0, q4 = 0;
    
    state.data.rows.forEach(r => {
      const m = parseInt(r.label.split("-")[1], 10);
      if (m >= 1 && m <= 3) q1 += r.total || 0;
      else if (m >= 4 && m <= 6) q2 += r.total || 0;
      else if (m >= 7 && m <= 9) q3 += r.total || 0;
      else if (m >= 10 && m <= 12) q4 += r.total || 0;
    });

    return [
      { name: "ไตรมาส 1 (Q1)", value: Math.round(q1), color: "#38bdf8" },
      { name: "ไตรมาส 2 (Q2)", value: Math.round(q2), color: "#10b981" },
      { name: "ไตรมาส 3 (Q3)", value: Math.round(q3), color: "#f59e0b" },
      { name: "ไตรมาส 4 (Q4)", value: Math.round(q4), color: "#ec4899" }
    ].filter(q => q.value > 0);
  }, [currentMode, state.data]);

  // Color Coding
  const COLOR_A = "#38bdf8"; // Sky Blue
  const COLOR_B = "#10b981"; // Emerald Green

  function varianceColor(percent) {
    if (percent === null || percent === undefined) return "";
    if (isReductionModule) {
      return percent < 0 ? "var-positive" : percent > 0 ? "var-negative" : "";
    } else {
      return percent > 0 ? "var-positive" : percent < 0 ? "var-negative" : "";
    }
  }

  function varianceIcon(percent) {
    if (percent === null || percent === undefined) return "—";
    if (percent < 0) return "▼";
    if (percent > 0) return "▲";
    return "—";
  }

  const handleApplyOverride = (e) => {
    e.preventDefault();
    const newLog = {
      time: new Date().toTimeString().slice(0, 8),
      user: "Tong (Owner)",
      action: `ปรับสูตรตัวคูณข้อมูลดิบเป็น ${multiplier}x และเชื่อม Source: ${sourceMapping}`
    };
    setAdminLogs(prev => [newLog, ...prev]);
    load();
  };

  const modes = [
    { id: "A", label: "เดือน เทียบ เดือน", icon: Calendar, description: "เปรียบเทียบรายเดือนเชิงลึก" },
    { id: "B", label: "ไตรมาส เทียบ ไตรมาส", icon: BarChart3, description: "วิเคราะห์ไตรมาสต่อไตรมาส" },
    { id: "C", label: "ปี เทียบ ปี", icon: TrendingUp, description: "ภาพรวมปีต่อปี" },
    { id: "D", label: "ภาพรวมใหญ่", icon: Award, description: "สรุปรายเดือนและวงกลมไตรมาส" },
  ];

  const chartTypes = [
    { id: "line", label: "กราฟเส้น", icon: TrendingUp },
    { id: "bar", label: "กราฟแท่ง", icon: BarChart3 },
  ];

  const summary = state.data?.summary;
  const categoriesList = state.data?.categories || [];

  return (
    <>
      {/* Page Heading */}
      <section className="page-heading">
        <div>
          <p className="eyebrow">Data Comparison</p>
          <h1>เปรียบเทียบข้อมูล</h1>
          <p>วิเคราะห์ข้อมูลเปรียบเทียบเชิงลึกด้วยระบบควบคุม 2 ชั้น พร้อมกราฟ Recharts แบบมีอนิเมชั่น</p>
        </div>
        <div className="page-heading-actions">
          {/* Module Select */}
          <label className="comparison-filter-select" style={{ minWidth: "180px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>หมวดข้อมูล</span>
            <select
              value={module}
              onChange={e => setModule(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--border)", fontSize: "0.88rem", fontWeight: "600" }}
            >
              {analyticsModules.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* DUAL-CONTROL INTERFACE */}
      <div className="space-y-6">
        
        {/* 1. View Mode Selector */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">
          <p className="text-sm text-gray-500 mb-4 font-medium">เลือกโหมดการเปรียบเทียบ</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {modes.map((modeItem) => {
              const Icon = modeItem.icon;
              const isActive = currentMode === modeItem.id;
              return (
                <button
                  key={modeItem.id}
                  onClick={() => {
                    setCurrentMode(modeItem.id);
                    // Default chart type to bar for Mode D
                    if (modeItem.id === "D") setCurrentChartType("bar");
                  }}
                  className={`p-5 rounded-2xl flex flex-col items-center gap-3 transition-all border-2 ${
                    isActive
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-950 shadow-md"
                      : "border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  style={{ cursor: "pointer" }}
                >
                  <div className={`p-3 rounded-xl ${isActive ? "bg-teal-100 dark:bg-teal-900" : "bg-gray-100 dark:bg-gray-800"}`}>
                    <Icon size={28} className={isActive ? "text-teal-600" : "text-gray-500"} />
                  </div>
                  <div className="text-center">
                    <div className={`font-semibold ${isActive ? "text-teal-700 dark:text-teal-300" : "text-gray-700 dark:text-gray-300"}`}>
                      {modeItem.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{modeItem.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Secondary Controls */}
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          
          {/* Parameter Selectors */}
          <div className="flex-1 flex gap-4 w-full">
            {currentMode === "A" && (
              // Mode A: Month vs Month Selectors
              <>
                <div className="flex-1 flex gap-2">
                  <div style={{ flex: 1 }}>
                    <label className="block text-sm text-gray-500 mb-2">ปี A (ฐาน)</label>
                    <select
                      value={selectedYearA}
                      onChange={(e) => setSelectedYearA(Number(e.target.value))}
                      className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                    >
                      {yearOptions().map(y => (
                        <option key={y} value={y}>{y + 543} ({y})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="block text-sm text-gray-500 mb-2">เดือน A</label>
                    <select
                      value={selectedMonthA}
                      onChange={(e) => setSelectedMonthA(Number(e.target.value))}
                      className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                    >
                      {THAI_MONTHS.map((mName, idx) => (
                        <option key={idx} value={idx + 1}>{mName}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex-1 flex gap-2">
                  <div style={{ flex: 1 }}>
                    <label className="block text-sm text-gray-500 mb-2">ปี B (เปรียบเทียบ)</label>
                    <select
                      value={selectedYearB}
                      onChange={(e) => setSelectedYearB(Number(e.target.value))}
                      className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                    >
                      {yearOptions().map(y => (
                        <option key={y} value={y}>{y + 543} ({y})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="block text-sm text-gray-500 mb-2">เดือน B</label>
                    <select
                      value={selectedMonthB}
                      onChange={(e) => setSelectedMonthB(Number(e.target.value))}
                      className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                    >
                      {THAI_MONTHS.map((mName, idx) => (
                        <option key={idx} value={idx + 1}>{mName}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {currentMode === "B" && (
              // Mode B: Quarter vs Quarter Selectors
              <>
                <div className="flex-1 flex gap-2">
                  <div style={{ flex: 1 }}>
                    <label className="block text-sm text-gray-500 mb-2">ปี A (ฐาน)</label>
                    <select
                      value={selectedYearA}
                      onChange={(e) => setSelectedYearA(Number(e.target.value))}
                      className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                    >
                      {yearOptions().map(y => (
                        <option key={y} value={y}>{y + 543} ({y})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="block text-sm text-gray-500 mb-2">ไตรมาส A</label>
                    <select
                      value={quarterA}
                      onChange={(e) => setQuarterA(Number(e.target.value))}
                      className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                    >
                      {[1, 2, 3, 4].map(q => (
                        <option key={q} value={q}>ไตรมาส {q} (Q{q})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex-1 flex gap-2">
                  <div style={{ flex: 1 }}>
                    <label className="block text-sm text-gray-500 mb-2">ปี B (เปรียบเทียบ)</label>
                    <select
                      value={selectedYearB}
                      onChange={(e) => setSelectedYearB(Number(e.target.value))}
                      className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                    >
                      {yearOptions().map(y => (
                        <option key={y} value={y}>{y + 543} ({y})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="block text-sm text-gray-500 mb-2">ไตรมาส B</label>
                    <select
                      value={quarterB}
                      onChange={(e) => setQuarterB(Number(e.target.value))}
                      className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                    >
                      {[1, 2, 3, 4].map(q => (
                        <option key={q} value={q}>ไตรมาส {q} (Q{q})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {currentMode === "C" && (
              // Mode C: Year vs Year Selectors
              <>
                <div className="flex-1">
                  <label className="block text-sm text-gray-500 mb-2">ปี A (ฐาน)</label>
                  <select
                    value={selectedYearA}
                    onChange={(e) => setSelectedYearA(Number(e.target.value))}
                    className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                  >
                    {yearOptions().map(y => (
                      <option key={y} value={y}>{y + 543} ({y})</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-500 mb-2">ปี B (เปรียบเทียบ)</label>
                  <select
                    value={selectedYearB}
                    onChange={(e) => setSelectedYearB(Number(e.target.value))}
                    className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                  >
                    {yearOptions().map(y => (
                      <option key={y} value={y}>{y + 543} ({y})</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {currentMode === "D" && (
              // Mode D: Single Year Selector
              <div className="flex-1">
                <label className="block text-sm text-gray-500 mb-2">เลือกปีวิเคราะห์ข้อมูล</label>
                <select
                  value={selectedYearB}
                  onChange={(e) => setSelectedYearB(Number(e.target.value))}
                  className="w-full p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-teal-500"
                >
                  {yearOptions().map(y => (
                      <option key={y} value={y}>ปี {y + 543} ({y})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Chart Type Switcher (Only visible when not Mode D or customized) */}
          {currentMode !== "D" && (
            <div className="flex-shrink-0">
              <label className="block text-sm text-gray-500 mb-2">ประเภทกราฟ</label>
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
                {chartTypes.map((type) => {
                  const Icon = type.icon;
                  const isActive = currentChartType === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => setCurrentChartType(type.id)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-[14px] font-medium transition-all ${
                        isActive
                          ? "bg-white dark:bg-gray-900 shadow-sm text-teal-600"
                          : "text-gray-600 dark:text-gray-400 hover:bg-white/60"
                      }`}
                      style={{ cursor: "pointer", border: "none" }}
                    >
                      <Icon size={20} />
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* MAIN DATA CONTENT (Chart & Summary Grid) */}
      {currentMode === "D" ? (
        // MODE D (ภาพรวมใหญ่): Multi-bar Monthly breakdown + Quarterly Pie Chart
        <div style={{ marginTop: "24px" }} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 1. Monthly Multi-Bar Trend (X-axis is Months, bars are categories + Total) */}
            <div className="lg:col-span-8 quality-list-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", margin: "0" }}>
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Monthly Category Comparison</p>
                  <h2>เปรียบเทียบข้อมูลรายเดือนของปี {selectedYearB + 543} ({selectedYearB})</h2>
                </div>
              </div>
              <div style={{ padding: "20px 24px", height: "350px", width: "100%" }}>
                {chartData.length > 0 && !state.loading ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderRadius: "10px" }}
                        labelStyle={{ color: "var(--accent-strong)", fontWeight: "bold" }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="rect" />
                      
                      {/* Render category series dynamically */}
                      {categoriesList.map((cat, idx) => (
                        <Bar key={idx} dataKey={cat.code} name={cat.name_th} fill={cat.color_hex || COLOR_A} radius={[3, 3, 0, 0]} maxBarSize={30} />
                      ))}
                      {/* Add Total Bar (Exactly matching user's Excel style) */}
                      <Bar dataKey="TOTAL" name="Total" fill="#0284c7" radius={[3, 3, 0, 0]} maxBarSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "var(--text-muted)" }}>
                    {state.loading ? "กำลังโหลดข้อมูล..." : "ไม่มีข้อมูล"}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Quarterly Pie Chart */}
            <div className="lg:col-span-4 quality-list-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", margin: "0", display: "flex", flexDirection: "column" }}>
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Quarterly Share</p>
                  <h2>สัดส่วนข้อมูลรายไตรมาส (Pie Chart)</h2>
                </div>
              </div>
              <div style={{ padding: "10px", flex: 1, minHeight: "280px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                {pieData.length > 0 && !state.loading ? (
                  <>
                    <div style={{ width: "100%", height: "200px" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => `${formatNumber(v)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div style={{ display: "flex", flexWrap: "wrap", justifyContext: "center", gap: "10px", fontSize: "0.75rem", marginTop: "10px", width: "100%", padding: "0 10px" }}>
                      {pieData.map((q, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: q.color }}></span>
                          <span>{q.name} ({formatNumber(q.value)})</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: "var(--text-muted)" }}>
                    {state.loading ? "กำลังโหลดข้อมูล..." : "ไม่มีข้อมูลสำหรับสร้างกราฟวงกลม"}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      ) : (
        // MODE A, B, C: Side-by-Side Comparison (Line or Bar)
        <section className="quality-list-card" style={{ marginTop: "24px", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="card-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="eyebrow">Interactive Recharts Engine</p>
              <h2>
                กราฟวิเคราะห์ข้อมูลเปรียบเทียบ — {moduleLabel}{" "}
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: "normal" }}>
                  ({state.data?.periodA?.label} vs {state.data?.periodB?.label})
                </span>
              </h2>
            </div>
            <div style={{ display: "flex", gap: "16px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: COLOR_A }}></span>
                {state.data?.periodA?.label || "ช่วง A (ฐาน)"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: COLOR_B }}></span>
                {state.data?.periodB?.label || "ช่วง B (เปรียบเทียบ)"}
              </span>
            </div>
          </div>

          <div style={{ padding: "20px 24px", height: "350px", width: "100%" }}>
            {chartData.length > 0 && !state.loading ? (
              <ResponsiveContainer width="100%" height="100%">
                {currentChartType === "line" ? (
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderRadius: "10px" }}
                      labelStyle={{ color: "var(--accent-strong)", fontWeight: "bold" }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line type="monotone" dataKey="valueA" name={state.data?.periodA?.label || "ช่วง A"} stroke={COLOR_A} strokeWidth={3} activeDot={{ r: 8 }} />
                    <Line type="monotone" dataKey="valueB" name={state.data?.periodB?.label || "ช่วง B"} stroke={COLOR_B} strokeWidth={3} activeDot={{ r: 8 }} />
                  </LineChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderRadius: "10px" }}
                      labelStyle={{ color: "var(--accent-strong)", fontWeight: "bold" }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="rect" />
                    <Bar dataKey="valueA" name={state.data?.periodA?.label || "ช่วง A"} fill={COLOR_A} radius={[4, 4, 0, 0]} maxBarSize={45} />
                    <Bar dataKey="valueB" name={state.data?.periodB?.label || "ช่วง B"} fill={COLOR_B} radius={[4, 4, 0, 0]} maxBarSize={45} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "var(--text-muted)" }}>
                {state.loading ? "กำลังโหลดข้อมูลกราฟ..." : "ไม่มีข้อมูลสำหรับแสดงกราฟเปรียบเทียบ"}
              </div>
            )}
          </div>
        </section>
      )}

      {/* KPI Summary Cards */}
      {summary && !state.loading && (
        <section className="analytics-kpi-grid" style={{ marginTop: "24px" }}>
          <article>
            <span>ยอดรวม — {state.data?.periodA?.label || "ช่วง A"}</span>
            <strong>{formatNumber(summary.totalA)} <small>{state.data?.unit}</small></strong>
            <em>ฐานเปรียบเทียบ</em>
          </article>
          <article>
            <span>ยอดรวม — {state.data?.periodB?.label || "ช่วง B"}</span>
            <strong>{formatNumber(summary.totalB)} <small>{state.data?.unit}</small></strong>
            <em>ช่วงเปรียบเทียบ</em>
          </article>
          <article>
            <span>ผลต่างสุทธิ</span>
            <strong className={summary.difference >= 0 ? "var-positive" : "var-negative"}>
              {summary.difference >= 0 ? "+" : ""}{formatNumber(summary.difference)} <small>{state.data?.unit}</small>
            </strong>
            <em>{summary.difference > 0 ? "เพิ่มขึ้น" : summary.difference < 0 ? "ลดลง" : "เท่าเดิม"}</em>
          </article>
          <article className={varianceColor(summary.percent)}>
            <span>Variance %</span>
            <strong>{summary.percent !== null ? `${summary.percent >= 0 ? "+" : ""}${formatNumber(summary.percent)}%` : "—"}</strong>
            <em>{isReductionModule ? (summary.percent < 0 ? "ผ่านเกณฑ์ 🟢" : summary.percent > 0 ? "ต้องเฝ้าระวัง 🔴" : "ทรงตัว") : (summary.percent > 0 ? "ดีขึ้น 🟢" : summary.percent < 0 ? "ต้องปรับปรุง 🔴" : "ทรงตัว")}</em>
          </article>
        </section>
      )}

      {/* Comparison Table */}
      {state.data && !state.loading && (
        <section className="quality-list-card" style={{ marginTop: "24px" }}>
          <div className="card-heading">
            <div>
              <p className="eyebrow">Data Summary Table</p>
              <h2>
                {currentMode === "D" 
                  ? `ตารางข้อมูลรายเดือนปี ${selectedYearB + 543} (${selectedYearB})`
                  : `ตารางเปรียบเทียบ ${moduleLabel} — ${state.data?.periodA?.label} vs ${state.data?.periodB?.label}`
                }
              </h2>
            </div>
          </div>
          <div className="table-scroll">
            <table className="v3-data-table comparison-table">
              <thead>
                {currentMode === "D" ? (
                  // Mode D: Monthly listing table header
                  <tr>
                    <th>เดือน</th>
                    {categoriesList.map((cat, idx) => (
                      <th key={idx} className="numeric-cell">{cat.name_th}</th>
                    ))}
                    <th className="numeric-cell">รวมสุทธิ ({state.data?.unit})</th>
                  </tr>
                ) : (
                  // Modes A, B, C: Side-by-Side compare table header
                  <tr>
                    <th style={{ minWidth: "140px" }}>ประเภท</th>
                    <th className="numeric-cell">{state.data?.periodA?.label || "ช่วง A"}</th>
                    <th className="numeric-cell">{state.data?.periodB?.label || "ช่วง B"}</th>
                    <th className="numeric-cell">ผลต่าง</th>
                    <th className="numeric-cell" style={{ minWidth: "100px" }}>Variance %</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {currentMode === "D" ? (
                  // Mode D: Monthly listing table rows
                  (state.data?.rows || []).map((row, idx) => {
                    const mPart = parseInt(row.label.split("-")[1], 10);
                    const mLabel = THAI_MONTHS[mPart - 1] || row.label;
                    return (
                      <tr key={idx}>
                        <td><strong>{mLabel}</strong></td>
                        {categoriesList.map((cat, catIdx) => (
                          <td key={catIdx} className="numeric-cell">{formatNumber(row.values?.[cat.code])}</td>
                        ))}
                        <td className="numeric-cell"><strong>{formatNumber(row.total)}</strong></td>
                      </tr>
                    );
                  })
                ) : (
                  // Modes A, B, C: Side-by-Side comparison table rows
                  (state.data?.rows || []).map((row, idx) => {
                    const vc = varianceColor(row.percent);
                    return (
                      <tr key={idx}>
                        <td>
                          {row.color && <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: row.color, marginRight: "8px", verticalAlign: "middle" }} />}
                          {row.label}
                        </td>
                        <td className="numeric-cell">{formatNumber(row.valueA)}</td>
                        <td className="numeric-cell">{formatNumber(row.valueB)}</td>
                        <td className={`numeric-cell ${vc}`}>
                          <strong>{row.difference >= 0 ? "+" : ""}{formatNumber(row.difference)}</strong>
                        </td>
                        <td className={`numeric-cell ${vc}`}>
                          <span className="comparison-variance-badge">
                            {varianceIcon(row.percent)}{" "}
                            {row.percent !== null ? `${row.percent >= 0 ? "+" : ""}${formatNumber(row.percent)}%` : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                {currentMode === "D" ? (
                  // Mode D: Summary row
                  <tr className="comparison-summary-row">
                    <td><strong>รวมทั้งหมด</strong></td>
                    {categoriesList.map((cat, catIdx) => (
                      <td key={catIdx} className="numeric-cell"><strong>{formatNumber(cat.total)}</strong></td>
                    ))}
                    <td className="numeric-cell"><strong>{formatNumber(summary?.grandTotal)}</strong></td>
                  </tr>
                ) : (
                  // Modes A, B, C: Summary row
                  <tr className="comparison-summary-row">
                    <td><strong>รวมทั้งหมด</strong></td>
                    <td className="numeric-cell"><strong>{formatNumber(summary?.totalA)}</strong></td>
                    <td className="numeric-cell"><strong>{formatNumber(summary?.totalB)}</strong></td>
                    <td className={`numeric-cell ${varianceColor(summary?.percent)}`}>
                      <strong>{summary?.difference >= 0 ? "+" : ""}{formatNumber(summary?.difference)}</strong>
                    </td>
                    <td className={`numeric-cell ${varianceColor(summary?.percent)}`}>
                      <strong className="comparison-variance-badge">
                        {varianceIcon(summary?.percent)}{" "}
                        {summary?.percent !== null ? `${summary.percent >= 0 ? "+" : ""}${formatNumber(summary.percent)}%` : "—"}
                      </strong>
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* ADMIN & OWNER WIDGETS */}
      <section className="space-y-6" style={{ marginTop: "24px" }}>
        
        {/* Admin Specification console */}
        <div className="quality-list-card" style={{ padding: "0", overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setIsAdminOpen(!isAdminOpen)}
            style={{
              width: "100%",
              padding: "16px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--surface-muted)",
              border: "none",
              borderBottom: isAdminOpen ? "1px solid var(--border)" : "none",
              cursor: "pointer",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#0d9488" }}></span>
              <div>
                <h3 style={{ margin: "0", fontSize: "0.88rem", fontWeight: "700" }}>🛠️ Admin Specification Console</h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>ระบบแอดมินสำหรับแมปแหล่งข้อมูล และปรับตั้งสูตรคำนวณแบบแมนนวล</p>
              </div>
            </div>
            <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--text-muted)" }}>
              {isAdminOpen ? "COLLAPSE [-]" : "EXPAND [+]"}
            </span>
          </button>

          {isAdminOpen && (
            <div style={{ padding: "20px 24px", background: "var(--surface)" }}>
              <form onSubmit={handleApplyOverride} style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "bold" }}>Database Data Source Mapping</span>
                  <input
                    type="text"
                    value={sourceMapping}
                    onChange={e => setSourceMapping(e.target.value)}
                    style={{ padding: "10px 14px", borderRadius: "12px", border: "1px solid var(--border)", fontSize: "0.88rem" }}
                  />
                </div>
                <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "bold" }}>Manual Override Formula (ตัวคูณข้อมูล)</span>
                  <input
                    type="text"
                    value={multiplier}
                    onChange={e => setMultiplier(e.target.value)}
                    style={{ padding: "10px 14px", borderRadius: "12px", border: "1px solid var(--border)", fontSize: "0.88rem" }}
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    className="primary-button"
                    style={{ padding: "12px 24px", borderRadius: "12px", fontWeight: "bold", fontSize: "0.88rem" }}
                  >
                    Apply Override Config
                  </button>
                </div>
              </form>
              <div style={{ marginTop: "16px", padding: "12px 16px", borderRadius: "12px", background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: "var(--accent-strong)" }}>💡 คำอธิบายแอดมิน:</span>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  คุณสามารถกรอกตัวเลขในช่อง **Manual Override Formula** เพื่อจำลองปรับสูตรข้อมูลดิบ (เช่น กรอก `1.2` เพื่อจำลองข้อมูลเพิ่มขึ้น 20% หรือ `0.8` เพื่อจำลองข้อมูลลดลง 20%) ระบบเปรียบเทียบทั้งตารางและกราฟจะอัปเดตแบบเรียลไทม์ทันที
                </p>
              </div>
            </div>
          )}
        </div>

        {/* System Owner logs panel */}
        <div className="quality-list-card" style={{ padding: "0", overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setIsLogsOpen(!isLogsOpen)}
            style={{
              width: "100%",
              padding: "16px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--surface-muted)",
              border: "none",
              borderBottom: isLogsOpen ? "1px solid var(--border)" : "none",
              cursor: "pointer",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#38bdf8" }}></span>
              <div>
                <h3 style={{ margin: "0", fontSize: "0.88rem", fontWeight: "700" }}>📋 System Owner Logs Panel</h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>บันทึกกิจกรรมระบบหลักและรายงานความเปลี่ยนแปลงการกระทำเชิงลึก</p>
              </div>
            </div>
            <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--text-muted)" }}>
              {isLogsOpen ? "COLLAPSE [-]" : "EXPAND [+]"}
            </span>
          </button>

          {isLogsOpen && (
            <div style={{ padding: "20px 24px", background: "var(--surface)" }}>
              <div className="table-scroll">
                <table className="v3-data-table" style={{ width: "100%", fontSize: "0.75rem" }}>
                  <thead>
                    <tr>
                      <th style={{ pb: "8px", fontWeight: "bold" }}>เวลา</th>
                      <th style={{ pb: "8px", fontWeight: "bold" }}>ผู้ใช้งาน</th>
                      <th style={{ pb: "8px", fontWeight: "bold" }}>การดำเนินการ</th>
                      <th style={{ pb: "8px", fontWeight: "bold", textAlign: "right" }}>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{log.time}</td>
                        <td style={{ fontWeight: "bold" }}>{log.user}</td>
                        <td>{log.action}</td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "2px 8px", borderRadius: "12px", fontSize: "0.7rem", fontWeight: "bold" }}>
                            สำเร็จ
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </section>

      {state.loading && (
        <section style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
          <p style={{ fontSize: "1.2rem" }}>กำลังโหลดข้อมูลเปรียบเทียบ...</p>
        </section>
      )}
    </>
  );
}
