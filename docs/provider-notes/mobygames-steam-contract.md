# MobyGames + Steam Provider Contract Review (GS-001)

Status: superseded historical artifact; MobyGames rejected because V0.1 permits only zero-cost providers
Reviewed: 2026-08-13
Authoritative specification: `PROJECT_SPEC.md`

## Superseded decision

This provider path is no longer active. The user rejected MobyGames because it is a paid API for the intended project constraints. The active GS-001 provider review is `docs/provider-notes/steam-contract.md`. Do not run the MobyGames validator for current GameScout work.

## Historical decision

MobyGames is the provisional primary catalog provider, and Steam is approved as a narrowly scoped enrichment source. That architecture does not by itself complete GS-001. Acceptance still requires authenticated, retainable samples, current first-party terms review, and proof that the applicable access tier and GameScout's intended use require no paid API/service subscription. If MobyGames requires payment for this use, it is not accepted for V0.1.

The provider-independent GameScout model remains authoritative:

```text
MobyGames DTO -> GameScout normalization -> Game / GamePlatform / MultiplayerCapability -> SQLite
Steam DTO -> Steam enrichment mapper -> verified external reference + latest current-player observation -> SQLite
```

Steam current players are concurrent activity observations. They are never multiplayer support evidence, player capacity, or a substitute for MobyGames capability data.

## MobyGames contract

The validator targets the MobyGames API v1 shape documented by public client artifacts. It must be rechecked against the account's current official documentation before provider implementation:

- Base URL: `https://api.mobygames.com/v1`.
- Credential: one MobyGames API key, supplied as the `api_key` query parameter.
- Game list/detail: `/games`, `/games/{game_id}`.
- Game platforms: `/games/{game_id}/platforms`.
- Platform detail: `/games/{game_id}/platforms/{platform_id}`.
- Reference lists: `/platforms`, `/genres`.

The platform-detail response is the critical multiplayer input. It is expected to contain `attributes[]` entries with category and attribute IDs/names. The validator records selected attribute evidence but does not turn free text into canonical support or capacity automatically.

Public client/scraper artifacts suggest categories for general/offline player counts, online player counts, and multiplayer game modes. Those category IDs and semantics are provisional until authenticated first-party verification. Exact range text must be retained; GameScout must not use a parser that discards the minimum and keeps only the maximum.

### Required evidence

For every capability fixture, the same platform-detail record must establish the platform scope. These remain unknown unless explicit:

- generic online multiplayer versus online co-op;
- local/offline multiplayer versus local/offline co-op;
- LAN;
- split-screen;
- minimum and maximum player counts;
- whether a count applies to co-op rather than another online mode.

Separate free-text attributes must not be cross-combined into a verified capability merely because they occur on the same platform page. GS-002's six-player online-co-op fixture is valid only when an authenticated record explicitly proves that binding and can legally be retained. The four-player counterexample requires a separate explicit record.

V0.1 imports only Windows platform records. Linux, macOS, DOS, console, and other non-Windows platform records are out of scope. GS-001 must record the exact MobyGames Windows platform IDs approved for import.

| GameScout field | Candidate MobyGames source | Status |
| --- | --- | --- |
| Provider identity/title | `game_id`, `title` | Candidate; verify live |
| Summary | `description` | Candidate; nullable |
| Release date | game/platform release fields | Candidate; verify platform semantics |
| Cover | `cover` | Candidate; nullable |
| Genres | `genres` | Candidate relationship |
| Platforms | `platforms`, platform-detail endpoint | Candidate; preserve distinct IDs |
| Platform multiplayer | platform-detail `attributes[]` | Critical; semantics/linkage require live verification |
| Rating/rating count | `moby_score`, `num_votes`-like fields | Nullable until semantically accepted |
| Popularity | no accepted mapping | Nullable |
| Provider update timestamp | no accepted mapping | Nullable |
| Store URL | listed URL only when its type is verified as a store | Nullable; never guessed |

## Steam enrichment contract

