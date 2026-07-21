# M1 — Immortal Core (Maya's Sentinel)

**Before assuming anything is missing, verify against this repo's own git log and files first — do not delete or rebuild based on assumption alone.**

---

## Build Phases

### Phase 1 — Immortal Core (Step 1)
- [x] CRUD: directory structure, .env template, .gitignore, package.json
- [x] CRUD: `src/index.ts` — Express server with config loading
- [x] CRUD: `src/monitor.ts` — health-ping logic for core Maya's `/health/live` + `/health/ready`
- [x] CRUD: `src/storage.ts` — local JSON file state store (separate from M-2.0 storage)
- [x] CRUD: `GET /health` route on M1's own port — returns monitor status + own liveness
- [x] CRUD: flag gating (`M1_ENABLED`), try/except soft-fail everywhere
- [x] TEST: manual start, verify M1 boots, verify it pings core Maya, verify `/health` responds

### Phase 2 — Dual-Brain Layer (Step 2)
- [x] CRUD: `src/dual-brain.ts` — Gemini HTTP client + rate limiter + pattern detection + emergency fallback
- [x] CRUD: extend `config.ts` with `M1_DUAL_BRAIN_ENABLED`, `GEMINI_API_KEY`, cooldown, analysis window, history max
- [x] CRUD: extend `storage.ts` with rolling `history[]` array + `dual_brain` state section
- [x] CRUD: `monitor.ts` calls `checkAndAlert()` after each ping (fire-and-forget)
- [x] CRUD: `GET /health` returns `dual_brain` section with alert + analysis
- [x] CRUD: flag-gated (`M1_DUAL_BRAIN_ENABLED=false`), try/except soft-fail everywhere
- [x] TEST: graceful-failure-without-key — M1_DUAL_BRAIN_ENABLED=true + no key logs warning and falls back to Step 1 (no crash)
- [x] TEST: manual start, verify `/health` shows dual_brain fields, verify rate limiter works
- [x] DOC: reconciled with deferred-items list (no overlap)

**⚠️ LIVE emergency-path test PENDING — committed as 1e7e6f4.** Needs a real Gemini key added to .env as M1_EMERGENCY_GEMINI_KEY, then a core-Maya-down test to fire the real Gemini call and confirm alert text + total_gemini_calls increment + cooldown behavior. Do not mark Phase 2 fully verified until that's done.

---

## Deferred to Later Steps
- `.env` auto-backup/restore for core Maya's `.env` — requires M1 to be given filesystem read/write access to that one specific file path (an intentional, minimal exception to the HTTP-only design). Not done in Step 1.
- Key add/rotate/delete via core Maya's authenticated `set_key()` route — requires an auth token, which M1 doesn't have yet. Not done in Step 1.

---

## Flag State
| Flag | Default | Current |
|------|---------|---------|
| M1_ENABLED | false | false |
| M1_DUAL_BRAIN_ENABLED | false | false |
*(add more as phases add them)*

---

## Current Status
- **Active Phase:** Phase 2 — Dual-Brain Layer (code complete, LIVE test pending)
- **Next Step:** Owner adds M1_EMERGENCY_GEMINI_KEY to .env → run live emergency-path test → commit verification → then design Phase 3
- **Notes:** M1 is a separate process, separate repo, no code shared with M-2.0. Connects to core Maya via HTTP only.
