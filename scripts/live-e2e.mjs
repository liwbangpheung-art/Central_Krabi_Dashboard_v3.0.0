const required = [
  "E2E_BACKEND_BASE_URL",
  "E2E_FRONTEND_ORIGIN",
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_ANON_KEY",
  "E2E_EMAIL",
  "E2E_PASSWORD"
];

const missing = required.filter((key) => !String(process.env[key] || "").trim());
if (missing.length) {
  console.error(`Missing live E2E variables: ${missing.join(", ")}`);
  process.exit(2);
}

function rootUrl(value, label) {
  const raw = String(value).trim();
  const url = new URL(raw);
  if (!/^https?:$/u.test(url.protocol) || raw.endsWith("/") || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be a root HTTP/HTTPS URL without trailing slash or path`);
  }
  return url.origin;
}

const backend = rootUrl(process.env.E2E_BACKEND_BASE_URL, "E2E_BACKEND_BASE_URL");
const frontendOrigin = rootUrl(process.env.E2E_FRONTEND_ORIGIN, "E2E_FRONTEND_ORIGIN");
const supabase = rootUrl(process.env.E2E_SUPABASE_URL, "E2E_SUPABASE_URL");
const anonKey = process.env.E2E_SUPABASE_ANON_KEY.trim();

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} -> ${response.status}: ${JSON.stringify(payload)}`);
  return { response, payload };
}

const health = await jsonRequest(`${backend}/health`, { headers: { Origin: frontendOrigin } });
if (health.payload?.status !== "ok") throw new Error("/health did not return status=ok");
if (health.response.headers.get("access-control-allow-origin") !== frontendOrigin) throw new Error("CORS did not echo the configured frontend origin");

const ready = await jsonRequest(`${backend}/ready`, { headers: { Origin: frontendOrigin } });
if (ready.payload?.status !== "ready") throw new Error("/ready did not return status=ready");

const login = await jsonRequest(`${supabase}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anonKey },
  body: JSON.stringify({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD })
});
const accessToken = login.payload?.access_token;
if (!accessToken) throw new Error("Supabase login did not return an access token");

const me = await jsonRequest(`${backend}/api/me`, {
  headers: { Origin: frontendOrigin, Authorization: `Bearer ${accessToken}` }
});
if (!me.payload?.profile?.id || !["admin", "editor", "viewer"].includes(me.payload.profile.role)) {
  throw new Error("/api/me did not return a valid active profile and role");
}

console.log("Live E2E passed.");
console.log(`- Health ${health.payload.version}`);
console.log("- Ready and database checks passed");
console.log(`- Supabase login passed for ${me.payload.user.email}`);
console.log(`- Profile role: ${me.payload.profile.role}`);
console.log(`- CORS origin: ${frontendOrigin}`);
