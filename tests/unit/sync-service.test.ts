import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import type { NormalizedGame } from '../../src/main/normalization/models';
import { createSynchronizationService } from '../../src/main/sync/sync-service';

const directories: string[] = [];

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function setup(times: string[]) {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-sync-test-'));
  directories.push(userDataPath);
  const database = openGameScoutDatabase({ userDataPath });
  let index = 0;
  const service = createSynchronizationService(database, () => new Date(times[index++]!));
  return { database, service, userDataPath };
}

function game(valid = true): NormalizedGame {
  return {
    providerGameId: valid ? '194' : 'broken',
    title: valid ? 'Portal 2' : 'Broken',
    normalizedTitle: valid ? 'portal 2' : 'broken',
    summary: null,
    releaseDate: null,
    coverUrl: null,
    rating: null,
    ratingCount: null,
    popularity: null,
    providerUpdatedAt: null,
    fetchedAt: '2026-08-14T00:00:00.000Z',
    genres: [],
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
        dataStatus: 'partial',
        capabilities: [
          {
            capabilityType: 'cooperative',
            connectionType: 'online',
            supportState: 'supported',
            countModel: valid ? 'maximum_only' : 'exact_range',
            minPlayers: null,
            maxPlayers: 2,
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

describe('synchronization state', () => {
  it('persists primary success and preserves it across a later failure and restart', () => {
    const { database, service, userDataPath } = setup([
      '2026-08-14T01:00:00.000Z',
      '2026-08-14T02:00:00.000Z',
    ]);
    service.importPrimary([game()]);
    expect(() => service.importPrimary([game(false)])).toThrow();
    expect(service.getStatus().primary).toEqual({
      phase: 'steam_catalog',
      state: 'error',
      lastAttemptAt: '2026-08-14T02:00:00.000Z',
      lastSuccessAt: '2026-08-14T01:00:00.000Z',
      lastError: expect.any(String),
      importedCount: 1,
    });
    database.close();

    const reopened = openGameScoutDatabase({ userDataPath });
    expect(createSynchronizationService(reopened).getStatus().primary.lastSuccessAt).toBe(
      '2026-08-14T01:00:00.000Z',
    );
    reopened.close();
  });

  it('tracks Steam independently and retains the latest observation timestamp after failure', () => {
    const { database, service } = setup([
      '2026-08-14T01:00:00.000Z',
      '2026-08-14T02:00:00.000Z',
      '2026-08-14T03:00:00.000Z',
    ]);
    service.importPrimary([game()]);
    service.importSteam([
      {
        providerGameId: '194',
        enrichment: {
          state: 'available',
          externalReference: null,
          currentPlayerObservation: {
            provider: 'steam',
            playerCount: 12,
            observedAt: '2026-08-14T01:30:00.000Z',
          },
        },
      },
    ]);
    service.importSteam([
      {
        providerGameId: 'missing',
        enrichment: {
          state: 'unavailable',
          externalReference: null,
          currentPlayerObservation: null,
        },
      },
    ]);

    const status = service.getStatus();
    expect(status.primary.state).toBe('success');
    expect(status.steam).toMatchObject({
      state: 'error',
      lastAttemptAt: '2026-08-14T03:00:00.000Z',
      lastSuccessAt: '2026-08-14T02:00:00.000Z',
    });
    expect(status.latestSteamObservationAt).toBe('2026-08-14T01:30:00.000Z');
    database.close();
  });
});
