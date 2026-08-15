import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import {
  importNormalizedCatalog,
  importSteamEnrichmentsBestEffort,
} from '../../src/main/imports/catalog-import';
import type { NormalizedGame } from '../../src/main/normalization/models';

const directories: string[] = [];

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function setup() {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-import-test-'));
  directories.push(userDataPath);
  return openGameScoutDatabase({ userDataPath });
}

function game(providerGameId = '194', title = 'Portal 2'): NormalizedGame {
  return {
    providerGameId,
    title,
    normalizedTitle: title.toLowerCase(),
    summary: null,
    releaseDate: '2011-04-19',
    coverUrl: null,
    rating: null,
    ratingCount: null,
    popularity: null,
    providerUpdatedAt: '2026-08-14T00:00:00.000Z',
    fetchedAt: '2026-08-14T01:00:00.000Z',
    genres: [{ providerGenreId: 'puzzle', name: 'Puzzle' }],
    platforms: [
      {
        providerPlatformId: 'windows',
        name: 'Windows',
        family: 'PC',
        generation: null,
        releaseDate: '2011-04-19',
        storeUrl: 'https://store.steampowered.com/app/620/',
        editionName: null,
        dataStatus: 'partial',
        capabilities: [
          {
            capabilityType: 'cooperative',
            connectionType: 'online',
            supportState: 'supported',
            countModel: 'maximum_only',
            minPlayers: null,
            maxPlayers: 2,
            playerCounts: [],
            confidence: 'verified',
            notes: null,
            features: [],
            evidence: [
              {
                provider: 'steam',
                externalRecordId: `${providerGameId}:1`,
                observedAt: '2026-08-14T00:00:00.000Z',
                sourceField: 'online play',
                confidence: 'verified',
                notes: null,
              },
            ],
          },
        ],
      },
    ],
    externalReferences: [
      {
        provider: 'steam',
        externalId: '620',
        externalUrl: 'https://store.steampowered.com/app/620/',
      },
    ],
  };
}

describe('transactional catalog import', () => {
  it('imports and updates idempotently while preserving favorites', () => {
    const database = setup();
    expect(importNormalizedCatalog(database, [game()])).toEqual({
      added: 1,
      updated: 0,
      imported: 1,
    });
    const saved = database.repositories.games.getByProviderId('194')!;
    database.repositories.favorites.add(saved.id, '2026-08-14T01:00:00.000Z');

    expect(importNormalizedCatalog(database, [game('194', 'Portal Two')])).toEqual({
      added: 0,
      updated: 1,
      imported: 1,
    });
    expect(database.repositories.games.list()).toHaveLength(1);
    expect(database.repositories.games.getByProviderId('194')?.title).toBe('Portal Two');
    expect(database.repositories.favorites.has(saved.id)).toBe(true);
    expect(database.repositories.gamePlatforms.listForGame(saved.id)).toHaveLength(1);
    database.close();
  });

  it('rolls back the entire primary batch when a later game fails', () => {
    const database = setup();
    importNormalizedCatalog(database, [game('existing', 'Existing')]);
    const invalid = game('broken', 'Broken');
    invalid.platforms[0]!.capabilities[0]!.countModel = 'exact_range';
    invalid.platforms[0]!.capabilities[0]!.minPlayers = null;

    expect(() => importNormalizedCatalog(database, [game('new', 'New'), invalid])).toThrow();
    expect(database.repositories.games.getByProviderId('new')).toBeNull();
    expect(database.repositories.games.getByProviderId('broken')).toBeNull();
    expect(database.repositories.games.getByProviderId('existing')?.title).toBe('Existing');
    database.close();
  });

  it('applies latest-only Steam enrichment and isolates individual failures', () => {
    const database = setup();
    importNormalizedCatalog(database, [game()]);
    const first = importSteamEnrichmentsBestEffort(database, [
      {
        providerGameId: '194',
        enrichment: {
          state: 'available',
          externalReference: {
            provider: 'steam',
            externalId: '620',
            externalUrl: 'https://store.steampowered.com/app/620/',
          },
          currentPlayerObservation: {
            provider: 'steam',
            playerCount: 10,
            observedAt: '2026-08-14T01:00:00.000Z',
          },
        },
      },
      {
        providerGameId: 'missing',
        enrichment: {
          state: 'available',
          externalReference: null,
          currentPlayerObservation: {
            provider: 'steam',
            playerCount: 999,
            observedAt: '2026-08-14T01:00:00.000Z',
          },
        },
      },
    ]);
    expect(first.failures).toHaveLength(1);
    expect(first.updatedObservations).toBe(1);

    const saved = database.repositories.games.getByProviderId('194')!;
    importSteamEnrichmentsBestEffort(database, [
      {
        providerGameId: '194',
        enrichment: {
          state: 'available',
          externalReference: null,
          currentPlayerObservation: {
            provider: 'steam',
            playerCount: 20,
            observedAt: '2026-08-14T02:00:00.000Z',
          },
        },
      },
    ]);
    expect(database.repositories.currentPlayerCounts.get(saved.id, 'steam')).toMatchObject({
      playerCount: 20,
      observedAt: '2026-08-14T02:00:00.000Z',
    });
    expect(database.repositories.games.getByProviderId('194')).not.toBeNull();

    const failed = importSteamEnrichmentsBestEffort(database, [
      {
        providerGameId: '194',
        enrichment: {
          state: 'available',
          externalReference: {
            provider: 'steam',
            externalId: '620',
            externalUrl: 'https://store.steampowered.com/app/620/',
          },
          currentPlayerObservation: {
            provider: 'steam',
            playerCount: -1,
            observedAt: '2026-08-14T03:00:00.000Z',
          },
        },
      },
    ]);
    expect(failed.failures).toHaveLength(1);
    expect(database.repositories.currentPlayerCounts.get(saved.id, 'steam')?.playerCount).toBe(20);
    expect(database.repositories.games.getByProviderId('194')).not.toBeNull();
    database.close();
  });
});
