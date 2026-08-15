import { app, ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc/contracts';
import type { DatabaseHealth, SynchronizationStatus } from '../../shared/ipc/contracts';
import { createStatusHandlers } from './status-handlers';

export function registerStatusHandlers(
  getDatabaseHealth: () => DatabaseHealth,
  isSteamCredentialConfigured: () => boolean,
  isPrimaryProviderConfigured: () => boolean,
  getSynchronizationStatus: () => SynchronizationStatus,
): void {
  const handlers = createStatusHandlers({
    getApplicationVersion: () => app.getVersion(),
    getDatabaseHealth,
    isSteamCredentialConfigured,
    isPrimaryProviderConfigured,
    getSynchronizationStatus,
    platform: process.platform,
  });

  ipcMain.handle(ipcChannels.getApplicationStatus, (_event, request: unknown) =>
    handlers.getApplicationStatus(request),
  );
  ipcMain.handle(ipcChannels.getSettingsStatus, (_event, request: unknown) =>
    handlers.getSettingsStatus(request),
  );
  ipcMain.handle(ipcChannels.getDatabaseHealth, (_event, request: unknown) =>
    handlers.getDatabaseHealth(request),
  );
  ipcMain.handle(ipcChannels.getSynchronizationStatus, (_event, request: unknown) =>
    handlers.getSynchronizationStatus(request),
  );
}
