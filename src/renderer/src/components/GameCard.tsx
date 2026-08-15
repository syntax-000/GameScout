import { useState, type MouseEvent } from 'react';
import type { BrowseGame } from '../../../shared/ipc/contracts';
import { getFavoriteErrorMessage } from './favorite-control-helpers';
import { formatReleaseDate, summarizeCapabilities } from './game-card-helpers';

export function GameCard({
  game,
  onOpen,
  onFavoriteChange,
}: {
  game: BrowseGame;
  onOpen: (gameId: number) => void;
  onFavoriteChange: (gameId: number, isFavorite: boolean) => Promise<void>;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [changingFavorite, setChangingFavorite] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const showCover = game.coverUrl !== null && !coverFailed;
  const summaries = summarizeCapabilities(game.capabilities);

  async function toggleFavorite(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    event.stopPropagation();
    setChangingFavorite(true);
    setFavoriteError(null);
    try {
      await onFavoriteChange(game.id, !game.isFavorite);
    } catch (error) {
      setFavoriteError(getFavoriteErrorMessage(error));
    } finally {
      setChangingFavorite(false);
    }
  }

  return (
    <article className="game-card">
      <button
        type="button"
        className="game-card-action"
        onClick={() => onOpen(game.id)}
        aria-label={`Open details for ${game.title}`}
      >
        <div className="game-card-cover">
          {showCover ? (
            <img src={game.coverUrl ?? undefined} alt="" onError={() => setCoverFailed(true)} />
          ) : (
            <span aria-hidden="true">GS</span>
          )}
        </div>
        <div className="game-card-body">
          <div className="game-card-heading">
            <h2>{game.title}</h2>
            <span>{formatReleaseDate(game.releaseDate)}</span>
          </div>
          <p className="game-platform">
            {game.platforms.length > 0 ? game.platforms.join(', ') : 'Platform unknown'}
          </p>
          <div className="game-card-tags" aria-label="Genres">
            {game.genres.length > 0 ? (
              game.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)
            ) : (
              <span className="unknown-tag">Genre unknown</span>
            )}
          </div>
          <p className="multiplayer-summary">
            {summaries.length > 0 ? summaries.join(' · ') : 'Multiplayer support unknown'}
          </p>
        </div>
      </button>
      <button
        type="button"
        className={game.isFavorite ? 'favorite-control saved' : 'favorite-control'}
        aria-label={
          game.isFavorite ? `Remove ${game.title} from favorites` : `Add ${game.title} to favorites`
        }
        aria-pressed={game.isFavorite}
        disabled={changingFavorite}
        onClick={(event) => void toggleFavorite(event)}
      >
        <span aria-hidden="true">{game.isFavorite ? '★' : '☆'}</span>
      </button>
      {favoriteError ? (
        <p className="game-card-favorite-error" role="alert">
          {favoriteError}
        </p>
      ) : null}
    </article>
  );
}
