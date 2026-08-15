# GameScout Project Specification

Status: authoritative V0.1 specification
Scope: Windows desktop application, local-first, single developer
Implementation status: planning only; no application code is authorized by this document

## 1. Product vision

GameScout is a Windows desktop game-discovery application that helps a person or group answer: “What game can we play together?” It retrieves a bounded catalog from one primary game-data API, optionally enriches verified Steam associations with bounded Steam-specific data, indexes the results locally, and lets users find games by genre, multiplayer capability, and required player count. Results must be explainable and must distinguish verified support from unknown data.

The V0.1 product principle is: reliable compatibility answers are more valuable than a huge, poorly normalized catalog.

## 2. Core user problem

Game stores expose broad metadata but make practical group questions difficult to answer. Users need to know whether a specific game supports their platform, play mode, and group size. GameScout reduces that search to local, deterministic filters and a clear details view.

## 3. Target users

- Friend groups choosing a game night title.
- PC players looking for online, local, LAN, or split-screen games.
- Players discovering games by genre or multiplayer capability.
- Users who want a small, searchable catalog rather than browsing a large storefront manually.

V0.1 does not target social communities, retailers, developers, or competitive-esports analytics users.

## 4. Frozen V0.1 scope

V0.1 includes exactly:

- Windows desktop application.
- First-run Steam setup with one personal API key, plus the required attribution and terms notice.
- One primary catalog provider: Steam, subject to the feasibility, licensing, and terms validation in GS-001.
- Bounded Steam enrichment for source-backed Steam AppID associations, validated Steam store links, and the latest current-player observation when a supported endpoint provides it.
- Manual, bounded retrieval of a Windows-PC game catalog. V0.1 does not import Linux, macOS, DOS, console, or other non-Windows platform records.
- Local SQLite persistence.
- Browse imported games.
- Case-insensitive title search.
- One selected genre filter.
- Multiplayer-type filters:
  - Any
  - Single-player
  - Online multiplayer
  - Online co-op
  - Local multiplayer
  - Local co-op
  - LAN co-op
  - Split-screen
- Required player-count filter from 1 through 16.
- Game details page.
- Safe opening of an approved-source-listed store page, including a validated Steam store page derived from a verified Steam AppID, in the system browser.
- Local favorites.
- Manual refresh/re-import.
- Import progress, retry, and useful error states.
- Offline browsing, search, filtering, details, and favorites for previously imported data.

“Retrieve games” means a bounded, deterministic import. V0.1 does not mirror the entire provider catalog.

## 5. Explicit V0.1 non-goals

The following are out of scope:

- Steam player-history snapshots, charts, peaks, or background polling. V0.1 stores at most the latest point-in-time Steam current-player observation from a manual refresh.
- Pricing, budget filtering, or multi-store comparison.
- MobyGames, IsThereAnyDeal, or any additional catalog provider. Steam is both the catalog and bounded activity source.
- Hidden-gem scoring, trending, personalized recommendations, or AI/LLM recommendations.
- Accounts, cloud synchronization, group profiles, or social features.
- Steam library integration.
- Watchlists, notifications, price alerts, or background automatic synchronization.
- Screenshots, trailers, offline media downloads, or remote fallback search.
- Fuzzy duplicate merging, raw API-response storage, or a generalized provenance framework.
- Mobile applications, microservices, Docker, virtual machines, Kubernetes, or hosted infrastructure.

Future features may be considered only after the V0.1 workflow is reliable. They are not part of the implementation contract.

## 6. Final technology stack

- Desktop shell: Electron.
- UI: React, TypeScript, and Vite.
- Local database: SQLite using `better-sqlite3` or an equivalent maintained SQLite binding.
- Main/renderer communication: typed Electron IPC through a narrow preload API.
- Credentials: Windows Credential Manager (or an equivalent OS-secure credential store).
- Tests: Vitest for unit/integration tests and Playwright (or equivalent) for desktop end-to-end tests.
- Formatting/linting/type checks: TypeScript compiler, ESLint, and Prettier.

Electron is final for V0.1 because it permits a single primary implementation language and a simpler solo-developer workflow.

### Thin Rust/Tauri responsibilities

None. Rust and Tauri are not part of the finalized V0.1 stack. The equivalent native responsibilities are handled by the Electron main process and preload layer. No Rust/Tauri code is to be introduced unless a later, explicit scope decision changes the stack.

## 7. Architecture

GameScout is a modular monolith with one desktop process boundary:

```text
React renderer
    -> typed preload API / IPC
Electron main process
    -> application services
        -> SQLite repositories
        -> Steam provider adapter
        -> Steam enrichment adapter
        -> credential storage
```

Responsibilities are separated by module, not by services or deployable processes. The renderer never owns provider secrets, SQLite connections, or direct provider requests.

The data path is:

```text
Steam -> Steam DTO -> GameScout normalization layer -> canonical Game / MultiplayerCapability model -> SQLite -> local search/filter queries -> React UI

Verified Steam reference -> Steam DTO -> Steam enrichment mapper -> SQLite external reference/store/latest observation
```

## 8. React/TypeScript responsibilities

React/TypeScript owns:

- Setup, Browse, Game Details, and Favorites screens.
- Form state and validation for search and filters.
- Rendering cards, capability tables, progress, errors, and stale-data indicators.
- Navigation and route state.
- Calling only the typed preload/IPC API.
- Local presentation state such as selected filters and current page.

React/TypeScript must not:

- Contain Steam or Steam credentials, API keys, or access tokens.
- Open raw database connections.
- Call Steam or Steam directly.
- Reimplement canonical multiplayer normalization.
- Treat unknown capability data as supported.

## 9. Thin Rust/Tauri responsibilities

Not applicable to V0.1. Electron main-process responsibilities are:

