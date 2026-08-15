import type { GameScoutDatabase } from '../db/database';
import { assertOpenGameStoreRequest, type OpenGameStoreResult } from '../../shared/ipc/contracts';

export interface StoreHandlerDependencies {
  getDatabase: () => GameScoutDatabase | null;
  openExternal: (url: string) => Promise<void>;
}

export function createStoreHandlers(dependencies: StoreHandlerDependencies) {
  return {
    async openGameStore(request: unknown): Promise<OpenGameStoreResult> {
      assertOpenGameStoreRequest(request);
      const database = dependencies.getDatabase();
      if (!database) return { ok: false, error: 'Local catalog database is unavailable.' };

      const platform = database.repositories.gamePlatforms.getById(request.gamePlatformId);
      if (!platform || platform.gameId !== request.gameId) {
        return { ok: false, error: 'The selected game platform is unavailable.' };
      }

      const steamReference = database.repositories.externalReferences
        .listForGame(request.gameId)
        .find((reference) => reference.provider === 'steam');
      if (!steamReference || !/^\d+$/.test(steamReference.externalId)) {
        return { ok: false, error: 'No verified Steam store association is available.' };
      }

      const storeUrl = createSteamStoreUrl(steamReference.externalId);
      if (platform.storeUrl !== storeUrl) {
        return { ok: false, error: 'The stored page is not an approved Steam store link.' };
      }

      try {
        await dependencies.openExternal(storeUrl);
        return { ok: true };
      } catch {
        return { ok: false, error: 'The Steam store page could not be opened.' };
      }
    },
  };
}

export function createSteamStoreUrl(appId: string): string {
  if (!/^\d+$/.test(appId)) throw new TypeError('Steam AppID must be numeric.');
  if (!/^[1-9]\d{0,9}$/.test(appId) || Number(appId) > 4_294_967_295) {
    throw new TypeError('Steam AppID must be a positive uint32 without leading zeros.');
  }
  const url = new URL(`https://store.steampowered.com/app/${appId}/`);
  if (url.protocol !== 'https:' || url.hostname !== 'store.steampowered.com') {
    throw new TypeError('Steam store URL is not approved.');
  }
  return url.toString();
}
