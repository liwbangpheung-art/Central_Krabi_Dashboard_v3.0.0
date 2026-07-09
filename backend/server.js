const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { z } = require('zod');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const VERSION = '3.0.0-production-ready';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

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

function normalizeEntry(input) {
  const entryDate = input.entry_date || input.date || monthStart(input.month) || new Date().toISOString().slice(0, 10);
  const periodMonth = monthStart(input.period_month || input.month || entryDate);
  const weight = input.weight_kg === '' || input.weight_kg === undefined ? null : Number(input.weight_kg);
  const quantity = input.quantity === '' || input.quantity === undefined ? null : Number(input.quantity);
  const unitPrice = input.unit_price === '' || input.unit_price === undefined ? null : Number(input.unit_price);
  const explicitAmount = input.amount === '' || input.amount === undefined ? null : Number(input.amount);
  const baseAmount = Number.isFinite(weight) && Number.isFinite(unitPrice) ? weight * unitPrice : explicitAmount;

  return {
    module: input.module,
    category_code: input.category_code || null,
    entry_date: entryDate,
    period_month: periodMonth,
    material_name: input.material_name || input.material || null,
    weight_kg: Number.isFinite(weight) ? weight : null,
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit: input.unit || 'kg',
    unit_price: Number.isFinite(unitPrice) ? unitPrice : null,
    amount: Number.isFinite(baseAmount) ? Number(baseAmount.toFixed(2)) : null,
    notes: input.notes || null,
    metadata: input.metadata || {}
  };
}

const entrySchema = z.object({
  module: z.string().min(1),
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
    id: 'owner-local-session',
    display_name: 'System Owner',
    role: 'owner',
    permissions: ['dashboard.read', 'entries.read', 'entries.write', 'entries.delete', 'reports.export']
  });
});

app.get('/api/master-categories', requireSupabase, async (req, res) => {
  const module = req.query.module;
  let query = supabase.from('master_categories').select('*').eq('active', true).order('sort_order', { ascending: true });
  if (module) query = query.eq('module', module);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/entries', requireSupabase, async (req, res) => {
  const { module, month } = req.query;
  let query = supabase.from('data_entries').select('*').order('entry_date', { ascending: true }).order('created_at', { ascending: true });
  if (month) query = query.eq('period_month', monthStart(month));
  if (module) {
    if (module === 'wet_waste') query = query.in('module', ['dog_food', 'pig_feed']);
    else query = query.eq('module', module);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/entries', requireSupabase, async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid entry', details: parsed.error.flatten() });
  const payload = normalizeEntry(parsed.data);
  const { data, error } = await supabase.from('data_entries').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.post('/api/entries/batch', requireSupabase, async (req, res) => {
  const rows = Array.isArray(req.body?.entries) ? req.body.entries : [];
  if (!rows.length) return res.status(400).json({ error: 'entries array is required' });
  const payload = [];
  for (const row of rows) {
    const parsed = entrySchema.safeParse(row);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid entry in batch', details: parsed.error.flatten(), row });
    payload.push(normalizeEntry(parsed.data));
  }
  const { data, error } = await supabase.from('data_entries').insert(payload).select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ inserted: data?.length || 0, data: data || [] });
});

app.put('/api/entries/:id', requireSupabase, async (req, res) => {
  const parsed = entrySchema.partial({ module: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid entry', details: parsed.error.flatten() });
  const payload = normalizeEntry({ ...parsed.data, module: parsed.data.module || req.body.module || 'rdf' });
  delete payload.module;
  payload.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('data_entries').update(payload).eq('id', req.params.id).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/entries/:id', requireSupabase, async (req, res) => {
  const { error } = await supabase.from('data_entries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.get('/api/dashboard', requireSupabase, async (req, res) => {
  const month = monthStart(req.query.month || new Date().toISOString().slice(0, 7));
  const { data, error } = await supabase.from('data_entries').select('*').eq('period_month', month);
  if (error) return res.status(500).json({ error: error.message });
  const rows = data || [];
  const byModule = {};
  for (const row of rows) {
    if (!byModule[row.module]) byModule[row.module] = { module: row.module, weight_kg: 0, quantity: 0, amount: 0, count: 0 };
    byModule[row.module].weight_kg += Number(row.weight_kg || 0);
    byModule[row.module].quantity += Number(row.quantity || 0);
    byModule[row.module].amount += Number(row.amount || 0);
    byModule[row.module].count += 1;
  }
  const wetWeight = (byModule.dog_food?.weight_kg || 0) + (byModule.pig_feed?.weight_kg || 0);
  res.json({
    month,
    totals: {
      total_weight_kg: rows.reduce((sum, row) => sum + Number(row.weight_kg || 0), 0),
      total_amount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      entry_count: rows.length,
      wet_waste_weight_kg: wetWeight
    },
    modules: Object.values(byModule)
  });
});

app.get('/api/data-quality', requireSupabase, async (req, res) => {
  const month = monthStart(req.query.month || new Date().toISOString().slice(0, 7));
  const { data, error } = await supabase.from('data_entries').select('module,entry_date,weight_kg,quantity,amount').eq('period_month', month);
  if (error) return res.status(500).json({ error: error.message });
  const rows = data || [];
  const modules = ['rdf', 'dog_food', 'pig_feed', 'recycle', 'tissue', 'black_bag'];
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const monthlyModules = new Set(['pig_feed', 'black_bag']);
  const scores = modules.map(module => {
    const moduleRows = rows.filter(row => row.module === module);
    const uniqueDays = new Set(moduleRows.map(row => row.entry_date)).size;
    const expected = monthlyModules.has(module) ? 1 : daysInMonth;
    const completeness = moduleRows.length ? moduleRows.filter(row => row.weight_kg !== null || row.quantity !== null || row.amount !== null).length / moduleRows.length : 0;
    const coverage = Math.min(uniqueDays / expected, 1);
    const score = Math.round((coverage * 70) + (completeness * 30));
    return { module, score, entries: moduleRows.length, covered_days: uniqueDays, expected_days: expected };
  });
  res.json({ month, scores });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () => {
  console.log(`CKAP Backend ${VERSION} running on port ${PORT}`);
});
