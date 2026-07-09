import "dotenv/config";

export class EnvironmentConfigurationError extends Error {
  constructor(issues) {
    super(`Environment configuration is invalid: ${issues.join(" | ")}`);
    this.name = "EnvironmentConfigurationError";
    this.issues = issues;
  }
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function validateRootOrigin(value, label, issues) {
  const parsed = parseHttpUrl(value);
  if (!parsed) {
    issues.push(`${label} must be a valid HTTP/HTTPS URL`);
    return null;
  }
  if (value.endsWith("/")) issues.push(`${label} must not end with /`);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    issues.push(`${label} must be a root origin without path, query, hash, or credentials`);
  }
  return parsed.origin;
}

export function readEnvironment(source = process.env) {
  const issues = [];
  const supabaseUrlValue = String(source.SUPABASE_URL ?? "").trim();
  const serviceRoleKey = String(source.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const port = Number(source.PORT ?? 3000);
  const rateLimitWindowMinutes = Number(source.RATE_LIMIT_WINDOW_MINUTES ?? 15);
  const rateLimitMaxRequests = Number(source.RATE_LIMIT_MAX_REQUESTS ?? 300);
  const sensitiveRateLimitWindowMinutes = Number(source.SENSITIVE_RATE_LIMIT_WINDOW_MINUTES ?? 15);
  const sensitiveRateLimitMaxRequests = Number(source.SENSITIVE_RATE_LIMIT_MAX_REQUESTS ?? 60);
  const originValues = String(source.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const supabaseUrl = parseHttpUrl(supabaseUrlValue);
  if (!supabaseUrlValue) issues.push("SUPABASE_URL is required");
  else if (!supabaseUrl) issues.push("SUPABASE_URL must be a valid HTTP/HTTPS URL");
  else if (!supabaseUrl.hostname.endsWith(".supabase.co")) issues.push("SUPABASE_URL should be the Supabase Project URL ending in .supabase.co");

  if (!serviceRoleKey) issues.push("SUPABASE_SERVICE_ROLE_KEY is required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) issues.push("PORT must be an integer between 1 and 65535");
  if (!Number.isFinite(rateLimitWindowMinutes) || rateLimitWindowMinutes < 1 || rateLimitWindowMinutes > 1440) issues.push("RATE_LIMIT_WINDOW_MINUTES must be between 1 and 1440");
  if (!Number.isInteger(rateLimitMaxRequests) || rateLimitMaxRequests < 10 || rateLimitMaxRequests > 10000) issues.push("RATE_LIMIT_MAX_REQUESTS must be an integer between 10 and 10000");
  if (!Number.isFinite(sensitiveRateLimitWindowMinutes) || sensitiveRateLimitWindowMinutes < 1 || sensitiveRateLimitWindowMinutes > 1440) issues.push("SENSITIVE_RATE_LIMIT_WINDOW_MINUTES must be between 1 and 1440");
  if (!Number.isInteger(sensitiveRateLimitMaxRequests) || sensitiveRateLimitMaxRequests < 5 || sensitiveRateLimitMaxRequests > 1000) issues.push("SENSITIVE_RATE_LIMIT_MAX_REQUESTS must be an integer between 5 and 1000");
  if (!originValues.length) issues.push("CORS_ORIGIN must contain at least one origin");

  const allowedOrigins = originValues
    .map((origin, index) => validateRootOrigin(origin, `CORS_ORIGIN[${index}]`, issues))
    .filter(Boolean);

  if (new Set(allowedOrigins).size !== allowedOrigins.length) issues.push("CORS_ORIGIN contains duplicate origins");
  if (issues.length) throw new EnvironmentConfigurationError(issues);

  return Object.freeze({
    nodeEnv: String(source.NODE_ENV ?? "development"),
    port,
    supabaseUrl: supabaseUrl.origin,
    serviceRoleKey,
    allowedOrigins,
    reportStorageBucket: String(source.REPORT_STORAGE_BUCKET ?? "report-files").trim() || "report-files",
    rateLimitWindowMinutes,
    rateLimitMaxRequests,
    sensitiveRateLimitWindowMinutes,
    sensitiveRateLimitMaxRequests,
    organizationName: String(source.ORGANIZATION_NAME ?? "Central Krabi").trim() || "Central Krabi"
  });
}
