import { writeHealth, HealthSnapshot } from "./storage";
import { M1Config } from "./config";
import { checkAndAlert } from "./dual-brain";

export interface MonitorResult {
  snapshot: HealthSnapshot;
  lastCheck: number; // epoch ms
}

let current: MonitorResult = {
  snapshot: { live: false, ready: null, error: null, lastCheck: null },
  lastCheck: 0,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function pingCoreMaya(cfg: M1Config): Promise<HealthSnapshot> {
  const base = cfg.coreMayaUrl;
  const now = new Date().toISOString();

  try {
    // Step 1: liveness probe — cheapest, always available
    const liveRes = await fetch(`${base}/health/live`, { signal: AbortSignal.timeout(5000) });
    if (!liveRes.ok) {
      const snap: HealthSnapshot = { live: false, ready: null, error: `liveness returned ${liveRes.status}`, lastCheck: now };
      writeHealth(snap);
      checkAndAlert(cfg); // fire-and-forget, no await needed for monitor loop timing
      return snap;
    }

    // Step 2: readiness probe — checks storage, DB, LLM provider status
    const readyRes = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(5000) });
    let ready: boolean | null = null;
    if (readyRes.ok) {
      const body: any = await readyRes.json();
      ready = body.ready === true;
    } else {
      ready = false;
    }

    const snap: HealthSnapshot = { live: true, ready, error: null, lastCheck: now };
    writeHealth(snap);
    checkAndAlert(cfg);
    return snap;
  } catch (err: any) {
    const snap: HealthSnapshot = {
      live: false,
      ready: null,
      error: err?.message ?? String(err),
      lastCheck: now,
    };
    writeHealth(snap);
    checkAndAlert(cfg);
    return snap;
  }
}

export function getMonitorResult(): MonitorResult {
  return { ...current, snapshot: { ...current.snapshot } };
}

export function startMonitor(cfg: M1Config): void {
  if (intervalHandle) return;

  // Run immediately on start
  pingCoreMaya(cfg).then((snap) => {
    current = { snapshot: snap, lastCheck: Date.now() };
  });

  // Then every pingIntervalMs
  intervalHandle = setInterval(async () => {
    const snap = await pingCoreMaya(cfg);
    current = { snapshot: snap, lastCheck: Date.now() };
  }, cfg.pingIntervalMs);
}

export function stopMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
