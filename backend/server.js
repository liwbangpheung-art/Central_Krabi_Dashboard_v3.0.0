import { readEnvironment } from "./src/config/env.js";
import { createSupabaseAdmin } from "./src/config/supabase.js";
import { createApp } from "./src/app.js";

try {
  const config = readEnvironment();
  const supabaseAdmin = createSupabaseAdmin(config);
  const app = createApp({ config, supabaseAdmin });

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Central Krabi API listening on http://0.0.0.0:${config.port}`);
    console.log(`Allowed origins: ${config.allowedOrigins.join(", ")}`);
  });

  function shutdown(signal) {
    console.log(`${signal} received. Closing server...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  console.error("Backend failed to start.");
  console.error(error.message);
  if (error.issues) {
    for (const issue of error.issues) console.error(`- ${issue}`);
  }
  process.exit(1);
}
