import type { SynchronizationStatus } from '../../../shared/ipc/contracts';

export interface CatalogFreshnessMessage {
  state: 'current' | 'stale' | 'unavailable';
  title: string;
  detail: string;
  steamDetail: string;
}

export function getCatalogFreshnessMessage(
  synchronization: SynchronizationStatus,
  formatTimestamp: (value: string | null) => string,
): CatalogFreshnessMessage {
  const steamObservation = synchronization.latestSteamObservationAt
    ? `Latest cached Steam activity observation: ${formatTimestamp(synchronization.latestSteamObservationAt)}.`
    : 'No cached Steam activity observation is available.';
  const steamDetail =
    synchronization.steam.state === 'error' && synchronization.steam.lastError
      ? `${steamObservation} Steam enrichment issue: ${synchronization.steam.lastError}`
      : steamObservation;

  if (synchronization.primary.lastSuccessAt === null) {
    return {
      state: 'unavailable',
      title: 'No successful catalog sync yet',
      detail: 'Local screens use SQLite only, but no successfully imported catalog is recorded.',
      steamDetail,
    };
  }

  if (synchronization.primary.state === 'error') {
    return {
      state: 'stale',
      title: 'Cached catalog may be stale',
      detail: `Last successful update: ${formatTimestamp(synchronization.primary.lastSuccessAt)}. ${synchronization.primary.lastError ?? 'The latest refresh failed.'} Saved local data remains available offline.`,
      steamDetail,
    };
  }

  return {
    state: 'current',
    title: 'Browsing cached local data',
    detail: `Last successful update: ${formatTimestamp(synchronization.primary.lastSuccessAt)}. Browse, search, filters, details, and favorites remain available offline.`,
    steamDetail,
  };
}
