import type { SynchronizationStatus } from '../../../shared/ipc/contracts';
import { formatTimestamp } from '../screens/game-details-helpers';
import { getCatalogFreshnessMessage } from './catalog-freshness-helpers';

export function CatalogFreshness({ synchronization }: { synchronization: SynchronizationStatus }) {
  const message = getCatalogFreshnessMessage(synchronization, formatTimestamp);

  return (
    <aside className={`catalog-freshness ${message.state}`} aria-label="Cached data status">
      <span className="catalog-freshness-symbol" aria-hidden="true">
        {message.state === 'current' ? '✓' : message.state === 'stale' ? '!' : 'i'}
      </span>
      <div>
        <strong>{message.title}</strong>
        <p>{message.detail}</p>
        <p>{message.steamDetail} Steam activity values are observations, not live counts.</p>
      </div>
    </aside>
  );
}
