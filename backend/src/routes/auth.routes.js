import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";

export function createAuthRouter(authenticate) {
  const router = Router();

  router.get("/me", authenticate, (req, res) => {
    res.json({
      user: {
        id: req.auth.user.id,
        email: req.auth.user.email
      },
      profile: req.auth.profile,
      permissions: req.auth.permissions
    });
  });

  router.get("/admin-check", authenticate, requirePermission("manage_master_data"), (req, res) => {
    res.json({ status: "ok", role: req.auth.profile.role, permissions: req.auth.permissions });
  });

  return router;
}