- Provider authentication and requests.
- Credential-store access.
- SQLite connection and migrations.
- Repository calls and transactional imports.
- Canonical normalization and capability query logic.
- Safe external-link validation and opening.
- Typed progress and error events to the renderer.

The main process should remain thin: it coordinates services and enforces boundaries; it should not become a large framework or a second UI.

## 10. SQLite responsibilities

SQLite is the source of truth for all imported and user-created local state. It owns:

- Normalized game metadata.
- Platform-specific capabilities.
- Genre relationships.
- Provider references and evidence.
- Latest Steam current-player observation and its observation time.
- Favorites.
- Synchronization status.
- Indexed local search.

All normal browsing, searching, filtering, details, and favorites operations read SQLite and work without network access. Imports use transactions and upserts.

## 11. External API responsibilities

Steam is the only external catalog provider in V0.1. Its adapter retrieves, when available:

- Provider game ID and title.
- Summary.
- Release date.
- Cover art URL or image identifier.
- Genres.
- Windows game records and platform associations retained as distinct provider platforms.
- Platform-specific multiplayer options, multiplayer modes, and online/offline player-count attributes when their semantics and linkage are explicit.
- Rating and rating count only when the validated Steam fields are semantically compatible.
- Provider popularity or ranking only when the validated Steam contract supplies a semantically matching field.
- Provider-listed website/store references when available.
- Provider update timestamp when available.

The Steam adapter converts provider-specific DTOs through a provider-independent GameScout normalization layer. It does not invent values. Missing fields become unknown. Generic online multiplayer does not become online co-op. Separate platform attributes are combined only when the provider contract proves they apply to the same platform capability; vague or unbound attributes never become exact player-count support.

Steam activity is a bounded enrichment phase of the Steam catalog, not a second provider. Every imported game already has a source-backed AppID. GameScout constructs and validates `https://store.steampowered.com/app/<appid>/` and may retrieve the latest current-player value during manual refresh. A successful observed value of zero is valid; missing, failed, or unavailable observations remain null/unknown. Steam current players measure concurrent activity, not multiplayer support or capacity, and never populate `MultiplayerCapability`, player-count fields, or compatibility filters.

Steam catalog and activity endpoints, rate limits, storage rights, attribution, terms, and field availability must be validated before release (GS-001). Steam requires a user-supplied Web API key; no shared key is packaged with GameScout.

## 12. Hybrid local-index + live-details strategy

V0.1 uses a local-index-first strategy:

- The bounded catalog is imported into SQLite.
- Browse, search, filters, details, and favorites use local data.
- The UI does not require a provider request during normal navigation.
- Manual refresh retrieves the bounded Steam catalog again, transactionally upserts it, and then performs bounded best-effort Steam enrichment only for verified AppIDs.
- There is no remote fallback search.

V0.1 does not implement a separate live-details network request. Game details are read from the local record. The model retains `fetched_at`, provider update metadata, and Steam observation time so stale data can be shown honestly. A Steam enrichment failure does not invalidate or roll back a successful Steam catalog import.

## 13. Database schema

The physical schema is normalized around game-platform capabilities. Table and column names below are authoritative for V0.1.

### `games`

- `id` — local primary key.
- `provider_game_id` — unique Steam page or record identifier.
- `title`.
- `normalized_title`.
- `summary`, nullable.
- `release_date`, nullable.
- `cover_url`, nullable.
- `rating`, nullable.
- `rating_count`, nullable.
- `popularity`, nullable.
- `provider_updated_at`, nullable.
- `fetched_at`.

### `genres`

- `id` — local primary key.
- `provider_genre_id` — stable Steam genre/category key documented by GS-001; no identifier is fabricated when the source supplies only ambiguous prose.
- `name`.

### `game_genres`

- `game_id`.
- `genre_id`.
- Composite primary key: `(game_id, genre_id)`.

### `platforms`

- `id` — local primary key.
- `provider_platform_id` — stable Steam Windows platform key documented by GS-001.
- `name`.
- `family`, nullable.
- `generation`, nullable.

V0.1 imports and displays only Windows game records from Steam. Non-Windows platform records are out of scope for V0.1 and must not be imported. GS-001 defines the exact Windows platform taxonomy and record-selection rules.

### `game_platforms`

- `id` — local primary key.
- `game_id`.
- `platform_id`.
- `release_date`, nullable.
- `store_url`, nullable.
- `edition_name`, nullable and empty for V0.1.
- `data_status` — complete, partial, or unknown.

Unique identity: `(game_id, platform_id, edition_name)`.

### `multiplayer_capabilities`

One row per game-platform capability.

- `id` — capability primary key.
- `game_platform_id`.
- `capability_type` — `single_player`, `multiplayer_unspecified`, `cooperative`, `pvp`, `mixed_coop_pvp`.
- `connection_type` — `none`, `local_device`, `lan`, `online`.
- `support_state` — `supported`, `unsupported`, or `unknown`.
- `count_model` — `exact_range`, `discrete_set`, `maximum_only`, or `unknown`.
- `min_players`, nullable.
- `max_players`, nullable.
- `confidence` — `verified`, `high`, `medium`, or `low`.
- `notes`, nullable.

Unique identity: `(game_platform_id, capability_type, connection_type)`.

### `capability_player_counts`

Used when `count_model = discrete_set`.

- `capability_id`.
- `player_count`.
- Composite primary key: `(capability_id, player_count)`.

### `capability_features`

Features attached to a capability rather than to the entire game.

- `capability_id`.
- `feature_type` — `split_screen`, `shared_screen`, or `hot_seat`.
- `support_state` — `supported`, `unsupported`, or `unknown`.
- Composite primary key: `(capability_id, feature_type)`.

### `external_game_references`

- `game_id`.
- `provider`.
- `external_id`.
- `external_url`, nullable.

Unique constraint: `(provider, external_id)`.

