import type { ProviderSettingsStore } from '../settings/provider-settings';
import type { CredentialStore } from '../credentials/credential-store';
import { normalizeSteamApiKey } from '../providers/authentication';
import {
  assertOpenSetupResourceRequest,
  assertProviderSetupRequest,
  type ProviderSetupResult,
} from '../../shared/ipc/contracts';

const setupResourceUrls = {
  steamKey: 'https://steamcommunity.com/dev/apikey',
  steamTerms: 'https://steamcommunity.com/dev/apiterms',
} as const;

export function createSetupHandlers(dependencies: {
  settingsStore: ProviderSettingsStore;
  credentialStore: CredentialStore;
  openExternal: (url: string) => Promise<void>;
  isSteamCredentialConfigured: () => boolean;
}) {
  return {
    saveProviderSetup(request: unknown): ProviderSetupResult {
      try {
        assertProviderSetupRequest(request);
        dependencies.settingsStore.save(request.attributionAccepted);
        dependencies.credentialStore.save('steam.api_key', normalizeSteamApiKey(request.apiKey));
        dependencies.credentialStore.delete('rawg.api_key');
        return {
          ok: true,
          settings: {
            primaryProvider: 'steam',
            primaryProviderConfigurationRequired: true,
            primaryProviderConfigured: true,
            steamCredentialRequired: true,
            steamCredentialConfigured: true,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Provider setup could not be saved.',
        };
      }
    },
    async openSetupResource(request: unknown): Promise<void> {
      assertOpenSetupResourceRequest(request);
      await dependencies.openExternal(setupResourceUrls[request.resource]);
    },
  };
}
