const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0.0', platform: 'Central Krabi Analytics Platform' });
});

// Example: Get master categories
app.get('/api/master-categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('master_categories')
      .select('*')
      .eq('active', true)
      .order('sort_order');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TODO: Add more routes for daily_entries, scrap_sales, analytics, pptx, etc.

app.listen(PORT, () => {
  console.log(`🚀 CKAP Backend v3 running on port ${PORT}`);
});