For `provider = steam`, `external_id` is the verified numeric Steam AppID and is unique. For a verified Steam association, the canonical Steam HTTPS URL is the PC store URL. Without a verified AppID, `game_platforms.store_url` may use only an approved source-listed URL whose type is validated as an actual store; otherwise it remains null.

### `current_player_counts`

Latest point-in-time activity observation; it is not a multiplayer capability or supported capacity.

- `game_id`.
- `provider`.
- `player_count`.
- `observed_at`.

Composite primary key: `(game_id, provider)`. Refresh overwrites the latest value; V0.1 does not retain player-history rows. Steam current players must not be copied into `games.popularity` or any capability/player-count table.

### `capability_evidence`

Lightweight source evidence for multiplayer claims.

- `id`.
- `capability_id`.
- `provider`.
- `external_record_id`.
- `observed_at`.
- `source_field`, nullable.
- `confidence`.
- `notes`, nullable.

V0.1 does not store complete raw API responses.

### `favorites`

- `game_id` — primary key and foreign key.
- `created_at`.

### `sync_state`

- `id`.
- `provider_name`.
- `last_attempt_at`, nullable.
- `last_success_at`, nullable.
- `last_error`, nullable.
- `imported_count`, nullable.

Unique constraint: `provider_name`. Steam primary import and Steam enrichment maintain independent rows/status.

Required indexes include normalized title, release date, popularity, provider IDs, relationship keys, and capability lookup fields.

## 14. Internal game data model

The canonical hierarchy is:

```text
Game
└── GamePlatform
    ├── MultiplayerCapability
    │   ├── interaction type
    │   ├── connection type
    │   ├── support state
    │   ├── player-count rule
    │   └── confidence/evidence
    └── CapabilityFeature
        └── split screen/shared screen/hot seat
```

Game-level fields contain identity and general metadata only. Capabilities are never stored as game-level booleans because PC and console support can differ.

Current-player observations are separate activity/enrichment records and are not part of the `MultiplayerCapability` hierarchy.

A Steam page or record identifier is authoritative for primary catalog identity. An external provider ID is authoritative only within that provider. A Steam AppID association requires explicit source-backed evidence; it is never created by fuzzy or title-only matching. V0.1 does not automatically fuzzy-merge games, editions, remakes, DLC, or bundles. Occasional duplicates and missing Steam enrichment are preferable to false merges.

## 15. Multiplayer/player-count model

The model keeps three dimensions independent:

1. Interaction: single-player, unspecified multiplayer, co-op, PvP, or mixed co-op/PvP.
2. Connection: none, same device, LAN, or online.
3. Capacity: a range, discrete set, maximum-only value, or unknown.

Rules:

- `unknown` is not `unsupported`.
- Split-screen is a feature of a local capability.
- LAN is distinct from same-device local play.
- Generic online multiplayer does not prove online co-op.
- A generic online maximum does not become an online co-op maximum.
- A provider claim without a platform scope is not used as a verified platform-specific claim.
- A query requiring a player count matches only a capability that explicitly supports that count.
- For a range, `min_players <= requested <= max_players`.
- For a discrete set, the requested count must be listed.
- A maximum-only value can be shown as uncertain but is not a verified exact group-size match unless the user explicitly enables incomplete data.
- Steam current-player values are concurrent activity observations, not supported group capacity. They never establish single-player, multiplayer, co-op, connection type, minimum players, maximum players, or a player-count match.

Derived values such as “supports online co-op” or “maximum online co-op players” are query results over platform capabilities, not independently stored facts.

## 16. Search strategy

V0.1 searches the local SQLite catalog only.

- Case-insensitive title search.
- Substring matching against `title` and `normalized_title`.
- No description search, fuzzy matching, or remote fallback search.
- Search combines with genre, multiplayer, player-count, and sort filters.
- Pagination is required for browse results.

FTS5 is not required initially. It may be added only if measurable title-search performance or relevance requires it; this does not expand V0.1 scope.

## 17. Filtering strategy

All filters are SQL-backed and platform-aware.

### Genre

- One selected genre at a time.
- Default: Any genre.
- Match requires an explicit `game_genres` relationship.

### Multiplayer type

- Any.
- Single-player.
- Online multiplayer.
- Online co-op.
- Local multiplayer.
- Local co-op.
- LAN co-op.
- Split-screen.

Only `support_state = supported` records satisfy verified filters. Unknown records remain visible in details but are not treated as supported.

### Player count

- Integer from 1 through 16.
- Means “supports at least this many players” for the selected capability.
- Known lower maximums are excluded.
- Unknown maximums are excluded from verified results.
- Steam current-player observations are excluded from player-count filtering.

Steam platform attributes may be normalized into a count rule only when GS-001 documents their exact semantics and the source record binds the count to the same Windows platform and capability. Free-text multiplayer modes and separate online/offline count attributes are not cross-combined unless that relationship is explicit in the provider contract or source record.

### Sorts

- Title ascending.
- Release date newest first.
- Rating descending.
- Popularity descending.

Null ordering is consistent and documented in the repository tests.

Rating and popularity remain nullable. GS-001 must document a semantically compatible Steam source before either value is populated; Steam current players and materially different rankings are not substitutes. If the primary provider supplies no compatible value, the sort remains deterministic with all-null provider values rather than fabricating a score.

## 18. Caching strategy

V0.1 caching is intentionally simple:

- Normalized game data is cached in SQLite.
- `fetched_at` and provider update timestamps are retained.
- Manual refresh is the only catalog synchronization trigger.
- Provider credentials, API keys, and access tokens are kept out of SQLite. Short-lived tokens, if a validated endpoint uses them, are held in memory only.
- Only the latest Steam current-player observation and its observation time are retained; V0.1 stores no player history.
- No raw response cache is stored.
- No screenshot or trailer download cache is implemented.

If the primary Steam refresh fails, the last successful catalog remains available and is marked stale. Imports are bounded and transactional. If only Steam enrichment fails, the successful primary catalog import remains committed and prior Steam enrichment remains available with its older observation time.

