import { readEnvironment } from "../src/config/env.js";

try {
  const config = readEnvironment();
  console.log("Backend environment is valid.");
  console.log({
    nodeEnv: config.nodeEnv,
    port: config.port,
    supabaseUrl: config.supabaseUrl,
    hasServiceRoleKey: Boolean(config.serviceRoleKey),
    allowedOrigins: config.allowedOrigins,
    organizationName: config.organizationName
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
