import type { GameScoutDatabase } from '../db/database';
import {
  assertBrowsePageRequest,
  assertGameDetailsRequest,
  assertStatusRequest,
  type BrowseGenre,
  type BrowsePage,
  type GameDetails,
} from '../../shared/ipc/contracts';

export function createBrowseHandlers(getDatabase: () => GameScoutDatabase | null) {
  return {
    getBrowsePage(request: unknown): BrowsePage {
      assertBrowsePageRequest(request);
      const database = getDatabase();
      if (!database) throw new Error('Local catalog database is unavailable.');
      return database.repositories.games.browse(request);
    },
    getBrowseGenres(request: unknown): BrowseGenre[] {
      assertStatusRequest(request);
      const database = getDatabase();
      if (!database) throw new Error('Local catalog database is unavailable.');
      return database.repositories.genres.listUsed().map(({ id, name }) => ({ id, name }));
    },
    getGameDetails(request: unknown): GameDetails | null {
      assertGameDetailsRequest(request);
      const database = getDatabase();
      if (!database) throw new Error('Local catalog database is unavailable.');
      return database.repositories.games.getDetails(request.gameId);
    },
  };
}
