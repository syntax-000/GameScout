export type DataStatus = 'complete' | 'partial' | 'unknown';
export type CapabilityType =
  'single_player' | 'multiplayer_unspecified' | 'cooperative' | 'pvp' | 'mixed_coop_pvp';
export type ConnectionType = 'none' | 'local_device' | 'lan' | 'online';
export type SupportState = 'supported' | 'unsupported' | 'unknown';
export type CountModel = 'exact_range' | 'discrete_set' | 'maximum_only' | 'unknown';
export type Confidence = 'verified' | 'high' | 'medium' | 'low';
export type FeatureType = 'split_screen' | 'shared_screen' | 'hot_seat';

export interface GameRecord {
  id: number;
  providerGameId: string;
  title: string;
  normalizedTitle: string;
  summary: string | null;
  releaseDate: string | null;
  coverUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  popularity: number | null;
  providerUpdatedAt: string | null;
  fetchedAt: string;
}

export type GameInput = Omit<GameRecord, 'id'>;

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

export interface BrowseGameRecord {
  id: number;
  title: string;
  releaseDate: string | null;
  coverUrl: string | null;
  genres: string[];
  platforms: string[];
  capabilities: BrowseCapabilityRecord[];
  isFavorite: boolean;
}

export interface BrowseCapabilityRecord {
  capabilityType: CapabilityType;
  connectionType: ConnectionType;
  splitScreen: boolean;
}

export interface BrowsePageRecord {
  games: BrowseGameRecord[];
  totalCount: number;
  offset: number;
  pageSize: number;
}

export interface BrowseOptions {
  offset: number;
  pageSize: number;
  sort: BrowseSort;
  query: string;
  genreId: number | null;
  multiplayerFilter: MultiplayerFilter;
  requiredPlayers: number | null;
}

export interface GameDetailsRecord {
  id: number;
  title: string;
  summary: string | null;
  releaseDate: string | null;
  coverUrl: string | null;
  genres: string[];
  fetchedAt: string;
  providerUpdatedAt: string | null;
  isFavorite: boolean;
  platforms: GameDetailsPlatformRecord[];
  steam: GameDetailsSteamRecord | null;
}

export interface GameDetailsPlatformRecord {
  id: number;
  name: string;
  family: string | null;
  releaseDate: string | null;
  storeUrl: string | null;
  dataStatus: DataStatus;
  capabilities: GameDetailsCapabilityRecord[];
}

export interface GameDetailsCapabilityRecord {
  id: number;
  capabilityType: CapabilityType;
  connectionType: ConnectionType;
  supportState: SupportState;
  countModel: CountModel;
  minPlayers: number | null;
  maxPlayers: number | null;
  playerCounts: number[];
  confidence: Confidence;
  notes: string | null;
  features: CapabilityFeatureRecord[];
  evidence: CapabilityEvidenceRecord[];
}

export interface GameDetailsSteamRecord {
  appId: string;
  storeUrl: string | null;
  currentPlayerCount: number | null;
  observedAt: string | null;
}

export interface GenreRecord {
  id: number;
  providerGenreId: string;
  name: string;
}

export type GenreInput = Omit<GenreRecord, 'id'>;

export interface PlatformRecord {
  id: number;
  providerPlatformId: string;
  name: string;
  family: string | null;
  generation: string | null;
}

export type PlatformInput = Omit<PlatformRecord, 'id'>;

export interface GamePlatformRecord {
  id: number;
  gameId: number;
  platformId: number;
  releaseDate: string | null;
  storeUrl: string | null;
  editionName: string | null;
  dataStatus: DataStatus;
}

export type GamePlatformInput = Omit<GamePlatformRecord, 'id'>;

export interface CapabilityRecord {
  id: number;
  gamePlatformId: number;
  capabilityType: CapabilityType;
  connectionType: ConnectionType;
  supportState: SupportState;
  countModel: CountModel;
  minPlayers: number | null;
  maxPlayers: number | null;
  confidence: Confidence;
  notes: string | null;
}

export type CapabilityInput = Omit<CapabilityRecord, 'id'>;

export interface CapabilityFeatureRecord {
  capabilityId: number;
  featureType: FeatureType;
  supportState: SupportState;
}

export interface CapabilityEvidenceRecord {
  id: number;
  capabilityId: number;
  provider: string;
  externalRecordId: string;
  observedAt: string;
  sourceField: string | null;
  confidence: Confidence;
  notes: string | null;
}

export type CapabilityEvidenceInput = Omit<CapabilityEvidenceRecord, 'id'>;

export interface ExternalGameReferenceRecord {
  gameId: number;
  provider: string;
  externalId: string;
  externalUrl: string | null;
}

export interface CurrentPlayerCountRecord {
  gameId: number;
  provider: string;
  playerCount: number;
  observedAt: string;
}

export interface FavoriteRecord {
  gameId: number;
  createdAt: string;
}

export interface SyncStateRecord {
  id: number;
  providerName: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  importedCount: number | null;
}

export type SyncStateInput = Omit<SyncStateRecord, 'id'>;
