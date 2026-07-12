function safeRequire(packageName) {
  try {
    return require(packageName);
  } catch (error) {
    const isDirectMissingDependency = error && error.code === 'MODULE_NOT_FOUND' && String(error.message || '').includes(packageName);
    if (isDirectMissingDependency) {
      console.error('\nMissing backend dependency: ' + packageName);
      console.error('Run these commands from PowerShell:');
      console.error('  cd C:\\Users\\Administrator\\Desktop\\ckap-v3\\backend');
      console.error('  npm install');
      console.error('  npm start\n');
      process.exit(1);
    }
    throw error;
  }
}

const majorNodeVersion = Number(process.versions.node.split('.')[0]);
if (majorNodeVersion >= 22) {
  console.warn('Warning: local Node.js ' + process.version + ' detected. Render is pinned to Node 20.18.0. If npm install fails locally, install Node 20 LTS.');
}

const express = safeRequire('express');
const cors = safeRequire('cors');
const helmet = safeRequire('helmet');
const { z } = safeRequire('zod');
const { createClient } = safeRequire('@supabase/supabase-js');
const pptxgen = safeRequire('pptxgenjs');
safeRequire('dotenv').config();

const multer = safeRequire('multer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const VERSION = '3.0.9-production-ready';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

const MODULES = {
  rdf: 'RDF',
  dog_food: 'อาหารหมา',
  pig_feed: 'อาหารหมู',
  wet_waste: 'ขยะเปียก',
  recycle: 'รีไซเคิล',
  tissue: 'กระดาษทิชชู่',
  black_bag: 'ถุงดำ',
  consumable: 'ของใช้สิ้นเปลือง'
};

const MODULE_ORDER = ['rdf', 'dog_food', 'pig_feed', 'wet_waste', 'recycle', 'tissue', 'black_bag', 'consumable'];
const ALL_PERMISSIONS = [
  'dashboard.read',
  'entries.read', 'entries.create', 'entries.edit', 'entries.delete', 'entries.import', 'entries.export',
  'quality.read',
  'insights.read',
  'charts.read', 'charts.export',
  'reports.preview', 'reports.export', 'reports.presets.manage',
  'users.read', 'users.manage',
  'roles.read', 'roles.manage',
  'audit.read',
  'automation.read', 'automation.manage', 'automation.run',
  'settings.manage'
];

function requireSupabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      error: 'Supabase is not configured',
      details: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render environment variables.'
    });
  }
  return next();
}

function monthStart(value) {
  if (!value || !/^\d{4}-\d{2}/.test(value)) return null;
  return `${value.slice(0, 7)}-01`;
}

function cleanDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toNumberOrNull(value) {
  if (value === '' || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: digits });
}

function normalizeEntry(input) {
  const entryDate = cleanDate(input.entry_date || input.date || monthStart(input.month));
  const periodMonth = monthStart(input.period_month || input.month || entryDate);
  const weight = toNumberOrNull(input.weight_kg);
  const quantity = toNumberOrNull(input.quantity);
  const unitPrice = toNumberOrNull(input.unit_price);
  const explicitAmount = toNumberOrNull(input.amount);
  const computedAmount = weight !== null && unitPrice !== null ? weight * unitPrice : explicitAmount;

  return {
    module: input.module,
    category_code: input.category_code || null,
    entry_date: entryDate,
    period_month: periodMonth,
    material_name: input.material_name || input.material || null,
    weight_kg: weight,
    quantity,
    unit: input.unit || 'kg',
    unit_price: unitPrice,
    amount: Number.isFinite(computedAmount) ? Number(computedAmount.toFixed(2)) : null,
    notes: input.notes || null,
    metadata: input.metadata || {}
  };
}

const entrySchema = z.object({
  module: z.enum(['rdf', 'dog_food', 'pig_feed', 'wet_waste', 'recycle', 'tissue', 'black_bag', 'consumable']),
  category_code: z.string().optional().nullable(),
  entry_date: z.string().optional(),
  date: z.string().optional(),
  month: z.string().optional(),
  period_month: z.string().optional(),
  material_name: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  weight_kg: z.union([z.number(), z.string()]).optional().nullable(),
  quantity: z.union([z.number(), z.string()]).optional().nullable(),
  unit: z.string().optional(),
  unit_price: z.union([z.number(), z.string()]).optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional()
});

async function getRolePermissions(role) {
  if (!supabase) return ALL_PERMISSIONS;
  if (role === 'owner') return ALL_PERMISSIONS;
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .eq('role_key', role)
    .eq('allowed', true);
  if (error) {
    if (String(error.message || '').includes('role_permissions')) return ALL_PERMISSIONS;
    throw error;
  }
  return (data || []).map(row => row.permission_key);
}

async function getUserOverrides(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('user_permission_overrides')
    .select('permission_key, allowed')
    .eq('user_id', userId);
  if (error) {
    if (String(error.message || '').includes('user_permission_overrides')) return [];
    throw error;
  }
  return data || [];
}

async function hydrateUserPermissions(user) {
  const rolePermissions = await getRolePermissions(user.role || 'viewer');
  const permissionSet = new Set(rolePermissions);
  for (const override of await getUserOverrides(user.id)) {
    if (override.allowed) permissionSet.add(override.permission_key);
    else permissionSet.delete(override.permission_key);
  }
  return { ...user, permissions: Array.from(permissionSet) };
}

async function resolveUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !supabase) return { id: null, display_name: 'Unauthenticated', role: 'blocked', permissions: [] };
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return { id: null, display_name: 'Invalid session', role: 'blocked', permissions: [] };
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
  if (profileError || !profile || !profile.active) {
    return { id: authData.user.id, email: authData.user.email, display_name: 'Profile unavailable', role: 'blocked', permissions: [], profileExists: false };
  }
  const hydrated = await hydrateUserPermissions(profile);
  return { ...hydrated, profileExists: true };
}

app.use(async (req, res, next) => {
  try {
    req.user = await resolveUser(req);
    next();
  } catch (error) {
    res.status(500).json({ error: 'Permission bootstrap failed', details: error.message });
  }
});

function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = new Set(req.user?.permissions || []);
    if (req.user?.role === 'owner' || permissions.has(permission)) return next();
    return res.status(403).json({ error: 'Permission denied', required_permission: permission });
  };
}

async function audit(req, action, tableName, recordId, oldData, newData) {
  if (!supabase) return;
  try {
    await supabase.from('audit_logs').insert({
      actor_id: (req.user?.profileExists && req.user?.id) ? req.user.id : null,
      action,
      table_name: tableName,
      record_id: recordId || null,
      old_data: oldData || null,
      new_data: newData || null,
      ip_address: req.ip || null,
      user_agent: req.headers['user-agent'] || null
    });
  } catch (error) {
    console.warn('Audit log skipped:', error.message);
  }
}

