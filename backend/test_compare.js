import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: "./.env" });

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function parsePeriod(str, modeType) {
  if (modeType === "year") {
    const y = Number(str);
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `ปี ${y + 543} (${y})`, key: String(y) };
  } else if (modeType === "quarter") {
    const qMatch = /^(\d{4})-?Q?(\d)$/i.exec(str);
    const y = Number(qMatch[1]);
    const q = Number(qMatch[2]);
    const firstMonth = (q - 1) * 3 + 1;
    const lastMonth = firstMonth + 2;
    const lastDay = new Date(Date.UTC(y, lastMonth, 0)).getUTCDate();
    return {
      start: `${y}-${String(firstMonth).padStart(2, "0")}-01`,
      end: `${y}-${String(lastMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      label: `Q${q}/${y + 543} (${y})`,
      key: `${y}-Q${q}`
    };
  } else {
    const mMatch = /^(\d{4})-?(\d{2}|\d)$/.exec(str);
    const y = Number(mMatch[1]);
    const m = Number(mMatch[2]);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      start: `${y}-${String(m).padStart(2, "0")}-01`,
      end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      label: `${THAI_MONTHS[m - 1]} ${y + 543} (${y})`,
      key: `${y}-${String(m).padStart(2, "0")}`
    };
  }
}

async function loadCategories(supabase, moduleName) {
  const { data, error } = await supabase
    .from("master_categories")
    .select("id,code,name_th,color_hex,unit")
    .eq("module", moduleName)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

async function run() {
  try {
    const module = "waste";
    const mode = "month";
    const breakdown = "category";
    const metric = "quantity";
    const periodA = "2025-12";
    const periodB = "2026-02";

    const pA = parsePeriod(periodA, mode);
    const pB = parsePeriod(periodB, mode);

    console.log("pA:", pA);
    console.log("pB:", pB);

    const categories = await loadCategories(supabaseAdmin, module);
    console.log("Categories found:", categories.length, categories.map(c => c.name_th));
    
    const ids = categories.map(c => c.id);
    const globalStart = pA.start < pB.start ? pA.start : pB.start;
    const globalEnd = pA.end > pB.end ? pA.end : pB.end;

    console.log("Querying database between:", globalStart, "and", globalEnd);

    const { data: allRecords, error } = await supabaseAdmin.from("daily_entries")
      .select("category_id,entry_date,quantity")
      .in("category_id", ids)
      .gte("entry_date", globalStart).lte("entry_date", globalEnd);

    if (error) throw error;
    console.log("Total records found in range:", allRecords.length);

    const recordsA = allRecords.filter(r => r.entry_date >= pA.start && r.entry_date <= pA.end);
    const recordsB = allRecords.filter(r => r.entry_date >= pB.start && r.entry_date <= pB.end);

    console.log("recordsA count:", recordsA.length);
    console.log("recordsB count:", recordsB.length);

    // Let's print out what rows will be built
    const rows = categories.map(cat => {
      const sumA = recordsA
        .filter(r => r.category_id === cat.id)
        .reduce((s, r) => s + Number(r.quantity || 0), 0);
      const sumB = recordsB
        .filter(r => r.category_id === cat.id)
        .reduce((s, r) => s + Number(r.quantity || 0), 0);
      return { label: cat.name_th, code: cat.code, valueA: sumA, valueB: sumB };
    });
    console.log("Built Rows:", rows);

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
