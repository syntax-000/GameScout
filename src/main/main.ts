import { app, BrowserWindow, safeStorage, shell } from 'electron';
import path from 'node:path';
import type { CredentialStore } from './credentials/credential-store';
import { createCredentialStore } from './credentials/credential-store';
import type { GameScoutDatabase } from './db/database';
import { openGameScoutDatabase, toDatabaseErrorHealth, toDatabaseHealth } from './db/database';
import { registerStatusHandlers } from './ipc/register-status-handlers';
import { registerBrowseHandlers } from './ipc/register-browse-handlers';
import { registerSetupHandlers } from './ipc/register-setup-handlers';
import { registerStoreHandlers } from './ipc/register-store-handlers';
import { registerFavoriteHandlers } from './ipc/register-favorite-handlers';
import { registerRefreshHandlers } from './ipc/register-refresh-handlers';
import type { ProviderSettingsStore } from './settings/provider-settings';
import { createProviderSettingsStore } from './settings/provider-settings';
import type { SynchronizationService } from './sync/sync-service';
import { createSynchronizationService } from './sync/sync-service';
import type { CatalogRefreshService } from './sync/catalog-refresh';
import { createCatalogRefreshService } from './sync/catalog-refresh';
import type { DatabaseHealth } from '../shared/ipc/contracts';

const developmentUrl = process.env.GAMESCOUT_RENDERER_URL;
const smokeTest = process.env.GAMESCOUT_SMOKE_TEST === '1';
let database: GameScoutDatabase | null = null;
let credentialStore: CredentialStore | null = null;
let synchronizationService: SynchronizationService | null = null;
let providerSettingsStore: ProviderSettingsStore | null = null;
let catalogRefreshService: CatalogRefreshService | null = null;
let databaseHealth: DatabaseHealth = {
  state: 'error',
  schemaVersion: null,
  foreignKeysEnabled: false,
  error: 'Database initialization has not run.',
};

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 840,
    minHeight: 560,
    show: false,
    backgroundColor: '#0b1020',
    title: 'GameScout',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );

  window.once('ready-to-show', () => {
    window.show();
    if (smokeTest) {
      console.log('GAMESCOUT_SMOKE_READY');
      setTimeout(() => app.quit(), 250);
    }
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`GameScout renderer failed to load (${errorCode}): ${errorDescription}`);
    if (smokeTest) app.exit(1);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`GameScout renderer exited unexpectedly: ${details.reason}`);
    if (smokeTest) app.exit(1);
  });

  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(path.join(__dirname, '..', '..', 'dist-renderer', 'index.html'));
  }

  return window;
}

app.whenReady().then(() => {
  credentialStore = createCredentialStore({
    userDataPath: app.getPath('userData'),
    protector: safeStorage,
  });
  providerSettingsStore = createProviderSettingsStore({ userDataPath: app.getPath('userData') });

  try {
    database = openGameScoutDatabase({ userDataPath: app.getPath('userData') });
    synchronizationService = createSynchronizationService(database);
    catalogRefreshService = createCatalogRefreshService({
      settingsStore: providerSettingsStore,
      credentialStore,
      synchronization: synchronizationService,
      applicationVersion: app.getVersion(),
    });
    databaseHealth = toDatabaseHealth(database);
  } catch (error) {
    const errorHealth = toDatabaseErrorHealth(error);
    databaseHealth = errorHealth;
    console.error(errorHealth.error);
  }

  registerStatusHandlers(
    () => databaseHealth,
    () => credentialStore?.isConfigured('steam.api_key') ?? false,
    () =>
      (providerSettingsStore?.isConfigured() ?? false) &&
      (credentialStore?.isConfigured('steam.api_key') ?? false),
    () =>
      synchronizationService?.getStatus() ?? {
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
      },
  );
  registerSetupHandlers({
    settingsStore: providerSettingsStore,
    credentialStore,
    openExternal: (url) => shell.openExternal(url),
    isSteamCredentialConfigured: () => credentialStore?.isConfigured('steam.api_key') ?? false,
  });
  registerBrowseHandlers(() => database);
  registerStoreHandlers({
    getDatabase: () => database,
    openExternal: (url) => shell.openExternal(url),
  });
  registerFavoriteHandlers(() => database);
  registerRefreshHandlers(() => catalogRefreshService);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  database?.close();
  database = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
