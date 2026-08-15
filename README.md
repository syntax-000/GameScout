# GameScout

GameScout is a local-first Windows desktop application for discovering PC games from Steam. It keeps
the catalog, favorites, filters, and game details available locally after a successful refresh.

## Features

- Browse and search a locally cached Steam game catalog.
- Filter by genre, multiplayer mode, and supported player information.
- View game details and open verified Steam Store pages.
- Save favorites locally.
- Keep the existing catalog usable when Steam is unavailable.
- Store the Steam Web API key with Windows-backed encryption.

## Requirements

- Windows 10 or Windows 11, x64
- Node.js 24
- npm 11 or later
- A personal [Steam Web API key](https://steamcommunity.com/dev/apikey)

## Run locally

```powershell
git clone https://github.com/syntax-000/GameScout.git
cd GameScout
npm.cmd ci
npm.cmd run dev
```

On first launch, enter the Steam Web API key in GameScout's setup screen. Do not add the key to an
environment file or commit it to the repository. GameScout encrypts it with Electron `safeStorage`
and writes it beneath `%APPDATA%\GameScout\secure-storage`, outside the source tree.

## Verify changes

```powershell
npm.cmd run verify
npm.cmd audit --audit-level=moderate
```

The verification command runs TypeScript checks, ESLint, Prettier validation, unit and end-to-end
tests, and a production build.

## Build the Windows installer

```powershell
npm.cmd run package:windows
```

The generated installer is written to `release/GameScout-0.1.0-Setup.exe`. Generated builds,
installers, local databases, caches, environment files, and credentials are intentionally excluded
from Git.

## Architecture and security

GameScout uses Electron, React, TypeScript, and SQLite. Network access, database access, credential
storage, and external-link validation remain in the Electron main process. The renderer runs with
context isolation, Node integration disabled, sandboxing, a restrictive content security policy,
blocked navigation and popup creation, and a narrow validated IPC bridge.

See [local development](docs/development.md), the [Steam provider contract](docs/provider-notes/steam-contract.md),
and [security policy](SECURITY.md) for more information.

GameScout is an independent project and is not affiliated with or endorsed by Valve Corporation.
