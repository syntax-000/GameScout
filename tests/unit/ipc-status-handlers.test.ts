import { describe, expect, it } from 'vitest';
import { createStatusHandlers } from '../../src/main/ipc/status-handlers';
import {
  assertStatusRequest,
  createStatusRequest,
  IPC_PROTOCOL_VERSION,
  ipcChannels,
} from '../../src/shared/ipc/contracts';

const handlers = createStatusHandlers({
  getApplicationVersion: () => '0.1.0-test',
  getDatabaseHealth: () => ({
    state: 'ready',
    schemaVersion: 1,
    foreignKeysEnabled: true,
  }),
  isSteamCredentialConfigured: () => false,
  isPrimaryProviderConfigured: () => false,
  getSynchronizationStatus: () => ({
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
  }),
  platform: 'win32',
});

describe('status IPC contracts', () => {
  it('uses explicit allowlisted channel names', () => {
    expect(Object.values(ipcChannels)).toEqual([
      'gamescout:status:application',
      'gamescout:status:settings',
      'gamescout:status:database',
      'gamescout:status:synchronization',
      'gamescout:catalog:refresh',
      'gamescout:setup:save-provider',
      'gamescout:setup:open-resource',
      'gamescout:browse:get-page',
      'gamescout:browse:get-genres',
      'gamescout:details:get',
      'gamescout:store:open',
      'gamescout:favorites:add',
      'gamescout:favorites:remove',
      'gamescout:favorites:status',
      'gamescout:favorites:list',
    ]);
  });

  it('accepts only the exact versioned request envelope', () => {
    expect(() => assertStatusRequest(createStatusRequest())).not.toThrow();
    expect(() => assertStatusRequest(undefined)).toThrow('IPC request must be an object.');
    expect(() => assertStatusRequest(null)).toThrow('IPC request must be an object.');
    expect(() => assertStatusRequest([])).toThrow('IPC request must be an object.');
    expect(() => assertStatusRequest({})).toThrow('IPC request contains unexpected fields.');
    expect(() =>
      assertStatusRequest({ protocolVersion: IPC_PROTOCOL_VERSION, extra: true }),
    ).toThrow('IPC request contains unexpected fields.');
    expect(() => assertStatusRequest({ protocolVersion: 999 })).toThrow(
      'Unsupported IPC protocol version.',
    );
  });

  it('returns non-secret application, settings, and database statuses', () => {
    const request = createStatusRequest();

    expect(handlers.getApplicationStatus(request)).toEqual({
      state: 'ready',
      version: '0.1.0-test',
      platform: 'win32',
      desktopShell: 'electron',
      rendererIsolation: true,
    });
    expect(handlers.getSettingsStatus(request)).toEqual({
      primaryProvider: 'steam',
      primaryProviderConfigurationRequired: true,
      primaryProviderConfigured: false,
      steamCredentialRequired: true,
      steamCredentialConfigured: false,
    });
    expect(handlers.getDatabaseHealth(request)).toEqual({
      state: 'ready',
      schemaVersion: 1,
      foreignKeysEnabled: true,
    });

    const serialized = JSON.stringify({
      application: handlers.getApplicationStatus(request),
      settings: handlers.getSettingsStatus(request),
      database: handlers.getDatabaseHealth(request),
    });
    expect(serialized).not.toMatch(/secret|token|api[_-]?key|credentialValue/i);
  });

  it('rejects malformed requests before invoking dependencies', () => {
    let versionReads = 0;
    const guardedHandlers = createStatusHandlers({
      getApplicationVersion: () => {
        versionReads += 1;
        return 'should-not-be-read';
      },
      getDatabaseHealth: () => ({
        state: 'error',
        schemaVersion: null,
        foreignKeysEnabled: false,
        error: 'should-not-be-read',
      }),
      isSteamCredentialConfigured: () => false,
      isPrimaryProviderConfigured: () => false,
      getSynchronizationStatus: () => ({
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
      }),
      platform: 'win32',
    });

    expect(() => guardedHandlers.getApplicationStatus({ protocolVersion: '1' })).toThrow(
      'Unsupported IPC protocol version.',
    );
    expect(versionReads).toBe(0);
  });
});
