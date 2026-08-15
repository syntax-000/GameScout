import type { BrowseGame, GameDetails } from '../../../shared/ipc/contracts';

export function toFavoriteBrowseGame(details: GameDetails): BrowseGame {
  return {
    id: details.id,
    title: details.title,
    releaseDate: details.releaseDate,
    coverUrl: details.coverUrl,
    genres: details.genres,
    platforms: details.platforms.map((platform) => platform.name),
    capabilities: details.platforms.flatMap((platform) =>
      platform.capabilities
        .filter((capability) => capability.supportState === 'supported')
        .map((capability) => ({
          capabilityType: capability.capabilityType,
          connectionType: capability.connectionType,
          splitScreen: capability.features.some(
            (feature) =>
              feature.featureType === 'split_screen' && feature.supportState === 'supported',
          ),
        })),
    ),
    isFavorite: details.isFavorite,
  };
}

export function filterFavoriteGames(games: BrowseGame[], query: string): BrowseGame[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery === '') return games;
  return games.filter((game) => game.title.toLocaleLowerCase().includes(normalizedQuery));
}
