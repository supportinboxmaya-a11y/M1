import { Router, Request, Response } from "express";
import { getMonitorResult } from "./monitor";
import { loadConfig } from "./config";

const router = Router();

// GET /health — M1's own health status reflecting core Maya's state
router.get("/health", (_req: Request, res: Response) => {
  const cfg = loadConfig();
  const result = getMonitorResult();

  res.json({
    status: "ok",
    service: "M1 — Immortal Core",
    core_maya: {
      url: cfg.coreMayaUrl,
      live: result.snapshot.live,
      ready: result.snapshot.ready,
      error: result.snapshot.error,
      last_check: result.snapshot.lastCheck,
    },
    m1: {
      port: cfg.port,
      enabled: cfg.enabled,
      uptime_sec: process.uptime(),
    },
  });
});

export default router;