## 19. Error and rate-limit handling

Provider errors are categorized by source and phase as:

- Missing/invalid credentials.
- Authentication failure.
- Network unavailable.
- Timeout.
- Rate limited.
- Invalid provider response.
- Empty provider response.
- Steam enrichment unavailable.

Behavior:

- Show a readable error and a retry action.
- Preserve the last successful catalog.
- Do not log credentials or tokens.
- Use bounded retries with backoff for transient network and rate-limit failures.
- Respect `Retry-After` when supplied.
- Do not run background synchronization.
- A provider request never runs during ordinary local browsing.
- Missing Steam association or current-player data is an unknown enrichment value, not a primary import failure.
- Steam enrichment failures do not roll back a successful Steam catalog import.

## 20. Security requirements

- Provider credentials and API keys are stored in Windows Credential Manager, never in source control, SQLite, or renderer state.
- Access tokens are not logged or exposed through IPC responses.
- The renderer uses a narrow, typed preload API; Node integration is disabled.
- SQL queries are parameterized.
- External store links accept only validated HTTPS URLs and open in the system browser.
- The renderer never navigates directly to arbitrary external pages.
- Provider text is treated as untrusted display data.
- Local diagnostics must redact credentials, API keys, tokens, and credential-bearing URLs or query strings.
- Provider credentials or query parameters, if any, must be removed before request URLs are logged or reported.
- The packaged app must not contain a shared production credential. Public distribution requires a later, explicit credential/distribution decision.
- A Steam store URL is accepted only when it is an approved provider-listed HTTPS URL or is constructed from a verified numeric AppID using the documented Steam host/path.

## 21. Screens and navigation

### Setup

Shown when required provider configuration is not complete. The screen collects the personal API key required by Steam and acknowledgement of the attribution/terms notice. Steam credentials are shown only if GS-001 confirms that an approved endpoint requires one.

### Browse

The default screen after setup. Includes title search, one genre filter, multiplayer-type filter, required player count, four sorts, paginated cards, retrieve/refresh action, import status, and last-successful-sync time.

### Game Details

Includes title, cover, summary, release date, genres, platform, capability table, player ranges, confidence/unknown indicators, store-page action, favorite action, and last-fetched time. When available, it also shows the verified Steam AppID and latest Steam current-player observation with its observation time, clearly separated from supported player capacity.

### Favorites

Lists locally favorited games, supports title search within favorites, opens details, and supports removal.

### Import progress modal

Shows phase, processed count, imported count, errors, completion/failure state, retry, and cancellation where supported.

Navigation:

```text
Setup -> Browse
Browse -> Game Details
Browse -> Favorites
Game Details -> Browse or Favorites
Favorites -> Game Details
```

There are no separate Home, Trending, Upcoming, Hidden Gems, Watchlist, or Settings routes in the frozen scope beyond setup/import controls required by V0.1.

## 22. Folder/project structure

```text
gamescout/
  src/
    main/
      main.ts
      ipc/
      services/
      providers/
        steam/
        steam/
      db/
      security/
      errors/
    preload/
      index.ts
      api.ts
    renderer/
      app/
      components/
      features/
        setup/
        browse/
        game-details/
        favorites/
      pages/
      hooks/
      types/
      styles/
  migrations/
  tests/
    fixtures/
    unit/
    integration/
    e2e/
  docs/
    provider-notes/
```

Steam response types stay under `src/main/providers/steam`; Steam response types stay under `src/main/providers/steam`. Canonical models and narrow enrichment contracts are shared through explicit typed contracts and do not expose provider response shapes to UI components.

## 23. Testing strategy

### Unit tests

- Provider-to-canonical normalization.
- Source-backed Steam AppID association and Steam enrichment isolation.
- Steam current players never satisfying multiplayer or player-count filters.
- Supported/unsupported/unknown multiplayer states.
- Platform-specific capability isolation.
- Range, discrete-set, maximum-only, and unknown player counts.
- Genre and title filtering.
- Safe URL validation.
- Input validation.

### Database integration tests

- Migrations.
- Foreign keys and uniqueness constraints.
- Repository CRUD/upserts.
- Transactional Steam imports.
- Failed primary-import preservation and non-fatal Steam enrichment failure.
- Source-backed external references and latest-only current-player observation overwrite behavior.
- Favorite persistence and refresh behavior.
- Per-source sync-state updates.

### End-to-end tests

With Steam catalog, Store-details, and activity responses mocked:

1. Complete the Steam provider setup, if any configuration is required.
2. Retrieve games.
3. Apply bounded Steam enrichment for a verified fixture AppID and tolerate an unavailable-enrichment fixture.
4. Browse.
5. Search.
6. Filter genre.
7. Filter multiplayer type.
8. Filter player count.
9. Open details and verify current-player activity is separate from supported capacity.
10. Open a test HTTPS store URL.
11. Favorite a game.
12. Restart and verify the favorite and timestamped enrichment state.

### Manual Windows verification

- Clean install.
- First-run setup.
- Packaged import.
- Network failure and retry.
- Offline browsing.
- Reinstall behavior.
- Windows Credential Manager behavior.
- Steam primary-import success with Steam enrichment unavailable.

## 24. Definition of Done for V0.1

V0.1 is done when:

