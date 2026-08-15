import { useEffect, useState } from 'react';
import type { BrowseGame } from '../../../shared/ipc/contracts';
import { GameCard } from '../components/GameCard';
import {
  getFavoriteErrorMessage,
  persistFavoriteChange,
} from '../components/favorite-control-helpers';
import { filterFavoriteGames, toFavoriteBrowseGame } from './favorites-helpers';

export function FavoritesScreen({ onOpenGame }: { onOpenGame: (gameId: number) => void }) {
  const [games, setGames] = useState<BrowseGame[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) {
      setError('Desktop bridge unavailable.');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void desktopApi
      .listFavorites()
      .then(async (favorites) => {
        const details = await Promise.all(
          favorites.map((favorite) => desktopApi.getGameDetails(favorite.gameId)),
        );
        if (!active) return;
        setGames(
          details
            .filter((game): game is NonNullable<typeof game> => game !== null && game.isFavorite)
            .map(toFavoriteBrowseGame),
        );
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('Your locally saved games could not be loaded.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retryKey]);

  async function changeFavorite(gameId: number, isFavorite: boolean): Promise<void> {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) throw new Error('Desktop bridge unavailable.');

    setGames((current) =>
      current.map((game) => (game.id === gameId ? { ...game, isFavorite } : game)),
    );
    try {
      const persistedFavorite = await persistFavoriteChange(desktopApi, gameId, isFavorite);
      setGames((current) =>
        persistedFavorite
          ? current.map((game) =>
              game.id === gameId ? { ...game, isFavorite: persistedFavorite } : game,
            )
          : current.filter((game) => game.id !== gameId),
      );
    } catch (cause) {
      setGames((current) =>
        current.map((game) => (game.id === gameId ? { ...game, isFavorite: !isFavorite } : game)),
      );
      throw new Error(getFavoriteErrorMessage(cause));
    }
  }

  const visibleGames = filterFavoriteGames(games, query);

  return (
    <section
      className="page-view"
      aria-labelledby="favorites-title"
      aria-busy={loading && error === null}
    >
      <header className="page-header">
        <div>
          <p className="page-kicker">Saved locally</p>
          <h1 id="favorites-title">Favorites</h1>
        </div>
        {!loading && games.length > 0 ? (
          <p className="result-count" role="status">
            {games.length.toLocaleString()} {games.length === 1 ? 'game' : 'games'}
          </p>
        ) : null}
      </header>

      {games.length > 0 ? (
        <div className="favorites-search">
          <label htmlFor="favorites-title-search">Search saved games by title</label>
          <input
            id="favorites-title-search"
            type="search"
            value={query}
            maxLength={200}
            placeholder="Game title"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}

      {error ? (
        <FavoritesMessage symbol="!" title="Favorites unavailable" detail={error}>
          <button
            type="button"
            className="primary-button"
            onClick={() => setRetryKey((key) => key + 1)}
          >
            Try again
          </button>
        </FavoritesMessage>
      ) : loading ? (
        <FavoritesMessage symbol="..." title="Loading favorites" detail="Reading local storage." />
      ) : games.length === 0 ? (
        <FavoritesMessage
          symbol="☆"
          title="No favorites yet"
          detail="Games you save will appear here."
        />
      ) : visibleGames.length === 0 ? (
        <FavoritesMessage
          symbol="?"
          title="No matching favorites"
          detail="No saved games match that title."
        />
      ) : (
        <ol className="browse-results" aria-label="Favorite games">
          {visibleGames.map((game) => (
            <li key={game.id}>
              <GameCard game={game} onOpen={onOpenGame} onFavoriteChange={changeFavorite} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FavoritesMessage({
  symbol,
  title,
  detail,
  children,
}: {
  symbol: string;
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-symbol" aria-hidden="true">
        {symbol}
      </div>
      <h2>{title}</h2>
      <p>{detail}</p>
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  );
}
