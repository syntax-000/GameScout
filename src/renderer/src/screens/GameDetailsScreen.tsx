import { useEffect, useState, type ReactNode } from 'react';
import type {
  GameDetails,
  GameDetailsCapability,
  GameDetailsPlatform,
} from '../../../shared/ipc/contracts';
import { formatReleaseDate } from '../components/game-card-helpers';
import {
  getFavoriteErrorMessage,
  persistFavoriteChange,
} from '../components/favorite-control-helpers';
import {
  formatCapabilityName,
  formatConnectionName,
  formatPlayerCapacity,
  formatTimestamp,
  formatFeatureName,
} from './game-details-helpers';

export function GameDetailsScreen({
  gameId,
  onBack,
  backLabel = 'Browse',
}: {
  gameId: number;
  onBack: () => void;
  backLabel?: 'Browse' | 'Favorites';
}) {
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [coverFailed, setCoverFailed] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [openingStore, setOpeningStore] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [changingFavorite, setChangingFavorite] = useState(false);

  useEffect(() => {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi) {
      setError('Desktop bridge unavailable.');
      setLoading(false);
      return;
    }
    let active = true;
    setError(null);
    setLoading(true);
    setCoverFailed(false);
    setFavoriteError(null);
    void desktopApi
      .getGameDetails(gameId)
      .then((result) => {
        if (!active) return;
        setDetails(result);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('The local game details could not be loaded.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [gameId, retryKey]);

  const storePlatform = details?.platforms.find((platform) => platform.storeUrl !== null) ?? null;

  async function openStore(): Promise<void> {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi || storePlatform === null) return;
    setStoreError(null);
    setOpeningStore(true);
    try {
      const result = await desktopApi.openGameStore(gameId, storePlatform.id);
      if (!result.ok) setStoreError(result.error);
    } catch {
      setStoreError('The store page could not be opened.');
    } finally {
      setOpeningStore(false);
    }
  }

  async function toggleFavorite(): Promise<void> {
    const desktopApi = window.gameScoutDesktop;
    if (!desktopApi || details === null) return;

    const previousFavorite = details.isFavorite;
    const nextFavorite = !previousFavorite;
    setDetails({ ...details, isFavorite: nextFavorite });
    setFavoriteError(null);
    setChangingFavorite(true);
    try {
      const persistedFavorite = await persistFavoriteChange(desktopApi, gameId, nextFavorite);
      setDetails((current) => (current ? { ...current, isFavorite: persistedFavorite } : current));
    } catch (error) {
      setDetails((current) => (current ? { ...current, isFavorite: previousFavorite } : current));
      setFavoriteError(getFavoriteErrorMessage(error));
    } finally {
      setChangingFavorite(false);
    }
  }

  return (
    <section className="page-view details-view" aria-labelledby="details-title" aria-busy={loading}>
      <button
        type="button"
        className="back-button"
        onClick={onBack}
        aria-label={`Back to ${backLabel.toLowerCase()}`}
      >
        &larr; {backLabel}
      </button>
      {loading ? (
        <DetailsMessage title="Loading game details" detail="Reading the local catalog." />
      ) : error ? (
        <DetailsMessage title="Game details unavailable" detail={error}>
          <button
            type="button"
            className="primary-button"
            onClick={() => setRetryKey((key) => key + 1)}
          >
            Try again
          </button>
        </DetailsMessage>
      ) : details === null ? (
        <DetailsMessage title="Game unavailable" detail="This game is not in the local catalog." />
      ) : (
        <>
          <header className="details-hero">
            <div className="details-cover">
              {details.coverUrl !== null && !coverFailed ? (
                <img src={details.coverUrl} alt="" onError={() => setCoverFailed(true)} />
              ) : (
                <span aria-hidden="true">GS</span>
              )}
            </div>
            <div className="details-summary">
              <p className="page-kicker">Local game details</p>
              <h1 id="details-title">{details.title}</h1>
              <p className="details-release">{formatReleaseDate(details.releaseDate)}</p>
              <div className="game-card-tags" aria-label="Genres">
                {details.genres.length > 0 ? (
                  details.genres.map((genre) => <span key={genre}>{genre}</span>)
                ) : (
                  <span className="unknown-tag">Genre unknown</span>
                )}
              </div>
              <p className="details-description">
                {details.summary ?? 'No summary is available from the approved source.'}
              </p>
              <div className="details-actions" aria-label="Game actions and state">
                <button
                  type="button"
                  className={details.isFavorite ? 'details-favorite saved' : 'details-favorite'}
                  aria-pressed={details.isFavorite}
                  disabled={changingFavorite}
                  onClick={() => void toggleFavorite()}
                >
                  <span aria-hidden="true">{details.isFavorite ? '★' : '☆'}</span>{' '}
                  {changingFavorite
                    ? 'Updating favorite...'
                    : details.isFavorite
                      ? 'Remove favorite'
                      : 'Add favorite'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={storePlatform === null || openingStore}
                  onClick={() => void openStore()}
                >
                  {openingStore
                    ? 'Opening store...'
                    : storePlatform
                      ? 'Open Steam store'
                      : 'Store link unavailable'}
                </button>
              </div>
              {storeError ? (
                <p className="store-error" role="alert">
                  {storeError}
                </p>
              ) : null}
              {favoriteError ? (
                <p className="favorite-error" role="alert">
                  {favoriteError}
                </p>
              ) : null}
            </div>
          </header>

          <section className="details-section" aria-labelledby="capabilities-title">
            <div className="details-section-heading">
              <div>
                <p className="page-kicker">Compatibility</p>
                <h2 id="capabilities-title">Platform capabilities</h2>
              </div>
            </div>
            {details.platforms.length > 0 ? (
              <div className="platform-details-list">
                {details.platforms.map((platform) => (
                  <PlatformDetails key={platform.id} platform={platform} />
                ))}
              </div>
            ) : (
              <p className="details-unknown">No platform records are available.</p>
            )}
          </section>

          <section className="details-section" aria-labelledby="activity-title">
            <div className="details-section-heading">
              <div>
                <p className="page-kicker">Steam enrichment</p>
                <h2 id="activity-title">Cached Steam activity</h2>
              </div>
            </div>
            {details.steam ? (
              <dl className="details-facts">
                <div>
                  <dt>Verified Steam AppID</dt>
                  <dd>{details.steam.appId}</dd>
                </div>
                <div>
                  <dt>Observed player count</dt>
                  <dd>
                    {details.steam.currentPlayerCount?.toLocaleString() ??
                      'Unknown — no cached observation'}
                  </dd>
                </div>
                <div>
                  <dt>Observed at</dt>
                  <dd>{formatTimestamp(details.steam.observedAt)}</dd>
                </div>
              </dl>
            ) : (
              <p className="details-unknown">
                No verified Steam association or cached Steam activity is available.
              </p>
            )}
            <p className="activity-note">
              This is the latest locally cached point-in-time observation, not a live player count
              or supported player capacity.
            </p>
          </section>

          <footer className="details-freshness">
            Catalog fetched {formatTimestamp(details.fetchedAt)}
            {details.providerUpdatedAt
              ? ` · Source updated ${formatTimestamp(details.providerUpdatedAt)}`
              : ''}
          </footer>
        </>
      )}
    </section>
  );
}

function PlatformDetails({ platform }: { platform: GameDetailsPlatform }) {
  return (
    <article className="platform-details">
      <header>
        <div>
          <h3>{platform.name}</h3>
          <p>{platform.family ?? 'Platform family unknown'}</p>
        </div>
        <span className={`data-status ${platform.dataStatus}`}>{platform.dataStatus}</span>
      </header>
      <p className="platform-release">{formatReleaseDate(platform.releaseDate)}</p>
      {platform.capabilities.length > 0 ? (
        <div className="capability-table-wrap">
          <table className="capability-table">
            <thead>
              <tr>
                <th>Mode</th>
                <th>Connection</th>
                <th>Support</th>
                <th>Players</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {platform.capabilities.map((capability) => (
                <CapabilityRow key={capability.id} capability={capability} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="details-unknown">Multiplayer capability data is unknown.</p>
      )}
    </article>
  );
}

function CapabilityRow({ capability }: { capability: GameDetailsCapability }) {
  const features = capability.features.map(
    (feature) => `${formatFeatureName(feature.featureType)}: ${feature.supportState}`,
  );
  return (
    <tr>
      <td>
        {formatCapabilityName(capability.capabilityType)}
        {features.length > 0 ? <small>{features.join(' · ')}</small> : null}
      </td>
      <td>{formatConnectionName(capability.connectionType)}</td>
      <td>
        <span className={`support-state ${capability.supportState}`}>
          {capability.supportState}
        </span>
      </td>
      <td>{formatPlayerCapacity(capability)}</td>
      <td>
        {capability.confidence}
        <small>
          {capability.evidence.length > 0
            ? `${capability.evidence.length} source ${capability.evidence.length === 1 ? 'record' : 'records'}`
            : 'No evidence record'}
        </small>
      </td>
    </tr>
  );
}

function DetailsMessage({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="details-placeholder">
      <div className="cover-placeholder" aria-hidden="true">
        GS
      </div>
      <div>
        <h1 id="details-title">{title}</h1>
        <p>{detail}</p>
        {children ? <div className="empty-actions">{children}</div> : null}
      </div>
    </div>
  );
}
