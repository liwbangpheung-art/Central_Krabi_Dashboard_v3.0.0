function minutes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60 * 1000 : 15 * 60 * 1000;
}

function clientKey(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || "").split(",")[0];
  return (forwardedIp || req.ip || req.socket?.remoteAddress || "unknown").trim();
}

function createLocalRateLimiter({ windowMs, limit, errorCode }) {
  const hits = new Map();

  return function localRateLimiter(req, res, next) {
    const now = Date.now();
    const key = clientKey(req);
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Limit", String(limit));
      res.setHeader("RateLimit-Remaining", String(Math.max(limit - 1, 0)));
      res.setHeader("RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
      return next();
    }

    current.count += 1;
    const remaining = Math.max(limit - current.count, 0);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));

    if (current.count > limit) {
      const retryAfterSeconds = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: errorCode,
        message: "มีคำขอใช้งานมากเกินไป กรุณาลองใหม่อีกครั้งในภายหลัง"
      });
    }

    if (hits.size > 10000) {
      for (const [entryKey, entry] of hits.entries()) {
        if (entry.resetAt <= now) hits.delete(entryKey);
      }
    }

    return next();
  };
}

export function createApiRateLimiter(config) {
  return createLocalRateLimiter({
    windowMs: minutes(config.rateLimitWindowMinutes),
    limit: Number(config.rateLimitMaxRequests) || 300,
    errorCode: "RATE_LIMIT_EXCEEDED"
  });
}

export function createSensitiveRateLimiter(config) {
  return createLocalRateLimiter({
    windowMs: minutes(config.sensitiveRateLimitWindowMinutes),
    limit: Number(config.sensitiveRateLimitMaxRequests) || 60,
    errorCode: "SENSITIVE_RATE_LIMIT_EXCEEDED"
  });
}
