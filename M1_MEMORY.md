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
- [x] **LIVE VERIFIED 2026-07-21** — Gemini primary + Groq fallback, real alert generation confirmed, rate-limiter confirmed, recovery-detection confirmed, zero crashes.

### Phase 2a — Groq Fallback (Step 2a)
- [x] CRUD: add `callGroq()` — raw fetch to Groq's /chat/completions (no SDK)
- [x] CRUD: chain Gemini → Groq — tries Gemini first, falls through to Groq on any failure
- [x] CRUD: `last_provider` tracked in state + /health output
- [x] CRUD: log line shows "via: gemini" or "via: groq" so you know which fired
- [x] CRUD: config + .env.example updated with M1_EMERGENCY_GROQ_KEY
- [x] CRUD: soft-fail accepts either key (Gemini or Groq), warns only if both missing
- [x] TEST: live emergency-path — core Maya down, Gemini empty → Groq fired real alert, log showed "via: groq", rate limiter engaged, recovery detected

---

### Phase 3 — Smart Core (DONE, built 2026-07-21)
- [x] Research: adopted NVIDIA NIM (DeepSeek V3) as new primary — free API, 80+ open models, matches core Maya's LLM strategy
- [x] CRUD: `callNim()` in dual-brain.ts — raw fetch to NVIDIA NIM /chat/completions (OpenAI-compatible)
- [x] CRUD: provider chain updated — **NVIDIA NIM (primary) → Gemini (fallback 1) → Groq (fallback 2)** — matches core Maya's fallback hierarchy
- [x] CRUD: config.ts extended with `nvidiaNimKey`, `nvidiaNimModel` (env: `NVIDIA_NIM_KEY`, `M1_NVIDIA_NIM_MODEL`)
- [x] CRUD: soft-fail updated — checks all three provider keys before disabling dual-brain
- [x] CRUD: `src/keygen.ts` — interactive CLI to walk through obtaining API key for NIM / Gemini / Groq (auto-opens URL via termux-open-url)
- [x] CRUD: `.env.example` updated with NIM vars + new chain description
- [x] CRUD: live `.env` populated with core Maya's `NVIDIA_NIM_KEY` (same device, same free account)
- [x] TEST: `tsc --noEmit` clean, `tsc` build clean, zero errors
- [x] **LIVE VERIFIED 2026-07-21** — NVIDIA NIM fired real alert with `lastProvider: "nim"`, DeepSeek V4 Pro model confirmed working on NIM API, full chain NIM→Gemini→Groq demonstrated (NIM first attempt with wrong V3 model → 404 → fell through to Groq successfully; after correcting to V4 Pro → NIM fired immediately on first ping)

---

