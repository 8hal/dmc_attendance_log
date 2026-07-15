# AGENTS.md

## Cursor Cloud specific instructions

DMC Attendance Log is a Firebase app (Cloud Functions + Firestore + static HTML hosting).
Standard commands live in `README.md`, `functions/package.json`, and `scripts/`; this
section only records non-obvious caveats for running/testing it in this environment.

### Toolchain / environment gotchas
- `firebase` CLI is installed under `~/.npm-global/bin` (user-level npm prefix), which is
  added to `PATH` via `~/.bashrc`. Both are managed by the startup update script, so no
  manual install is needed.
- Every `npm`/`node`-launched command prints a warning: *"Your user's .npmrc file has a
  `globalconfig` and/or `prefix` setting, which are incompatible with nvm."* This is
  **harmless** — the active node is `/exec-daemon/node` (v22, matches `functions` engine),
  not nvm's node. Ignore it.
- The Firestore emulator needs a JDK; Java 21 is present in the base image.

### Running the app (dev mode)
- Start the full local stack:
  `firebase emulators:start --only functions,hosting,firestore,storage --project dmc-attendance`
- Ports: Hosting `5000`, Functions `5001`, Firestore `8080`, Storage `9199`, Emulator UI `4000`.
- On startup, the pubsub-triggered functions (`scrapeHealthCheck`, `weekendScrapeReadinessCheck`,
  `groupEventAutoScrape`) log *"function ignored because the pubsub emulator ... is not running"*.
  This is **expected** (no pubsub emulator) and not a failure.
- Open the app at `http://localhost:5000/index.html`. The frontend detects `localhost`/`127.*`
  and automatically points its API base at the local Functions emulator, so no config edit is needed.

### Seeding emulator data
- The emulator starts **empty**. Seed scripts require `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
  and `functions/node_modules` to be present, and only work while the emulator is running:
  - Members (enables attendance/roster flows): `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-members-2026-03-31.js`
  - Chunbaek season data: `scripts/seed-emulator-chunbaek.js`
- The attendance check-in form auto-fills date + meeting type from the day of week, so a submitted
  record's `meetingDateKey` follows the desktop clock's KST date (not necessarily "today" in UTC).

### Tests
- Unit tests (no emulator): `npm run test:members-sync` (`node --test`).
- Full integration suite: `bash scripts/pre-deploy-test.sh` — boots `emulators:exec`
  (functions + hosting + firestore + storage), seeds minimal data, and runs ~50 API/hosting
  assertions. Requires the `firebase` CLI, `java`, and `functions/node_modules` (all provided
  by the update script). The emulator admin password used in tests is `dmc2008`.

### Deploy
- Per repo rules in `.cursor/rules/`, **never run `firebase deploy`** yourself — deployment is
  a human-only, approval-gated action.
