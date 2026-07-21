import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export interface M1Config {
  coreMayaUrl: string;
  port: number;
  enabled: boolean;
  pingIntervalMs: number;
  // Dual-brain
  dualBrainEnabled: boolean;
  geminiApiKey: string;
  geminiCooldownMin: number;
  analysisWindowMin: number;
  historyMaxEntries: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

let cached: M1Config | null = null;

export function loadConfig(): M1Config {
  if (cached) return cached;

  const cfg: M1Config = {
    coreMayaUrl: required("CORE_MAYA_URL").replace(/\/+$/, ""),
    port: optionalInt("M1_PORT", 3001),
    enabled: optional("M1_ENABLED", "false").toLowerCase() === "true",
    pingIntervalMs: optionalInt("M1_PING_INTERVAL_MS", 30_000),
    dualBrainEnabled: optional("M1_DUAL_BRAIN_ENABLED", "false").toLowerCase() === "true",
    geminiApiKey: optional("M1_EMERGENCY_GEMINI_KEY", optional("GEMINI_API_KEY", "")),
    geminiCooldownMin: optionalInt("M1_GEMINI_COOLDOWN_MIN", 15),
    analysisWindowMin: optionalInt("M1_ANALYSIS_WINDOW_MIN", 5),
    historyMaxEntries: optionalInt("M1_HISTORY_MAX_ENTRIES", 100),
  };

  // Soft-fail: dual brain requires a Gemini key — warn and disable
  if (cfg.dualBrainEnabled && !cfg.geminiApiKey) {
    console.warn("[M1] M1_DUAL_BRAIN_ENABLED=true but no Gemini key set (checked M1_EMERGENCY_GEMINI_KEY, GEMINI_API_KEY). Dual brain disabled. Set a key and restart to activate.");
    cfg.dualBrainEnabled = false;
  }

  cached = cfg;
  return cfg;
}
