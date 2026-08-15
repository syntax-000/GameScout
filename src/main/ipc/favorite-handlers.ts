import type { GameScoutDatabase } from '../db/database';
import {
  assertFavoriteGameRequest,
  assertStatusRequest,
  type FavoriteEntry,
  type FavoriteMutationResult,
} from '../../shared/ipc/contracts';

export function createFavoriteHandlers(
  getDatabase: () => GameScoutDatabase | null,
  now: () => string = () => new Date().toISOString(),
) {
  const databaseOrThrow = (): GameScoutDatabase => {
    const database = getDatabase();
    if (!database) throw new Error('Local catalog database is unavailable.');
    return database;
  };

  return {
    add(request: unknown): FavoriteMutationResult {
      assertFavoriteGameRequest(request);
      const database = databaseOrThrow();
      if (!database.repositories.games.getById(request.gameId)) {
        return { ok: false, error: 'The game is not in the local catalog.' };
      }
      database.repositories.favorites.add(request.gameId, now());
      return { ok: true, isFavorite: true };
    },
    remove(request: unknown): FavoriteMutationResult {
      assertFavoriteGameRequest(request);
      const database = databaseOrThrow();
      if (!database.repositories.games.getById(request.gameId)) {
        return { ok: false, error: 'The game is not in the local catalog.' };
      }
      database.repositories.favorites.remove(request.gameId);
      return { ok: true, isFavorite: false };
    },
    status(request: unknown): boolean {
      assertFavoriteGameRequest(request);
      return databaseOrThrow().repositories.favorites.has(request.gameId);
    },
    list(request: unknown): FavoriteEntry[] {
      assertStatusRequest(request);
      return databaseOrThrow().repositories.favorites.list();
    },
  };
}
