import { contextBridge, ipcRenderer } from 'electron';
import type {
  BrowseSort,
  GameScoutDesktopApi,
  MultiplayerFilter,
  SetupResource,
} from '../shared/ipc/contracts';

const protocolVersion = 1 as const;
const ipcChannels = {
  getApplicationStatus: 'gamescout:status:application',
  getSettingsStatus: 'gamescout:status:settings',
  getDatabaseHealth: 'gamescout:status:database',
  getSynchronizationStatus: 'gamescout:status:synchronization',
  refreshCatalog: 'gamescout:catalog:refresh',
  saveProviderSetup: 'gamescout:setup:save-provider',
  openSetupResource: 'gamescout:setup:open-resource',
  getBrowsePage: 'gamescout:browse:get-page',
  getBrowseGenres: 'gamescout:browse:get-genres',
  getGameDetails: 'gamescout:details:get',
  openGameStore: 'gamescout:store:open',
  addFavorite: 'gamescout:favorites:add',
  removeFavorite: 'gamescout:favorites:remove',
  getFavoriteStatus: 'gamescout:favorites:status',
  listFavorites: 'gamescout:favorites:list',
} as const;

const createStatusRequest = () => ({ protocolVersion });
const createProviderSetupRequest = (apiKey: string, attributionAccepted: boolean) => ({
  protocolVersion,
  apiKey,
  attributionAccepted,
});
const createOpenSetupResourceRequest = (resource: SetupResource) => ({
  protocolVersion,
  resource,
});
const createBrowsePageRequest = (
  offset: number,
  pageSize: number,
  sort: BrowseSort,
  query: string,
  genreId: number | null,
  multiplayerFilter: MultiplayerFilter,
  requiredPlayers: number | null,
) => ({
  protocolVersion,
  offset,
  pageSize,
  sort,
  query,
  genreId,
  multiplayerFilter,
  requiredPlayers,
});
const createGameDetailsRequest = (gameId: number) => ({ protocolVersion, gameId });
const createOpenGameStoreRequest = (gameId: number, gamePlatformId: number) => ({
  protocolVersion,
  gameId,
  gamePlatformId,
});
const createFavoriteGameRequest = (gameId: number) => ({ protocolVersion, gameId });

const desktopApi: GameScoutDesktopApi = {
  getApplicationStatus: () =>
    ipcRenderer.invoke(ipcChannels.getApplicationStatus, createStatusRequest()),
  getSettingsStatus: () => ipcRenderer.invoke(ipcChannels.getSettingsStatus, createStatusRequest()),
  getDatabaseHealth: () => ipcRenderer.invoke(ipcChannels.getDatabaseHealth, createStatusRequest()),
  getSynchronizationStatus: () =>
    ipcRenderer.invoke(ipcChannels.getSynchronizationStatus, createStatusRequest()),
  refreshCatalog: () => ipcRenderer.invoke(ipcChannels.refreshCatalog, createStatusRequest()),
  saveProviderSetup: (apiKey, attributionAccepted) =>
    ipcRenderer.invoke(
      ipcChannels.saveProviderSetup,
      createProviderSetupRequest(apiKey, attributionAccepted),
    ),
  openSetupResource: (resource) =>
    ipcRenderer.invoke(ipcChannels.openSetupResource, createOpenSetupResourceRequest(resource)),
  getBrowsePage: (offset, pageSize, sort, query, genreId, multiplayerFilter, requiredPlayers) =>
    ipcRenderer.invoke(
      ipcChannels.getBrowsePage,
      createBrowsePageRequest(
        offset,
        pageSize,
        sort,
        query,
        genreId,
        multiplayerFilter,
        requiredPlayers,
      ),
    ),
  getBrowseGenres: () => ipcRenderer.invoke(ipcChannels.getBrowseGenres, createStatusRequest()),
  getGameDetails: (gameId) =>
    ipcRenderer.invoke(ipcChannels.getGameDetails, createGameDetailsRequest(gameId)),
  openGameStore: (gameId, gamePlatformId) =>
    ipcRenderer.invoke(
      ipcChannels.openGameStore,
      createOpenGameStoreRequest(gameId, gamePlatformId),
    ),
  addFavorite: (gameId) =>
    ipcRenderer.invoke(ipcChannels.addFavorite, createFavoriteGameRequest(gameId)),
  removeFavorite: (gameId) =>
    ipcRenderer.invoke(ipcChannels.removeFavorite, createFavoriteGameRequest(gameId)),
  getFavoriteStatus: (gameId) =>
    ipcRenderer.invoke(ipcChannels.getFavoriteStatus, createFavoriteGameRequest(gameId)),
  listFavorites: () => ipcRenderer.invoke(ipcChannels.listFavorites, createStatusRequest()),
};

contextBridge.exposeInMainWorld('gameScoutDesktop', desktopApi);