- The packaged Windows application launches on a clean installation.
- Setup stores any required provider credentials securely without exposing them to the renderer, logs, or database.
- A bounded real catalog can be retrieved from Steam without a paid API key or subscription.
- Verified Steam AppIDs can be enriched with a valid Steam store link and, when available, a timestamped latest current-player observation without affecting multiplayer compatibility.
- Re-imports update existing provider records without duplicates.
- Failed imports preserve the previous successful catalog.
- Browse, title search, genre filtering, multiplayer filtering, player-count filtering, and sorting work locally.
- Platform-specific multiplayer capabilities are not combined incorrectly.
- Unknown multiplayer values are shown as unknown and never treated as verified support.
- Missing or failed Steam enrichment remains unknown and does not discard a valid Steam catalog.
- A game details screen shows source-backed metadata and capability/player-count information.
- Valid store links open in the system browser; invalid or missing links are handled safely.
- Steam current-player observations are displayed only as timestamped activity data and never as multiplayer capacity.
- Favorites persist across restarts and catalog refreshes.
- Previously imported data remains usable offline.
- Automated normalization, database, import, and end-to-end tests pass.
- The complete core workflow succeeds:
  1. Launch app.
  2. Retrieve games.
  3. Browse games.
  4. Search games.
  5. Filter by genre.
  6. Filter by multiplayer type.
  7. Filter by number of players.
  8. Open game details.
  9. Open the game’s store page.
  10. Favorite a game.

## 25. Complete approved GS-XXX development backlog

Each task is intended to be implemented, tested, and committed independently. Tasks must be completed in this order.

### EPIC 0 — Validate the provider contract

#### GS-001 — Validate Steam catalog and activity access, licensing, and terms

**Goal:** Confirm that Steam provides the primary V0.1 Windows catalog/capability data without a paid API key or subscription, that the approved Steam endpoints provide the bounded enrichment data, and that both permit the intended use.

**Implementation description:** Document Steam REST access and API-key authentication, required fields, Windows filtering and tag mappings, Steam AppID evidence rules, request limits, caching/retention rights, attribution, terms, and unsupported fields. Steam mode tags do not establish exact player capacity. Verify that Steam current players are point-in-time activity only and cannot affect compatibility.

**Dependencies:** None.

**Acceptance criteria:** Access, field availability, Windows-platform/multiplayer mapping, AppID association evidence, request limits, retention, attribution, licensing, and terms are documented for both sources; Steam is accepted as the primary V0.1 catalog provider only if no paid API/service subscription is required and the intended distribution can comply with its license; approved Steam enrichment endpoints are enumerated; unsupported or ambiguous values are documented as unknown. If the no-cost access, required field semantics, or licensing requirements are incompatible, GS-001 remains blocked and the provider is not implemented.

**How to test it:** Make bounded authenticated Steam requests and inspect varied Windows records, including explicit and ambiguous multiplayer tags and missing values. Confirm attribution/terms requirements and acceptable request behavior. Test approved Steam endpoints with verified, missing, and invalid AppIDs and confirm current players never represent supported capacity.

#### GS-002 — Create representative provider fixtures

**Goal:** Establish deterministic source data for implementation and tests.

**Implementation description:** Create sanitized Steam DTO fixtures for all V0.1 capability types, missing fields, missing store URLs, and conflicting/ambiguous capability fields; document expected canonical output and required attribution/license notices. Add narrow Steam DTO fixtures for verified AppID/store enrichment, positive and zero current-player success, missing association, unavailable count, and enrichment failure.

**Dependencies:** GS-001.

**Acceptance criteria:** Steam fixtures cover explicit online/local co-op, multiplayer, split-screen, ambiguous tags, and unknown player counts. Steam fixtures prove enrichment isolation and do not supply multiplayer capacity.

**How to test it:** Review fixtures against the documented Steam Store-category and activity mappings, confirm no credentials or prohibited complete responses are included, and verify that no capability is created from ambiguous categories.

**Feasibility result:** Steam does not provide reliable exact supported player counts. Exact-count filtering remains conservative and excludes Steam capabilities whose count model is unknown. Do not infer capacity from tags or substitute Steam current-player data.

### EPIC 1 — Create the desktop foundation

#### GS-003 — Initialize the Electron desktop application

**Goal:** Create a Windows-runnable Electron, React, TypeScript, and Vite shell.

**Implementation description:** Configure development/production builds, native window, placeholder loading screen, and separate renderer/main entry points.

**Dependencies:** GS-001, GS-002.

**Acceptance criteria:** Development launch, production build, native window, and renderer isolation all work.

**How to test it:** Start development, build production, and launch the built application on Windows.

#### GS-004 — Configure project quality tools

**Goal:** Make project health continuously testable.

**Implementation description:** Configure TypeScript checks, ESLint, Prettier, unit-test runner, and documented verification commands.

**Dependencies:** GS-003.

**Acceptance criteria:** Type checking, linting, formatting verification, and tests pass; intentional errors fail checks.

**How to test it:** Run every check and introduce temporary type/lint errors to verify failure behavior.

#### GS-005 — Establish the renderer/main-process boundary

**Goal:** Define a safe, typed IPC boundary.

**Implementation description:** Add initial typed IPC for application status, settings status, and database health; reject malformed input.

**Dependencies:** GS-003.

**Acceptance criteria:** Renderer uses explicit IPC only; secrets and database/network access remain outside renderer; invalid input is rejected.

**How to test it:** Call methods from the renderer and send malformed payloads.

### EPIC 2 — Build local persistence

#### GS-006 — Add SQLite initialization and migrations

**Goal:** Create reliable local SQLite storage.

**Implementation description:** Select application-data directory, create database on first launch, implement migration runner, store schema version, and make migration failures recoverable.

**Dependencies:** GS-003, GS-005.

**Acceptance criteria:** Clean initialization, safe reopening, recorded schema version, and recoverable migration failure.

**How to test it:** Launch with no database, relaunch, run test migrations, and simulate a failed migration.

#### GS-007 — Create the V0.1 database schema

**Goal:** Persist the finalized canonical model.

**Implementation description:** Create `games`, `genres`, `game_genres`, `platforms`, `game_platforms`, `multiplayer_capabilities`, `capability_player_counts`, `capability_features`, `external_game_references`, latest-only `current_player_counts`, `capability_evidence`, `favorites`, and per-source `sync_state` with keys, foreign keys, uniqueness constraints, and indexes.

