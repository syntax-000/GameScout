import { ipcMain } from 'electron';
import type { ProviderSettingsStore } from '../settings/provider-settings';
import type { CredentialStore } from '../credentials/credential-store';
import { ipcChannels } from '../../shared/ipc/contracts';
import { createSetupHandlers } from './setup-handlers';

export function registerSetupHandlers(options: {
  settingsStore: ProviderSettingsStore;
  credentialStore: CredentialStore;
  openExternal: (url: string) => Promise<void>;
  isSteamCredentialConfigured: () => boolean;
}): void {
  const handlers = createSetupHandlers(options);
  ipcMain.handle(ipcChannels.saveProviderSetup, (_event, request: unknown) =>
    handlers.saveProviderSetup(request),
  );
  ipcMain.handle(ipcChannels.openSetupResource, (_event, request: unknown) =>
    handlers.openSetupResource(request),
  );
}
