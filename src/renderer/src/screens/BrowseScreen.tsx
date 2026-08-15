import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type {
  BrowseGenre,
  BrowsePage,
  BrowseSort,
  MultiplayerFilter,
  SynchronizationStatus,
} from '../../../shared/ipc/contracts';
import { GameCard } from '../components/GameCard';
import {
  getFavoriteErrorMessage,
  persistFavoriteChange,
} from '../components/favorite-control-helpers';

const pageSize = 12;

export function BrowseScreen({
  onOpenGame,
  synchronization,
  onSynchronizationChanged,
}: {
  onOpenGame: (gameId: number) => void;
  synchronization: SynchronizationStatus;
  onSynchronizationChanged: (synchronization: SynchronizationStatus) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<BrowsePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [genres, setGenres] = useState<BrowseGenre[]>([]);
  const [genreId, setGenreId] = useState<number | null>(null);
  const [multiplayerFilter, setMultiplayerFilter] = useState<MultiplayerFilter>('any');
  const [requiredPlayers, setRequiredPlayers] = useState<number | null>(null);
  const [sort, setSort] = useState<BrowseSort>('title_asc');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  useEffect(() => {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) return;
    let active = true;
    void desktopApi
      .getBrowseGenres()
      .then((result) => {
        if (active) setGenres(result);
      })
      .catch(() => {
        if (active) setError('The local catalog filters could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  useEffect(() => {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) {
      setError('Desktop bridge unavailable.');
      return;
    }

    let active = true;
    setError(null);
    setLoading(true);
    void desktopApi
      .getBrowsePage(offset, pageSize, sort, query, genreId, multiplayerFilter, requiredPlayers)
      .then((result) => {
        if (active) {
          setPage(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('The local catalog could not be loaded.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [genreId, multiplayerFilter, offset, query, requiredPlayers, retryKey, sort]);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setOffset(0);
    setQuery(queryInput.trim());
  }

  function clearSearch(): void {
    setQueryInput('');
    setOffset(0);
    setQuery('');
  }

  function changeGenre(value: string): void {
    setOffset(0);
    setGenreId(value === '' ? null : Number(value));
  }

  function changeMultiplayerFilter(value: string): void {
    setOffset(0);
    setMultiplayerFilter(value as MultiplayerFilter);
  }

  function changeRequiredPlayers(value: string): void {
    setOffset(0);
    setRequiredPlayers(value === '' ? null : Number(value));
  }

  function changeSort(value: string): void {
    setOffset(0);
    setSort(value as BrowseSort);
  }

  async function changeFavorite(gameId: number, isFavorite: boolean): Promise<void> {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) throw new Error('Desktop bridge unavailable.');

    setPage((current) => updateFavoriteOnPage(current, gameId, isFavorite));
    try {
      const persistedFavorite = await persistFavoriteChange(desktopApi, gameId, isFavorite);
      setPage((current) => updateFavoriteOnPage(current, gameId, persistedFavorite));
    } catch (error) {
      setPage((current) => updateFavoriteOnPage(current, gameId, !isFavorite));
      throw new Error(getFavoriteErrorMessage(error));
    }
  }

  async function refreshCatalog(): Promise<void> {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) {
      setRefreshMessage('Desktop bridge unavailable.');
      return;
    }
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const result = await desktopApi.refreshCatalog();
      onSynchronizationChanged(result.synchronization);
      if (!result.ok) {
        setRefreshMessage(result.error);
        return;
      }
      setOffset(0);
      setRetryKey((key) => key + 1);
      setRefreshMessage(
        `Imported ${result.primary.imported} games. Steam activity updated for ${result.steamSucceeded} of ${result.steamAttempted} verified associations.`,
      );
    } catch {
      setRefreshMessage('The catalog refresh could not be started.');
    } finally {
      setRefreshing(false);
    }
  }

  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = page ? Math.max(1, Math.ceil(page.totalCount / page.pageSize)) : 1;
  const isLoading = loading && error === null;

  return (
    <section className="page-view" aria-labelledby="browse-title" aria-busy={isLoading}>
      <header className="page-header browse-header">
        <div>
          <p className="page-kicker">Local catalog</p>
          <h1 id="browse-title">Browse games</h1>
        </div>
        <div className="browse-header-actions">
          {page && page.totalCount > 0 ? (
            <p className="result-count">
              {page.totalCount.toLocaleString()} {page.totalCount === 1 ? 'game' : 'games'}
            </p>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={refreshing}
            onClick={refreshCatalog}
          >
            {refreshing
              ? 'Retrieving...'
              : synchronization.primary.lastSuccessAt === null
                ? 'Retrieve games'
                : 'Refresh catalog'}
          </button>
        </div>
      </header>

      {refreshMessage ? (
        <p className="import-message" role="status">
          {refreshMessage}
        </p>
      ) : null}

      <form className="browse-search" role="search" onSubmit={submitSearch}>
        <label htmlFor="browse-title-search">Search by title</label>
        <div className="browse-search-controls">
          <input
            id="browse-title-search"
            type="search"
            value={queryInput}
            maxLength={200}
            placeholder="Game title"
            onChange={(event) => setQueryInput(event.target.value)}
          />
          <button type="submit" className="primary-button">
            Search
          </button>
          {query !== '' ? (
            <button type="button" className="secondary-button" onClick={clearSearch}>
              Clear
            </button>
          ) : null}
        </div>
      </form>

      <div className="browse-filters" aria-label="Browse filters">
        <div>
          <label htmlFor="browse-genre">Genre</label>
          <select
            id="browse-genre"
            value={genreId ?? ''}
            onChange={(event) => changeGenre(event.target.value)}
          >
            <option value="">Any genre</option>
            {genres.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="browse-multiplayer">Multiplayer</label>
          <select
            id="browse-multiplayer"
            value={multiplayerFilter}
            onChange={(event) => changeMultiplayerFilter(event.target.value)}
          >
            <option value="any">Any</option>
            <option value="single_player">Single-player</option>
            <option value="online_multiplayer">Online multiplayer</option>
            <option value="online_coop">Online co-op</option>
            <option value="local_multiplayer">Local multiplayer</option>
            <option value="local_coop">Local co-op</option>
            <option value="lan_coop">LAN co-op</option>
            <option value="split_screen">Split-screen</option>
          </select>
        </div>
        <div>
          <label htmlFor="browse-player-count">Required players</label>
          <select
            id="browse-player-count"
            value={requiredPlayers ?? ''}
            onChange={(event) => changeRequiredPlayers(event.target.value)}
          >
            <option value="">Any group size</option>
            {Array.from({ length: 16 }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? 'player' : 'players'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="browse-sort">Sort by</label>
          <select
            id="browse-sort"
            value={sort}
            onChange={(event) => changeSort(event.target.value)}
          >
            <option value="title_asc">Title A–Z</option>
            <option value="release_date_desc">Release date: newest</option>
            <option value="rating_desc">Rating: highest</option>
            <option value="popularity_desc">Popularity: highest</option>
          </select>
        </div>
      </div>

      {error ? (
        <BrowseMessage symbol="!" title="Catalog unavailable" detail={error}>
          <button
            type="button"
            className="primary-button"
            onClick={() => setRetryKey((key) => key + 1)}
          >
            Try again
          </button>
        </BrowseMessage>
      ) : isLoading ? (
        <BrowseMessage
          symbol="..."
          title="Loading catalog"
          detail="Reading games from local storage."
        />
      ) : page &&
        page.totalCount === 0 &&
        (query !== '' ||
          genreId !== null ||
          multiplayerFilter !== 'any' ||
          requiredPlayers !== null) ? (
        <BrowseMessage
          symbol="?"
          title="No matching games"
          detail="No imported games match the selected search and filters."
        />
      ) : page && page.totalCount === 0 ? (
        <BrowseMessage symbol="+" title="No games imported" detail="Your local catalog is empty." />
      ) : page ? (
        <>
          <ol className="browse-results" aria-label="Games">
            {page.games.map((game) => (
              <li key={game.id}>
                <GameCard game={game} onOpen={onOpenGame} onFavoriteChange={changeFavorite} />
              </li>
            ))}
          </ol>
          <nav className="pagination" aria-label="Browse pages">
            <button
              type="button"
              className="secondary-button"
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - pageSize))}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={offset + page.pageSize >= page.totalCount}
              onClick={() => setOffset((value) => value + pageSize)}
            >
              Next
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}

function updateFavoriteOnPage(
  page: BrowsePage | null,
  gameId: number,
  isFavorite: boolean,
): BrowsePage | null {
  if (page === null) return null;
  return {
    ...page,
    games: page.games.map((game) => (game.id === gameId ? { ...game, isFavorite } : game)),
  };
}

function BrowseMessage({
  symbol,
  title,
  detail,
  children,
}: {
  symbol: string;
  title: string;
  detail: string;
  children?: ReactNode;
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
