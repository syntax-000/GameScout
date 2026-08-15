import type { FeatureType } from '../db/models';
import type { SteamCatalogGameDto, SteamStoreCategoryDto } from '../providers/steam';
import type { NormalizedCapability, NormalizedGame } from './models';

const categoryMappings: ReadonlyMap<
  number,
  {
    capabilityType: NormalizedCapability['capabilityType'];
    connectionType: NormalizedCapability['connectionType'];
    features?: FeatureType[];
  }
> = new Map([
  [2, { capabilityType: 'single_player', connectionType: 'none' }],
  [20, { capabilityType: 'multiplayer_unspecified', connectionType: 'online' }],
  [36, { capabilityType: 'pvp', connectionType: 'online' }],
  [37, { capabilityType: 'pvp', connectionType: 'local_device', features: ['split_screen'] }],
  [38, { capabilityType: 'cooperative', connectionType: 'online' }],
  [
    39,
    { capabilityType: 'cooperative', connectionType: 'local_device', features: ['split_screen'] },
  ],
  [47, { capabilityType: 'pvp', connectionType: 'lan' }],
  [48, { capabilityType: 'cooperative', connectionType: 'lan' }],
]);

export function normalizeSteamCatalogGame(
  dto: SteamCatalogGameDto,
  fetchedAt: string,
): NormalizedGame {
  const capabilities = dto.categories.flatMap((category) =>
    normalizeCategory(dto, category, fetchedAt),
  );
  return {
    providerGameId: String(dto.appId),
    title: dto.name,
    normalizedTitle: dto.name.toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim(),
    summary: dto.summary,
    releaseDate: dto.releaseDate,
    coverUrl: dto.headerImage,
    rating: dto.rating,
    ratingCount: null,
    popularity: dto.popularity,
    providerUpdatedAt: new Date(dto.lastModified * 1000).toISOString(),
    fetchedAt,
    genres: dto.genres.map((genre) => ({
      providerGenreId: genre.id,
      name: genre.description,
    })),
    platforms: [
      {
        providerPlatformId: 'windows',
        name: 'Windows',
        family: 'PC',
        generation: null,
        releaseDate: dto.releaseDate,
        storeUrl: dto.storeUrl,
        editionName: null,
        dataStatus: capabilities.length > 0 ? 'partial' : 'unknown',
        capabilities,
      },
    ],
    externalReferences: [
      { provider: 'steam', externalId: String(dto.appId), externalUrl: dto.storeUrl },
    ],
  };
}

function normalizeCategory(
  dto: SteamCatalogGameDto,
  category: SteamStoreCategoryDto,
  fetchedAt: string,
): NormalizedCapability[] {
  const mapping = categoryMappings.get(category.id);
  if (!mapping) return [];
  return [
    {
      capabilityType: mapping.capabilityType,
      connectionType: mapping.connectionType,
      supportState: 'supported',
      countModel: 'unknown',
      minPlayers: null,
      maxPlayers: null,
      playerCounts: [],
      confidence: 'high',
      notes: 'Steam Store category evidence does not provide an exact supported player capacity.',
      features: (mapping.features ?? []).map((featureType) => ({
        featureType,
        supportState: 'supported',
      })),
      evidence: [
        {
          provider: 'steam',
          externalRecordId: `${dto.appId}:category:${category.id}`,
          observedAt: new Date(dto.lastModified * 1000).toISOString() || fetchedAt,
          sourceField: `categories.${category.id}`,
          confidence: 'high',
          notes: category.description,
        },
      ],
    },
  ];
}
