import type { ProviderSettingsStore } from '../settings/provider-settings';
import type { CredentialStore } from '../credentials/credential-store';
import { createSteamRequestPolicy } from '../providers/authentication';
import { retrieveSteamCatalog, retrieveSteamCurrentPlayers } from '../providers/steam';
import { normalizeSteamCatalogGame } from '../normalization/steam-catalog';
import { normalizeSteamEnrichment } from '../normalization/steam';
import type { GameSteamEnrichment } from '../imports/catalog-import';
import type { SynchronizationService } from './sync-service';
import type { CatalogRefreshResult } from '../../shared/ipc/contracts';

export const catalogImportLimit = 25;

export function createCatalogRefreshService(options: {
  settingsStore: ProviderSettingsStore;
  credentialStore: CredentialStore;
  synchronization: SynchronizationService;
  applicationVersion: string;
  now?: () => Date;
  providerSleep?: (milliseconds: number) => Promise<void>;
}) {
  const now = options.now ?? (() => new Date());

  return {
    async refresh(): Promise<CatalogRefreshResult> {
      const settings = options.settingsStore.read();
      const apiKey = options.credentialStore.read('steam.api_key');
      if (settings === null || apiKey === null) {
        return failure('Complete Steam Web API setup before retrieving games.');
      }

      let catalog;
      try {
        catalog = await retrieveSteamCatalog({
          apiKey,
          limit: catalogImportLimit,
          sleep: options.providerSleep,
        });
      } catch (error) {
        const classified = options.synchronization.recordFailure('steam_catalog', error);
        return failure(classified.message);
      }

      const fetchedAt = now().toISOString();
      const games = catalog.games.map((game) => normalizeSteamCatalogGame(game, fetchedAt));
      let primary;
      try {
        primary = options.synchronization.importPrimary(games);
      } catch (error) {
        return failure(
          error instanceof Error ? error.message : 'The catalog could not be imported.',
        );
      }

      const steamPolicy = createSteamRequestPolicy(options.applicationVersion);
      const enrichments: GameSteamEnrichment[] = [];
      let steamAttempted = 0;
      let steamFailed = 0;
      let latestSteamError: unknown = null;

      for (const dto of catalog.games) {
        const appId = dto.appId;
        if (!Number.isSafeInteger(appId) || appId < 1 || appId > 4_294_967_295) continue;
        steamAttempted += 1;
        const association = {
          appId,
          evidence: {
            provider: 'steam',
            externalRecordId: String(dto.appId),
          },
        };
        try {
          const observation = await retrieveSteamCurrentPlayers({
            association,
            policy: steamPolicy,
            now,
          });
          enrichments.push({
            providerGameId: String(dto.appId),
            enrichment: normalizeSteamEnrichment(association, observation),
          });
        } catch (error) {
          steamFailed += 1;
          latestSteamError = error;
        }
      }

      if (enrichments.length > 0) {
        const imported = options.synchronization.importSteam(enrichments);
        steamFailed += imported.failures.length;
        if (imported.failures.length > 0) latestSteamError = new Error(imported.failures[0]!.error);
      }
      if (latestSteamError !== null)
        options.synchronization.recordFailure('steam_activity', latestSteamError);

      return {
        ok: true,
        primary,
        requestedLimit: catalog.requestedLimit,
        steamAttempted,
        steamSucceeded: steamAttempted - steamFailed,
        steamFailed,
        synchronization: options.synchronization.getStatus(),
      };
    },
  };

  function failure(error: string): CatalogRefreshResult {
    return { ok: false, error, synchronization: options.synchronization.getStatus() };
  }
}

export type CatalogRefreshService = ReturnType<typeof createCatalogRefreshService>;
