import type { CatalogImportDatabase, GameSteamEnrichment } from '../imports/catalog-import';
import {
  importNormalizedCatalog,
  importSteamEnrichmentsBestEffort,
  type CatalogImportResult,
  type SteamEnrichmentBatchResult,
  type ImportControl,
} from '../imports/catalog-import';
import type { NormalizedGame } from '../normalization/models';
import { classifyImportError, type ImportErrorState } from '../imports/import-errors';
import type {
  SynchronizationPhaseStatus as SyncPhaseStatus,
  SynchronizationStatus,
} from '../../shared/ipc/contracts';

export type SyncPhase = 'steam_catalog' | 'steam_activity';

export function createSynchronizationService(
  database: CatalogImportDatabase,
  now: () => Date = () => new Date(),
) {
  const recordFailure = (
    phase: SyncPhase,
    error: unknown,
    attemptedAt = now().toISOString(),
  ): ImportErrorState => {
    const classified = classifyImportError(error, 'steam');
    const previous = database.repositories.syncState.get(phase);
    database.repositories.syncState.upsert({
      providerName: phase,
      lastAttemptAt: attemptedAt,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      lastError: classified.message,
      importedCount: previous?.importedCount ?? null,
    });
    return classified;
  };

  return {
    importPrimary(games: readonly NormalizedGame[], control?: ImportControl): CatalogImportResult {
      const attemptedAt = now().toISOString();
      const previous = database.repositories.syncState.get('steam_catalog');
      database.repositories.syncState.upsert({
        providerName: 'steam_catalog',
        lastAttemptAt: attemptedAt,
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        lastError: null,
        importedCount: previous?.importedCount ?? null,
      });
      try {
        const result = importNormalizedCatalog(database, games, control);
        database.repositories.syncState.upsert({
          providerName: 'steam_catalog',
          lastAttemptAt: attemptedAt,
          lastSuccessAt: attemptedAt,
          lastError: null,
          importedCount: result.imported,
        });
        return result;
      } catch (error) {
        recordFailure('steam_catalog', error, attemptedAt);
        throw error;
      }
    },
    importSteam(
      enrichments: readonly GameSteamEnrichment[],
      control?: ImportControl,
    ): SteamEnrichmentBatchResult {
      const attemptedAt = now().toISOString();
      const previous = database.repositories.syncState.get('steam_activity');
      database.repositories.syncState.upsert({
        providerName: 'steam_activity',
        lastAttemptAt: attemptedAt,
        lastSuccessAt: previous?.lastSuccessAt ?? null,
        lastError: null,
        importedCount: previous?.importedCount ?? null,
      });
      try {
        const result = importSteamEnrichmentsBestEffort(database, enrichments, control);
        const successful = enrichments.length - result.failures.length;
        database.repositories.syncState.upsert({
          providerName: 'steam_activity',
          lastAttemptAt: attemptedAt,
          lastSuccessAt:
            result.failures.length === enrichments.length
              ? (previous?.lastSuccessAt ?? null)
              : attemptedAt,
          lastError:
            result.failures.length === 0
              ? null
              : `${result.failures.length} Steam enrichment operation(s) failed.`,
          importedCount: successful,
        });
        return result;
      } catch (error) {
        recordFailure('steam_activity', error, attemptedAt);
        throw error;
      }
    },
    getStatus(): SynchronizationStatus {
      return {
        primary: toPhaseStatus(
          'steam_catalog',
          database.repositories.syncState.get('steam_catalog'),
        ),
        steam: toPhaseStatus(
          'steam_activity',
          database.repositories.syncState.get('steam_activity'),
        ),
        latestSteamObservationAt:
          database.repositories.currentPlayerCounts.getLatestObservedAt('steam'),
      };
    },
    recordFailure,
  };
}

function toPhaseStatus(
  phase: SyncPhase,
  state: ReturnType<CatalogImportDatabase['repositories']['syncState']['get']>,
): SyncPhaseStatus {
  if (state === null) {
    return {
      phase,
      state: 'never',
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      importedCount: null,
    };
  }
  return {
    phase,
    state:
      state.lastError === null ? (state.lastSuccessAt === null ? 'never' : 'success') : 'error',
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    importedCount: state.importedCount,
  };
}

export type SynchronizationService = ReturnType<typeof createSynchronizationService>;