async function getEntriesForMonth(month, modules = MODULE_ORDER) {
  let query = supabase.from('data_entries').select('*').eq('period_month', monthStart(month));
  const normalizedModules = Array.isArray(modules) && modules.length ? modules : MODULE_ORDER;
  const expandedModules = normalizedModules.includes('wet_waste')
    ? Array.from(new Set([...normalizedModules.filter(m => m !== 'wet_waste'), 'dog_food', 'pig_feed']))
    : normalizedModules;
  query = query.in('module', expandedModules).order('module').order('entry_date', { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function summarizeRows(rows) {
  const byModule = {};
  for (const row of rows) {
    if (!byModule[row.module]) byModule[row.module] = { module: row.module, label: MODULES[row.module] || row.module, weight_kg: 0, quantity: 0, amount: 0, count: 0 };
    byModule[row.module].weight_kg += Number(row.weight_kg || 0);
    byModule[row.module].quantity += Number(row.quantity || 0);
    byModule[row.module].amount += Number(row.amount || 0);
    byModule[row.module].count += 1;
  }
  const wetWeight = (byModule.dog_food?.weight_kg || 0) + (byModule.pig_feed?.weight_kg || 0);
  const wetCount = (byModule.dog_food?.count || 0) + (byModule.pig_feed?.count || 0);
  byModule.wet_waste = { module: 'wet_waste', label: MODULES.wet_waste, weight_kg: wetWeight, quantity: 0, amount: 0, count: wetCount };
  return {
    totals: {
      total_weight_kg: rows.reduce((sum, row) => sum + Number(row.weight_kg || 0), 0),
      total_amount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      entry_count: rows.length,
      wet_waste_weight_kg: wetWeight
    },
    modules: MODULE_ORDER.map(module => byModule[module] || { module, label: MODULES[module], weight_kg: 0, quantity: 0, amount: 0, count: 0 })
  };
}


function previousMonth(value) {
  const base = monthStart(value || new Date().toISOString().slice(0, 7));
  const date = new Date(`${base}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function percentChange(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (!p && !c) return 0;
  if (!p && c) return 100;
  return Number((((c - p) / Math.abs(p)) * 100).toFixed(1));
}

function buildQualityScores(rows, month) {
  const targetMonth = monthStart(month || new Date().toISOString().slice(0, 7));
  const modules = ['rdf', 'dog_food', 'pig_feed', 'recycle', 'tissue', 'black_bag', 'consumable'];
  const daysInMonth = new Date(Number(targetMonth.slice(0, 4)), Number(targetMonth.slice(5, 7)), 0).getDate();
  const monthlyModules = new Set(['pig_feed', 'black_bag', 'consumable']);
  return modules.map(module => {
    const moduleRows = rows.filter(row => row.module === module);
    const uniqueDays = new Set(moduleRows.map(row => String(row.entry_date || '').slice(0, 10))).size;
    const expected = monthlyModules.has(module) ? 1 : daysInMonth;
    const completedRows = moduleRows.filter(row => row.weight_kg !== null || row.quantity !== null || row.amount !== null).length;
    const completeness = moduleRows.length ? completedRows / moduleRows.length : 0;
    const coverage = Math.min(uniqueDays / expected, 1);
    const score = Math.round((coverage * 70) + (completeness * 30));
    return { module, label: MODULES[module], score, entries: moduleRows.length, covered_days: uniqueDays, expected_days: expected };
  });
}

function buildAdvancedInsights({ month, rows, previousRows }) {
  const currentSummary = summarizeRows(rows || []);
  const previousSummary = summarizeRows(previousRows || []);
  const qualityScores = buildQualityScores(rows || [], month);
  const trends = MODULE_ORDER.map(module => {
    const current = currentSummary.modules.find(item => item.module === module) || { weight_kg: 0, amount: 0, count: 0 };
    const previous = previousSummary.modules.find(item => item.module === module) || { weight_kg: 0, amount: 0, count: 0 };
    const changePercent = percentChange(current.weight_kg, previous.weight_kg);
    const direction = changePercent > 15 ? 'up' : changePercent < -15 ? 'down' : 'stable';
    const message = direction === 'up'
      ? `${MODULES[module]} เพิ่มขึ้น ${Math.abs(changePercent)}% จากเดือนก่อน`
      : direction === 'down'
        ? `${MODULES[module]} ลดลง ${Math.abs(changePercent)}% จากเดือนก่อน`
        : `${MODULES[module]} ใกล้เคียงเดือนก่อน`;
    return {
      module,
      label: MODULES[module],
      current_weight_kg: Number((current.weight_kg || 0).toFixed(2)),
      previous_weight_kg: Number((previous.weight_kg || 0).toFixed(2)),
      change_percent: changePercent,
      direction,
      current_amount: Number((current.amount || 0).toFixed(2)),
      count: current.count || 0,
      message
    };
  });

  const anomalies = [];
  for (const row of rows || []) {
    const label = MODULES[row.module] || row.module;
    const date = String(row.entry_date || '').slice(0, 10);
    if (Number(row.weight_kg || 0) < 0 || Number(row.quantity || 0) < 0 || Number(row.amount || 0) < 0) {
      anomalies.push({ severity: 'high', module: row.module, label, date, title: 'พบค่าติดลบ', details: 'ควรตรวจสอบน้ำหนัก/จำนวน/ยอดเงิน เพราะเป็นค่าติดลบ', metric_value: row.weight_kg || row.quantity || row.amount });
    }
    if (row.module === 'recycle' && row.weight_kg !== null && row.unit_price !== null && row.amount !== null) {
      const expectedAmount = Number(row.weight_kg || 0) * Number(row.unit_price || 0);
      if (Math.abs(expectedAmount - Number(row.amount || 0)) > 1) {
        anomalies.push({ severity: 'medium', module: row.module, label, date, title: 'ยอดเงินไม่ตรงกับน้ำหนัก x ราคา/กก.', details: `ยอดที่คำนวณได้ ${formatNumber(expectedAmount)} บาท แต่บันทึกไว้ ${formatNumber(row.amount)} บาท`, metric_value: row.amount });
      }
    }
    if (Number(row.weight_kg || 0) === 0 && Number(row.quantity || 0) === 0 && Number(row.amount || 0) === 0) {
      anomalies.push({ severity: 'low', module: row.module, label, date, title: 'รายการไม่มีตัวเลขหลัก', details: 'รายการนี้ยังไม่มีน้ำหนัก จำนวน หรือยอดเงิน', metric_value: 0 });
    }
  }

  for (const module of ['rdf', 'dog_food', 'pig_feed', 'recycle']) {
    const values = (rows || []).filter(row => row.module === module).map(row => Number(row.weight_kg || 0)).filter(value => value > 0);
    if (values.length >= 5) {
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
      const sd = Math.sqrt(variance);
      const threshold = avg + (sd * 2);
      const spikeRows = (rows || []).filter(row => row.module === module && Number(row.weight_kg || 0) > threshold && Number(row.weight_kg || 0) > avg * 1.7).slice(0, 3);
      for (const row of spikeRows) {
        anomalies.push({ severity: 'medium', module, label: MODULES[module], date: String(row.entry_date || '').slice(0, 10), title: 'น้ำหนักสูงกว่าค่าปกติ', details: `สูงกว่าค่าเฉลี่ยของเดือน (${formatNumber(avg)} kg) อย่างชัดเจน`, metric_value: row.weight_kg });
      }
    }
  }

  for (const score of qualityScores) {
    if (score.score < 55) {
      anomalies.push({ severity: 'medium', module: score.module, label: score.label, title: 'ข้อมูลยังไม่ครบตามรอบกรอก', details: `ครอบคลุม ${score.covered_days}/${score.expected_days} วัน คะแนน ${score.score}%`, metric_value: score.score });
    }
  }

  const recommendations = [];
  const lowQuality = qualityScores.filter(item => item.score < 70).slice(0, 3);
  if (lowQuality.length) {
    recommendations.push({ priority: 'high', title: 'เติมข้อมูลให้ครบก่อนทำรายงานทางการ', details: `ควรตรวจ ${lowQuality.map(item => item.label).join(', ')} เพราะคะแนนความครบถ้วนต่ำกว่า 70%` });
  }
  const rising = trends.filter(item => item.direction === 'up' && item.change_percent >= 30 && item.current_weight_kg > 0).sort((a, b) => b.change_percent - a.change_percent)[0];
  if (rising) {
    recommendations.push({ priority: 'medium', title: `ตรวจสอบสาเหตุ ${rising.label} เพิ่มขึ้น`, details: `${rising.label} เพิ่มขึ้น ${rising.change_percent}% จากเดือนก่อน ควรดูวันที่/แหล่งที่ทำให้ยอดสูง` });
  }
  const falling = trends.filter(item => item.direction === 'down' && item.previous_weight_kg > 0 && item.current_weight_kg > 0).sort((a, b) => a.change_percent - b.change_percent)[0];
  if (falling) {
    recommendations.push({ priority: 'medium', title: `ติดตาม ${falling.label} ที่ลดลง`, details: `${falling.label} ลดลง ${Math.abs(falling.change_percent)}% อาจเป็นผลจากการคัดแยกดีขึ้น หรือข้อมูลยังกรอกไม่ครบ` });
  }
  const recycle = currentSummary.modules.find(item => item.module === 'recycle') || { weight_kg: 0, amount: 0 };
  if (recycle.weight_kg > 0 && recycle.amount <= 0) {
    recommendations.push({ priority: 'medium', title: 'เพิ่มข้อมูลราคารีไซเคิล', details: 'มีน้ำหนักรีไซเคิลแล้ว แต่ยอดเงินยังเป็นศูนย์ ทำให้รายงานรายได้ไม่สมบูรณ์' });
  }
  if (!recommendations.length) {
    recommendations.push({ priority: 'normal', title: 'ข้อมูลอยู่ในเกณฑ์พร้อมใช้งาน', details: 'ยังไม่พบความผิดปกติสำคัญ สามารถใช้ข้อมูลเพื่อพรีวิวรายงานและสร้าง PowerPoint ได้' });
  }

  const averageQuality = qualityScores.length ? Math.round(qualityScores.reduce((sum, item) => sum + item.score, 0) / qualityScores.length) : 0;
  const highCount = anomalies.filter(item => item.severity === 'high').length;
  const mediumCount = anomalies.filter(item => item.severity === 'medium').length;
  const insightScore = Math.max(0, Math.min(100, averageQuality - (highCount * 15) - (mediumCount * 5)));
  const topWeight = currentSummary.modules.filter(item => item.module !== 'wet_waste').sort((a, b) => b.weight_kg - a.weight_kg)[0];
  const headline = topWeight && topWeight.weight_kg > 0
    ? `เดือนนี้ ${topWeight.label} มีน้ำหนักสูงสุด ${formatNumber(topWeight.weight_kg)} kg และคะแนนความพร้อมข้อมูลอยู่ที่ ${insightScore}%`
    : `เดือนนี้ยังมีข้อมูลไม่มากพอสำหรับวิเคราะห์เชิงลึก คะแนนความพร้อมข้อมูล ${insightScore}%`;

  const powerpointBullets = [
    headline,
    anomalies.length ? `พบประเด็นที่ควรตรวจสอบ ${anomalies.length} จุด` : 'ไม่พบความผิดปกติสำคัญในข้อมูลเดือนนี้',
    recommendations[0]?.details || recommendations[0]?.title || 'ใช้ข้อมูลนี้ประกอบสรุปรายงานได้',
    rising ? `${rising.label} เป็นหมวดที่เพิ่มขึ้นเด่นที่สุดเมื่อเทียบกับเดือนก่อน` : 'แนวโน้มโดยรวมยังไม่เปลี่ยนแปลงรุนแรง'
  ].filter(Boolean);

  return {
    month: monthStart(month),
    generated_at: new Date().toISOString(),
    engine: 'CKAP local analytical insight engine',
    score: insightScore,
    headline,
    trends,
    anomalies: anomalies.slice(0, 12),
    recommendations: recommendations.slice(0, 6),
    quality_scores: qualityScores,
    powerpoint_bullets: powerpointBullets
  };
}


function dayKey(value) {
  return String(value || '').slice(8, 10) || '01';
}

function sumBy(rows, keyFn, valueFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    const value = Number(valueFn(row) || 0);
    map.set(key, (map.get(key) || 0) + value);
  }
  return map;
}

function chartDataLabel(value, digits = 2) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: digits });
}

function buildChartPreview({ month, rows, modules = MODULE_ORDER }) {
  const selected = Array.isArray(modules) && modules.length ? modules : MODULE_ORDER;
  const summary = summarizeRows(rows || []);
  const charts = [];

  const comparisonData = summary.modules
    .filter(item => selected.includes(item.module) && item.module !== 'wet_waste')
    .map(item => ({ module: item.module, label: item.label, value: Number((item.weight_kg || 0).toFixed(2)), amount: Number((item.amount || 0).toFixed(2)), count: item.count || 0 }));

  charts.push({
    id: 'module-comparison',
    enabled: true,
    title: 'กราฟเปรียบเทียบน้ำหนักตามประเภท',
    subtitle: 'น้ำหนักรวมของแต่ละประเภทในเดือนที่เลือก',
    chart_type: 'bar',
    metric: 'weight_kg',
    unit: 'kg',
    data: comparisonData,
    takeaway: comparisonData.length ? `${comparisonData.sort((a, b) => b.value - a.value)[0].label} มีน้ำหนักสูงสุด` : 'ยังไม่มีข้อมูลสำหรับสร้างกราฟ'
  });

  const daysInMonth = new Date(Number(monthStart(month).slice(0, 4)), Number(monthStart(month).slice(5, 7)), 0).getDate();
  const dailyModules = selected.filter(module => ['rdf', 'dog_food', 'recycle', 'tissue', 'black_bag', 'consumable'].includes(module));
  const dailySeries = dailyModules.map(module => {
    const dailyMap = sumBy((rows || []).filter(row => row.module === module), row => dayKey(row.entry_date), row => row.weight_kg || row.quantity || row.amount || 0);
    return {
      module,
      name: MODULES[module] || module,
      data: Array.from({ length: daysInMonth }, (_, idx) => {
        const day = String(idx + 1).padStart(2, '0');
        return { day, value: Number((dailyMap.get(day) || 0).toFixed(2)) };
      })
    };
  });
  if (dailySeries.length) {
    charts.push({
      id: 'daily-trend',
      enabled: true,
      title: 'กราฟแนวโน้มรายวัน',
      subtitle: 'ดูความเคลื่อนไหวรายวันของแต่ละประเภท',
      chart_type: 'line',
      metric: 'daily_value',
      unit: 'หน่วยวัด',
      series: dailySeries,
      takeaway: 'ใช้ดูวันที่มียอดสูงหรือต่ำผิดปกติก่อนทำรายงาน'
    });
  }

  const wetData = [
    { module: 'dog_food', label: MODULES.dog_food, value: Number(((rows || []).filter(row => row.module === 'dog_food').reduce((sum, row) => sum + Number(row.weight_kg || 0), 0)).toFixed(2)) },
    { module: 'pig_feed', label: MODULES.pig_feed, value: Number(((rows || []).filter(row => row.module === 'pig_feed').reduce((sum, row) => sum + Number(row.weight_kg || 0), 0)).toFixed(2)) }
  ].filter(item => item.value > 0 || selected.includes('wet_waste') || selected.includes(item.module));
  if (wetData.length) {
    charts.push({
      id: 'wet-waste-composition',
      enabled: true,
      title: 'กราฟขยะเปียกรวม',
      subtitle: 'ขยะเปียก = อาหารหมา + อาหารหมู',
      chart_type: 'pie',
      metric: 'weight_kg',
      unit: 'kg',
      data: wetData,
      takeaway: `ขยะเปียกรวม ${chartDataLabel(wetData.reduce((sum, item) => sum + item.value, 0))} kg`
    });
  }

  const recycleRows = (rows || []).filter(row => row.module === 'recycle');
  if (selected.includes('recycle')) {
    const materialMap = new Map();
    for (const row of recycleRows) {
      const key = row.material_name || 'ไม่ระบุวัสดุ';
      const current = materialMap.get(key) || { label: key, value: 0, amount: 0, count: 0 };
      current.value += Number(row.weight_kg || 0);
      current.amount += Number(row.amount || 0);
      current.count += 1;
      materialMap.set(key, current);
    }
    const recycleData = Array.from(materialMap.values()).map(item => ({ ...item, value: Number(item.value.toFixed(2)), amount: Number(item.amount.toFixed(2)) })).sort((a, b) => b.amount - a.amount).slice(0, 8);
    charts.push({
      id: 'recycle-revenue',
      enabled: true,
      title: 'กราฟรายได้รีไซเคิลตามวัสดุ',
      subtitle: 'แยกตามประเภทวัสดุและยอดเงิน',
      chart_type: 'bar',
      metric: 'amount',
      unit: 'บาท',
      data: recycleData,
      takeaway: recycleData.length ? `${recycleData[0].label} สร้างรายได้สูงสุด` : 'ยังไม่มีข้อมูลรายได้รีไซเคิล'
    });
  }

  const quantityData = summary.modules
    .filter(item => selected.includes(item.module) && ['tissue', 'black_bag', 'consumable'].includes(item.module))
    .map(item => ({ module: item.module, label: item.label, value: Number((item.quantity || item.amount || item.weight_kg || 0).toFixed(2)), amount: Number((item.amount || 0).toFixed(2)), count: item.count || 0 }));
  if (quantityData.length) {
    charts.push({
      id: 'quantity-summary',
      enabled: true,
      title: 'กราฟจำนวนวัสดุสิ้นเปลือง',
      subtitle: 'กระดาษทิชชู่ ถุงดำ และของใช้สิ้นเปลือง',
      chart_type: 'bar',
      metric: 'quantity',
      unit: 'จำนวน',
      data: quantityData,
      takeaway: 'ใช้ติดตามวัสดุสิ้นเปลืองแบบรายเดือน'
    });
  }

  return { month: monthStart(month), generated_at: new Date().toISOString(), charts };
}

function getChartById(charts, id) {
  return (charts || []).find(chart => chart.id === id);
}

function buildReportOutline({ month, title, modules, summary, insights, charts }) {
  const selected = modules && modules.length ? modules : MODULE_ORDER;
  const outline = [
    { id: 'cover', enabled: true, title: title || 'รายงานขยะประจำเดือน', layout: 'cover', content_type: 'cover', note: `ประจำเดือน ${month}` },
    { id: 'kpi-summary', enabled: true, title: 'สรุปภาพรวมประจำเดือน', layout: 'kpi', content_type: 'summary', note: 'น้ำหนักรวม รายได้รวม จำนวนรายการ และขยะเปียกรวม' },
    { id: 'ai-insights', enabled: true, title: 'AI Insight และข้อเสนอแนะ', layout: 'insight-cards', content_type: 'insights', note: insights?.headline || 'สรุปแนวโน้ม ความผิดปกติ และคำแนะนำจากข้อมูลจริง' }
  ];
  for (const chart of (charts || []).filter(item => item.enabled !== false).slice(0, 4)) {
    outline.push({
      id: `chart-${chart.id}`,
      enabled: true,
      title: chart.title,
      layout: `${chart.chart_type}-chart`,
      content_type: 'chart',
      chart_id: chart.id,
      chart_type: chart.chart_type,
      note: chart.takeaway || chart.subtitle || 'พรีวิวกราฟก่อนสร้างรายงาน'
    });
  }
  for (const module of selected) {
    const item = summary.modules.find(row => row.module === module);
    outline.push({
      id: `module-${module}`,
      enabled: true,
      title: MODULES[module] || module,
      layout: module === 'recycle' ? 'table-kpi' : 'simple-kpi',
      content_type: 'module',
      module,
      note: `น้ำหนัก ${formatNumber(item?.weight_kg || 0)} kg / รายการ ${formatNumber(item?.count || 0, 0)}`
    });
  }
  outline.push({ id: 'closing', enabled: true, title: 'สรุปและข้อเสนอแนะ', layout: 'closing', content_type: 'closing', note: 'สรุปประเด็นที่ควรติดตามต่อ' });
  return outline;
}

async function createPowerPointBuffer({ month, title, outline, rows, summary, insights, charts }) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Central Krabi Analytics Platform';
  pptx.company = 'Central Krabi';
  pptx.subject = `Monthly waste report ${month}`;
  pptx.title = title || 'รายงานขยะประจำเดือน';
  pptx.lang = 'th-TH';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'th-TH'
  };

  function titleBar(slide, text) {
    slide.background = { color: 'F8FAFC' };
    slide.addText(text, { x: 0.45, y: 0.35, w: 12.4, h: 0.45, fontSize: 22, bold: true, color: '0F172A', margin: 0.02 });
    slide.addShape(pptx.ShapeType.line, { x: 0.45, y: 0.9, w: 12.2, h: 0, line: { color: 'CBD5E1', width: 1 } });
  }

  function drawSimpleBarChart(slide, chart, options = {}) {
    const x0 = options.x || 0.85;
    const y0 = options.y || 1.35;
    const w = options.w || 11.65;
    const h = options.h || 4.55;
    const data = (chart?.data || []).filter(item => Number(item.value ?? item.amount ?? 0) > 0).slice(0, 8);
    const metric = chart?.metric === 'amount' ? 'amount' : 'value';

    slide.addShape(pptx.ShapeType.roundRect, { x: x0, y: y0, w, h, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, radius: 0.12 });
    
    if (!data.length) {
      slide.addText('ยังไม่มีข้อมูลเพียงพอสำหรับแสดงกราฟ', { x: x0 + 0.35, y: y0 + 1.9, w: w - 0.7, h: 0.4, fontSize: 16, color: '64748B', margin: 0.02, align: 'center' });
      return;
    }

    const labels = data.map(item => String(item.label || item.module || '').slice(0, 12));
    const values = data.map(item => Number(item[metric] ?? item.value ?? 0));

    const chartData = [
      {
        name: chart.unit || (metric === 'amount' ? 'บาท' : 'kg'),
        labels: labels,
        values: values
      }
    ];

    slide.addChart(pptx.ChartType.bar, chartData, {
      x: x0 + 0.4,
      y: y0 + 0.3,
      w: w - 0.8,
      h: h - 0.6,
      barDir: 'col',
      chartColors: ['2563EB'],
      showLegend: false,
      showValue: true,
      dataLabelColor: '1E293B',
      dataLabelFontSize: 8,
      valAxisLabelColor: '475569',
      catAxisLabelColor: '475569',
      valAxisLabelFontSize: 8,
      catAxisLabelFontSize: 8,
      valGridLine: { color: 'F1F5F9', width: 1 }
    });
  }

  function drawSimpleLineChart(slide, chart, options = {}) {
    const x0 = options.x || 0.85;
    const y0 = options.y || 1.35;
    const w = options.w || 11.65;
    const h = options.h || 4.55;
    const series = (chart?.series || []).slice(0, 3);

    slide.addShape(pptx.ShapeType.roundRect, { x: x0, y: y0, w, h, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, radius: 0.12 });
    
    if (!series.length) {
      slide.addText('ยังไม่มีข้อมูลรายวันสำหรับแสดงกราฟ', { x: x0 + 0.35, y: y0 + 1.9, w: w - 0.7, h: 0.4, fontSize: 16, color: '64748B', margin: 0.02, align: 'center' });
      return;
    }

    const labels = (series[0]?.data || []).map(point => String(point.day));
    const chartColors = ['2563EB', '16A34A', 'D97706'];

    const chartData = series.map((serie, idx) => {
      return {
        name: serie.name,
        labels: labels,
        values: labels.map(day => {
          const found = (serie.data || []).find(point => point.day === day);
          return Number(found?.value || 0);
        }),
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 5
      };
    });

    slide.addChart(pptx.ChartType.line, chartData, {
      x: x0 + 0.4,
      y: y0 + 0.3,
      w: w - 0.8,
      h: h - 0.6,
      chartColors: chartColors,
      showLegend: true,
      legendPos: 'b',
      showValue: false,
      valAxisLabelColor: '475569',
      catAxisLabelColor: '475569',
      valAxisLabelFontSize: 8,
      catAxisLabelFontSize: 8,
      valGridLine: { color: 'F1F5F9', width: 1 }
    });
  }

  function drawSimplePieChart(slide, chart, options = {}) {
    const x0 = options.x || 0.85;
    const y0 = options.y || 1.35;
    const w = options.w || 11.65;
    const h = options.h || 4.55;
    const data = (chart?.data || []).filter(item => Number(item.value || 0) > 0).slice(0, 5);
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

    slide.addShape(pptx.ShapeType.roundRect, { x: x0, y: y0, w, h, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, radius: 0.12 });
    
    if (!total) {
      slide.addText('ยังไม่มีข้อมูลสำหรับแสดงสัดส่วน', { x: x0 + 0.35, y: y0 + 1.9, w: w - 0.7, h: 0.4, fontSize: 16, color: '64748B', margin: 0.02, align: 'center' });
      return;
    }

    const labels = data.map(item => String(item.label || item.module || ''));
    const values = data.map(item => Number(item.value || 0));

    const chartData = [
      {
        name: chart.title || 'สัดส่วน',
        labels: labels,
        values: values
      }
    ];

    slide.addChart(pptx.ChartType.pie, chartData, {
      x: x0 + 0.4,
      y: y0 + 0.3,
      w: w - 0.8,
      h: h - 0.6,
      chartColors: ['2563EB', '16A34A', 'D97706', '9333EA', '0F766E'],
      showLegend: true,
      legendPos: 'r',
      showPercent: true,
      dataLabelColor: '1E293B',
      dataLabelFontSize: 8
    });
  }

  for (const item of (outline || []).filter(s => s.enabled !== false)) {
    const slide = pptx.addSlide();
    if (item.content_type === 'cover') {
      slide.background = { color: 'EFF6FF' };
      slide.addText(item.title || title, { x: 0.75, y: 1.45, w: 11.8, h: 0.75, fontSize: 31, bold: true, color: '1E3A8A', margin: 0.02 });
      slide.addText(`ประจำเดือน ${month}`, { x: 0.78, y: 2.25, w: 11.2, h: 0.35, fontSize: 16, color: '475569', margin: 0.02 });
      slide.addText('Central Krabi Analytics Platform v3.0.8', { x: 0.78, y: 6.55, w: 11.4, h: 0.28, fontSize: 12, color: '64748B', margin: 0.02 });
      continue;
    }

    if (item.content_type === 'summary') {
      titleBar(slide, item.title || 'สรุปภาพรวมประจำเดือน');
      const kpis = [
        ['น้ำหนักรวม', `${formatNumber(summary.totals.total_weight_kg)} kg`],
        ['รายได้รวม', `${formatNumber(summary.totals.total_amount)} บาท`],
        ['จำนวนรายการ', `${formatNumber(summary.totals.entry_count, 0)} รายการ`],
        ['ขยะเปียกรวม', `${formatNumber(summary.totals.wet_waste_weight_kg)} kg`]
      ];
      kpis.forEach((kpi, idx) => {
        const x = 0.7 + (idx % 2) * 6.15;
        const y = 1.35 + Math.floor(idx / 2) * 1.9;
        slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.55, h: 1.35, fill: { color: 'FFFFFF' }, line: { color: 'BFDBFE' }, radius: 0.15 });
        slide.addText(kpi[0], { x: x + 0.24, y: y + 0.22, w: 5.1, h: 0.25, fontSize: 12, color: '475569', margin: 0.02 });
        slide.addText(kpi[1], { x: x + 0.24, y: y + 0.66, w: 5.1, h: 0.38, fontSize: 21, bold: true, color: '1D4ED8', margin: 0.02 });
      });
      continue;
    }


    if (item.content_type === 'insights') {
      titleBar(slide, item.title || 'AI Insight และข้อเสนอแนะ');
      const score = insights?.score ?? 0;
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 1.2, w: 3.2, h: 1.25, fill: { color: 'FFFFFF' }, line: { color: 'BFDBFE' }, radius: 0.12 });
      slide.addText('คะแนนความพร้อมข้อมูล', { x: 0.88, y: 1.38, w: 2.7, h: 0.24, fontSize: 11, color: '64748B', margin: 0.02 });
      slide.addText(`${score}%`, { x: 0.88, y: 1.75, w: 2.7, h: 0.45, fontSize: 25, bold: true, color: score >= 70 ? '1D4ED8' : 'B45309', margin: 0.02 });
      slide.addShape(pptx.ShapeType.roundRect, { x: 4.1, y: 1.2, w: 8.15, h: 1.25, fill: { color: 'FFFFFF' }, line: { color: 'BFDBFE' }, radius: 0.12 });
      slide.addText(insights?.headline || 'ยังไม่มีข้อมูล Insight', { x: 4.35, y: 1.5, w: 7.65, h: 0.62, fontSize: 15, bold: true, color: '0F172A', margin: 0.02, fit: 'shrink' });

      const bullets = (insights?.powerpoint_bullets || []).slice(0, 4).map(text => `• ${text}`).join('\n');
      slide.addText(bullets || '• ยังไม่มีประเด็นเพิ่มเติม', { x: 0.75, y: 2.85, w: 5.75, h: 2.8, fontSize: 13, color: '0F172A', margin: 0.04, fit: 'shrink' });

      const recs = (insights?.recommendations || []).slice(0, 3);
      recs.forEach((rec, idx) => {
        const y = 2.78 + idx * 1.05;
        slide.addShape(pptx.ShapeType.roundRect, { x: 6.85, y, w: 5.65, h: 0.82, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0' }, radius: 0.12 });
        slide.addText(rec.title || 'ข้อเสนอแนะ', { x: 7.08, y: y + 0.12, w: 5.2, h: 0.2, fontSize: 10.5, bold: true, color: '1D4ED8', margin: 0.02 });
        slide.addText(rec.details || '', { x: 7.08, y: y + 0.36, w: 5.2, h: 0.25, fontSize: 8.8, color: '475569', margin: 0.02, fit: 'shrink' });
      });
      continue;
    }


    if (item.content_type === 'chart') {
      const chart = getChartById(charts, item.chart_id) || { title: item.title, chart_type: item.chart_type, data: [] };
      titleBar(slide, item.title || chart.title || 'กราฟรายงาน');
      slide.addText(chart.subtitle || item.note || '', { x: 0.65, y: 0.98, w: 11.9, h: 0.24, fontSize: 10.5, color: '64748B', margin: 0.02, fit: 'shrink' });
      if (chart.chart_type === 'line') drawSimpleLineChart(slide, chart);
      else if (chart.chart_type === 'pie') drawSimplePieChart(slide, chart);
      else drawSimpleBarChart(slide, chart);
      continue;
    }

    if (item.content_type === 'module') {
      const moduleRows = item.module === 'wet_waste'
        ? rows.filter(row => ['dog_food', 'pig_feed'].includes(row.module))
        : rows.filter(row => row.module === item.module);
      const moduleSummary = item.module === 'wet_waste'
        ? summary.modules.find(row => row.module === 'wet_waste')
        : summary.modules.find(row => row.module === item.module);
      titleBar(slide, item.title || MODULES[item.module] || item.module);
      const kpis = [
        ['น้ำหนัก', `${formatNumber(moduleSummary?.weight_kg || 0)} kg`],
        ['จำนวน', `${formatNumber(moduleSummary?.quantity || 0)} ${item.module === 'black_bag' ? 'ใบ' : ''}`],
        ['ยอดเงิน', `${formatNumber(moduleSummary?.amount || 0)} บาท`],
        ['รายการ', `${formatNumber(moduleSummary?.count || 0, 0)} รายการ`]
      ];
      kpis.forEach((kpi, idx) => {
        const x = 0.55 + idx * 3.15;
        slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.2, w: 2.85, h: 1.05, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0' }, radius: 0.12 });
        slide.addText(kpi[0], { x: x + 0.17, y: 1.36, w: 2.5, h: 0.2, fontSize: 10, color: '64748B', margin: 0.02 });
        slide.addText(kpi[1], { x: x + 0.17, y: 1.72, w: 2.5, h: 0.28, fontSize: 15, bold: true, color: '0F172A', margin: 0.02 });
      });
      const tableRows = [['วันที่', 'ประเภท/วัสดุ', 'น้ำหนัก', 'จำนวน', 'ยอดเงิน']]
        .concat(moduleRows.slice(0, 12).map(row => [
          String(row.entry_date || '').slice(0, 10),
          row.material_name || MODULES[row.module] || row.module,
          formatNumber(row.weight_kg || 0),
          formatNumber(row.quantity || 0),
          formatNumber(row.amount || 0)
        ]));
      slide.addTable(tableRows, { x: 0.55, y: 2.65, w: 12.2, h: 3.75, fontSize: 9.5, border: { color: 'CBD5E1' }, color: '0F172A', fill: { color: 'FFFFFF' } });
      if (moduleRows.length > 12) {
        slide.addText(`แสดง 12 รายการแรกจากทั้งหมด ${moduleRows.length} รายการ`, { x: 0.55, y: 6.55, w: 12, h: 0.25, fontSize: 9, color: '64748B', margin: 0.02 });
      }
      continue;
    }

    titleBar(slide, item.title || 'สรุปและข้อเสนอแนะ');
    const topModule = [...summary.modules].filter(row => row.module !== 'wet_waste').sort((a, b) => b.weight_kg - a.weight_kg)[0];
    const lines = (insights?.powerpoint_bullets?.length ? insights.powerpoint_bullets : [
      `เดือนนี้มีข้อมูลรวม ${formatNumber(summary.totals.entry_count, 0)} รายการ`,
      `น้ำหนักรวม ${formatNumber(summary.totals.total_weight_kg)} kg`,
      `ขยะเปียกรวม ${formatNumber(summary.totals.wet_waste_weight_kg)} kg`,
      topModule ? `หมวดที่มีน้ำหนักสูงสุดคือ ${topModule.label} (${formatNumber(topModule.weight_kg)} kg)` : 'ยังไม่มีข้อมูลเพียงพอสำหรับสรุปหมวดสูงสุด'
    ]);
    slide.addText(lines.map(text => `• ${text}`).join('\n'), { x: 0.8, y: 1.35, w: 11.6, h: 3.2, fontSize: 16, color: '0F172A', breakLine: false, margin: 0.05, fit: 'shrink' });
  }

  return pptx.write({ outputType: 'nodebuffer' });
}

async function runAutomationJob(job, reqLike = {}) {
  const startedAt = new Date().toISOString();
  let status = 'success';
  let result = {};
  try {
    const month = job.config?.month || new Date().toISOString().slice(0, 7);
    if (job.action_type === 'data_quality_check') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      result = { month, entry_count: rows.length, message: rows.length ? 'พบข้อมูลสำหรับตรวจสอบ' : 'ยังไม่มีข้อมูลเดือนนี้' };
    } else if (job.action_type === 'monthly_summary') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      const summary = summarizeRows(rows);
      result = { month, totals: summary.totals };
    } else if (job.action_type === 'report_preview') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      const previousRows = await getEntriesForMonth(previousMonth(month), MODULE_ORDER);
      const summary = summarizeRows(rows);
      const insights = buildAdvancedInsights({ month, rows, previousRows });
      result = { month, outline: buildReportOutline({ month, title: 'รายงานอัตโนมัติ', modules: MODULE_ORDER, summary, insights }), insights };
    } else if (job.action_type === 'ai_insight_check') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      const previousRows = await getEntriesForMonth(previousMonth(month), MODULE_ORDER);
      result = buildAdvancedInsights({ month, rows, previousRows });
    } else if (job.action_type === 'chart_preview') {
      const rows = await getEntriesForMonth(month, MODULE_ORDER);
      result = buildChartPreview({ month, rows, modules: MODULE_ORDER });
    } else {
      result = { message: 'Unknown action_type, no operation performed.' };
    }
  } catch (error) {
    status = 'failed';
    result = { error: error.message };
  }
  const finishedAt = new Date().toISOString();
  if (supabase) {
    await supabase.from('automation_runs').insert({
      job_id: job.id,
      status,
      result,
      started_at: startedAt,
      finished_at: finishedAt
    });
  }
  return { status, result, started_at: startedAt, finished_at: finishedAt };
}

async function automationTick() {
  if (!supabase || process.env.AUTOMATION_RUNNER_ENABLED !== 'true') return;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('automation_jobs')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now)
    .limit(5);
  if (error || !data?.length) return;
  for (const job of data) {
    await runAutomationJob(job);
    const nextRunAt = new Date(Date.now() + Number(job.interval_minutes || 1440) * 60 * 1000).toISOString();
    await supabase.from('automation_jobs').update({ last_run_at: now, next_run_at: nextRunAt, updated_at: now }).eq('id', job.id);
  }
}

app.post('/api/auth/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'รูปแบบอีเมลหรือข้อมูลไม่ถูกต้อง', details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  try {
    let userProfile = null;
    let authSession = null;

    // 1. Try Supabase Auth if configured
    if (supabase) {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (!authError && authData?.user) {
        authSession = authData.session;
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .eq('active', true)
          .maybeSingle();

        if (profile) {
          userProfile = profile;
        } else return res.status(403).json({ error: 'ไม่พบ Profile ที่เชื่อมกับบัญชี Authentication กรุณาติดต่อ Owner' });
      } else {
        const errMsg = authError?.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        return res.status(401).json({ error: errMsg });
      }
    } else return res.status(503).json({ error: 'Supabase is not configured' });

    if (!userProfile) {
      return res.status(401).json({ error: 'บัญชีนี้ถูกระงับการใช้งานหรือไม่มีในระบบ' });
    }

    // Hydrate permissions
    const userWithPerms = await hydrateUserPermissions(userProfile);

    await audit(req, 'login', 'profiles', userWithPerms.id, null, { email: userWithPerms.email });

    res.json({
      token: authSession.access_token,
      refresh_token: authSession.refresh_token,
      user: {
        id: userWithPerms.id,
        email: userWithPerms.email,
        display_name: userWithPerms.display_name,
        role: userWithPerms.role,
        permissions: userWithPerms.permissions
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    platform: 'Central Krabi Analytics Platform',
    supabase: isSupabaseConfigured ? 'configured' : 'missing-env'
  });
});

app.get('/api/me', (req, res) => {
  res.json({
    id: req.user?.id || null,
    display_name: req.user?.display_name || 'Unauthenticated',
    email: req.user?.email || null,
    role: req.user?.role || 'blocked',
    permissions: req.user?.permissions || []
  });
});

app.get('/api/master-categories', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const module = req.query.module;
  let query = supabase.from('master_categories').select('*').eq('active', true).order('sort_order', { ascending: true });
  if (module) query = query.eq('module', module);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const mapped = (data || []).map(item => ({ ...item, color: item.color_hex || item.color }));
  res.json(mapped);
});

app.get('/api/entries', requireSupabase, requirePermission('entries.read'), async (req, res) => {
  const { module, month, startDate, endDate, category, search } = req.query;
  let query = supabase.from('data_entries').select('*').order('entry_date', { ascending: true }).order('created_at', { ascending: true });
  
  if (month) query = query.eq('period_month', monthStart(month));
  if (startDate) query = query.gte('entry_date', startDate);
  if (endDate) query = query.lte('entry_date', endDate);
  if (category) query = query.eq('category_code', category);
  
  if (module && module !== 'all') {
    if (module === 'wet_waste') query = query.in('module', ['dog_food', 'pig_feed']);
    else query = query.eq('module', module);
  }
  
  if (search) {
    query = query.or(`notes.ilike.%${search}%,material_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/entries', requireSupabase, requirePermission('entries.create'), async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid entry', details: parsed.error.flatten() });
  const payload = normalizeEntry(parsed.data);
  payload.created_by = (req.user?.profileExists && req.user?.id) ? req.user.id : null;
  const { data, error } = await supabase.from('data_entries').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'create', 'data_entries', data.id, null, data);
  res.status(201).json(data);
});

