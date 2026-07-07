import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createAuthenticationMiddleware } from "./middleware/auth.js";
import { requestContext } from "./middleware/request-context.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { createHealthRouter } from "./routes/health.routes.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createMasterDataRouter } from "./routes/master-data.routes.js";
import { createDailyEntryRouter } from "./routes/daily-entry.routes.js";
import { createScrapSalesRouter } from "./routes/scrap-sales.routes.js";
import { createAnalyticsRouter } from "./routes/analytics.routes.js";
import { createExportRouter } from "./routes/export.routes.js";
import { createUsersRouter } from "./routes/users.routes.js";
import { createDataGovernanceRouter } from "./routes/data-governance.routes.js";
import { HttpError } from "./http/errors.js";
import { createApiRateLimiter, createSensitiveRateLimiter } from "./middleware/rate-limit.js";

export function createApp({ config, supabaseAdmin }) {
  const app = express();
  const authenticate = createAuthenticationMiddleware(supabaseAdmin);
  app.locals.organizationName = config.organizationName;
  app.locals.reportStorageBucket = config.reportStorageBucket;

  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new HttpError(
        403,
        "CORS_ORIGIN_FORBIDDEN",
        `Origin ไม่ได้รับอนุญาต: ${origin}`,
        { allowedOrigins: config.allowedOrigins }
      ));
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    optionsSuccessStatus: 204
  }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createApiRateLimiter(config));
  app.use(["/api/users", "/api/report-presets", "/api/reports/powerpoint"], createSensitiveRateLimiter(config));

  app.use(createHealthRouter({ config, supabaseAdmin }));
  app.use("/api", createAuthRouter(authenticate));
  app.use("/api", createMasterDataRouter({ supabaseAdmin, authenticate }));
  app.use("/api", createDailyEntryRouter({ supabaseAdmin, authenticate }));
  app.use("/api", createScrapSalesRouter({ supabaseAdmin, authenticate }));
  app.use("/api", createAnalyticsRouter({ supabaseAdmin, authenticate }));
  app.use("/api", createExportRouter({ supabaseAdmin, authenticate }));
  app.use("/api", createUsersRouter({ supabaseAdmin, authenticate }));
  app.use("/api", createDataGovernanceRouter({ supabaseAdmin, authenticate }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
