import { Router, Request, Response } from "express";
import { getMonitorResult } from "./monitor";
import { loadConfig } from "./config";
import { getDualBrainStatus, analyzeHistory } from "./dual-brain";
import { readState } from "./storage";

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

export default router;