**Dependencies:** GS-006.

**Acceptance criteria:** Schema enforces provider identity, relationship uniqueness, capability uniqueness, foreign keys, tri-state support, and required search/filter indexes.

**How to test it:** Inspect schema, insert valid data, and verify duplicate/foreign-key violations.

#### GS-008 — Implement database repositories

**Goal:** Provide persistence operations for canonical models.

**Implementation description:** Implement repositories for games, genres, platforms, game-platforms, capabilities/features/counts, evidence, external references/latest Steam observation, favorites, and per-source sync state; keep SQL in the database layer.

**Dependencies:** GS-007.

**Acceptance criteria:** Repositories insert, retrieve, update, upsert, and list records predictably and idempotently.

**How to test it:** Run integration tests against temporary SQLite databases.

### EPIC 3 — Implement provider access and normalization

#### GS-009 — Implement secure credential storage

**Goal:** Store provider credentials securely.

**Implementation description:** Use Windows Credential Manager through main-process IPC for the user-supplied Steam Web API key. V0.1 access must not depend on a paid credential. Expose only configured status to the renderer; never store secrets in SQLite or logs.

**Dependencies:** GS-005.

**Acceptance criteria:** Save/read/delete work and secrets are absent from database, renderer state, and logs.

**How to test it:** Save test values, restart, inspect storage/logs, and delete values.

#### GS-010 — Implement provider authentication

**Goal:** Configure Steam requests and authenticate the official catalog-list request.

**Implementation description:** Implement the GS-001-approved Steam request headers, identification, throttling, and any free-use authentication/redaction rules. Add Steam credential handling only for approved endpoints that require it; keep any short-lived tokens in memory and expose typed authentication errors.

**Dependencies:** GS-001, GS-009.

**Acceptance criteria:** Steam requests use the validated free access method and required identification; any optional provider credentials are handled only when required; invalid credentials are handled; keys and tokens are never logged or exposed.

**How to test it:** Test API-key validation, redaction, query authentication, throttling behavior, and any credential cases required by the approved Steam endpoints.

#### GS-011 — Implement provider retrieval and Steam enrichment queries

**Goal:** Retrieve a bounded Windows-PC catalog.

**Implementation description:** Request a bounded Steam Windows catalog, follow only the required store-link subresources, apply a fixed import limit, throttle requests, and classify network/rate-limit/response errors. For source-backed Steam AppIDs only, perform bounded best-effort lookups for approved enrichment fields. Steam failure must not invalidate a valid Steam response.

**Dependencies:** GS-001, GS-002, GS-010.

**Acceptance criteria:** Real and fixture Steam requests are bounded, paginated correctly, follow the validated request policy, tolerate missing optional fields, and classify failures. Steam requests are bounded to verified AppIDs, tolerate unavailable values, and report partial enrichment failures separately.

**How to test it:** Run small real Steam and approved Steam requests plus mocked empty, malformed, rate-limited, network-failure, missing-AppID, invalid-AppID, and partial-enrichment responses.

#### GS-012 — Normalize provider records into the internal model

**Goal:** Convert Steam records without losing multiplayer meaning or uncertainty and map Steam data without contaminating canonical capabilities.

**Implementation description:** Map Steam DTOs through the GameScout normalization layer into identity, metadata, genres, Windows platform records, covers, approved store references, ratings/rankings only when semantically compatible, and platform-specific capability records. Missing values become unknown; generic online multiplayer never becomes online co-op; unbound attributes are not cross-combined. Map Steam DTOs separately into verified external references, validated store URLs, and latest timestamped current-player observations only.

**Dependencies:** GS-002, GS-007, GS-011.

**Acceptance criteria:** Fixture outputs match documented canonical and enrichment records; platform capabilities remain separate; no player counts, AppIDs, associations, or URLs are invented; Steam current players never alter `MultiplayerCapability`.

**How to test it:** Run normalization tests for every fixture, including missing and conflicting fields.

### EPIC 4 — Import and synchronization

#### GS-013 — Implement transactional catalog import

**Goal:** Save retrieved catalogs safely.

**Implementation description:** Import normalized Steam records and relationships in one transaction; preserve favorites; report added/updated counts; then apply bounded Steam enrichment for verified AppIDs in a separate best-effort phase so an enrichment failure cannot roll back the primary catalog.

**Dependencies:** GS-008, GS-012.

**Acceptance criteria:** Successful Steam import is browseable; repeat imports are idempotent; failed primary imports do not erase prior data; Steam enrichment is latest-only and idempotent; Steam failures do not erase valid Steam data; favorites remain.

**How to test it:** Import Steam catalog and activity fixtures twice, modify one record, force primary mid-import failure, force activity enrichment failure, and verify catalog data/favorites remain intact.

#### GS-014 — Implement synchronization state

**Goal:** Persist catalog freshness and errors.

**Implementation description:** Store last attempt, last success, last error, and imported count per source/phase; expose primary and enrichment status via IPC, including the latest Steam observation time.

**Dependencies:** GS-013.

**Acceptance criteria:** Primary and enrichment success/failure transitions persist independently; a Steam failure leaves the prior successful Steam catalog available; stale Steam observations retain their observation time.

**How to test it:** Test successful and failed Steam imports, successful and failed Steam enrichment, restart the application, and inspect per-source state.

#### GS-015 — Implement import progress and cancellation behavior

**Goal:** Make import understandable and recoverable.

**Implementation description:** Emit primary-import and Steam-enrichment phases with processed, imported, error, completion, and failure events; support cancellation if cleanly available.

**Dependencies:** GS-013, GS-014.

**Acceptance criteria:** Primary and enrichment progress/completion/failure are distinct; retry is available; cancellation does not partially commit the primary import; Steam partial failure is clearly reported without rolling back Steam data.

