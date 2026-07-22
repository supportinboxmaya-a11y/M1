import fs from "fs";
import path from "path";
import { loadConfig, M1Config } from "./config";

const STATE_DIR = path.resolve(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".m1"
);
const POOL_FILE = path.join(STATE_DIR, "keys.json");

// ── Provider endpoints reused from dual-brain.ts ────────────────────────
const NIM_BASE = "https://integrate.api.nvidia.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ── Types ────────────────────────────────────────────────────────────────

export interface StoredKey {
  provider: "nim" | "gemini" | "groq";
  key: string;
  status: "active" | "degraded" | "revoked";
  lastOk: string | null;
  failCount: number;
  addedAt: string;
}

export interface KeyPool {
  keys: StoredKey[];
  archive: StoredKey[];
}

// ── Default ──────────────────────────────────────────────────────────────

function emptyPool(): KeyPool {
  return { keys: [], archive: [] };
}

// ── Read ─────────────────────────────────────────────────────────────────

export function readPool(): KeyPool {
  try {
    const raw = fs.readFileSync(POOL_FILE, "utf-8");
    return JSON.parse(raw) as KeyPool;
  } catch {
    return emptyPool();
  }
}

// ── Write ────────────────────────────────────────────────────────────────

export function writePool(pool: KeyPool): void {
  const content = JSON.stringify(pool, null, 2);

  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(POOL_FILE, content, "utf-8");
  } catch (err) {
    console.error("[M1:keystore] failed to persist key pool:", err);
  }

  // Backup — separate try/catch, never blocks the primary write
  try {
    const cfg = loadConfig();
    const raw = cfg.keysBackupPath;
    const expanded = raw.startsWith("~/")
      ? path.resolve(process.env.HOME || "/tmp", raw.slice(2))
      : path.resolve(raw);
    const dir = path.dirname(expanded);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(expanded, content, "utf-8");
  } catch {
    // backup is best-effort
  }
}

// ── Validate a key with a live test call ─────────────────────────────────
export async function validateKey(
  provider: "nim" | "gemini" | "groq",
  key: string,
  cfg: M1Config
): Promise<boolean> {
  try {
    let url: string;
    let body: unknown;
    let headers: Record<string, string>;

    if (provider === "nim") {
      url = `${NIM_BASE}/chat/completions`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      };
      body = {
        model: cfg.nvidiaNimModel,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      };
    } else if (provider === "gemini") {
      url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`;
      headers = { "Content-Type": "application/json" };
      body = {
        contents: [{ parts: [{ text: "hi" }] }],
        generationConfig: { maxOutputTokens: 5 },
      };
    } else if (provider === "groq") {
      url = `${GROQ_BASE}/chat/completions`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      };
      body = {
        model: GROQ_MODEL,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      };
    } else {
      return false;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    return res.ok;
  } catch {
    return false;
  }
}

// ── Pick the best active key for a provider ──────────────────────────────
export function pickBest(pool: KeyPool, provider: "nim" | "gemini" | "groq"): StoredKey | null {
  const candidates = pool.keys
    .filter((k) => k.provider === provider && k.status === "active")
    .sort((a, b) => {
      if (a.failCount !== b.failCount) return a.failCount - b.failCount;
      // tie-break: most recent lastOk first (null = never used = worst)
      const aTime = a.lastOk ? new Date(a.lastOk).getTime() : 0;
      const bTime = b.lastOk ? new Date(b.lastOk).getTime() : 0;
      return bTime - aTime;
    });

  return candidates[0] ?? null;
}

// ── Report a failure and return updated pool (no disk write) ─────────────
export function reportFailure(
  pool: KeyPool,
  provider: "nim" | "gemini" | "groq",
  key: string,
  statusCode: number
): KeyPool {
  const updated = {
    keys: pool.keys.map((k) => {
      if (k.provider !== provider || k.key !== key) return { ...k };
      const newFail = k.failCount + 1;
      let newStatus: StoredKey["status"] = k.status;
      if (statusCode === 401 || statusCode === 429 || newFail >= 3) {
        newStatus = "degraded";
      }
      return { ...k, failCount: newFail, status: newStatus };
    }),
    archive: [...pool.archive],
  };
  return updated;
}
