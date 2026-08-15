import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CredentialStore } from '../../src/main/credentials/credential-store';
import { openGameScoutDatabase } from '../../src/main/db/database';
import type { ProviderSettingsStore } from '../../src/main/settings/provider-settings';
import { createCatalogRefreshService } from '../../src/main/sync/catalog-refresh';
import { createSynchronizationService } from '../../src/main/sync/sync-service';
const directories: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
describe('manual catalog refresh', () => {
  it('requires Steam setup before network access', async () => {
    const { database, service } = setup(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(service.refresh()).resolves.toMatchObject({
      ok: false,
      error: 'Complete Steam Web API setup before retrieving games.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    database.close();
  });
  it('imports Steam catalog data and current-player activity', async () => {
    const { database, service } = setup(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(input.toString());
        if (url.pathname.includes('GetAppList'))
          return json({
            response: {
              apps: [{ appid: 620, name: 'Portal 2', last_modified: 1_723_600_000 }],
              have_more_results: false,
              last_appid: 620,
            },
          });
        if (url.pathname.includes('GetNumberOfCurrentPlayers'))
          return json({ response: { result: 1, player_count: 100 } });
        return json({
          '620': {
            success: true,
            data: {
              type: 'game',
              steam_appid: 620,
              name: 'Portal 2',
              short_description: 'Cooperative puzzle game.',
              header_image: 'https://example.com/portal.jpg',
              platforms: { windows: true },
              release_date: { coming_soon: false, date: '18 Apr, 2011' },
              genres: [{ id: '3', description: 'Puzzle' }],
              categories: [{ id: 38, description: 'Online Co-op' }],
            },
          },
        });
      }),
    );
    await expect(service.refresh()).resolves.toMatchObject({
      ok: true,
      primary: { added: 1, imported: 1 },
      steamAttempted: 1,
      steamSucceeded: 1,
      synchronization: { primary: { phase: 'steam_catalog', state: 'success' } },
    });
    expect(database.repositories.games.getByProviderId('620')?.title).toBe('Portal 2');
    database.close();
  });
});
function setup(configured: boolean) {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-refresh-'));
  directories.push(userDataPath);
  const database = openGameScoutDatabase({ userDataPath });
  const settingsStore: ProviderSettingsStore = {
    read: () => (configured ? { attributionAcceptedAt: '2026-08-14T00:00:00Z' } : null),
    save: () => {
      throw new Error('unused');
    },
    isConfigured: () => configured,
  };
  const credentialStore: CredentialStore = {
    read: () => (configured ? '0123456789ABCDEF0123456789ABCDEF' : null),
    save: () => undefined,
    delete: () => false,
    isConfigured: () => configured,
  };
  return {
    database,
    service: createCatalogRefreshService({
      settingsStore,
      credentialStore,
      synchronization: createSynchronizationService(
        database,
        () => new Date('2026-08-14T01:00:00Z'),
      ),
      applicationVersion: '0.1.0',
      now: () => new Date('2026-08-14T00:30:00Z'),
      providerSleep: async () => undefined,
    }),
  };
}
