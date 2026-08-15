import type {
  ApplicationStatus,
  DatabaseHealth,
  SettingsStatus,
  SynchronizationStatus,
} from '../../shared/ipc/contracts';
import { assertStatusRequest } from '../../shared/ipc/contracts';

export interface StatusHandlerDependencies {
  getApplicationVersion: () => string;
  getDatabaseHealth: () => DatabaseHealth;
  isSteamCredentialConfigured: () => boolean;
  isPrimaryProviderConfigured: () => boolean;
  getSynchronizationStatus: () => SynchronizationStatus;
  platform: NodeJS.Platform;
}

export function createStatusHandlers(dependencies: StatusHandlerDependencies) {
  return {
    getApplicationStatus(request: unknown): ApplicationStatus {
      assertStatusRequest(request);
      return {
        state: 'ready',
        version: dependencies.getApplicationVersion(),
        platform: dependencies.platform,
        desktopShell: 'electron',
        rendererIsolation: true,
      };
    },
    getSettingsStatus(request: unknown): SettingsStatus {
      assertStatusRequest(request);
      return {
        primaryProvider: 'steam',
        primaryProviderConfigurationRequired: true,
        primaryProviderConfigured: dependencies.isPrimaryProviderConfigured(),
        steamCredentialRequired: true,
        steamCredentialConfigured: dependencies.isSteamCredentialConfigured(),
      };
    },
    getDatabaseHealth(request: unknown): DatabaseHealth {
      assertStatusRequest(request);
      return dependencies.getDatabaseHealth();
    },
    getSynchronizationStatus(request: unknown): SynchronizationStatus {
      assertStatusRequest(request);
      return dependencies.getSynchronizationStatus();
    },
  };
}
