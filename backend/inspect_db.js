import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: "./.env" });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from("daily_entries")
    .select("entry_date, category_id, quantity")
    .order("entry_date", { ascending: false })
    .limit(10);
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Data:", data);
  }
}

run();
