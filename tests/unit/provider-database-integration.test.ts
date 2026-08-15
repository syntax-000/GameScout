import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import { normalizeSteamCatalogGame } from '../../src/main/normalization/steam-catalog';
import { createSynchronizationService } from '../../src/main/sync/sync-service';
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
describe('Steam-to-database integration', () => {
  it('imports by Steam AppID idempotently and preserves favorites', () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-provider-db-'));
    dirs.push(userDataPath);
    const database = openGameScoutDatabase({ userDataPath });
    const service = createSynchronizationService(database, () => new Date('2026-08-14T01:00:00Z'));
    const normalized = normalizeSteamCatalogGame(
      {
        appId: 620,
        name: 'Portal 2',
        summary: null,
        releaseDate: null,
        headerImage: null,
        rating: null,
        popularity: null,
        lastModified: 1_723_600_000,
        genres: [{ id: '3', description: 'Puzzle' }],
        categories: [],
        storeUrl: 'https://store.steampowered.com/app/620/',
      },
      '2026-08-14T00:00:00Z',
    );
    expect(service.importPrimary([normalized])).toEqual({ added: 1, updated: 0, imported: 1 });
    const record = database.repositories.games.getByProviderId('620')!;
    database.repositories.favorites.add(record.id, '2026-08-14T01:30:00Z');
    expect(service.importPrimary([{ ...normalized, title: 'Portal 2 Updated' }])).toEqual({
      added: 0,
      updated: 1,
      imported: 1,
    });
    expect(database.repositories.favorites.has(record.id)).toBe(true);
    expect(service.getStatus().primary.phase).toBe('steam_catalog');
    database.close();
  });
});
