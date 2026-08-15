# Steam provider contract (GS-001)

Steam is GameScout's sole catalog and activity provider. A user-supplied Steam Web API key stays encrypted in the Electron main process.

## Catalog

- Official list: `IStoreService/GetAppList/v1`, using an ordinary Web API key and `input_json`.
- Only games are requested; DLC, software, video, and hardware are excluded.
- Pages are bounded at 50,000 entries and continuation uses `last_appid`.
- GameScout selects at most 25 recently modified entries per manual refresh.
- Public Store details are requested for the bounded selection to obtain Windows support, titles, descriptions, images, release dates, genres, Store categories, ratings, and recommendation totals.
- Only successful `type=game` records with `platforms.windows=true` are imported.

## Capability mapping

Explicit Store categories map conservatively: Single-player (2), Massively Multiplayer (20), Online PvP (36), Shared/Split Screen PvP (37), Online Co-op (38), Shared/Split Screen Co-op (39), LAN PvP (47), and LAN Co-op (48). Generic Multi-player (1), Co-op (9), and PvP (49) are ignored because they do not establish a connection type.

Steam Store categories never establish minimum, maximum, range, or discrete supported player counts. Current-player observations measure activity and never establish compatibility or capacity.

## Terms and behavior

The UI links to Steam and presents Steam data as-is without implying Valve endorsement. Keys and credential-bearing URLs are excluded from logs and IPC. Requests are serialized and failures leave the previous local catalog available.

Official references: <https://partner.steamgames.com/doc/webapi/IStoreService> and <https://steamcommunity.com/dev/apiterms>.
