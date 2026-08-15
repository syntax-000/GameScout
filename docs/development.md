# Local development

## Requirements

- Windows
- Node.js 24 or a compatible maintained Node.js release
- npm

## Commands

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run dev
npm.cmd run build
```

Run the complete project-health suite before completing a backlog task:

```powershell
npm.cmd run verify
```

Individual checks:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run build
```

## Windows packaging

GameScout uses an x64, per-user NSIS installer. Install the development dependencies and produce the
installer with:

```powershell
npm.cmd run package:windows
```

The installer is written to `release/GameScout-0.1.0-Setup.exe`. It creates Start Menu and desktop
shortcuts and permits a custom installation directory. Normal uninstall removes application binaries
but deliberately preserves `%APPDATA%\GameScout`, including provider setup, the SQLite catalog, sync
state, and favorites. This lets a reinstall recover the local catalog. Users who want a completely
clean reset must remove that directory after uninstall.

Release verification must use a personal Steam Web API key obtained from
`https://steamcommunity.com/dev/apikey`.

For each release candidate:

1. Install the generated setup executable as a standard Windows user.
2. Confirm setup writes `%APPDATA%\GameScout\settings\settings.json` and first launch creates
   `%APPDATA%\GameScout\database\gamescout.sqlite3` at schema version 2.
3. Retrieve the bounded catalog, confirm Steam failure remains non-fatal, and test browse, search,
   genre, multiplayer, player-count filters, details, store opening, and favorites.
4. Exit and relaunch, disconnect the network, and repeat cached browsing and favorites checks.
5. Uninstall, confirm application binaries and shortcuts are removed while app data remains, then
   reinstall and confirm the cached catalog and favorites return.
6. For a clean-install test, uninstall and explicitly remove `%APPDATA%\GameScout` before reinstalling.

Use `npm.cmd run format` to apply Prettier formatting. The generated output, local dependency caches, frozen authoritative specification, historical provider notes, and PowerShell validation scripts are excluded from automatic formatting.

## Electron boundary

The renderer can access desktop capabilities only through `window.gameScoutDesktop`, which is exposed by the sandboxed preload script. The initial allowlisted API contains asynchronous application-status, settings-status, and database-health methods. Each request uses a versioned envelope that is validated in the main process; unexpected fields and unsupported versions are rejected before service dependencies are called.

The status DTOs expose configured-state booleans only. Credentials, database handles, raw SQL, network clients, and provider response objects are not part of the renderer contract. GS-009 stores the Steam API key encrypted through Electron `safeStorage` in the main process. The key is never logged, returned over IPC, or stored in SQLite.

## Local database

GameScout creates `database/gamescout.sqlite3` below Electron's Windows `userData` directory. SQLite is opened only in the main process using Node's built-in `node:sqlite` API. Every connection enables foreign keys and WAL mode.

Ordered migrations are defined in `src/main/db/migrations.ts`. Applied migrations are recorded in `_gamescout_migrations` with their version, name, and application time. Each pending migration runs in its own immediate transaction; a failure is rolled back, the connection is closed, and a controlled error health value remains available through IPC.

Migration 2 contains the authoritative GS-007 V0.1 domain schema. Its strict tables, foreign keys, unique identities, enum checks, count-model checks, and lookup indexes enforce the provider-independent game, platform, capability, evidence, enrichment, favorite, and synchronization model. SQL access remains confined to the main-process database layer.

GS-008 repositories are exposed from the opened database handle through `database.repositories`. They provide typed identity upserts and reads, relationship replacement, capability/count/feature persistence, evidence, external references, latest-only player observations, favorites, and per-provider synchronization state. Repository methods are main-process-only and use transactions for relationship replacement.

## Provider request policy

GS-010 defines provider authentication and throttling in `src/main/providers/authentication.ts`. The official Steam catalog list uses a user-supplied Web API key in the request query string. URLs are redacted before errors or diagnostics are recorded, requests are serialized, and the key stays encrypted at rest. Store-details and current-player requests are anonymous.

GS-012 normalization lives under `src/main/normalization`. Steam DTOs become ID-free canonical import records for Windows. Explicit Store categories such as Online Co-op, LAN Co-op, and Shared/Split Screen Co-op create capabilities with unknown player counts; generic Multi-player and Co-op categories remain ambiguous. Steam observations are normalized separately as activity enrichment and cannot create or alter multiplayer capabilities.

GS-013 catalog import lives in `src/main/imports/catalog-import.ts`. A normalized Steam batch is written in one immediate SQLite transaction, replacing imported relationships while preserving favorites. Steam enrichment runs only after that primary commit; each game enrichment uses its own transaction and reports individual failures without rolling back the catalog or successful enrichment for other games. Current-player rows remain latest-only through repository upserts.

GS-015 coordinates those phases in `src/main/imports/import-coordinator.ts`. Each run emits typed primary and Steam phase start, progress, item-error, completion, failure, and cancellation events. Cooperative cancellation throws inside the primary transaction so no partial primary batch commits; during Steam enrichment it stops before the next game and retains already completed enrichment. A run handle exposes `cancel()`, a completion promise, and `retry()` with the same immutable input.
