import fs from "fs";
import path from "path";

const STATE_DIR = path.resolve(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".m1"
);
const STATE_FILE = path.join(STATE_DIR, "state.json");

export interface HealthSnapshot {
  live: boolean;
  ready: boolean | null;
  error: string | null;
  lastCheck: string | null; // ISO timestamp
}

export interface M1State {
  health: HealthSnapshot;
}

function defaultState(): M1State {
  return {
    health: {
      live: false,
      ready: null,
      error: null,
      lastCheck: null,
    },
  };
}

export function readState(): M1State {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(raw) as M1State;
  } catch {
    return defaultState();
  }
}

export function writeHealth(snapshot: HealthSnapshot): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }

    const state = readState();
    state.health = snapshot;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    // storage failures are non-fatal — log but never throw
    console.error("[M1:storage] failed to persist state:", err);
  }
}
