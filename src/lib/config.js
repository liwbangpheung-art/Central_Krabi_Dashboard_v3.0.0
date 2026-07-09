function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function validateFrontendEnvironment(environment = {}) {
  const issues = [];
  const supabaseUrlValue = String(environment.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = String(environment.VITE_SUPABASE_ANON_KEY ?? "").trim();
  const apiBaseUrlValue = String(environment.VITE_API_BASE_URL ?? "").trim();
  const supabaseUrl = parseHttpUrl(supabaseUrlValue);
  const apiBaseUrl = parseHttpUrl(apiBaseUrlValue);

  if (!supabaseUrlValue) issues.push("VITE_SUPABASE_URL ยังไม่ได้ตั้งค่า");
  else if (!supabaseUrl) issues.push("VITE_SUPABASE_URL ไม่ใช่ HTTP/HTTPS URL ที่ถูกต้อง");
  else if (!supabaseUrl.hostname.endsWith(".supabase.co")) issues.push("VITE_SUPABASE_URL ควรเป็น Supabase Project URL ที่ลงท้ายด้วย .supabase.co");

  if (!anonKey) issues.push("VITE_SUPABASE_ANON_KEY ยังไม่ได้ตั้งค่า");

  if (!apiBaseUrlValue) issues.push("VITE_API_BASE_URL ยังไม่ได้ตั้งค่า");
  else if (!apiBaseUrl) issues.push("VITE_API_BASE_URL ไม่ใช่ HTTP/HTTPS URL ที่ถูกต้อง");
  else {
    if (apiBaseUrlValue.endsWith("/")) issues.push("VITE_API_BASE_URL ต้องไม่มี / ท้าย URL");
    if (apiBaseUrl.pathname !== "/" || apiBaseUrl.search || apiBaseUrl.hash) {
      issues.push("VITE_API_BASE_URL ต้องเป็น URL รากของ Backend และต้องไม่มี /api หรือ Path อื่น");
    }
    if (apiBaseUrl.username || apiBaseUrl.password) issues.push("VITE_API_BASE_URL ต้องไม่มี Username หรือ Password ใน URL");
  }

  return {
    issues,
    config: {
      supabaseUrl: supabaseUrl?.origin ?? supabaseUrlValue.replace(/\/$/u, ""),
      anonKey,
      apiUrl: apiBaseUrl?.origin ?? apiBaseUrlValue.replace(/\/$/u, ""),
      organizationName: String(environment.VITE_ORGANIZATION_NAME ?? "Central Krabi").trim() || "Central Krabi"
    }
  };
}

const runtimeEnvironment = import.meta.env ?? {};
export const frontendEnvironment = validateFrontendEnvironment(runtimeEnvironment);
