import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import { classifyImportError, type ImportErrorCode } from '../../src/main/imports/import-errors';
import type { NormalizedGame } from '../../src/main/normalization/models';
import { ProviderAuthenticationError } from '../../src/main/providers/authentication';
import {
  ProviderRequestError,
  type ProviderRequestErrorCode,
} from '../../src/main/providers/transport';
import { createSynchronizationService } from '../../src/main/sync/sync-service';

const directories: string[] = [];
afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe('import error states', () => {
  it.each<[ProviderRequestErrorCode, ImportErrorCode, boolean]>([
    ['network_error', 'network_unavailable', true],
    ['timeout', 'timeout', true],
    ['rate_limited', 'rate_limited', true],
    ['authentication_error', 'authentication', false],
    ['invalid_response', 'invalid_response', false],
    ['empty_response', 'empty_response', true],
    ['api_error', 'provider_error', true],
    ['http_error', 'provider_error', false],
  ])('classifies %s as %s with retryable=%s', (requestCode, expectedCode, retryable) => {
    const classified = classifyImportError(
      new ProviderRequestError({
        provider: 'steam',
        code: requestCode,
        message: 'raw provider message',
        retryable,
      }),
      'steam',
    );
    expect(classified).toMatchObject({
      source: 'steam',
      code: expectedCode,
      retryable,
    });
    expect(classified.message).not.toContain('raw provider message');
  });

  it.each([
    ['invalid_configuration', 'configuration'],
    ['credential_required', 'credential_required'],
    ['invalid_credential', 'authentication'],
  ] as const)('classifies provider authentication state %s', (authenticationCode, expectedCode) => {
    expect(
      classifyImportError(
        new ProviderAuthenticationError('steam', authenticationCode, 'secret detail'),
        'steam',
      ),
    ).toMatchObject({ source: 'steam', code: expectedCode, retryable: false });
  });

  it('records primary and Steam failures without changing catalog, favorites, or enrichment', () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-import-error-test-'));
    directories.push(userDataPath);
    const database = openGameScoutDatabase({ userDataPath });
    const service = createSynchronizationService(
      database,
      () => new Date('2026-08-14T02:00:00.000Z'),
    );
    service.importPrimary([game()]);
    service.importSteam([
      {
        providerGameId: 'preserved',
        enrichment: {
          state: 'available',
          externalReference: {
            provider: 'steam',
            externalId: '620',
            externalUrl: 'https://store.steampowered.com/app/620/',
          },
          currentPlayerObservation: {
            provider: 'steam',
            playerCount: 123,
            observedAt: '2026-08-14T01:30:00.000Z',
          },
        },
      },
    ]);
    const saved = database.repositories.games.getByProviderId('preserved')!;
    database.repositories.favorites.add(saved.id, '2026-08-14T01:45:00.000Z');

    const primaryError = service.recordFailure(
      'steam_catalog',
      new ProviderRequestError({
        provider: 'steam',
        code: 'network_error',
        message: 'offline',
        retryable: true,
      }),
    );
    const steamError = service.recordFailure(
      'steam_activity',
      new ProviderAuthenticationError('steam', 'credential_required', 'missing'),
    );

    expect(primaryError).toMatchObject({ code: 'network_unavailable', retryable: true });
    expect(steamError).toMatchObject({ code: 'credential_required', retryable: false });
    expect(database.repositories.games.list()).toHaveLength(1);
    expect(database.repositories.favorites.has(saved.id)).toBe(true);
    expect(database.repositories.currentPlayerCounts.get(saved.id, 'steam')).toMatchObject({
      playerCount: 123,
      observedAt: '2026-08-14T01:30:00.000Z',
    });
    expect(service.getStatus()).toMatchObject({
      primary: { state: 'error', lastSuccessAt: '2026-08-14T02:00:00.000Z' },
      steam: { state: 'error', lastSuccessAt: '2026-08-14T02:00:00.000Z' },
      latestSteamObservationAt: '2026-08-14T01:30:00.000Z',
    });
    database.close();
  });
});

function game(): NormalizedGame {
  return {
    providerGameId: 'preserved',
    title: 'Preserved Game',
    normalizedTitle: 'preserved game',
    summary: null,
    releaseDate: null,
    coverUrl: null,
    rating: null,
    ratingCount: null,
    popularity: null,
    providerUpdatedAt: null,
    fetchedAt: '2026-08-14T01:00:00.000Z',
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