app.post('/api/entries/batch', requireSupabase, requirePermission('entries.import'), async (req, res) => {
  // Accept both the CSV shape ({ entries: [...] }) and the native editor shape ([...]).
  const rows = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.entries) ? req.body.entries : []);
  if (!rows.length) return res.status(400).json({ error: 'entries array is required' });
  const payload = [];
  for (const row of rows) {
    const parsed = entrySchema.safeParse(row);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid entry in batch', details: parsed.error.flatten(), row });
    const normalized = { ...normalizeEntry(parsed.data), created_by: (req.user?.profileExists && req.user?.id) ? req.user.id : null };
    if (row.id) normalized.id = row.id;
    payload.push(normalized);
  }
  const { data, error } = await supabase.from('data_entries').upsert(payload).select('*');
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'import', 'data_entries', null, null, { inserted: data?.length || 0 });
  res.status(201).json({ inserted: data?.length || 0, data: data || [] });
});

app.put('/api/entries/:id', requireSupabase, requirePermission('entries.edit'), async (req, res) => {
  const oldRow = await supabase.from('data_entries').select('*').eq('id', req.params.id).maybeSingle();
  const parsed = entrySchema.partial({ module: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid entry', details: parsed.error.flatten() });
  const payload = normalizeEntry({ ...parsed.data, module: parsed.data.module || req.body.module || oldRow.data?.module || 'rdf' });
  delete payload.module;
  payload.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('data_entries').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'update', 'data_entries', data.id, oldRow.data || null, data);
  res.json(data);
});

app.delete('/api/entries/:id', requireSupabase, requirePermission('entries.delete'), async (req, res) => {
  const oldRow = await supabase.from('data_entries').select('*').eq('id', req.params.id).maybeSingle();
  const { error } = await supabase.from('data_entries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'delete', 'data_entries', req.params.id, oldRow.data || null, null);
  res.json({ ok: true });
});

// Ensure uploads folder exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({ dest: 'uploads/' });

app.post('/api/fmhy/import', requireSupabase, requirePermission('entries.create'), upload.single('file'), async (req, res) => {
  try {
    const commit = req.body.commit === 'true' || req.body.commit === true;
    const overwrite = req.body.overwrite === 'true' || req.body.overwrite === true;

    if (commit) {
      const entriesToSave = Array.isArray(req.body.entries) ? req.body.entries : JSON.parse(req.body.entries || '[]');
      if (!entriesToSave.length) {
        return res.status(400).json({ error: 'No entries to save provided' });
      }

      const period_month = entriesToSave[0].period_month;
      let finalPayload = [];

      if (overwrite) {
        // Overwrite mode: delete existing entries for this month that match the modules we are importing
        const modulesToOverwrite = [...new Set(entriesToSave.map(e => e.module))];
        const { error: delError } = await supabase
          .from('data_entries')
          .delete()
          .eq('period_month', period_month)
          .in('module', modulesToOverwrite);

        if (delError) return res.status(500).json({ error: delError.message });

        finalPayload = entriesToSave.map(e => {
          const { isDuplicate, id, created_at, updated_at, ...rest } = e;
          return { ...rest, created_by: (req.user?.profileExists && req.user?.id) ? req.user.id : null };
        });
      } else {
        // Skip mode (Default): filter out duplicates
        const { data: existing, error: fetchErr } = await supabase
          .from('data_entries')
          .select('*')
          .eq('period_month', period_month);

        if (fetchErr) return res.status(500).json({ error: fetchErr.message });

        const nonDuplicates = entriesToSave.filter(candidate => {
          const isDuplicate = existing.some(
            ex => ex.module === candidate.module && ex.category_code === candidate.category_code
          );
          return !isDuplicate;
        });

        finalPayload = nonDuplicates.map(e => {
          const { isDuplicate, id, created_at, updated_at, ...rest } = e;
          return { ...rest, created_by: (req.user?.profileExists && req.user?.id) ? req.user.id : null };
        });
      }

      if (finalPayload.length > 0) {
        const { data, error } = await supabase.from('data_entries').insert(finalPayload).select('*');
        if (error) return res.status(500).json({ error: error.message });
        await audit(req, 'import', 'data_entries', null, null, { source: 'fmhy_import', count: data.length });
        
        const summary = `นำเข้าข้อมูลรายงาน FM-HY สำเร็จทั้งหมด ${data.length} รายการสำหรับเดือน ${entriesToSave[0].period_month.slice(0, 7)} (ข้ามข้อมูลที่ซ้ำกัน ${entriesToSave.length - data.length} รายการ)`;
        return res.json({ success: true, count: data.length, summary });
      } else {
        return res.json({ success: true, count: 0, summary: 'ข้ามข้อมูลทั้งหมดเนื่องจากซ้ำกับข้อมูลที่มีอยู่แล้วในระบบ' });
      }
    }

    // Parse and Analyze Stage
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a PDF file' });
    }

    const filePath = req.file.path;
    const pythonExecutable = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\platform\\bundledpython\\python.exe';
    const parserScript = path.join(__dirname, 'fmhy-parser.py');

    execFile(pythonExecutable, [parserScript, filePath], async (err, stdout, stderr) => {
      // Clean up uploaded file
      try { fs.unlinkSync(filePath); } catch (e) {}

      if (err) {
        console.error('Parser error:', err, stderr);
        return res.status(500).json({ error: 'Failed to parse PDF', details: err.message });
      }

      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.success) {
          return res.status(422).json({ error: parsed.error || 'Invalid report structure' });
        }

        const period_month = `${parsed.month}-01`;
        const { data: existingEntries, error: fetchErr } = await supabase
          .from('data_entries')
          .select('*')
          .eq('period_month', period_month);

        if (fetchErr) return res.status(500).json({ error: fetchErr.message });

        const candidateEntries = [
          { module: 'tissue', category_code: 'tissue_roll', material_name: 'กระดาษทิชชู่ ม้วน', quantity: parsed.data.tissue.roll, unit: 'ม้วน' },
          { module: 'tissue', category_code: 'tissue_hand', material_name: 'กระดาษทิชชู่ มือ', quantity: parsed.data.tissue.hand, unit: 'แผ่น' },
          { module: 'tissue', category_code: 'tissue_popup', material_name: 'กระดาษทิชชู่ ป๊อปอัพ', quantity: parsed.data.tissue.popup, unit: 'แพ็ค' },
          { module: 'rdf', category_code: 'RDF', material_name: 'ขยะ RDF', weight_kg: parsed.data.waste.rdf, unit: 'kg' },
          { module: 'recycle', category_code: 'recycle_other', material_name: 'ขยะรีไซเคิล', weight_kg: parsed.data.waste.recycle_weight, amount: parsed.data.recycle_revenue, unit: 'kg' },
          { module: 'pig_feed', category_code: 'PIG_FEED', material_name: 'อาหารหมู (ขยะเปียก)', weight_kg: parsed.data.animal_feed.pig_feed, unit: 'kg' },
          { module: 'dog_food', category_code: 'DOG_FOOD', material_name: 'อาหารสุนัข (ขยะเปียก)', weight_kg: parsed.data.animal_feed.dog_food, unit: 'kg' },
          { module: 'black_bag', category_code: 'black_bag_small', material_name: 'ถุงดำเล็ก (30x40)', quantity: parsed.data.garbage_bags.small, unit: 'ใบ' },
          { module: 'black_bag', category_code: 'black_bag_medium', material_name: 'ถุงดำกลาง (28x36)', quantity: parsed.data.garbage_bags.medium, unit: 'ใบ' },
          { module: 'black_bag', category_code: 'black_bag_large', material_name: 'ถุงดำใหญ่ (18x20)', quantity: parsed.data.garbage_bags.large, unit: 'ใบ' }
        ].map(item => ({
          ...item,
          entry_date: period_month,
          period_month: period_month,
          metadata: { source: 'fmhy_import' }
        }));

        const entries = candidateEntries.map(candidate => {
          const isDuplicate = existingEntries.some(
            ex => ex.module === candidate.module && ex.category_code === candidate.category_code
          );
          return {
            ...candidate,
            isDuplicate
          };
        });

        const hasConflicts = entries.some(e => e.isDuplicate);

        res.json({
          success: true,
          month: parsed.month,
          thai_month: parsed.thai_month,
          year_be: parsed.year_be,
          entries,
          hasConflicts
        });
      } catch (e) {
        console.error('Failed to process JSON output:', e, stdout);
        res.status(500).json({ error: 'Failed to process parser output', details: e.message });
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dashboard', requireSupabase, requirePermission('dashboard.read'), async (req, res) => {
  const month = monthStart(req.query.month || new Date().toISOString().slice(0, 7));
  const { data, error } = await supabase.from('data_entries').select('*').eq('period_month', month);
  if (error) return res.status(500).json({ error: error.message });
  const summary = summarizeRows(data || []);
  res.json({ month, ...summary });
});

app.get('/api/data-quality', requireSupabase, requirePermission('quality.read'), async (req, res) => {
  const month = monthStart(req.query.month || new Date().toISOString().slice(0, 7));
  const { data, error } = await supabase.from('data_entries').select('module,entry_date,weight_kg,quantity,amount').eq('period_month', month);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ month, scores: buildQualityScores(data || [], month) });
});

app.get('/api/insights', requireSupabase, requirePermission('insights.read'), async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const modules = String(req.query.modules || MODULE_ORDER.join(',')).split(',').filter(Boolean);
    const rows = await getEntriesForMonth(month, modules);
    const previousRows = await getEntriesForMonth(previousMonth(month), modules);
    res.json(buildAdvancedInsights({ month, rows, previousRows }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/charts/preview', requireSupabase, requirePermission('charts.read'), async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const modules = String(req.query.modules || MODULE_ORDER.join(',')).split(',').filter(Boolean);
    const rows = await getEntriesForMonth(month, modules);
    res.json(buildChartPreview({ month, rows, modules }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/preview', requireSupabase, requirePermission('reports.preview'), async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const modules = String(req.query.modules || MODULE_ORDER.join(',')).split(',').filter(Boolean);
    const rows = await getEntriesForMonth(month, modules);
    const previousRows = await getEntriesForMonth(previousMonth(month), modules);
    const summary = summarizeRows(rows);
    const insights = buildAdvancedInsights({ month, rows, previousRows });
    const chartPreview = buildChartPreview({ month, rows, modules });
    const outline = buildReportOutline({ month, title: req.query.title || 'รายงานขยะประจำเดือน', modules, summary, insights, charts: chartPreview.charts });
    res.json({ month: monthStart(month), modules, summary, insights, charts: chartPreview.charts, outline });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reports/powerpoint', requireSupabase, requirePermission('reports.export'), async (req, res) => {
  try {
    const month = req.body.month || new Date().toISOString().slice(0, 7);
    const modules = Array.isArray(req.body.modules) && req.body.modules.length ? req.body.modules : MODULE_ORDER;
    const rows = await getEntriesForMonth(month, modules);
    const previousRows = await getEntriesForMonth(previousMonth(month), modules);
    const summary = summarizeRows(rows);
    const insights = buildAdvancedInsights({ month, rows, previousRows });
    const chartPreview = buildChartPreview({ month, rows, modules });
    const outline = Array.isArray(req.body.outline) && req.body.outline.length
      ? req.body.outline
      : buildReportOutline({ month, title: req.body.title, modules, summary, insights, charts: chartPreview.charts });
    const buffer = await createPowerPointBuffer({ month, title: req.body.title, outline, rows, summary, insights, charts: chartPreview.charts });
    const safeMonth = monthStart(month).slice(0, 7);
    await supabase.from('report_runs').insert({
      report_type: 'powerpoint',
      title: req.body.title || 'รายงานขยะประจำเดือน',
      period_month: monthStart(month),
      modules,
      outline,
      status: 'success',
      created_by: (req.user?.profileExists && req.user?.id) ? req.user.id : null
    });
    await audit(req, 'export_powerpoint', 'report_runs', null, null, { month: safeMonth, modules, slides: outline.filter(s => s.enabled !== false).length, charts: chartPreview.charts.length });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="CKAP-${safeMonth}.pptx"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', requireSupabase, requirePermission('users.read'), async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/users', requireSupabase, requirePermission('users.manage'), async (req, res) => {
  const schema = z.object({ email: z.string().email(), display_name: z.string().min(1), role: z.string().min(1), active: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user', details: parsed.error.flatten() });
  const redirectTo = `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/?set-password=1`;
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo, data: { display_name: parsed.data.display_name, role: parsed.data.role } }
  );
  if (authError) return res.status(500).json({ error: authError.message });
  const profilePayload = { id: authData.user.id, email: parsed.data.email, display_name: parsed.data.display_name, role: parsed.data.role, active: parsed.data.active ?? true };
  const { data, error } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' }).select('*').single();
  if (error) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: error.message });
  }
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'create', 'profiles', data.id, null, data);
  res.status(201).json(data);
});

app.post('/api/users/:id/resend-invite', requireSupabase, requirePermission('users.manage'), async (req, res) => {
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', req.params.id).single();
  if (profileError) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const redirectTo = `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/?set-password=1`;
  const { error } = await supabase.auth.resetPasswordForEmail(profile.email, { redirectTo });
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'resend_invite', 'profiles', profile.id, null, { email: profile.email });
  res.json({ ok: true });
});

app.put('/api/users/:id', requireSupabase, requirePermission('users.manage'), async (req, res) => {
  const oldRow = await supabase.from('profiles').select('*').eq('id', req.params.id).maybeSingle();
  const payload = {
    email: req.body.email,
    display_name: req.body.display_name,
    role: req.body.role,
    active: req.body.active,
    updated_at: new Date().toISOString()
  };
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
  const { data, error } = await supabase.from('profiles').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'update', 'profiles', data.id, oldRow.data || null, data);
  res.json(data);
});

