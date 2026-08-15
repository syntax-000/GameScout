import { describe, expect, it } from 'vitest';
import type { BrowseGame, GameDetails } from '../../src/shared/ipc/contracts';
import {
  filterFavoriteGames,
  toFavoriteBrowseGame,
} from '../../src/renderer/src/screens/favorites-helpers';

const favorite = (title: string): BrowseGame => ({
  id: title.length,
  title,
  releaseDate: null,
  coverUrl: null,
  genres: [],
  platforms: [],
  capabilities: [],
  isFavorite: true,
});

describe('favorites screen presentation', () => {
  it('searches favorite titles case-insensitively and ignores surrounding whitespace', () => {
    const games = [favorite('Deep Rock Galactic'), favorite('Overcooked! 2')];

    expect(filterFavoriteGames(games, '')).toEqual(games);
    expect(filterFavoriteGames(games, '  ROCK ')).toEqual([games[0]]);
    expect(filterFavoriteGames(games, 'missing')).toEqual([]);
  });

  it('derives card data only from supported detail capabilities', () => {
    const details: GameDetails = {
      id: 7,
      title: 'Local Favorite',
      summary: null,
      releaseDate: '2026-01-01',
      coverUrl: null,
      genres: ['Action'],
      fetchedAt: '2026-08-14T00:00:00.000Z',
      providerUpdatedAt: null,
      isFavorite: true,
      steam: null,
      platforms: [
        {
          id: 1,
          name: 'Windows',
          family: null,
          releaseDate: null,
          storeUrl: null,
          dataStatus: 'partial',
          capabilities: [
            {
              id: 1,
              capabilityType: 'cooperative',
              connectionType: 'local_device',
              supportState: 'supported',
              countModel: 'unknown',
              minPlayers: null,
              maxPlayers: null,
              playerCounts: [],
              confidence: 'verified',
              notes: null,
              evidence: [],
              features: [
                {
                  capabilityId: 1,
                  featureType: 'split_screen',
                  supportState: 'supported',
                },
              ],
            },
            {
              id: 2,
              capabilityType: 'cooperative',
              connectionType: 'online',
              supportState: 'unknown',
              countModel: 'unknown',
              minPlayers: null,
              maxPlayers: null,
              playerCounts: [],
              confidence: 'low',
              notes: null,
              evidence: [],
              features: [],
            },
          ],
        },
      ],
    };

    expect(toFavoriteBrowseGame(details)).toMatchObject({
      id: 7,
      title: 'Local Favorite',
      platforms: ['Windows'],
      capabilities: [
        { capabilityType: 'cooperative', connectionType: 'local_device', splitScreen: true },
      ],
      isFavorite: true,
    });
  });
});
