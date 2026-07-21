import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export interface M1Config {
  coreMayaUrl: string;
  port: number;
  enabled: boolean;
  pingIntervalMs: number;
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
  };

  cached = cfg;
  return cfg;
}
