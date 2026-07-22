import { Router, Request, Response } from "express";
import { getMonitorResult } from "./monitor";
import { loadConfig } from "./config";
import { getDualBrainStatus, analyzeHistory } from "./dual-brain";
import { readState } from "./storage";
import { readPool } from "./keystore";

const router = Router();

// GET /health — M1's own health status reflecting core Maya's state
router.get("/health", (_req: Request, res: Response) => {
  const cfg = loadConfig();
  const result = getMonitorResult();
  const dualBrain = getDualBrainStatus(cfg);
  const state = readState();
  const analysis = analyzeHistory(state.history || [], cfg.analysisWindowMin);

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
    dual_brain: {
      enabled: dualBrain.enabled,
      rate_limited: dualBrain.rateLimited,
      last_gemini_call: dualBrain.lastGeminiCall,
      last_alert: dualBrain.lastAlert,
      last_provider: dualBrain.lastProvider,
      total_gemini_calls: dualBrain.totalGeminiCalls,
      analysis: {
        failures_last_n_min: analysis.failures,
        total_in_window: analysis.total,
        window_minutes: analysis.windowMinutes,
      },
    },
    m1: {
      port: cfg.port,
      enabled: cfg.enabled,
      uptime_sec: process.uptime(),
    },
  });
});

// GET /keys/status — keystore pool status (never leaks key values)
router.get("/keys/status", (req: Request, res: Response) => {
  try {
    const cfg = loadConfig();

    // Auth check
    if (!cfg.keysToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${cfg.keysToken}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const pool = readPool();
    const providers = ["nim", "gemini", "groq"] as const;
    const counts: Record<string, { total: number; active: number; degraded: number; revoked: number }> = {};

    for (const p of providers) {
      const filtered = pool.keys.filter((k) => k.provider === p);
      counts[p] = {
        total: filtered.length,
        active: filtered.filter((k) => k.status === "active").length,
        degraded: filtered.filter((k) => k.status === "degraded").length,
        revoked: filtered.filter((k) => k.status === "revoked").length,
      };
    }

    res.json({
      keystore_enabled: cfg.keystoreEnabled,
      providers: counts,
    });
  } catch {
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