### Phase 4 — Safer Keygen (DONE, committed 2026-07-22)
- [x] FIX: updateEnvFile() writes .env.bak before overwriting — LIVE VERIFIED 2026-07-22
- [x] FIX: .gitignore — added .env.bak, .env.*.bak — VERIFIED: git status confirms .env.bak untracked
- [x] CRUD: config.ts — M1_KEYSTORE_ENABLED (default false), M1_KEYS_TOKEN, M1_KEYS_BACKUP_PATH — LIVE VERIFIED 2026-07-22: all three load correctly, default path resolved to ~/storage/downloads/m1-keys-backup.json
- [x] CRUD: src/keystore.ts — keys.json pool (provider, key, status, lastOk, failCount, addedAt) — LIVE VERIFIED 2026-07-22: write/read round-trip confirmed, keys.json lives in ~/.m1/ alongside state.json
- [x] CRUD: keystore.ts — validateKey(), pickBest(), reportFailure() — LIVE VERIFIED 2026-07-22: pickBest selects lowest-failCount active key, reportFailure degrades on 429/401, validateKey confirmed true on real NIM key, false on fake key
- [x] CRUD: auto-backup on every write to ~/storage/downloads/m1-keys-backup.json — LIVE VERIFIED 2026-07-22: keys.json (219 bytes) and backup file byte-identical, backup failure isolated in its own try/catch, cleanup confirmed
- [x] CRUD: keygen.ts EXTENDED (not replaced) — validate, then write to pool — LIVE VERIFIED 2026-07-22: end-to-end test with real NIM key — validateKey passed, pool entry created (status active, failCount 0, lastOk/addedAt set), .env write unaffected, pool confirmed clean (1 entry, no duplicates)
- [x] CRUD: dual-brain.ts callNim() — uses keystore pool via pickBest() when M1_KEYSTORE_ENABLED=true, falls back to cfg.nvidiaNimKey when disabled or pool empty (unchanged behavior preserved). reportFailure() + writePool() on non-200, isolated try/catch. — LIVE VERIFIED 2026-07-22: keystoreEnabled=false confirmed unchanged default behavior; keystoreEnabled=true confirmed .env fallback still loads; full fire test — real degraded state → pool key selected via pickBest → NIM fired → lastProvider="nim" → real alert generated → state restored clean
- [x] CRUD: GET /keys/status — provider health only, never returns key values, Bearer token required — LIVE VERIFIED 2026-07-22: no token → 401, wrong token → 401, correct token → 200 with provider counts (nim: 1 active), response body scanned against real key value — confirmed no leak
- [x] TEST: keystore disabled → M1 behaves exactly as Phase 3 — LIVE VERIFIED 2026-07-22: M1_KEYSTORE_ENABLED=false → lastProvider="nim" via .env key (not pool), alert generated normally, full regression confirmed
- [x] TEST: tsc --noEmit clean, tsc build clean — LIVE VERIFIED 2026-07-22: zero errors
- [x] CRUD: revokeKey() — soft-delete, moves key from pool.keys to pool.archive with status "revoked", unchanged pool on no-match (no throw) — LIVE VERIFIED 2026-07-22: key removed from active list, archived with correct status, non-matching revoke leaves pool untouched
- [x] CRUD: restoreFromBackup() + auto-restore fallback in readPool() — LIVE VERIFIED 2026-07-22: keys.json deleted entirely, readPool() auto-detected missing file, restored from ~/storage/downloads/m1-keys-backup.json, recreated keys.json (296 bytes), byte-identical to backup — full Termux-reset recovery confirmed
- [x] TEST: full multi-key failover chain — LIVE VERIFIED 2026-07-22: initial pickBest selects among active keys, 3× 401 degrades key-primary, pickBest correctly switches to key-secondary (only remaining active key), both keys degraded → pickBest returns null without throwing

---

### Phase 5 — /keys/reveal route (DONE, committed 2026-07-22)
- [x] CRUD: GET /keys/reveal — returns raw key value for trusted local caller (core Maya), distinct from /keys/status's no-leak guarantee. Bearer token + provider param required.
- [x] TEST: LIVE VERIFIED 2026-07-22: no token → 401, bad provider → 400, correct token+nim → 200 with real key, provider with no pool key → 404
- [x] TEST: tsc --noEmit clean

---

## Deferred to Later Steps
- `.env` auto-backup/restore for core Maya's `.env` — requires M1 to be given filesystem read/write access to that one specific file path (an intentional, minimal exception to the HTTP-only design). Not done in Step 1.
- Key add/rotate/delete via core Maya's authenticated `set_key()` route — requires an auth token, which M1 doesn't have yet. Not done in Step 1.

---

## Environment Risks

- **Termux reset wiped .env values on 2026-07-21** — This is a recurring environment risk, not a code issue. Every Termux reinstall/reset destroys gitignored files (.env, node_modules, etc.), while committed files survive. Two sessions in a row have now lost M1's API keys the same way.
- **Mitigation:** Set up an `.env` backup routine for M1, mirroring core Maya's. Copy to `~/storage/downloads/m1-env-backup.txt` after any .env change, so the keys survive the next reset.

---

## Flag State
| Flag | Default | Current |
|------|---------|---------|
| M1_ENABLED | false | false |
| M1_DUAL_BRAIN_ENABLED | false | false |
| NVIDIA_NIM_KEY | (none) | set |
| M1_NVIDIA_NIM_MODEL | deepseek-ai/deepseek-v4-pro | set (live-verified) |
*(add more as phases add them)*

---

## Current Status
- **Last Phase:** Phase 5 — /keys/reveal route (DONE, committed 2026-07-22)
- **Next Step:** (none) — Phase 5 complete. /keys/reveal returns raw key value for trusted local callers (core Maya) via Bearer token + provider param, with no-leak distinction from /keys/status clearly documented in code. All four test cases live-verified: 401/400/200/404. tsc clean.
- **Notes:** M1 is a separate process, separate repo, no code shared with M-2.0. Connects to core Maya via HTTP only. Provider chain: NVIDIA NIM (primary, from keystore pool or .env fallback) → Gemini (fallback 1) → Groq (fallback 2).
