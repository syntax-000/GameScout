import type { GameScoutDesktopApi } from '../../../shared/ipc/contracts';

type FavoriteApi = Pick<GameScoutDesktopApi, 'addFavorite' | 'removeFavorite'>;

export async function persistFavoriteChange(
  api: FavoriteApi,
  gameId: number,
  isFavorite: boolean,
): Promise<boolean> {
  const result = isFavorite ? await api.addFavorite(gameId) : await api.removeFavorite(gameId);
  if (!result.ok) throw new Error(result.error);
  return result.isFavorite;
}

export function getFavoriteErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The favorite could not be updated. Try again.';
}
