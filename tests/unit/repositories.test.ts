import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';

const directories: string[] = [];

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function setup() {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-repository-test-'));
  directories.push(userDataPath);
  const database = openGameScoutDatabase({ userDataPath });
  return { database, repositories: database.repositories };
}

describe('database repositories', () => {
  it('paginates browse results with deterministic ordering and total counts', () => {
    const { database, repositories } = setup();
    const titles = ['Zulu', 'alpha', 'Alpha', 'Bravo', 'Echo'];
    for (const [index, title] of titles.entries()) {
      repositories.games.upsert({
        providerGameId: `game-${index}`,
        title,
        normalizedTitle: title.toLowerCase(),
        summary: null,
        releaseDate: null,
        coverUrl: null,
        rating: null,
        ratingCount: null,
        popularity: null,
        providerUpdatedAt: null,
        fetchedAt: '2026-08-14T00:00:00.000Z',
      });
    }

    const firstPage = repositories.games.browse({
      offset: 0,
      pageSize: 2,
      sort: 'title_asc',
      query: '',
      genreId: null,
      multiplayerFilter: 'any',
      requiredPlayers: null,
    });
    const lastPage = repositories.games.browse({
      offset: 4,
      pageSize: 2,
      sort: 'title_asc',
      query: '',
      genreId: null,
      multiplayerFilter: 'any',
      requiredPlayers: null,
    });

    expect(firstPage).toEqual({
      games: [
        {
          id: 3,
          title: 'Alpha',
          releaseDate: null,
          coverUrl: null,
          genres: [],
          platforms: [],
          capabilities: [],
          isFavorite: false,
        },
        {
          id: 2,
          title: 'alpha',
          releaseDate: null,
          coverUrl: null,
          genres: [],
          platforms: [],
          capabilities: [],
          isFavorite: false,
        },
      ],
      totalCount: 5,
      offset: 0,
      pageSize: 2,
    });
    expect(lastPage.games).toEqual([
      {
        id: 1,
        title: 'Zulu',
        releaseDate: null,
        coverUrl: null,
        genres: [],
        platforms: [],
        capabilities: [],
        isFavorite: false,
      },
    ]);
    expect(() =>
      repositories.games.browse({
        offset: -1,
        pageSize: 2,
        sort: 'title_asc',
        query: '',
        genreId: null,
        multiplayerFilter: 'any',
        requiredPlayers: null,
      }),
    ).toThrow('offset');
    expect(() =>
      repositories.games.browse({
        offset: 0,
        pageSize: 0,
        sort: 'title_asc',
        query: '',
        genreId: null,
        multiplayerFilter: 'any',
        requiredPlayers: null,
      }),
    ).toThrow('page size');
    expect(
      repositories.games.browse({
        offset: 5,
        pageSize: 2,
        sort: 'title_asc',
        query: '',
        genreId: null,
        multiplayerFilter: 'any',
        requiredPlayers: null,
      }),
    ).toMatchObject({
      games: [],
      totalCount: 5,
    });
    database.close();
  });

  it('sorts release date, rating, and popularity descending with stable null ordering', () => {
    const { database, repositories } = setup();
    const records = [
      { title: 'Alpha', releaseDate: '2024-01-01', rating: 8, popularity: 10 },
      { title: 'Bravo', releaseDate: null, rating: null, popularity: null },
      { title: 'Charlie', releaseDate: '2025-01-01', rating: 9, popularity: 5 },
      { title: 'Delta', releaseDate: '2025-01-01', rating: 9, popularity: 10 },
      { title: 'Echo', releaseDate: null, rating: null, popularity: null },
    ];
    for (const [index, record] of records.entries()) {
      repositories.games.upsert({
        providerGameId: `sort-${index}`,
        title: record.title,
        normalizedTitle: record.title.toLowerCase(),
        summary: null,
        releaseDate: record.releaseDate,
        coverUrl: null,
        rating: record.rating,
        ratingCount: record.rating === null ? null : 1,
        popularity: record.popularity,
        providerUpdatedAt: null,
        fetchedAt: '2026-08-14T00:00:00.000Z',
      });
    }
    const titlesFor = (sort: Parameters<typeof repositories.games.browse>[0]['sort']) =>
      repositories.games
        .browse({
          offset: 0,
          pageSize: 100,
          sort,
          query: '',
          genreId: null,
          multiplayerFilter: 'any',
          requiredPlayers: null,
        })
        .games.map((game) => game.title);

    expect(titlesFor('release_date_desc')).toEqual(['Charlie', 'Delta', 'Alpha', 'Bravo', 'Echo']);
    expect(titlesFor('rating_desc')).toEqual(['Charlie', 'Delta', 'Alpha', 'Bravo', 'Echo']);
    expect(titlesFor('popularity_desc')).toEqual(['Alpha', 'Delta', 'Charlie', 'Bravo', 'Echo']);
    expect(
      repositories.games
        .browse({
          offset: 1,
          pageSize: 2,
          sort: 'rating_desc',
          query: '',
          genreId: null,
          multiplayerFilter: 'any',
          requiredPlayers: null,
        })
        .games.map((game) => game.title),
    ).toEqual(['Delta', 'Alpha']);
    database.close();
  });

  it('searches titles locally with case-insensitive normalized substring matching', () => {
    const { database, repositories } = setup();
    for (const [index, title] of [
      'Portal 2',
      'The Portal',
      'Port Royale',
      '100% Orange_Juice',
    ].entries()) {
      repositories.games.upsert({
        providerGameId: `search-${index}`,
        title,
        normalizedTitle: title.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' '),
        summary: null,
        releaseDate: null,
        coverUrl: null,
        rating: null,
        ratingCount: null,
        popularity: null,
        providerUpdatedAt: null,
        fetchedAt: '2026-08-14T00:00:00.000Z',
      });
    }

    const portal = repositories.games.browse({
      offset: 0,
      pageSize: 12,
      sort: 'title_asc',
      query: '  PoRtAl  ',
      genreId: null,
      multiplayerFilter: 'any',
      requiredPlayers: null,
    });
    expect(portal.games.map((game) => game.title)).toEqual(['Portal 2', 'The Portal']);
    expect(portal.totalCount).toBe(2);
    expect(
      repositories.games
        .browse({
          offset: 0,
          pageSize: 12,
          sort: 'title_asc',
          query: '% Orange_',
          genreId: null,
          multiplayerFilter: 'any',
          requiredPlayers: null,
        })
        .games.map((game) => game.title),
    ).toEqual(['100% Orange_Juice']);
    expect(
      repositories.games.browse({
        offset: 0,
        pageSize: 12,
        sort: 'title_asc',
        query: 'missing',
        genreId: null,
        multiplayerFilter: 'any',
        requiredPlayers: null,
      }),
    ).toMatchObject({ games: [], totalCount: 0 });
    database.close();
  });

  it('returns normalized card metadata without confirming unknown multiplayer support', () => {
    const { database, repositories } = setup();
    const game = repositories.games.upsert({
      providerGameId: 'card-game',
      title: 'Card Game',
      normalizedTitle: 'card game',
      summary: null,
      releaseDate: '2025-02-03',
      coverUrl: 'https://example.test/card-game.jpg',
      rating: null,
      ratingCount: null,
      popularity: null,
      providerUpdatedAt: null,
      fetchedAt: '2026-08-14T00:00:00.000Z',
    });
    const genres = [
      repositories.genres.upsert({ providerGenreId: 'strategy', name: 'Strategy' }),
      repositories.genres.upsert({ providerGenreId: 'action', name: 'Action' }),
    ];
    const windows = repositories.platforms.upsert({
      providerPlatformId: 'windows',
      name: 'Windows',
      family: 'PC',
      generation: null,
    });
    const gamePlatform = repositories.gamePlatforms.upsert({
      gameId: game.id,
      platformId: windows.id,
      releaseDate: game.releaseDate,
      storeUrl: null,
      editionName: null,
      dataStatus: 'complete',
    });
    repositories.genres.replaceForGame(
      game.id,
      genres.map((genre) => genre.id),
    );
    const supported = repositories.capabilities.upsert({
      gamePlatformId: gamePlatform.id,
      capabilityType: 'cooperative',
      connectionType: 'local_device',
      supportState: 'supported',
      countModel: 'unknown',
      minPlayers: null,
      maxPlayers: null,
      confidence: 'verified',
      notes: null,
    });
    repositories.capabilities.upsertFeature({
      capabilityId: supported.id,
      featureType: 'split_screen',
      supportState: 'supported',
    });
    repositories.capabilities.upsert({
      gamePlatformId: gamePlatform.id,
      capabilityType: 'pvp',
      connectionType: 'online',
      supportState: 'unknown',
      countModel: 'unknown',
      minPlayers: null,
      maxPlayers: null,
      confidence: 'low',
      notes: null,
    });
    repositories.capabilities.upsert({
      gamePlatformId: gamePlatform.id,
      capabilityType: 'pvp',
      connectionType: 'lan',
      supportState: 'unsupported',
      countModel: 'unknown',
      minPlayers: null,
      maxPlayers: null,
      confidence: 'verified',
      notes: null,
    });
    repositories.favorites.add(game.id, '2026-08-14T00:00:00.000Z');

    expect(
      repositories.games.browse({
        offset: 0,
        pageSize: 12,
        sort: 'title_asc',
        query: '',
        genreId: null,
        multiplayerFilter: 'any',
        requiredPlayers: null,
      }).games,
    ).toEqual([
      {
        id: game.id,
        title: 'Card Game',
        releaseDate: '2025-02-03',
        coverUrl: 'https://example.test/card-game.jpg',
        genres: ['Action', 'Strategy'],
        platforms: ['Windows'],
        capabilities: [
          {
            capabilityType: 'cooperative',
            connectionType: 'local_device',
            splitScreen: true,
          },
        ],
        isFavorite: true,
      },
    ]);
    database.close();
  });

  it('returns complete and incomplete local game details with isolated Steam activity', () => {
    const { database, repositories } = setup();
    const game = repositories.games.upsert({
      providerGameId: 'details-game',
      title: 'Details Game',
      normalizedTitle: 'details game',
      summary: 'A local details fixture.',
      releaseDate: '2025-06-01',
      coverUrl: 'https://example.test/details.jpg',
      rating: null,
      ratingCount: null,
      popularity: null,
      providerUpdatedAt: '2025-06-02T00:00:00.000Z',
      fetchedAt: '2026-08-14T00:00:00.000Z',
    });
    const genre = repositories.genres.upsert({ providerGenreId: 'action', name: 'Action' });
    repositories.genres.replaceForGame(game.id, [genre.id]);
    const windows = repositories.platforms.upsert({
      providerPlatformId: 'windows',
      name: 'Windows',
      family: 'PC',
      generation: null,
    });
    const platform = repositories.gamePlatforms.upsert({
      gameId: game.id,
      platformId: windows.id,
      releaseDate: '2025-06-01',
      storeUrl: 'https://store.steampowered.com/app/12345/',
      editionName: null,
      dataStatus: 'complete',
    });
    const capability = repositories.capabilities.upsert({
      gamePlatformId: platform.id,
      capabilityType: 'cooperative',
      connectionType: 'online',
      supportState: 'supported',
      countModel: 'discrete_set',
      minPlayers: null,
      maxPlayers: null,
      confidence: 'verified',
      notes: 'Provider-backed.',
    });
    repositories.capabilities.replacePlayerCounts(capability.id, [2, 4]);
    repositories.capabilities.upsertFeature({
      capabilityId: capability.id,
      featureType: 'shared_screen',
      supportState: 'unsupported',
    });
    repositories.evidence.insert({
      capabilityId: capability.id,
      provider: 'steam',
      externalRecordId: 'Details_Game',
      observedAt: '2026-08-14T00:00:00.000Z',
      sourceField: 'Multiplayer',
      confidence: 'verified',
      notes: null,
    });
    repositories.externalReferences.upsert({
      gameId: game.id,
      provider: 'steam',
      externalId: '12345',
      externalUrl: 'https://store.steampowered.com/app/12345/',
    });
    repositories.currentPlayerCounts.upsert({
      gameId: game.id,
      provider: 'steam',
      playerCount: 0,
      observedAt: '2026-08-14T01:00:00.000Z',
    });
    repositories.favorites.add(game.id, '2026-08-14T00:00:00.000Z');

    expect(repositories.games.getDetails(game.id)).toEqual({
      id: game.id,
      title: 'Details Game',
      summary: 'A local details fixture.',
      releaseDate: '2025-06-01',
      coverUrl: 'https://example.test/details.jpg',
      genres: ['Action'],
      fetchedAt: '2026-08-14T00:00:00.000Z',
      providerUpdatedAt: '2025-06-02T00:00:00.000Z',
      isFavorite: true,
      platforms: [
        {
          id: platform.id,
          name: 'Windows',
          family: 'PC',
          releaseDate: '2025-06-01',
          storeUrl: 'https://store.steampowered.com/app/12345/',
          dataStatus: 'complete',
          capabilities: [
            {
              id: capability.id,
              gamePlatformId: platform.id,
              capabilityType: 'cooperative',
              connectionType: 'online',
              supportState: 'supported',
              countModel: 'discrete_set',
              minPlayers: null,
              maxPlayers: null,
              playerCounts: [2, 4],
              confidence: 'verified',
              notes: 'Provider-backed.',
              features: [
                {
                  capabilityId: capability.id,
                  featureType: 'shared_screen',
                  supportState: 'unsupported',
                },
              ],
              evidence: [
                {
                  id: 1,
                  capabilityId: capability.id,
                  provider: 'steam',
                  externalRecordId: 'Details_Game',
                  observedAt: '2026-08-14T00:00:00.000Z',
                  sourceField: 'Multiplayer',
                  confidence: 'verified',
                  notes: null,
                },
              ],
            },
          ],
        },
      ],
      steam: {
        appId: '12345',
        storeUrl: 'https://store.steampowered.com/app/12345/',
        currentPlayerCount: 0,
        observedAt: '2026-08-14T01:00:00.000Z',
      },
    });

    const incomplete = repositories.games.upsert({
      providerGameId: 'incomplete-details',
      title: 'Incomplete',
      normalizedTitle: 'incomplete',
      summary: null,
      releaseDate: null,
      coverUrl: null,
      rating: null,
      ratingCount: null,
      popularity: null,
      providerUpdatedAt: null,
      fetchedAt: '2026-08-14T00:00:00.000Z',
    });
    expect(repositories.games.getDetails(incomplete.id)).toMatchObject({
      summary: null,
      releaseDate: null,
      coverUrl: null,
      genres: [],
      platforms: [],
      steam: null,
      isFavorite: false,
    });
    expect(repositories.games.getDetails(99999)).toBeNull();
    database.close();
  });

  it('filters by one explicit genre and combines it with title search', () => {
    const { database, repositories } = setup();
    const action = repositories.genres.upsert({ providerGenreId: 'action', name: 'Action' });
    const strategy = repositories.genres.upsert({
      providerGenreId: 'strategy',
      name: 'Strategy',
    });
    const titles = ['Action Quest', 'Strategy Quest', 'Action Strategy'];
    const games = titles.map((title, index) =>
      repositories.games.upsert({
        providerGameId: `genre-${index}`,
        title,
        normalizedTitle: title.toLowerCase(),
        summary: null,
        releaseDate: null,
        coverUrl: null,
        rating: null,
        ratingCount: null,
        popularity: null,
        providerUpdatedAt: null,
        fetchedAt: '2026-08-14T00:00:00.000Z',
      }),
    );
    repositories.genres.replaceForGame(games[0].id, [action.id]);
    repositories.genres.replaceForGame(games[1].id, [strategy.id]);
    repositories.genres.replaceForGame(games[2].id, [action.id, strategy.id]);

    expect(repositories.genres.listUsed().map((genre) => genre.name)).toEqual([
      'Action',
      'Strategy',
    ]);
    expect(
      repositories.games
        .browse({
          offset: 0,
          pageSize: 12,
          sort: 'title_asc',
          query: '',
          genreId: action.id,
          multiplayerFilter: 'any',
          requiredPlayers: null,
        })
        .games.map((game) => game.title),
    ).toEqual(['Action Quest', 'Action Strategy']);
    expect(
      repositories.games
        .browse({
          offset: 0,
          pageSize: 12,
          sort: 'title_asc',
          query: 'strategy',
          genreId: action.id,
          multiplayerFilter: 'any',
          requiredPlayers: null,
        })
        .games.map((game) => game.title),
    ).toEqual(['Action Strategy']);
    expect(
      repositories.games.browse({
        offset: 0,
        pageSize: 12,
        sort: 'title_asc',
        query: '',
        genreId: 999,
        multiplayerFilter: 'any',
        requiredPlayers: null,
      }),
    ).toMatchObject({ games: [], totalCount: 0 });
    database.close();
  });

  it('filters by verified multiplayer type without treating unknown support as confirmed', () => {
    const { database, repositories } = setup();
    const windows = repositories.platforms.upsert({
      providerPlatformId: 'windows',
      name: 'Windows',
      family: 'PC',
      generation: null,
    });
    const addCapabilityGame = (
      title: string,
      capabilityType:
        'single_player' | 'multiplayer_unspecified' | 'cooperative' | 'pvp' | 'mixed_coop_pvp',
      connectionType: 'none' | 'local_device' | 'lan' | 'online',
      supportState: 'supported' | 'unsupported' | 'unknown' = 'supported',
      splitScreen: 'supported' | 'unsupported' | 'unknown' | null = null,
    ) => {
      const game = repositories.games.upsert({
        providerGameId: `multiplayer-${title}`,
        title,
        normalizedTitle: title.toLowerCase(),
        summary: null,
        releaseDate: null,
        coverUrl: null,
        rating: null,
        ratingCount: null,
        popularity: null,
        providerUpdatedAt: null,
        fetchedAt: '2026-08-14T00:00:00.000Z',
      });
      const gamePlatform = repositories.gamePlatforms.upsert({
        gameId: game.id,
        platformId: windows.id,
        releaseDate: null,
        storeUrl: null,
        editionName: null,
        dataStatus: 'complete',
      });
      const capability = repositories.capabilities.upsert({
        gamePlatformId: gamePlatform.id,
        capabilityType,
        connectionType,
        supportState,
        countModel: 'unknown',
        minPlayers: null,
        maxPlayers: null,
        confidence: supportState === 'unknown' ? 'low' : 'verified',
        notes: null,
      });
      if (splitScreen !== null) {
        repositories.capabilities.upsertFeature({
          capabilityId: capability.id,
          featureType: 'split_screen',
          supportState: splitScreen,
        });
      }
    };

    addCapabilityGame('Single', 'single_player', 'none');
    addCapabilityGame('Online PvP', 'pvp', 'online');
    addCapabilityGame('Online Co-op', 'cooperative', 'online');
    addCapabilityGame('Online Mixed', 'mixed_coop_pvp', 'online');
    addCapabilityGame('Local PvP', 'pvp', 'local_device');
    addCapabilityGame('Local Co-op Split', 'cooperative', 'local_device', 'supported', 'supported');
    addCapabilityGame('LAN Co-op', 'cooperative', 'lan');
    addCapabilityGame('Unknown Online', 'pvp', 'online', 'unknown');
    addCapabilityGame('Unsupported Local', 'cooperative', 'local_device', 'unsupported');
    addCapabilityGame('Unknown Split', 'cooperative', 'local_device', 'supported', 'unknown');

    const titlesFor = (
      multiplayerFilter: Parameters<typeof repositories.games.browse>[0]['multiplayerFilter'],
      requiredPlayers: number | null = null,
    ) =>
      repositories.games
        .browse({
          offset: 0,
          pageSize: 100,
          sort: 'title_asc',
          query: '',
          genreId: null,
          multiplayerFilter,
          requiredPlayers,
        })
        .games.map((game) => game.title);

    expect(titlesFor('single_player')).toEqual(['Single']);
    expect(titlesFor('online_multiplayer')).toEqual(['Online Mixed', 'Online PvP']);
    expect(titlesFor('online_coop')).toEqual(['Online Co-op', 'Online Mixed']);
    expect(titlesFor('local_multiplayer')).toEqual(['Local PvP']);
    expect(titlesFor('local_coop')).toEqual(['Local Co-op Split', 'Unknown Split']);
    expect(titlesFor('lan_coop')).toEqual(['LAN Co-op']);
    expect(titlesFor('split_screen')).toEqual(['Local Co-op Split']);
    expect(titlesFor('any')).toHaveLength(10);
    database.close();
  });

  it('matches exact ranges and discrete counts while excluding unknown capacity', () => {
    const { database, repositories } = setup();
    const windows = repositories.platforms.upsert({
      providerPlatformId: 'windows',
      name: 'Windows',
      family: 'PC',
      generation: null,
    });
    const addCapacityGame = (
      title: string,
      countModel: 'exact_range' | 'discrete_set' | 'maximum_only' | 'unknown',
      minPlayers: number | null,
      maxPlayers: number | null,
      counts: number[],
    ) => {
      const game = repositories.games.upsert({
        providerGameId: `capacity-${title}`,
        title,
        normalizedTitle: title.toLowerCase(),
        summary: null,
        releaseDate: null,
        coverUrl: null,
        rating: null,
        ratingCount: null,
        popularity: null,
        providerUpdatedAt: null,
        fetchedAt: '2026-08-14T00:00:00.000Z',
      });
      const platform = repositories.gamePlatforms.upsert({
        gameId: game.id,
        platformId: windows.id,
        releaseDate: null,
        storeUrl: null,
        editionName: null,
        dataStatus: 'complete',
      });
      const capability = repositories.capabilities.upsert({
        gamePlatformId: platform.id,
        capabilityType: 'cooperative',
        connectionType: 'online',
        supportState: 'supported',
        countModel,
        minPlayers,
        maxPlayers,
        confidence: 'verified',
        notes: null,
      });
      repositories.capabilities.replacePlayerCounts(capability.id, counts);
    };
    addCapacityGame('Range 4-8', 'exact_range', 4, 8, []);
    addCapacityGame('Discrete 2-4', 'discrete_set', null, null, [2, 4]);
    addCapacityGame('Maximum 8', 'maximum_only', null, 8, []);
    addCapacityGame('Unknown capacity', 'unknown', null, null, []);

    const titlesFor = (requiredPlayers: number) =>
      repositories.games
        .browse({
          offset: 0,
          pageSize: 100,
          sort: 'title_asc',
          query: '',
          genreId: null,
          multiplayerFilter: 'online_coop',
          requiredPlayers,
        })
        .games.map((game) => game.title);

    expect(titlesFor(2)).toEqual(['Discrete 2-4']);
    expect(titlesFor(4)).toEqual(['Discrete 2-4', 'Range 4-8']);
    expect(titlesFor(6)).toEqual(['Range 4-8']);
    expect(titlesFor(8)).toEqual(['Range 4-8']);
    expect(titlesFor(9)).toEqual([]);
    database.close();
  });

  it('upserts core records and replaces relationships idempotently', () => {
    const { database, repositories } = setup();
    const game = repositories.games.upsert({
      providerGameId: 'example-game',
      title: 'Example Game',
      normalizedTitle: 'example game',
      summary: null,
      releaseDate: null,
      coverUrl: null,
      rating: null,
      ratingCount: null,
      popularity: null,
      providerUpdatedAt: null,
      fetchedAt: '2026-08-14T00:00:00.000Z',
    });
    const genre = repositories.genres.upsert({
      providerGenreId: 'action',
      name: 'Action',
    });
    const platform = repositories.platforms.upsert({
      providerPlatformId: 'windows',
      name: 'Windows',
      family: 'PC',
      generation: null,
    });
    const gamePlatform = repositories.gamePlatforms.upsert({
      gameId: game.id,
      platformId: platform.id,
      releaseDate: null,
      storeUrl: null,
      editionName: null,
      dataStatus: 'partial',
    });

    repositories.genres.replaceForGame(game.id, [genre.id, genre.id]);
    repositories.genres.replaceForGame(game.id, [genre.id]);
    expect(repositories.genres.listForGame(game.id)).toHaveLength(1);
    expect(repositories.gamePlatforms.listForGame(game.id)).toHaveLength(1);

    const updated = repositories.games.upsert({
      ...game,
      title: 'Updated Example',
      normalizedTitle: 'updated example',
    });
    expect(updated.id).toBe(game.id);
    expect(repositories.games.getByProviderId('example-game')?.title).toBe('Updated Example');
    expect(gamePlatform.dataStatus).toBe('partial');
    database.close();
  });

  it('persists capabilities, features, evidence, references, favorites, and sync state', () => {
    const { database, repositories } = setup();
    const game = repositories.games.upsert({
      providerGameId: 'example-game',
      title: 'Example Game',
      normalizedTitle: 'example game',
      summary: null,
      releaseDate: null,
      coverUrl: null,
      rating: null,
      ratingCount: null,
      popularity: null,
      providerUpdatedAt: null,
      fetchedAt: '2026-08-14T00:00:00.000Z',
    });
    const platform = repositories.platforms.upsert({
      providerPlatformId: 'windows',
      name: 'Windows',
      family: 'PC',
      generation: null,
    });
    const gamePlatform = repositories.gamePlatforms.upsert({
      gameId: game.id,
      platformId: platform.id,
      releaseDate: null,
      storeUrl: null,
      editionName: null,
      dataStatus: 'complete',
    });
    const capability = repositories.capabilities.upsert({
      gamePlatformId: gamePlatform.id,
      capabilityType: 'cooperative',
      connectionType: 'online',
      supportState: 'supported',
      countModel: 'discrete_set',
      minPlayers: null,
      maxPlayers: null,
      confidence: 'verified',
      notes: null,
    });
    repositories.capabilities.replacePlayerCounts(capability.id, [2, 4, 4]);
    expect(repositories.capabilities.listPlayerCounts(capability.id)).toEqual([2, 4]);
    expect(
      repositories.capabilities.upsertFeature({
        capabilityId: capability.id,
        featureType: 'split_screen',
        supportState: 'unknown',
      }),
    ).toMatchObject({ capabilityId: capability.id });
    expect(repositories.capabilities.listFeatures(capability.id)).toHaveLength(1);

    const evidence = {
      provider: 'steam',
      externalRecordId: 'Example_Game',
      observedAt: '2026-08-14T00:00:00.000Z',
      sourceField: 'Multiplayer',
      confidence: 'verified' as const,
      notes: null,
    };
    repositories.evidence.replaceForCapability(capability.id, [evidence]);
    repositories.evidence.replaceForCapability(capability.id, [evidence]);
    repositories.externalReferences.upsert({
      gameId: game.id,
      provider: 'steam',
      externalId: '12345',
      externalUrl: 'https://store.steampowered.com/app/12345/',
    });
    repositories.currentPlayerCounts.upsert({
      gameId: game.id,
      provider: 'steam',
      playerCount: 0,
      observedAt: '2026-08-14T00:00:00.000Z',
    });
    repositories.currentPlayerCounts.upsert({
      gameId: game.id,
      provider: 'steam',
      playerCount: 12,
      observedAt: '2026-08-14T01:00:00.000Z',
    });
    expect(repositories.currentPlayerCounts.get(game.id, 'steam')?.playerCount).toBe(12);

    repositories.favorites.add(game.id, '2026-08-14T00:00:00.000Z');
    repositories.favorites.add(game.id, '2026-08-14T01:00:00.000Z');
    expect(repositories.favorites.has(game.id)).toBe(true);
    expect(repositories.favorites.list()).toEqual([
      { gameId: game.id, createdAt: '2026-08-14T00:00:00.000Z' },
    ]);
    expect(repositories.favorites.remove(game.id)).toBe(true);
    expect(repositories.favorites.has(game.id)).toBe(false);

    repositories.syncState.upsert({
      providerName: 'steam',
      lastAttemptAt: '2026-08-14T00:00:00.000Z',
      lastSuccessAt: null,
      lastError: 'network unavailable',
      importedCount: 0,
    });
    repositories.syncState.upsert({
      providerName: 'steam',
      lastAttemptAt: '2026-08-14T01:00:00.000Z',
      lastSuccessAt: '2026-08-14T01:00:00.000Z',
      lastError: null,
      importedCount: 1,
    });
    expect(repositories.syncState.get('steam')).toMatchObject({ importedCount: 1 });
    expect(repositories.evidence.listForCapability(capability.id)).toHaveLength(1);
    expect(repositories.externalReferences.get('steam', '12345')?.gameId).toBe(game.id);
    database.close();
  });
});
