import { describe, expect, it, vi } from 'vitest';
import type { CredentialStore } from '../../src/main/credentials/credential-store';
import { createSetupHandlers } from '../../src/main/ipc/setup-handlers';
import type { ProviderSettingsStore } from '../../src/main/settings/provider-settings';
import {
  createOpenSetupResourceRequest,
  createProviderSetupRequest,
} from '../../src/shared/ipc/contracts';
function stores() {
  const credentials = new Map<string, string>();
  const credentialStore: CredentialStore = {
    save: (id, value) => {
      credentials.set(id, value);
    },
    read: (id) => credentials.get(id) ?? null,
    delete: (id) => credentials.delete(id),
    isConfigured: (id) => credentials.has(id),
  };
  const settingsStore: ProviderSettingsStore = {
    read: () => null,
    save: (accepted) => {
      if (!accepted) throw new TypeError('Accept the Steam Web API terms notice to continue.');
      return { attributionAcceptedAt: '2026-08-14T00:00:00Z' };
    },
    isConfigured: () => true,
  };
  return { credentialStore, settingsStore };
}
describe('setup IPC handlers', () => {
  it('stores the Steam key without returning it', () => {
    const storage = stores();
    const handlers = createSetupHandlers({
      ...storage,
      openExternal: vi.fn(),
      isSteamCredentialConfigured: () => false,
    });
    const result = handlers.saveProviderSetup(
      createProviderSetupRequest('0123456789abcdef0123456789abcdef', true),
    );
    expect(result).toMatchObject({
      ok: true,
      settings: { primaryProvider: 'steam', primaryProviderConfigured: true },
    });
    expect(storage.credentialStore.read('steam.api_key')).toBe('0123456789ABCDEF0123456789ABCDEF');
    expect(JSON.stringify(result)).not.toContain('0123456789ABCDEF0123456789ABCDEF');
  });
  it('opens only approved Steam links', async () => {
    const openExternal = vi.fn(async () => undefined);
    const handlers = createSetupHandlers({
      ...stores(),
      openExternal,
      isSteamCredentialConfigured: () => false,
    });
    expect(handlers.saveProviderSetup(createProviderSetupRequest('bad', true))).toMatchObject({
      ok: false,
    });
    await handlers.openSetupResource(createOpenSetupResourceRequest('steamKey'));
    await handlers.openSetupResource(createOpenSetupResourceRequest('steamTerms'));
    expect(openExternal.mock.calls).toEqual([
      ['https://steamcommunity.com/dev/apikey'],
      ['https://steamcommunity.com/dev/apiterms'],
    ]);
  });
});
