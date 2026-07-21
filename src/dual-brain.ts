import { M1Config } from "./config";
import { readState, updateDualBrain, HistoryEntry } from "./storage";

// ── NVIDIA NIM (primary) ─────────────────────────────────────────────────
const NIM_BASE = "https://integrate.api.nvidia.com/v1";

async function callNim(prompt: string, cfg: M1Config): Promise<string | null> {
  if (!cfg.nvidiaNimKey) return null;

  try {
    const res = await fetch(`${NIM_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.nvidiaNimKey}`,
      },
      body: JSON.stringify({
        model: cfg.nvidiaNimModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[M1:dual-brain] NVIDIA NIM returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const body: any = await res.json();
    const text = body?.choices?.[0]?.message?.content;
    if (!text) {
      console.error("[M1:dual-brain] NVIDIA NIM response missing text");
      return null;
    }
    return text;
  } catch (err: any) {
    console.error("[M1:dual-brain] NVIDIA NIM call failed:", err?.message ?? String(err));
    return null;
  }
}

// ── Gemini (fallback 1) ─────────────────────────────────────────────────
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGemini(prompt: string, cfg: M1Config): Promise<string | null> {
  if (!cfg.geminiApiKey) return null;

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
      console.error(`[M1:dual-brain] Gemini returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const body: any = await res.json();
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("[M1:dual-brain] Gemini response missing text");
      return null;
    }
    return text;
  } catch (err: any) {
    console.error("[M1:dual-brain] Gemini call failed:", err?.message ?? String(err));
    return null;
  }
}

// ── Groq ─────────────────────────────────────────────────────────────────
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_BASE = "https://api.groq.com/openai/v1";

async function callGroq(prompt: string, cfg: M1Config): Promise<string | null> {
  if (!cfg.groqApiKey) return null;

  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[M1:dual-brain] Groq returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const body: any = await res.json();
    const text = body?.choices?.[0]?.message?.content;
    if (!text) {
      console.error("[M1:dual-brain] Groq response missing text");
      return null;
    }
    return text;
  } catch (err: any) {
    console.error("[M1:dual-brain] Groq call failed:", err?.message ?? String(err));
    return null;
  }
}

// ── Rate limiter (shared, applies before either provider) ──────────────
let lastProviderCall = 0;

function canCallProvider(cfg: M1Config): boolean {
  const elapsed = Date.now() - lastProviderCall;
  return elapsed >= cfg.geminiCooldownMin * 60 * 1000;
}

function markProviderCalled(): void {
  lastProviderCall = Date.now();
}

export function isRateLimited(cfg: M1Config): boolean {
  return !canCallProvider(cfg);
}

// ── Local pattern detection ─────────────────────────────────────────────
export interface AnalysisResult {
  failures: number;
  total: number;
  windowMinutes: number;
}

export function analyzeHistory(history: HistoryEntry[], windowMinutes: number): AnalysisResult {
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

// ── Emergency fallback ──────────────────────────────────────────────────
export async function checkAndAlert(cfg: M1Config): Promise<void> {
  if (!cfg.dualBrainEnabled) return;

  const state = readState();
  if (state.health.live !== false && state.health.ready !== false) return;
  if (!canCallProvider(cfg)) return;

  // Build prompt from recent history
  const recent = state.history.slice(-10);
  const historyLines = recent
    .map((e) => `[${e.ts}] live=${e.live} ready=${e.ready} error=${e.error ?? "none"}`)
    .join("\n");
  const prompt = `You are a system monitor. Core Maya is degraded. Recent health history (newest last):
${historyLines}

Generate a brief human-readable status alert. State what's down, for how long (based on timestamps), and whether a pattern is visible. Keep it under 5 sentences.`;

  // Provider chain: NVIDIA NIM (primary) → Gemini (fallback 1) → Groq (fallback 2)
  let alert: string | null = null;
  let provider: string | null = null;

  alert = await callNim(prompt, cfg);
  if (alert) {
    provider = "nim";
  } else {
    alert = await callGemini(prompt, cfg);
    if (alert) {
      provider = "gemini";
    } else {
      alert = await callGroq(prompt, cfg);
      if (alert) provider = "groq";
    }
  }

  markProviderCalled();

  if (alert && provider) {
    const state = readState();
    updateDualBrain({
      lastGeminiCall: new Date().toISOString(),
      lastAlert: alert,
      lastProvider: provider,
      totalGeminiCalls: (state.dual_brain?.totalGeminiCalls ?? 0) + 1,
    });
    console.log(`[M1:dual-brain] emergency alert generated via: ${provider}`);
  }
}

// ── Status getter ────────────────────────────────────────────────────────
export interface DualBrainStatus {
  enabled: boolean;
  rateLimited: boolean;
  lastGeminiCall: string | null;
  lastAlert: string | null;
  lastProvider: string | null;
  totalGeminiCalls: number;
}

export function getDualBrainStatus(cfg: M1Config): DualBrainStatus {
  const state = readState();
  return {
    enabled: cfg.dualBrainEnabled,
    rateLimited: isRateLimited(cfg),
    lastGeminiCall: state.dual_brain?.lastGeminiCall ?? null,
    lastAlert: state.dual_brain?.lastAlert ?? null,
    lastProvider: state.dual_brain?.lastProvider ?? null,
    totalGeminiCalls: state.dual_brain?.totalGeminiCalls ?? 0,
  };
}