app.delete('/api/users/:id', requireSupabase, requirePermission('users.manage'), async (req, res) => {
  const oldRow = await supabase.from('profiles').select('*').eq('id', req.params.id).maybeSingle();
  const { error } = await supabase.from('profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  const { error: authError } = await supabase.auth.admin.deleteUser(req.params.id);
  if (authError && !String(authError.message || '').toLowerCase().includes('not found')) {
    return res.status(500).json({ error: authError.message });
  }
  await audit(req, 'delete', 'profiles', req.params.id, oldRow.data || null, null);
  res.json({ ok: true });
});

app.get('/api/roles', requireSupabase, requirePermission('roles.read'), async (req, res) => {
  const roles = await supabase.from('roles').select('*').order('sort_order');
  if (roles.error) return res.status(500).json({ error: roles.error.message });
  const permissions = await supabase.from('permissions').select('*').order('sort_order');
  if (permissions.error) return res.status(500).json({ error: permissions.error.message });
  const matrix = await supabase.from('role_permissions').select('*');
  if (matrix.error) return res.status(500).json({ error: matrix.error.message });
  res.json({ roles: roles.data || [], permissions: permissions.data || [], role_permissions: matrix.data || [] });
});

app.put('/api/roles/:roleKey/permissions', requireSupabase, requirePermission('roles.manage'), async (req, res) => {
  const roleKey = req.params.roleKey;
  const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
  const { error: delError } = await supabase.from('role_permissions').delete().eq('role_key', roleKey);
  if (delError) return res.status(500).json({ error: delError.message });
  if (permissions.length) {
    const payload = permissions.map(permission_key => ({ role_key: roleKey, permission_key, allowed: true }));
    const { error } = await supabase.from('role_permissions').insert(payload);
    if (error) return res.status(500).json({ error: error.message });
  }
  await audit(req, 'update_permissions', 'role_permissions', null, null, { role_key: roleKey, permissions });
  res.json({ ok: true, role_key: roleKey, permissions });
});

app.get('/api/audit-logs', requireSupabase, requirePermission('audit.read'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 300);
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/automation/jobs', requireSupabase, requirePermission('automation.read'), async (req, res) => {
  const { data, error } = await supabase.from('automation_jobs').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/automation/jobs', requireSupabase, requirePermission('automation.manage'), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    action_type: z.enum(['data_quality_check', 'monthly_summary', 'report_preview', 'ai_insight_check', 'chart_preview']),
    enabled: z.boolean().optional(),
    interval_minutes: z.union([z.number(), z.string()]).optional(),
    next_run_at: z.string().optional().nullable(),
    config: z.record(z.any()).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid automation job', details: parsed.error.flatten() });
  const payload = {
    ...parsed.data,
    enabled: parsed.data.enabled ?? true,
    interval_minutes: Number(parsed.data.interval_minutes || 1440),
    next_run_at: parsed.data.next_run_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    config: parsed.data.config || {},
    created_by: (req.user?.profileExists && req.user?.id) ? req.user.id : null
  };
  const { data, error } = await supabase.from('automation_jobs').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'create', 'automation_jobs', data.id, null, data);
  res.status(201).json(data);
});

