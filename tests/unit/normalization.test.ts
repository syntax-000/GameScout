import { describe, expect, it } from 'vitest';
import type { SteamCatalogGameDto } from '../../src/main/providers/steam';
import { normalizeSteamCatalogGame } from '../../src/main/normalization/steam-catalog';

const dto = (overrides: Partial<SteamCatalogGameDto> = {}): SteamCatalogGameDto => ({
  appId: 620,
  name: 'Portal 2',
  summary: 'Cooperative puzzle game.',
  releaseDate: '2011-04-18',
  headerImage: 'https://example.com/cover.jpg',
  rating: 95,
  popularity: 1000,
  lastModified: 1_723_600_000,
  genres: [{ id: '3', description: 'Puzzle' }],
  categories: [
    { id: 38, description: 'Online Co-op' },
    { id: 39, description: 'Shared/Split Screen Co-op' },
  ],
  storeUrl: 'https://store.steampowered.com/app/620/',
  ...overrides,
});

describe('Steam catalog normalization', () => {
  it('maps explicit Store categories without inventing player capacities', () => {
    const normalized = normalizeSteamCatalogGame(dto(), '2026-08-14T01:00:00Z');
    expect(normalized).toMatchObject({
      providerGameId: '620',
      rating: 95,
      popularity: 1000,
      genres: [{ providerGenreId: '3', name: 'Puzzle' }],
    });
    expect(normalized.platforms[0].capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityType: 'cooperative',
          connectionType: 'online',
          countModel: 'unknown',
          confidence: 'high',
        }),
        expect.objectContaining({
          connectionType: 'local_device',
          features: [{ featureType: 'split_screen', supportState: 'supported' }],
        }),
      ]),
    );
    expect(normalized.externalReferences).toEqual([
      { provider: 'steam', externalId: '620', externalUrl: dto().storeUrl },
    ]);
  });

  it('ignores generic multiplayer and co-op Store categories', () => {
    const normalized = normalizeSteamCatalogGame(
      dto({
        categories: [
          { id: 1, description: 'Multi-player' },
          { id: 9, description: 'Co-op' },
        ],
      }),
      '2026-08-14T01:00:00Z',
    );
    expect(normalized.platforms[0].capabilities).toEqual([]);
  });
});