**How to test it:** Run multi-batch Steam fixtures, simulate primary and Steam failures, and cancel during each phase.

### EPIC 5 — Application navigation and setup

#### GS-016 — Implement application layout and routes

**Goal:** Provide Setup, Browse, Game Details, and Favorites navigation.

**Implementation description:** Add routes, layout, navigation, selected-game routing, and startup route selection based on provider-setup/catalog state.

**Dependencies:** GS-003, GS-005.

**Acceptance criteria:** All screens open, details preserve selected game, favorites navigation works, and setup appears when unconfigured.

**How to test it:** Navigate every route and restart from each screen.

#### GS-017 — Implement the setup screen

**Goal:** Configure the free primary provider and any approved optional credentials without exposing secrets.

**Implementation description:** Add Steam source information, required attribution/license notice, any validated free-use configuration, configured status, documentation link, and transition to Browse. Add credential fields only if GS-001 proves an approved endpoint requires them; no paid Steam credential is permitted.

**Dependencies:** GS-009, GS-016.

**Acceptance criteria:** Required Steam configuration and attribution are displayed; invalid configuration is rejected; any optional credential follows the same rules; secrets are not redisplayed; user can proceed without purchasing API access.

**How to test it:** Test default/free, invalid, valid, and restart scenarios for Steam configuration and any approved required Steam credential.

### EPIC 6 — Browse, search, and filters

#### GS-018 — Implement paginated browse queries

**Goal:** Display imported games efficiently.

**Implementation description:** Add local queries for page size, offset, total count, sorting, and empty states.

**Dependencies:** GS-008, GS-016.

**Acceptance criteria:** Pages, counts, deterministic ordering, and empty states work.

**How to test it:** Browse fixture sets smaller than, equal to, and larger than one page.

#### GS-019 — Implement game cards

**Goal:** Provide a useful browse representation.

**Implementation description:** Show cover/placeholder, title, release date, genres, platform, multiplayer summary, and favorite state.

**Dependencies:** GS-018.

**Acceptance criteria:** Complete and incomplete records render; cards open details; favorite state is visible.

**How to test it:** Render fixtures with missing cover/date/capability data and test keyboard/mouse activation.

#### GS-020 — Implement title search

**Goal:** Find imported games by title.

**Implementation description:** Normalize query/title, perform case-insensitive local substring matching against title fields, and combine with existing filters.

**Dependencies:** GS-018.

**Acceptance criteria:** Exact, partial, mixed-case, empty, and no-match searches work offline.

**How to test it:** Run repository and UI search tests with fixture titles.

#### GS-021 — Implement genre filtering

**Goal:** Filter by one explicit genre.

**Implementation description:** Load genres from SQLite, provide Any genre, and apply one selected genre through a repository query.

**Dependencies:** GS-008, GS-018.

**Acceptance criteria:** Genre choices come from imported data; selection excludes non-matches; clearing restores results; search combines correctly.

**How to test it:** Use overlapping and unique genre fixtures.

#### GS-022 — Implement multiplayer-type filtering

**Goal:** Filter by verified capability.

**Implementation description:** Implement Any, Single-player, Online multiplayer, Online co-op, Local multiplayer, Local co-op, LAN co-op, and Split-screen using supported capability/feature records.

**Dependencies:** GS-008, GS-012, GS-018.

**Acceptance criteria:** Each filter returns only matching capabilities; unknown is never shown as supported; platform scope is preserved.

**How to test it:** Run each filter against all representative fixtures.

#### GS-023 — Implement required-player-count filtering

**Goal:** Find games supporting a requested group size.

**Implementation description:** Validate an integer from 1–16 and apply it to the selected capability’s range or discrete set; exclude unknown maximums from verified results.

**Dependencies:** GS-022.

**Acceptance criteria:** Six excludes four; six includes eight; discrete counts behave exactly; invalid input is rejected.

**How to test it:** Test counts 1, 2, 4, 6, and 16 with all count models.

#### GS-024 — Implement browse sorting

**Goal:** Order filtered results.

**Implementation description:** Add Title ascending, Release date newest first, Rating descending, and Popularity descending with consistent null ordering. Populate rating/popularity only when GS-001 documents semantically compatible Steam fields; otherwise preserve nulls and deterministic null ordering.

**Dependencies:** GS-018.

**Acceptance criteria:** All sorts work and remain stable across pagination; no sort substitutes Steam current players, Steam vote counts, or another semantically different metric for rating/popularity.

**How to test it:** Use fixtures with null and duplicate values.

### EPIC 7 — Game details and store links

#### GS-025 — Implement game-details data query

**Goal:** Retrieve all locally stored details for one game-platform result.

**Implementation description:** Return title, cover, summary, date, genres, platform, capabilities, counts, confidence, approved store URL, fetched time, and optional verified Steam AppID/current-player observation with observed time. Keep activity observations separate from capability counts.

**Dependencies:** GS-008, GS-016.

**Acceptance criteria:** Complete/incomplete records and nonexistent IDs have controlled outcomes; platform capabilities are not combined; missing/stale Steam enrichment is explicit and never presented as supported capacity.

**How to test it:** Query representative, incomplete, nonexistent, enriched, unenriched, and stale-observation records.

#### GS-026 — Implement the game-details screen

**Goal:** Let users verify compatibility before opening a store page.

**Implementation description:** Render metadata, capability table, player ranges, confidence/unknown indicators, favorite action, store action, and optional verified Steam AppID/current-player observation with its timestamp. Label Steam activity separately from supported capacity.

**Dependencies:** GS-025.

**Acceptance criteria:** Details are readable and accurately distinguish online/local/LAN/co-op/PvP and unknown values; Steam current players are never shown as a player-capacity claim.

**How to test it:** Test all capability fixtures, missing fields, enriched/stale Steam observations, resizing, and keyboard navigation.

#### GS-027 — Implement safe external store links

**Goal:** Open valid store pages safely.

