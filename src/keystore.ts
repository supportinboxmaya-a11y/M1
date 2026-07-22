import fs from "fs";
import path from "path";

const STATE_DIR = path.resolve(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".m1"
);
const POOL_FILE = path.join(STATE_DIR, "keys.json");

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
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2), "utf-8");
  } catch (err) {
    console.error("[M1:keystore] failed to persist key pool:", err);
  }
}
