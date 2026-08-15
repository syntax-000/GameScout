import type { DatabaseRepositories } from '../db/repositories';
import type { NormalizedGame, NormalizedSteamEnrichment } from '../normalization/models';

export interface CatalogImportResult {
  added: number;
  updated: number;
  imported: number;
}

export interface SteamEnrichmentImportResult {
  updatedReferences: number;
  updatedObservations: number;
  unavailable: number;
  skipped: number;
}

export interface SteamEnrichmentBatchResult extends SteamEnrichmentImportResult {
  failures: Array<{ providerGameId: string; error: string }>;
}

export interface GameSteamEnrichment {
  providerGameId: string;
  enrichment: NormalizedSteamEnrichment;
}

export interface CatalogImportDatabase {
  repositories: DatabaseRepositories;
  transaction: (operation: () => void) => void;
}

export interface ImportControl {
  throwIfCancelled: () => void;
  onPrimaryProcessed?: (processed: number, imported: number) => void;
  onSteamProcessed?: (processed: number, imported: number, errors: number) => void;
}

export class ImportCancelledError extends Error {
  constructor() {
    super('Import was cancelled.');
    this.name = 'ImportCancelledError';
  }
}

export function importNormalizedCatalog(
  database: CatalogImportDatabase,
  games: readonly NormalizedGame[],
  control?: ImportControl,
): CatalogImportResult {
  let added = 0;
  let updated = 0;

  database.transaction(() => {
    for (const game of games) {
      control?.throwIfCancelled();
      const existing = database.repositories.games.getByProviderId(game.providerGameId);
      const record = database.repositories.games.upsert(game);
      if (existing === null) added += 1;
      else updated += 1;

      database.repositories.genres.replaceForGame(
        record.id,
        game.genres.map((genre) => database.repositories.genres.upsert(genre).id),
      );
      database.repositories.gamePlatforms.removeForGame(record.id);

      for (const platform of game.platforms) {
        const platformRecord = database.repositories.platforms.upsert({
          providerPlatformId: platform.providerPlatformId,
          name: platform.name,
          family: platform.family,
          generation: platform.generation,
        });
        const gamePlatform = database.repositories.gamePlatforms.upsert({
          gameId: record.id,
          platformId: platformRecord.id,
          releaseDate: platform.releaseDate,
          storeUrl: platform.storeUrl,
          editionName: platform.editionName,
          dataStatus: platform.dataStatus,
        });
        for (const capability of platform.capabilities) {
          const capabilityRecord = database.repositories.capabilities.upsert({
            gamePlatformId: gamePlatform.id,
            capabilityType: capability.capabilityType,
            connectionType: capability.connectionType,
            supportState: capability.supportState,
            countModel: capability.countModel,
            minPlayers: capability.minPlayers,
            maxPlayers: capability.maxPlayers,
            confidence: capability.confidence,
            notes: capability.notes,
          });
          database.repositories.capabilities.replacePlayerCounts(
            capabilityRecord.id,
            capability.playerCounts,
          );
          for (const feature of capability.features) {
            database.repositories.capabilities.upsertFeature({
              capabilityId: capabilityRecord.id,
              featureType: feature.featureType,
              supportState: feature.supportState,
            });
          }
          database.repositories.evidence.replaceForCapability(
            capabilityRecord.id,
            capability.evidence,
          );
        }
      }

      database.repositories.externalReferences.removeForGame(record.id);
      for (const reference of game.externalReferences) {
        database.repositories.externalReferences.upsert({
          gameId: record.id,
          provider: reference.provider,
          externalId: reference.externalId,
          externalUrl: reference.externalUrl,
        });
      }
      control?.onPrimaryProcessed?.(added + updated, added + updated);
    }
  });

  return { added, updated, imported: games.length };
}

export function importSteamEnrichment(
  database: CatalogImportDatabase,
  gameId: number,
  enrichment: NormalizedSteamEnrichment,
): SteamEnrichmentImportResult {
  database.transaction(() => {
    if (enrichment.externalReference !== null) {
      database.repositories.externalReferences.upsert({
        gameId,
        provider: enrichment.externalReference.provider,
        externalId: enrichment.externalReference.externalId,
        externalUrl: enrichment.externalReference.externalUrl,
      });
    }
    if (enrichment.currentPlayerObservation !== null) {
      database.repositories.currentPlayerCounts.upsert({
        gameId,
        provider: enrichment.currentPlayerObservation.provider,
        playerCount: enrichment.currentPlayerObservation.playerCount,
        observedAt: enrichment.currentPlayerObservation.observedAt,
      });
    }
  });

  return {
    updatedReferences: enrichment.externalReference === null ? 0 : 1,
    updatedObservations: enrichment.currentPlayerObservation === null ? 0 : 1,
    unavailable: enrichment.state === 'unavailable' ? 1 : 0,
    skipped: enrichment.state === 'missing_association' ? 1 : 0,
  };
}

export function importSteamEnrichmentsBestEffort(
  database: CatalogImportDatabase,
  enrichments: readonly GameSteamEnrichment[],
  control?: ImportControl,
): SteamEnrichmentBatchResult {
  const result: SteamEnrichmentBatchResult = {
    updatedReferences: 0,
    updatedObservations: 0,
    unavailable: 0,
    skipped: 0,
    failures: [],
  };
  let processed = 0;
  for (const item of enrichments) {
    control?.throwIfCancelled();
    try {
      const game = database.repositories.games.getByProviderId(item.providerGameId);
      if (game === null) throw new Error('Primary catalog game was not found.');
      const imported = importSteamEnrichment(database, game.id, item.enrichment);
      result.updatedReferences += imported.updatedReferences;
      result.updatedObservations += imported.updatedObservations;
      result.unavailable += imported.unavailable;
      result.skipped += imported.skipped;
    } catch (error) {
      if (error instanceof ImportCancelledError) throw error;
      result.failures.push({
        providerGameId: item.providerGameId,
        error: error instanceof Error ? error.message : 'Steam enrichment failed.',
      });
    }
    processed += 1;
    control?.onSteamProcessed?.(processed, result.updatedObservations, result.failures.length);
  }
  return result;
}
