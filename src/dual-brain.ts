import { M1Config } from "./config";
import { readState, updateDualBrain, HistoryEntry } from "./storage";

// Gemini HTTP client — no SDK, direct fetch to the API
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGemini(prompt: string, cfg: M1Config): Promise<string | null> {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${cfg.geminiApiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[M1:dual-brain] Gemini returned ${res.status}: ${await res.text()}`);
      return null;
    }

    const body: any = await res.json();
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("[M1:dual-brain] Gemini response missing text:", JSON.stringify(body));
      return null;
    }

    return text;
  } catch (err: any) {
    console.error("[M1:dual-brain] Gemini call failed:", err?.message ?? String(err));
    return null;
  }
}

// In-memory rate limiter
let lastGeminiCall = 0;

function canCallGemini(cfg: M1Config): boolean {
  const elapsed = Date.now() - lastGeminiCall;
  return elapsed >= cfg.geminiCooldownMin * 60 * 1000;
}

function markGeminiCalled(): void {
  lastGeminiCall = Date.now();
}

export function isRateLimited(cfg: M1Config): boolean {
  return !canCallGemini(cfg);
}

// Local pattern detection — pure function, no Gemini cost
export interface AnalysisResult {
  failures: number;
  total: number;
  windowMinutes: number;
}

export function analyzeHistory(
  history: HistoryEntry[],
  windowMinutes: number
): AnalysisResult {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  let failures = 0;
  let total = 0;

  for (const entry of history) {
    const entryTime = new Date(entry.ts).getTime();
    if (isNaN(entryTime) || entryTime < cutoff) continue;
    total++;
    if (!entry.live || entry.ready === false) failures++;
  }

  return { failures, total, windowMinutes };
}

// Emergency fallback — called after each monitor ping
export async function checkAndAlert(cfg: M1Config): Promise<void> {
  if (!cfg.dualBrainEnabled) return;

  const state = readState();

  // Only trigger when core Maya is actually degraded
  if (state.health.live !== false && state.health.ready !== false) return;

  // Rate limit check
  if (!canCallGemini(cfg)) return;

  // Build prompt from recent history
  const recent = state.history.slice(-10);
  const historyLines = recent
    .map(
      (e) =>
        `[${e.ts}] live=${e.live} ready=${e.ready} error=${e.error ?? "none"}`
    )
    .join("\n");

  const prompt = `You are a system monitor. Core Maya is degraded. Recent health history (newest last):
${historyLines}

Generate a brief human-readable status alert. State what's down, for how long (based on timestamps), and whether a pattern is visible. Keep it under 5 sentences.`;

  const alert = await callGemini(prompt, cfg);
  markGeminiCalled();

  if (alert) {
    updateDualBrain({
      lastGeminiCall: new Date().toISOString(),
      lastAlert: alert,
      totalGeminiCalls: (state.dual_brain?.totalGeminiCalls ?? 0) + 1,
    });
    console.log(`[M1:dual-brain] alert generated (call #${state.dual_brain?.totalGeminiCalls ?? 0 + 1})`);
  }
}

// Status getter for routes
export interface DualBrainStatus {
  enabled: boolean;
  rateLimited: boolean;
  lastGeminiCall: string | null;
  lastAlert: string | null;
  totalGeminiCalls: number;
}

export function getDualBrainStatus(cfg: M1Config): DualBrainStatus {
  const state = readState();
  return {
    enabled: cfg.dualBrainEnabled,
    rateLimited: isRateLimited(cfg),
    lastGeminiCall: state.dual_brain?.lastGeminiCall ?? null,
    lastAlert: state.dual_brain?.lastAlert ?? null,
    totalGeminiCalls: state.dual_brain?.totalGeminiCalls ?? 0,
  };
}
