import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import { createBrowseHandlers } from '../../src/main/ipc/browse-handlers';
import { normalizeSteamCatalogGame } from '../../src/main/normalization/steam-catalog';
import { createSynchronizationService } from '../../src/main/sync/sync-service';
import { createBrowsePageRequest, createStatusRequest } from '../../src/shared/ipc/contracts';
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
describe('Steam catalog workflow', () => {
  it('imports Steam data and supports offline browsing after restart', () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-e2e-'));
    dirs.push(userDataPath);
    let database = openGameScoutDatabase({ userDataPath });
    const normalized = normalizeSteamCatalogGame(
      {
        appId: 620,
        name: 'Portal 2',
        summary: 'Cooperative puzzle game.',
        releaseDate: '2011-04-19',
        headerImage: null,
        rating: 95,
        popularity: 20000,
        lastModified: 1_723_600_000,
        genres: [{ id: '3', description: 'Puzzle' }],
        categories: [{ id: 38, description: 'Online Co-op' }],
        storeUrl: 'https://store.steampowered.com/app/620/',
      },
      '2026-08-14T00:00:00Z',
    );
    createSynchronizationService(database, () => new Date('2026-08-14T01:00:00Z')).importPrimary([
      normalized,
    ]);
    database.close();
    database = openGameScoutDatabase({ userDataPath });
    const browse = createBrowseHandlers(() => database);
    expect(browse.getBrowseGenres(createStatusRequest())).toEqual([
      expect.objectContaining({ name: 'Puzzle' }),
    ]);
    expect(
      browse.getBrowsePage(
        createBrowsePageRequest(0, 12, 'title_asc', 'portal', null, 'online_coop', null),
      ).games,
    ).toEqual([expect.objectContaining({ title: 'Portal 2' })]);
    database.close();
  });
});
