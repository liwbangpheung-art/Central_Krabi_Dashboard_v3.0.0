import { createClient } from "@supabase/supabase-js";

export function createSupabaseBrowserClient(config) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
