export const IPC_PROTOCOL_VERSION = 1 as const;

export const ipcChannels = {
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

export interface StatusRequest {
  protocolVersion: typeof IPC_PROTOCOL_VERSION;
}

export interface ApplicationStatus {
  state: 'ready';
  version: string;
  platform: NodeJS.Platform;
  desktopShell: 'electron';
  rendererIsolation: true;
}

export interface SettingsStatus {
  primaryProvider: 'steam';
  primaryProviderConfigurationRequired: true;
  primaryProviderConfigured: boolean;
  steamCredentialRequired: true;
  steamCredentialConfigured: boolean;
}

export interface ProviderSetupRequest extends StatusRequest {
  apiKey: string;
  attributionAccepted: boolean;
}

export type ProviderSetupResult =
  { ok: true; settings: SettingsStatus } | { ok: false; error: string };

export type SetupResource = 'steamKey' | 'steamTerms';

export interface OpenSetupResourceRequest extends StatusRequest {
  resource: SetupResource;
}

export type BrowseSort = 'title_asc' | 'release_date_desc' | 'rating_desc' | 'popularity_desc';
export type MultiplayerFilter =
  | 'any'
  | 'single_player'
  | 'online_multiplayer'
  | 'online_coop'
  | 'local_multiplayer'
  | 'local_coop'
  | 'lan_coop'
  | 'split_screen';

export interface BrowsePageRequest extends StatusRequest {
  offset: number;
  pageSize: number;
  sort: BrowseSort;
  query: string;
  genreId: number | null;
  multiplayerFilter: MultiplayerFilter;
  requiredPlayers: number | null;
}

export interface BrowseGenre {
  id: number;
  name: string;
}

export interface BrowseGame {
  id: number;
  title: string;
  releaseDate: string | null;
  coverUrl: string | null;
  genres: string[];
  platforms: string[];
  capabilities: BrowseCapability[];
  isFavorite: boolean;
}

export interface BrowseCapability {
  capabilityType:
    'single_player' | 'multiplayer_unspecified' | 'cooperative' | 'pvp' | 'mixed_coop_pvp';
  connectionType: 'none' | 'local_device' | 'lan' | 'online';
  splitScreen: boolean;
}

export interface BrowsePage {
  games: BrowseGame[];
  totalCount: number;
  offset: number;
  pageSize: number;
}

export interface GameDetailsRequest extends StatusRequest {
  gameId: number;
}

export interface OpenGameStoreRequest extends StatusRequest {
  gameId: number;
  gamePlatformId: number;
}

export type OpenGameStoreResult = { ok: true } | { ok: false; error: string };

export interface FavoriteGameRequest extends StatusRequest {
  gameId: number;
}

export interface FavoriteEntry {
  gameId: number;
  createdAt: string;
}

export type FavoriteMutationResult =
  { ok: true; isFavorite: boolean } | { ok: false; error: string };

export interface GameDetails {
  id: number;
  title: string;
  summary: string | null;
  releaseDate: string | null;
  coverUrl: string | null;
  genres: string[];
  fetchedAt: string;
  providerUpdatedAt: string | null;
  isFavorite: boolean;
  platforms: GameDetailsPlatform[];
  steam: GameDetailsSteam | null;
}

export interface GameDetailsPlatform {
  id: number;
  name: string;
  family: string | null;
  releaseDate: string | null;
  storeUrl: string | null;
  dataStatus: 'complete' | 'partial' | 'unknown';
  capabilities: GameDetailsCapability[];
}

export interface GameDetailsCapability {
  id: number;
  capabilityType: BrowseCapability['capabilityType'];
  connectionType: BrowseCapability['connectionType'];
  supportState: 'supported' | 'unsupported' | 'unknown';
  countModel: 'exact_range' | 'discrete_set' | 'maximum_only' | 'unknown';
  minPlayers: number | null;
  maxPlayers: number | null;
  playerCounts: number[];
  confidence: 'verified' | 'high' | 'medium' | 'low';
  notes: string | null;
  features: GameDetailsFeature[];
  evidence: GameDetailsEvidence[];
}

export interface GameDetailsFeature {
  capabilityId: number;
  featureType: 'split_screen' | 'shared_screen' | 'hot_seat';
  supportState: 'supported' | 'unsupported' | 'unknown';
}

export interface GameDetailsEvidence {
  id: number;
  capabilityId: number;
  provider: string;
  externalRecordId: string;
  observedAt: string;
  sourceField: string | null;
  confidence: 'verified' | 'high' | 'medium' | 'low';
  notes: string | null;
}

export interface GameDetailsSteam {
  appId: string;
  storeUrl: string | null;
  currentPlayerCount: number | null;
  observedAt: string | null;
}

export type DatabaseHealth =
  | {
      state: 'ready';
      schemaVersion: number;
      foreignKeysEnabled: boolean;
    }
  | {
      state: 'error';
      schemaVersion: null;
      foreignKeysEnabled: false;
      error: string;
    };

export interface SynchronizationPhaseStatus {
  phase: 'steam_catalog' | 'steam_activity';
  state: 'never' | 'success' | 'error';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  importedCount: number | null;
}

export interface SynchronizationStatus {
  primary: SynchronizationPhaseStatus;
  steam: SynchronizationPhaseStatus;
  latestSteamObservationAt: string | null;
}

export type CatalogRefreshResult =
  | {
      ok: true;
      primary: { added: number; updated: number; imported: number };
      requestedLimit: number;
      steamAttempted: number;
      steamSucceeded: number;
      steamFailed: number;
      synchronization: SynchronizationStatus;
    }
  | { ok: false; error: string; synchronization: SynchronizationStatus };

export interface GameScoutDesktopApi {
  getApplicationStatus: () => Promise<ApplicationStatus>;
  getSettingsStatus: () => Promise<SettingsStatus>;
  getDatabaseHealth: () => Promise<DatabaseHealth>;
  getSynchronizationStatus: () => Promise<SynchronizationStatus>;
  refreshCatalog: () => Promise<CatalogRefreshResult>;
  saveProviderSetup: (apiKey: string, attributionAccepted: boolean) => Promise<ProviderSetupResult>;
  openSetupResource: (resource: SetupResource) => Promise<void>;
  getBrowsePage: (
    offset: number,
    pageSize: number,
    sort: BrowseSort,
    query: string,
    genreId: number | null,
    multiplayerFilter: MultiplayerFilter,
    requiredPlayers: number | null,
  ) => Promise<BrowsePage>;
  getBrowseGenres: () => Promise<BrowseGenre[]>;
  getGameDetails: (gameId: number) => Promise<GameDetails | null>;
  openGameStore: (gameId: number, gamePlatformId: number) => Promise<OpenGameStoreResult>;
  addFavorite: (gameId: number) => Promise<FavoriteMutationResult>;
  removeFavorite: (gameId: number) => Promise<FavoriteMutationResult>;
  getFavoriteStatus: (gameId: number) => Promise<boolean>;
  listFavorites: () => Promise<FavoriteEntry[]>;
}

export function createFavoriteGameRequest(gameId: number): FavoriteGameRequest {
  return { protocolVersion: IPC_PROTOCOL_VERSION, gameId };
}

export function assertFavoriteGameRequest(value: unknown): asserts value is FavoriteGameRequest {
  if (!isExactObject(value, ['protocolVersion', 'gameId'])) {
    throw new TypeError('Favorite game request is invalid.');
  }
  assertProtocolVersion(value.protocolVersion);
  if (!Number.isSafeInteger(value.gameId) || Number(value.gameId) < 1) {
    throw new TypeError('Favorite game ID must be a positive integer.');
  }
}

export function createGameDetailsRequest(gameId: number): GameDetailsRequest {
  return { protocolVersion: IPC_PROTOCOL_VERSION, gameId };
}

export function assertGameDetailsRequest(value: unknown): asserts value is GameDetailsRequest {
  if (!isExactObject(value, ['protocolVersion', 'gameId'])) {
    throw new TypeError('Game details request is invalid.');
  }
  assertProtocolVersion(value.protocolVersion);
  if (!Number.isSafeInteger(value.gameId) || Number(value.gameId) < 1) {
    throw new TypeError('Game details ID must be a positive integer.');
  }
}

export function createOpenGameStoreRequest(
  gameId: number,
  gamePlatformId: number,
): OpenGameStoreRequest {
  return { protocolVersion: IPC_PROTOCOL_VERSION, gameId, gamePlatformId };
}

export function assertOpenGameStoreRequest(value: unknown): asserts value is OpenGameStoreRequest {
  if (!isExactObject(value, ['protocolVersion', 'gameId', 'gamePlatformId'])) {
    throw new TypeError('Open store request is invalid.');
  }
  assertProtocolVersion(value.protocolVersion);
  if (!Number.isSafeInteger(value.gameId) || Number(value.gameId) < 1) {
    throw new TypeError('Open store game ID must be a positive integer.');
  }
  if (!Number.isSafeInteger(value.gamePlatformId) || Number(value.gamePlatformId) < 1) {
    throw new TypeError('Open store platform ID must be a positive integer.');
  }
}

export function createBrowsePageRequest(
  offset: number,
  pageSize: number,
  sort: BrowseSort,
  query: string,
  genreId: number | null,
  multiplayerFilter: MultiplayerFilter,
  requiredPlayers: number | null,
): BrowsePageRequest {
  return {
    protocolVersion: IPC_PROTOCOL_VERSION,
    offset,
    pageSize,
    sort,
    query,
    genreId,
    multiplayerFilter,
    requiredPlayers,
  };
}

export function assertBrowsePageRequest(value: unknown): asserts value is BrowsePageRequest {
  if (
    !isExactObject(value, [
      'protocolVersion',
      'offset',
      'pageSize',
      'sort',
      'query',
      'genreId',
      'multiplayerFilter',
      'requiredPlayers',
    ])
  ) {
    throw new TypeError('Browse page request is invalid.');
  }
  assertProtocolVersion(value.protocolVersion);
  if (!Number.isSafeInteger(value.offset) || Number(value.offset) < 0) {
    throw new RangeError('Browse offset must be a non-negative integer.');
  }
  if (
    !Number.isSafeInteger(value.pageSize) ||
    Number(value.pageSize) < 1 ||
    Number(value.pageSize) > 100
  ) {
    throw new RangeError('Browse page size must be between 1 and 100.');
  }
  if (!browseSorts.includes(value.sort as BrowseSort)) {
    throw new TypeError('Browse sort is not supported.');
  }
  if (typeof value.query !== 'string' || value.query.length > 200) {
    throw new TypeError('Browse query must be a string of at most 200 characters.');
  }
  if (
    value.genreId !== null &&
    (!Number.isSafeInteger(value.genreId) || Number(value.genreId) < 1)
  ) {
    throw new TypeError('Browse genre must be a positive integer or null.');
  }
  if (!multiplayerFilters.includes(value.multiplayerFilter as MultiplayerFilter)) {
    throw new TypeError('Browse multiplayer filter is not supported.');
  }
  if (
    value.requiredPlayers !== null &&
    (!Number.isSafeInteger(value.requiredPlayers) ||
      Number(value.requiredPlayers) < 1 ||
      Number(value.requiredPlayers) > 16)
  ) {
    throw new TypeError('Required players must be an integer from 1 through 16 or null.');
  }
}

const multiplayerFilters: readonly MultiplayerFilter[] = [
  'any',
  'single_player',
  'online_multiplayer',
  'online_coop',
  'local_multiplayer',
  'local_coop',
  'lan_coop',
  'split_screen',
];

const browseSorts: readonly BrowseSort[] = [
  'title_asc',
  'release_date_desc',
  'rating_desc',
  'popularity_desc',
];

export function createProviderSetupRequest(
  apiKey: string,
  attributionAccepted: boolean,
): ProviderSetupRequest {
  return { protocolVersion: IPC_PROTOCOL_VERSION, apiKey, attributionAccepted };
}

export function assertProviderSetupRequest(value: unknown): asserts value is ProviderSetupRequest {
  if (!isExactObject(value, ['protocolVersion', 'apiKey', 'attributionAccepted'])) {
    throw new TypeError('Provider setup request is invalid.');
  }
  assertProtocolVersion(value.protocolVersion);
  if (typeof value.apiKey !== 'string' || typeof value.attributionAccepted !== 'boolean') {
    throw new TypeError('Provider setup request is invalid.');
  }
}

export function createOpenSetupResourceRequest(resource: SetupResource): OpenSetupResourceRequest {
  return { protocolVersion: IPC_PROTOCOL_VERSION, resource };
}

export function assertOpenSetupResourceRequest(
  value: unknown,
): asserts value is OpenSetupResourceRequest {
  if (!isExactObject(value, ['protocolVersion', 'resource'])) {
    throw new TypeError('Setup resource request is invalid.');
  }
  assertProtocolVersion(value.protocolVersion);
  if (value.resource !== 'steamKey' && value.resource !== 'steamTerms') {
    throw new TypeError('Setup resource is not approved.');
  }
}

export function createStatusRequest(): StatusRequest {
  return { protocolVersion: IPC_PROTOCOL_VERSION };
}

export function assertStatusRequest(value: unknown): asserts value is StatusRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('IPC request must be an object.');
  }

  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'protocolVersion') {
    throw new TypeError('IPC request contains unexpected fields.');
  }

  assertProtocolVersion((value as { protocolVersion?: unknown }).protocolVersion);
}

function assertProtocolVersion(value: unknown): void {
  if (value !== IPC_PROTOCOL_VERSION) throw new TypeError('Unsupported IPC protocol version.');
}

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}
