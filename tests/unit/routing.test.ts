import { describe, expect, it } from 'vitest';
import type { SettingsStatus, SynchronizationStatus } from '../../src/shared/ipc/contracts';
import { getRouteFromHash, getStartupRoute } from '../../src/renderer/src/routing';

const synchronization: SynchronizationStatus = {
  primary: {
    phase: 'steam_catalog',
    state: 'never',
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    importedCount: null,
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
};

function settings(primaryProviderConfigured: boolean): SettingsStatus {
  return {
    primaryProvider: 'steam',
    primaryProviderConfigurationRequired: true,
    primaryProviderConfigured,
    steamCredentialRequired: true,
    steamCredentialConfigured: false,
  };
}

describe('application routing', () => {
  it.each([
    ['', { name: 'browse' }],
    ['#/', { name: 'browse' }],
    ['#/browse', { name: 'browse' }],
    ['#/setup', { name: 'setup' }],
    ['#/favorites', { name: 'favorites' }],
    ['#/unknown', { name: 'browse' }],
  ] as const)('maps %s to the expected screen', (hash, route) => {
    expect(getRouteFromHash(hash)).toEqual(route);
  });

  it('preserves a selected positive numeric game ID', () => {
    expect(getRouteFromHash('#/games/42')).toEqual({ name: 'details', gameId: 42 });
  });

  it.each(['#/games/0', '#/games/-2', '#/games/not-a-number', '#/games/1.5'])(
    'rejects invalid details route %s',
    (hash) => {
      expect(getRouteFromHash(hash)).toEqual({ name: 'browse' });
    },
  );

  it('starts in setup when the primary provider is unconfigured', () => {
    expect(getStartupRoute({ settings: settings(false), synchronization })).toEqual({
      name: 'setup',
    });
  });

  it('starts in browse when configured, including an empty catalog', () => {
    expect(getStartupRoute({ settings: settings(true), synchronization })).toEqual({
      name: 'browse',
    });
  });
});