Steam is not a catalog provider. The validator accepts only explicit AppIDs supplied by the caller or later sourced from a verified provider-listed Steam URL. It never uses title matching.

Approved candidate endpoint:

- `GET https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=<uint32>`

The response's `player_count` is a latest point-in-time observation stored with `observed_at`. Zero is valid. Missing, unavailable, or failed values remain null/unknown. Refresh overwrites the latest value; V0.1 stores no history.

For a verified numeric AppID, GameScout may derive and validate `https://store.steampowered.com/app/<appid>/`. That URL is not capability evidence.

Steam authentication, anonymous access, endpoint availability, rate limits, terms, retention, attribution, and redistribution rights require current first-party verification. A Steam API key must not be added to Setup unless an approved endpoint actually requires it.

## Security and retention

- MobyGames API keys in query strings are never logged, persisted in reports, or returned through IPC.
- Steam keys/tokens are never logged or returned through IPC.
- Reports contain selected IDs, names, attribute IDs/names, statuses, and review flags, not complete raw responses.
- Credentials, headers, account identifiers, and unrelated fields are removed from fixtures.
- Provider terms and fixture-retention rights must be confirmed before GS-002 fixtures are committed.

## Validation procedure

Use `scripts/validate-mobygames-steam.ps1`. The script supports a dry run without credentials and an authenticated run with explicit IDs:

```powershell
$env:MOBYGAMES_API_KEY = Read-Host 'MobyGames API key'

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File ./scripts/validate-mobygames-steam.ps1 `
  -MobyGameIds '123,456' `
  -MobyPlatformIds '1,2' `
  -SteamAppIds '730,440' `
  -OutputPath "$env:TEMP/gamescout-provider-contract.json"

Remove-Item Env:MOBYGAMES_API_KEY
```

The IDs are placeholders. Do not substitute guessed IDs or use title matching. The output is a review report, not a GS-002 fixture.

Steam-only endpoint validation may be run with explicit AppIDs and no MobyGames key:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File ./scripts/validate-mobygames-steam.ps1 `
  -SteamAppIds '730,440' `
  -OutputPath "$env:TEMP/gamescout-steam-validation.json"
```

## Acceptance checklist

| Requirement | State | Notes |
| --- | --- | --- |
| MobyGames authentication documented | Partial | API-key shape documented; authenticated request unavailable locally |
| MobyGames required fields documented | Partial | Candidate fields and platform attributes recorded; live schema recheck required |
| MobyGames multiplayer mapping documented | Partial | Conservative rules recorded; exact semantics/linkage require live samples |
| MobyGames rate limits | Blocked | Account-tier quota not verified |
| MobyGames zero-cost eligibility | Blocked | Current official pricing/tier and intended-use eligibility not verified; paid tiers are not permitted |
| MobyGames terms/retention/attribution | Blocked | Current first-party review required |
| Steam current-player endpoint | Partial | Endpoint and timestamp semantics recorded; current auth/rate behavior requires live recheck |
| Steam AppID association rules | Complete | Source-backed evidence only; no title matching |
| Steam terms/retention/attribution | Blocked | Current first-party review required |
| Six-player online-coop evidence | Blocked | Requires explicit same-platform MobyGames evidence |
| Provider accepted for implementation | Blocked | Architecture approved; GS-001 evidence incomplete |

## Unavoidable limitations

- MobyGames may expose counts and modes as separate/free-text attributes whose relationship is ambiguous.
- Steam has no general MobyGames-ID-to-AppID mapping endpoint.
- Steam current players become stale between manual refreshes and say nothing about supported capacity.
- Rating/popularity/update fields may have no compatible MobyGames equivalents.
- Public distribution and fixture retention may be restricted by provider terms or account tier.
- A free API key, if offered, may still have usage restrictions that make the intended GameScout use ineligible; zero price and permission for the intended use must both be verified.

Do not start GS-002 until the blocked evidence is resolved or the user explicitly approves another documented specification decision.

This MobyGames review and its validator are superseded historical artifacts. The active provider contract is `docs/provider-notes/steam-contract.md`.