app.put('/api/automation/jobs/:id', requireSupabase, requirePermission('automation.manage'), async (req, res) => {
  const oldRow = await supabase.from('automation_jobs').select('*').eq('id', req.params.id).maybeSingle();
  const payload = { ...req.body, updated_at: new Date().toISOString() };
  if (payload.interval_minutes !== undefined) payload.interval_minutes = Number(payload.interval_minutes);
  const { data, error } = await supabase.from('automation_jobs').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'update', 'automation_jobs', data.id, oldRow.data || null, data);
  res.json(data);
});

app.post('/api/automation/jobs/:id/run', requireSupabase, requirePermission('automation.run'), async (req, res) => {
  const { data: job, error } = await supabase.from('automation_jobs').select('*').eq('id', req.params.id).single();
  if (error) return res.status(500).json({ error: error.message });
  const result = await runAutomationJob(job, req);
  await supabase.from('automation_jobs').update({ last_run_at: new Date().toISOString() }).eq('id', job.id);
  await audit(req, 'run', 'automation_jobs', job.id, null, result);
  res.json(result);
});

app.get('/api/automation/runs', requireSupabase, requirePermission('automation.read'), async (req, res) => {
  const { data, error } = await supabase.from('automation_runs').select('*').order('started_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET all categories (both active and inactive) for Settings
app.get('/api/master-categories/all', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const { data, error } = await supabase.from('master_categories').select('*').order('sort_order', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const mapped = (data || []).map(item => ({ ...item, color: item.color_hex || item.color }));
  res.json(mapped);
});

// POST to create a master category
app.post('/api/master-categories', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const schema = z.object({
    module: z.enum(['rdf', 'dog_food', 'pig_feed', 'wet_waste', 'recycle', 'tissue', 'black_bag', 'waste', 'animal_feed', 'garbage_bag', 'scrap_material', 'consumable']),
    code: z.string().min(1),
    name_th: z.string().min(1),
    name_en: z.string().optional().nullable(),
    unit: z.string().min(1),
    color: z.string().optional().nullable(),
    sort_order: z.number().int().optional().default(0),
    active: z.boolean().optional().default(true)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid master category payload', details: parsed.error.flatten() });
  
  const payload = {
    module: parsed.data.module,
    code: parsed.data.code,
    name_th: parsed.data.name_th,
    name_en: parsed.data.name_en || null,
    unit: parsed.data.unit,
    color: parsed.data.color || null,
    sort_order: parsed.data.sort_order,
    active: parsed.data.active
  };

  const { data, error } = await supabase.from('master_categories').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'create', 'master_categories', data.id, null, data);
  res.status(201).json(data);
});

// PUT to edit a master category
app.put('/api/master-categories/:id', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const oldRow = await supabase.from('master_categories').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'Category not found' });

  const schema = z.object({
    name_th: z.string().min(1).optional(),
    name_en: z.string().optional().nullable(),
    unit: z.string().min(1).optional(),
    color: z.string().optional().nullable(),
    sort_order: z.number().int().optional(),
    active: z.boolean().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update payload', details: parsed.error.flatten() });

  const payload = {
    name_th: parsed.data.name_th,
    name_en: parsed.data.name_en,
    unit: parsed.data.unit,
    color: parsed.data.color,
    sort_order: parsed.data.sort_order,
    active: parsed.data.active,
    updated_at: new Date().toISOString()
  };

  // Remove undefined fields
  Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

  const { data, error } = await supabase.from('master_categories').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, 'update', 'master_categories', data.id, oldRow.data, data);
  res.json(data);
});

// DELETE a master category (blocks deletion if used in data_entries)
app.delete('/api/master-categories/:id', requireSupabase, requirePermission('settings.manage'), async (req, res) => {
  const oldRow = await supabase.from('master_categories').select('*').eq('id', req.params.id).maybeSingle();
  if (!oldRow.data) return res.status(404).json({ error: 'Category not found' });

  // Check if used in data_entries
  const { count, error: countErr } = await supabase
    .from('data_entries')
    .select('id', { count: 'exact', head: true })
    .eq('category_code', oldRow.data.code);

  if (countErr) return res.status(500).json({ error: countErr.message });
  if (count > 0) {
    return res.status(400).json({
      error: 'Cannot delete category: it has active data entries in the system. Please set active = false to deactivate it instead.'
    });
  }

  // Otherwise, delete physically
  const { error: delErr } = await supabase.from('master_categories').delete().eq('id', req.params.id);
  if (delErr) return res.status(500).json({ error: delErr.message });
  await audit(req, 'delete', 'master_categories', req.params.id, oldRow.data, null);
  res.json({ ok: true });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

if (process.env.AUTOMATION_RUNNER_ENABLED === 'true') {
  setInterval(() => automationTick().catch(error => console.warn('Automation tick failed:', error.message)), 60 * 1000);
}

const defaultMasterCategories = [
  { module: 'tissue', code: 'tissue_roll', name_th: 'ม้วน', unit: 'ม้วน', color: '#3B82F6', sort_order: 10 },
  { module: 'tissue', code: 'tissue_hand', name_th: 'มือ', unit: 'แผ่น', color: '#10B981', sort_order: 20 },
  { module: 'tissue', code: 'tissue_popup', name_th: 'ป๊อปอัพ', unit: 'แพ็ค', color: '#F59E0B', sort_order: 30 },
  { module: 'recycle', code: 'recycle_pet', name_th: 'ขวดพลาสติก PET', unit: 'kg', color: '#3B82F6', sort_order: 10 },
  { module: 'recycle', code: 'recycle_cardboard', name_th: 'กระดาษลัง', unit: 'kg', color: '#F59E0B', sort_order: 20 },
  { module: 'recycle', code: 'recycle_iron', name_th: 'เหล็ก', unit: 'kg', color: '#6B7280', sort_order: 30 },
  { module: 'recycle', code: 'recycle_aluminum', name_th: 'อลูมิเนียม', unit: 'kg', color: '#EC4899', sort_order: 40 },
  { module: 'recycle', code: 'recycle_glass', name_th: 'ขวดแก้ว', unit: 'kg', color: '#10B981', sort_order: 50 },
  { module: 'recycle', code: 'recycle_other', name_th: 'อื่น ๆ', unit: 'kg', color: '#8B5CF6', sort_order: 60 },
  { module: 'black_bag', code: 'black_bag_small', name_th: 'ถุงดำเล็ก', unit: 'ใบ', color: '#64748B', sort_order: 10 },
  { module: 'black_bag', code: 'black_bag_medium', name_th: 'ถุงดำกลาง', unit: 'ใบ', color: '#475569', sort_order: 20 },
  { module: 'black_bag', code: 'black_bag_large', name_th: 'ถุงดำใหญ่', unit: 'ใบ', color: '#334155', sort_order: 30 }
];

async function seedMasterCategoriesIfEmpty() {
  if (!supabase) return;
  try {
    const { count, error } = await supabase.from('master_categories').select('id', { count: 'exact', head: true });
    if (error) {
      console.log('Note: master_categories table not found. Please run the SQL migration script: supabase/MIGRATION_MASTER_DATA.sql');
      return;
    }
    if (count === 0) {
      console.log('Seeding default master categories into database...');
      const { error: insertError } = await supabase.from('master_categories').insert(defaultMasterCategories);
      if (insertError) {
        console.error('Failed to seed master categories:', insertError.message);
      } else {
        console.log('Successfully seeded default master categories.');
      }
    }
  } catch (err) {
    console.warn('DB check/seed error:', err.message);
  }
}

app.listen(PORT, () => {
  console.log(`CKAP Backend ${VERSION} running on port ${PORT}`);
  seedMasterCategoriesIfEmpty().catch(err => console.warn('Seeding failed:', err.message));
});
