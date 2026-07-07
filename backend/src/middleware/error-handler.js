import { HttpError } from "../http/errors.js";

export function notFound(req, _res, next) {
  next(new HttpError(404, "ROUTE_NOT_FOUND", `ไม่พบ API route: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, req, res, _next) {
  const status = Number(error.status) || 500;
  const production = process.env.NODE_ENV === "production";

  if (status >= 500) {
    console.error(`[${req.requestId}]`, error);
  }

  res.status(status).json({
    error: {
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: status >= 500 && production ? "ระบบ Backend เกิดข้อผิดพลาด กรุณาตรวจสอบ Render Logs" : error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId: req.requestId
    }
  });
}
