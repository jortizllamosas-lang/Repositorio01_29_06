---
name: vitest-env-windows-node26
description: Vitest 1.6.1 + Node v26.4.0 on Windows in this repo — pool config and a non-reproducing crash report
metadata:
  type: project
---

`vitest.config.ts` sets `pool: 'forks'` with `poolOptions.forks.singleFork: true`. This is required
because Vitest 1.6.1's default `threads` pool (worker_threads) is incompatible with Node v26.4.0 on
this Windows machine — `better-sqlite3`'s native binding and the in-memory DB setup in `tests/setup.ts`
(`beforeAll` creating `new Database(':memory:')`) can crash with
`TypeError: Cannot read properties of undefined (reading 'on')` when it happens on a worker thread.

**Why:** A prior session report claimed `npm test` failed with that exact error even though
`vitest.config.ts` already had `pool: 'forks'` set, suggesting the fork config wasn't being honored.

**How to apply:** On 2026-07-14 this was re-verified from a clean environment (5 separate `npm test`
runs, including one after deleting `node_modules/.vite` and `node_modules/.vitest` caches) and it
passed every time (10/10 tests, 2 files) — the failure did not reproduce. No second config file
(`vite.config.ts`) exists to shadow `vitest.config.ts`, and `better-sqlite3`'s native binding loads
cleanly (ABI 147 matches `process.versions.modules`). Conclusion: the fork-pool config in
`vitest.config.ts` is correct and sufficient; the earlier failure was very likely a one-off,
transient environment glitch (e.g. mid-`npm install`/native-rebuild race), not a persistent
config/cache problem. If `npm test` ever fails again with that same `setup.ts:9` / `reading 'on'`
error, first re-check `better-sqlite3` native build alignment
(`node -e "console.log(process.versions.modules)"` vs the compiled `.node` file) and confirm no
stray `vite.config.*` exists before assuming the pool config itself is broken — do not re-diagnose
from scratch each time.
