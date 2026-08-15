import { describe, expect, it } from 'vitest';
import type { SynchronizationStatus } from '../../src/shared/ipc/contracts';
import { getCatalogFreshnessMessage } from '../../src/renderer/src/components/catalog-freshness-helpers';

function status(overrides: Partial<SynchronizationStatus> = {}): SynchronizationStatus {
  return {
    primary: {
      phase: 'steam_catalog',
      state: 'success',
      lastAttemptAt: '2026-08-14T01:00:00.000Z',
      lastSuccessAt: '2026-08-14T01:00:00.000Z',
      lastError: null,
      importedCount: 2,
    },
    steam: {
      phase: 'steam_activity',
      state: 'never',
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      importedCount: null,
    },
    latestSteamObservationAt: null,
    ...overrides,
  };
}

describe('catalog freshness presentation', () => {
  const format = (value: string | null) => value ?? 'Unknown';

  it('labels a successful import as cached offline data', () => {
    const message = getCatalogFreshnessMessage(status(), format);
    expect(message.state).toBe('current');
    expect(message.detail).toContain('available offline');
    expect(message.steamDetail).toContain('No cached');
  });

  it('marks a preserved catalog stale after a failed refresh', () => {
    const synchronization = status();
    synchronization.primary = {
      ...synchronization.primary,
      state: 'error',
      lastAttemptAt: '2026-08-14T02:00:00.000Z',
      lastError: 'Network unavailable.',
    };
    synchronization.latestSteamObservationAt = '2026-08-14T00:30:00.000Z';

    const message = getCatalogFreshnessMessage(synchronization, format);
    expect(message.state).toBe('stale');
    expect(message.detail).toContain('2026-08-14T01:00:00.000Z');
    expect(message.steamDetail).toContain('2026-08-14T00:30:00.000Z');
    expect(message.detail).toContain('Network unavailable.');
  });

  it('does not imply cached data exists before a successful import', () => {
    const synchronization = status();
    synchronization.primary = {
      phase: 'steam_catalog',
      state: 'never',
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      importedCount: null,
    };
    expect(getCatalogFreshnessMessage(synchronization, format).state).toBe('unavailable');
  });
});
