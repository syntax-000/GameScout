import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import {
  createImportCoordinator,
  type ImportProgressEvent,
} from '../../src/main/imports/import-coordinator';
import type { NormalizedGame } from '../../src/main/normalization/models';
import { createSynchronizationService } from '../../src/main/sync/sync-service';

const directories: string[] = [];

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function setup(yieldToEventLoop: () => Promise<void> = async () => undefined) {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-coordinator-test-'));
  directories.push(userDataPath);
  const database = openGameScoutDatabase({ userDataPath });
  const coordinator = createImportCoordinator(
    createSynchronizationService(database),
    yieldToEventLoop,
  );
  return { database, coordinator };
}

function game(id: string): NormalizedGame {
  return {
    providerGameId: id,
    title: `Game ${id}`,
    normalizedTitle: `game ${id}`,
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
        dataStatus: 'unknown',
        capabilities: [],
      },
    ],
  };
}

describe('import progress and cancellation', () => {
  it('emits distinct primary and Steam progress/completion events with partial errors', async () => {
    const { database, coordinator } = setup();
    const events: ImportProgressEvent[] = [];
    const run = coordinator.start(
      {
        games: [game('1'), game('2')],
        steamEnrichments: [
          {
            providerGameId: '1',
            enrichment: {
              state: 'missing_association',
              externalReference: null,
              currentPlayerObservation: null,
            },
          },
          {
            providerGameId: 'missing',
            enrichment: {
              state: 'unavailable',
              externalReference: null,
              currentPlayerObservation: null,
            },
          },
        ],
      },
      (event) => events.push(event),
    );

    await expect(run.completion).resolves.toMatchObject({
      state: 'completed',
      primaryCompleted: true,
      steamCompleted: true,
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'phase_started', phase: 'primary' }),
        expect.objectContaining({ type: 'progress', phase: 'primary', processed: 2 }),
        expect.objectContaining({ type: 'phase_completed', phase: 'primary' }),
        expect.objectContaining({ type: 'phase_started', phase: 'steam' }),
        expect.objectContaining({
          type: 'item_partial',
          phase: 'steam',
          providerGameId: '1',
          state: 'missing_association',
        }),
        expect.objectContaining({ type: 'item_error', phase: 'steam', providerGameId: 'missing' }),
        expect.objectContaining({ type: 'phase_completed', phase: 'steam', errors: 1, partial: 1 }),
      ]),
    );
    database.close();
  });

  it('cancels primary import without committing partial rows and can retry', async () => {
    const { database, coordinator } = setup();
    const events: ImportProgressEvent[] = [];
    let cancelOnce = true;
    let run = coordinator.start(
      { games: [game('1'), game('2')], steamEnrichments: [] },
      (event) => {
        events.push(event);
        if (
          cancelOnce &&
          event.type === 'progress' &&
          event.phase === 'primary' &&
          event.processed === 1
        ) {
          cancelOnce = false;
          run.cancel();
        }
      },
    );
    await expect(run.completion).resolves.toMatchObject({
      state: 'cancelled',
      primaryCompleted: false,
    });
    expect(database.repositories.games.list()).toHaveLength(0);

    run = run.retry();
    await expect(run.completion).resolves.toMatchObject({ state: 'completed' });
    expect(database.repositories.games.list()).toHaveLength(2);
    database.close();
  });

  it('cancels Steam after primary commit and keeps completed enrichment items', async () => {
    const { database, coordinator } = setup();
    const run = coordinator.start(
      {
        games: [game('1'), game('2')],
        steamEnrichments: [
          {
            providerGameId: '1',
            enrichment: {
              state: 'available',
              externalReference: null,
              currentPlayerObservation: {
                provider: 'steam',
                playerCount: 10,
                observedAt: '2026-08-14T01:00:00.000Z',
              },
            },
          },
          {
            providerGameId: '2',
            enrichment: {
              state: 'available',
              externalReference: null,
              currentPlayerObservation: {
                provider: 'steam',
                playerCount: 20,
                observedAt: '2026-08-14T01:00:00.000Z',
              },
            },
          },
        ],
      },
      (event) => {
        if (event.type === 'progress' && event.phase === 'steam' && event.processed === 1)
          run.cancel();
      },
    );
    await expect(run.completion).resolves.toMatchObject({
      state: 'cancelled',
      primaryCompleted: true,
    });
    expect(database.repositories.games.list()).toHaveLength(2);
    const first = database.repositories.games.getByProviderId('1')!;
    const second = database.repositories.games.getByProviderId('2')!;
    expect(database.repositories.currentPlayerCounts.get(first.id, 'steam')?.playerCount).toBe(10);
    expect(database.repositories.currentPlayerCounts.get(second.id, 'steam')).toBeNull();
    database.close();
  });

  it('emits a primary failure event and leaves the previous catalog available', async () => {
    const { database, coordinator } = setup();
    const existing = game('existing');
    await coordinator.start({ games: [existing], steamEnrichments: [] }, () => undefined)
      .completion;

    const broken = game('broken');
    broken.platforms[0]!.capabilities = [
      {
        capabilityType: 'cooperative',
        connectionType: 'online',
        supportState: 'supported',
        countModel: 'exact_range',
        minPlayers: null,
        maxPlayers: 2,
        playerCounts: [],
        confidence: 'verified',
        notes: null,
        features: [],
        evidence: [],
      },
    ];
    const events: ImportProgressEvent[] = [];
    const result = await coordinator.start({ games: [broken], steamEnrichments: [] }, (event) =>
      events.push(event),
    ).completion;

    expect(result).toMatchObject({ state: 'failed', primaryCompleted: false });
    expect(result.error).toMatchObject({
      source: 'steam',
      code: 'import_error',
      retryable: false,
    });
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'phase_failed', phase: 'primary' })]),
    );
    expect(database.repositories.games.getByProviderId('existing')).not.toBeNull();
    expect(database.repositories.games.getByProviderId('broken')).toBeNull();
    database.close();
  });
});
