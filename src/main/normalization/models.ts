import type {
  CapabilityType,
  Confidence,
  ConnectionType,
  CountModel,
  DataStatus,
  FeatureType,
  SupportState,
} from '../db/models';

export interface NormalizedGenre {
  providerGenreId: string;
  name: string;
}

export interface NormalizedCapabilityFeature {
  featureType: FeatureType;
  supportState: SupportState;
}

export interface NormalizedCapabilityEvidence {
  provider: string;
  externalRecordId: string;
  observedAt: string;
  sourceField: string | null;
  confidence: Confidence;
  notes: string | null;
}

export interface NormalizedCapability {
  capabilityType: CapabilityType;
  connectionType: ConnectionType;
  supportState: SupportState;
  countModel: CountModel;
  minPlayers: number | null;
  maxPlayers: number | null;
  playerCounts: number[];
  confidence: Confidence;
  notes: string | null;
  features: NormalizedCapabilityFeature[];
  evidence: NormalizedCapabilityEvidence[];
}

export interface NormalizedGamePlatform {
  providerPlatformId: 'windows';
  name: 'Windows';
  family: 'PC';
  generation: null;
  releaseDate: string | null;
  storeUrl: string | null;
  editionName: null;
  dataStatus: DataStatus;
  capabilities: NormalizedCapability[];
}

export interface NormalizedExternalReference {
  provider: string;
  externalId: string;
  externalUrl: string | null;
}

export interface NormalizedGame {
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
  genres: NormalizedGenre[];
  platforms: NormalizedGamePlatform[];
  externalReferences: NormalizedExternalReference[];
}

export interface NormalizedSteamEnrichment {
  externalReference: NormalizedExternalReference | null;
  currentPlayerObservation: {
    provider: 'steam';
    playerCount: number;
    observedAt: string;
  } | null;
  state: 'missing_association' | 'unavailable' | 'available';
}
