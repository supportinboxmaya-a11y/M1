import fs from "fs";
import path from "path";
import { loadConfig } from "./config";

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

export interface HistoryEntry {
  live: boolean;
  ready: boolean | null;
  error: string | null;
  ts: string; // ISO timestamp
}

export interface DualBrainState {
  lastGeminiCall: string | null;
  lastAlert: string | null;
  lastProvider: string | null;
  totalGeminiCalls: number;
}

export interface M1State {
  health: HealthSnapshot;
  history: HistoryEntry[];
  dual_brain: DualBrainState;
}

function defaultState(): M1State {
  return {
    health: {
      live: false,
      ready: null,
      error: null,
      lastCheck: null,
    },
    history: [],
    dual_brain: {
      lastGeminiCall: null,
      lastAlert: null,
      lastProvider: null,
      totalGeminiCalls: 0,
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
    if (!state.history || !Array.isArray(state.history)) {
    state.history = [];
  }
  if (!state.dual_brain) {
    state.dual_brain = { lastGeminiCall: null, lastAlert: null, lastProvider: null, totalGeminiCalls: 0 };
  }

  state.health = snapshot;

    // Append to rolling history
    const entry: HistoryEntry = {
      live: snapshot.live,
      ready: snapshot.ready,
      error: snapshot.error,
      ts: snapshot.lastCheck ?? new Date().toISOString(),
    };
    state.history.push(entry);

    // Trim to max entries
    const cfg = loadConfig();
    const max = cfg.historyMaxEntries;
    if (state.history.length > max) {
      state.history = state.history.slice(state.history.length - max);
    }

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    // storage failures are non-fatal — log but never throw
    console.error("[M1:storage] failed to persist state:", err);
  }
}

export function updateDualBrain(partial: Partial<DualBrainState>): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }

    const state = readState();
    state.dual_brain = { ...state.dual_brain, ...partial };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("[M1:storage] failed to persist dual_brain state:", err);
  }
}
