import { Router, Request, Response } from "express";
import { getMonitorResult } from "./monitor";
import { loadConfig } from "./config";
import { getDualBrainStatus, analyzeHistory } from "./dual-brain";
import { readState } from "./storage";
import { readPool, pickBest } from "./keystore";

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

// GET /keys/reveal — intentionally leaks the actual key value.
// This exists ONLY for trusted local callers (core Maya on the same device).
// /keys/status guarantees it never leaks key values — that guarantee does
// NOT apply here. Callers must already have the Bearer token proving they
// are authorised to obtain the raw secret.
router.get("/keys/reveal", (req: Request, res: Response) => {
  try {
    const cfg = loadConfig();

    // Auth check (identical to /keys/status)
    if (!cfg.keysToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${cfg.keysToken}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const provider = req.query.provider as string | undefined;
    if (!provider || !["nim", "gemini", "groq"].includes(provider)) {
      res.status(400).json({ error: "invalid provider" });
      return;
    }

    const pool = readPool();
    const bestKey = pickBest(pool, provider as "nim" | "gemini" | "groq");

    if (!bestKey) {
      res.status(404).json({ error: "no active key for provider" });
      return;
    }

    res.json({ provider, key: bestKey.key });
  } catch {
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
