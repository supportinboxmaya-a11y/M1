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
  nvidiaNimKey: string;
  nvidiaNimModel: string;
  geminiApiKey: string;
  groqApiKey: string;
  geminiCooldownMin: number;
  analysisWindowMin: number;
  historyMaxEntries: number;
  // Keystore
  keystoreEnabled: boolean;
  keysToken: string;
  keysBackupPath: string;
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
    nvidiaNimKey: optional("NVIDIA_NIM_KEY", ""),
    nvidiaNimModel: optional("M1_NVIDIA_NIM_MODEL", "deepseek-ai/deepseek-v4-pro"),
    geminiApiKey: optional("M1_EMERGENCY_GEMINI_KEY", optional("GEMINI_API_KEY", "")),
    groqApiKey: optional("M1_EMERGENCY_GROQ_KEY", ""),
    geminiCooldownMin: optionalInt("M1_GEMINI_COOLDOWN_MIN", 15),
    analysisWindowMin: optionalInt("M1_ANALYSIS_WINDOW_MIN", 5),
    historyMaxEntries: optionalInt("M1_HISTORY_MAX_ENTRIES", 100),
    keystoreEnabled: optional("M1_KEYSTORE_ENABLED", "false").toLowerCase() === "true",
    keysToken: optional("M1_KEYS_TOKEN", ""),
    keysBackupPath: optional("M1_KEYS_BACKUP_PATH", "~/storage/downloads/m1-keys-backup.json"),
  };

  // Soft-fail: dual brain needs at least one provider key — warn and disable if none
  if (cfg.dualBrainEnabled && !cfg.nvidiaNimKey && !cfg.geminiApiKey && !cfg.groqApiKey) {
    console.warn("[M1] M1_DUAL_BRAIN_ENABLED=true but no provider key set (checked NVIDIA_NIM_KEY, M1_EMERGENCY_GEMINI_KEY, GEMINI_API_KEY, M1_EMERGENCY_GROQ_KEY). Dual brain disabled. Set at least one key and restart to activate.");
    cfg.dualBrainEnabled = false;
  }

  cached = cfg;
  return cfg;
}
