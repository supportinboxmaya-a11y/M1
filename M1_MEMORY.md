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

### Phase 2 — (future)
- TBD

---

## Deferred to Later Steps
- `.env` auto-backup/restore for core Maya's `.env` — requires M1 to be given filesystem read/write access to that one specific file path (an intentional, minimal exception to the HTTP-only design). Not done in Step 1.
- Key add/rotate/delete via core Maya's authenticated `set_key()` route — requires an auth token, which M1 doesn't have yet. Not done in Step 1.

---

## Flag State
| Flag | Default | Current |
|------|---------|---------|
| M1_ENABLED | false | false |
*(add more as phases add them)*

---

## Current Status
- **Active Phase:** Phase 2 — (pending)
- **Next Step:** Design Phase 2 scope
- **Notes:** M1 is a separate process, separate repo, no code shared with M-2.0. Connects to core Maya via HTTP only.