**Implementation description:** Validate HTTPS URLs against approved provider/store hosts and paths, open them in the system browser, reject unsupported schemes, and disable missing links. A Steam URL may be constructed only from a verified numeric AppID.

**Dependencies:** GS-026.

**Acceptance criteria:** Valid links open externally; malformed, non-HTTPS, and missing links are safely handled; renderer does not navigate externally.

**How to test it:** Test valid approved HTTPS URLs, malformed, `file:`, `javascript:`, unapproved hosts, invalid AppID-derived URLs, and absent URLs.

### EPIC 8 — Favorites

#### GS-028 — Implement favorite persistence

**Goal:** Save games locally.

**Implementation description:** Add add/remove/check/list repository and IPC operations; make duplicate adds idempotent.

**Dependencies:** GS-008, GS-016.

**Acceptance criteria:** Favorites persist across restart and refresh and can be added/removed safely.

**How to test it:** Add/remove/restart/re-add and refresh tests.

#### GS-029 — Add favorite controls to cards and details

**Goal:** Make favorite actions available in core workflows.

**Implementation description:** Add controls to cards/details and prevent event bubbling from opening details unintentionally.

**Dependencies:** GS-019, GS-026, GS-028.

**Acceptance criteria:** State updates immediately, remains consistent across screens, and failures are actionable.

**How to test it:** Favorite from Browse, unfavorite from Details, navigate, and verify consistency.

#### GS-030 — Implement the Favorites screen

**Goal:** Browse saved games.

**Implementation description:** Reuse game cards, support title search within favorites, open details, and show an empty state.

**Dependencies:** GS-019, GS-020, GS-028.

**Acceptance criteria:** Favorites display after restart, search works, details open, and removal updates the list.

**How to test it:** Test zero, one, many, searched, and removed favorites.

### EPIC 9 — Offline behavior and error handling

#### GS-031 — Implement cached browsing

**Goal:** Keep browsing usable without internet.

**Implementation description:** Ensure Browse, Search, Filters, Details, and Favorites read SQLite only and show last successful primary sync/stale state plus the timestamp of any latest Steam observation.

**Dependencies:** GS-014, GS-018, GS-025, GS-030.

**Acceptance criteria:** All local workflows work after network disconnect; primary catalog staleness and stale/unavailable Steam observations are visible; no cached current-player value is presented as live.

**How to test it:** Import with and without Steam enrichment, disconnect network, restart, and execute the full local workflow.

#### GS-032 — Implement import error states

**Goal:** Handle provider failures without losing local data.

**Implementation description:** Handle Steam access/configuration failure and Steam missing credentials or auth failure, plus network unavailable, timeout, rate limit, invalid response, and empty response with readable messages and retry. Treat missing/unverified Steam AppIDs and unavailable current-player values as explicit partial/unknown enrichment states.

**Dependencies:** GS-011, GS-013, GS-014.

**Acceptance criteria:** Each error is classified by source, retryable where appropriate, and leaves the previous catalog intact; Steam enrichment errors do not roll back a successful Steam import.

**How to test it:** Mock each Steam catalog and activity failure and compare primary catalog, enrichment, favorites, and sync state before/after.

### EPIC 10 — Verification and release readiness

#### GS-033 — Add normalization and query unit tests

**Goal:** Protect multiplayer behavior.

**Implementation description:** Test tri-state support, platform isolation, connection/interaction distinctions, all count models, genres, search, URL validation, source-backed Steam AppID association, and enrichment isolation.

**Dependencies:** GS-012, GS-021, GS-022, GS-023, GS-027.

**Acceptance criteria:** Six-player online co-op, four-player counterexample, unknown handling, all required filter semantics, and the rule that Steam current players never satisfy capacity are covered.

**How to test it:** Run the automated unit suite and review failures for actionable messages.

#### GS-034 — Add import and database integration tests

**Goal:** Verify provider-to-database behavior.

**Implementation description:** Test migrations, foreign keys, uniqueness, repository CRUD/upserts, Steam transactional imports, latest-only Steam enrichment, failed primary imports, partial Steam failures, favorite preservation, and per-source sync state.

**Dependencies:** GS-008, GS-013, GS-014.

**Acceptance criteria:** Imports and enrichment are idempotent; failed primary imports preserve data; Steam failures preserve the imported catalog; latest observations overwrite rather than create player history; relationships are not duplicated; favorites survive refresh.

**How to test it:** Run against temporary SQLite databases and provider fixtures.

#### GS-035 — Add end-to-end workflow tests

**Goal:** Verify the complete V0.1 journey.

**Implementation description:** Test setup, Steam retrieval, bounded Steam enrichment, browse, search, genre, multiplayer, player-count filter, details, test store URL, favorite, restart, and offline behavior with mocked provider responses.

**Dependencies:** GS-017, GS-015, GS-020, GS-021, GS-023, GS-026, GS-027, GS-030, GS-031.

**Acceptance criteria:** The workflow passes from clean database and after restart; offline browse/search/filter passes; Steam enrichment failure is non-fatal; stale current-player data is timestamped and never used as capacity.

**How to test it:** Run the desktop end-to-end suite and perform one manual run against real Steam and approved Steam endpoints.

#### GS-036 — Package and manually verify the Windows build

**Goal:** Produce a usable V0.1 installer.

**Implementation description:** Configure Windows packaging and verify clean installation, app-data behavior, migrations, Steam configuration and any approved credential storage, any approved Steam credential storage, primary import, bounded enrichment, core workflow, offline browsing, uninstall, and reinstall.

**Dependencies:** GS-035.

**Acceptance criteria:** A clean Windows environment can install, configure, import, browse, filter, inspect, open a store page, favorite, restart, and browse offline without development-only configuration.

**How to test it:** Install the packaged build, complete the full workflow, uninstall, reinstall, and verify documented local-data behavior.
