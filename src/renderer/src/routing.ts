import type { SettingsStatus, SynchronizationStatus } from '../../shared/ipc/contracts';

export type AppRoute =
  | { name: 'setup' }
  | { name: 'browse' }
  | { name: 'favorites' }
  | { name: 'details'; gameId: number };

export function getRouteFromHash(hash: string): AppRoute {
  const path = hash.replace(/^#/, '').replace(/^\//, '');
  if (path === 'setup') return { name: 'setup' };
  if (path === 'favorites') return { name: 'favorites' };
  const details = /^games\/(\d+)$/.exec(path);
  if (details) {
    const gameId = Number(details[1]);
    if (Number.isSafeInteger(gameId) && gameId > 0) return { name: 'details', gameId };
  }
  return { name: 'browse' };
}

export function getStartupRoute(statuses: {
  settings: SettingsStatus;
  synchronization: SynchronizationStatus;
}): AppRoute {
  if (!statuses.settings.primaryProviderConfigured) return { name: 'setup' };
  return { name: 'browse' };
}
