import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import { createBrowseHandlers } from '../../src/main/ipc/browse-handlers';
import { createFavoriteHandlers } from '../../src/main/ipc/favorite-handlers';
import type { NormalizedGame } from '../../src/main/normalization/models';
import { createSynchronizationService } from '../../src/main/sync/sync-service';
import {
  createBrowsePageRequest,
  createGameDetailsRequest,
  createStatusRequest,
} from '../../src/shared/ipc/contracts';

const directories: string[] = [];

afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
});

function game(providerGameId: string, title: string, genre: string): NormalizedGame {
  return {
    providerGameId,
    title,
    normalizedTitle: title.toLocaleLowerCase(),
    summary: null,
    releaseDate: '2026-01-01',
    coverUrl: null,
    rating: null,
    ratingCount: null,
    popularity: null,
    providerUpdatedAt: null,
    fetchedAt: '2026-08-14T00:00:00.000Z',
    genres: [{ providerGenreId: genre.toLocaleLowerCase(), name: genre }],
    externalReferences: [],
    platforms: [
      {
        providerPlatformId: 'windows',
        name: 'Windows',
        family: 'PC',
        generation: null,
        releaseDate: null,
        storeUrl: null,
        editionName: null,
        dataStatus: 'complete',
        capabilities: [
          {
            capabilityType: 'cooperative',
            connectionType: 'online',
            supportState: 'supported',
            countModel: 'exact_range',
            minPlayers: 2,
            maxPlayers: 4,
            playerCounts: [],
            confidence: 'verified',
            notes: null,
            features: [],
            evidence: [],
          },
        ],
      },
    ],
  };
}

describe('cached browsing', () => {
  it('supports the local workflow after restart without provider clients', () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-cached-test-'));
    directories.push(userDataPath);
    const database = openGameScoutDatabase({ userDataPath });
    const synchronization = createSynchronizationService(
      database,
      () => new Date('2026-08-14T01:00:00.000Z'),
    );
    synchronization.importPrimary([
      game('portal-2', 'Portal 2', 'Puzzle'),
      game('deep-rock', 'Deep Rock Galactic', 'Action'),
    ]);
    synchronization.importSteam([
      {
        providerGameId: 'portal-2',
        enrichment: {
          state: 'available',
          externalReference: {
            provider: 'steam',
            externalId: '620',
            externalUrl: 'https://store.steampowered.com/app/620/',
          },
          currentPlayerObservation: {
            provider: 'steam',
            playerCount: 321,
            observedAt: '2026-08-14T00:30:00.000Z',
          },
        },
      },
    ]);
    const portal = database.repositories.games.getByProviderId('portal-2')!;
    database.repositories.favorites.add(portal.id, '2026-08-14T01:30:00.000Z');
    database.close();

    const reopened = openGameScoutDatabase({ userDataPath });
    const browse = createBrowseHandlers(() => reopened);
    const favorites = createFavoriteHandlers(() => reopened);
    const genres = browse.getBrowseGenres(createStatusRequest());
    const puzzleGenre = genres.find((genre) => genre.name === 'Puzzle')!;

    expect(
      browse.getBrowsePage(createBrowsePageRequest(0, 12, 'title_asc', '', null, 'any', null))
        .totalCount,
    ).toBe(2);
    expect(
      browse.getBrowsePage(
        createBrowsePageRequest(0, 12, 'title_asc', 'PoRtAl', puzzleGenre.id, 'online_coop', 2),
      ).games,
    ).toMatchObject([{ title: 'Portal 2', isFavorite: true }]);
    expect(browse.getGameDetails(createGameDetailsRequest(portal.id))?.steam).toMatchObject({
      appId: '620',
      currentPlayerCount: 321,
      observedAt: '2026-08-14T00:30:00.000Z',
    });
    expect(favorites.list(createStatusRequest())).toEqual([
      { gameId: portal.id, createdAt: '2026-08-14T01:30:00.000Z' },
    ]);
    expect(createSynchronizationService(reopened).getStatus()).toMatchObject({
      primary: { state: 'success', lastSuccessAt: '2026-08-14T01:00:00.000Z' },
      latestSteamObservationAt: '2026-08-14T00:30:00.000Z',
    });
    reopened.close();
  });
});
