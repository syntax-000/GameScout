import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import type {
  CapabilityType,
  ConnectionType,
  CountModel,
  SupportState,
} from '../../src/main/db/models';

const directories: string[] = [];
afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe('multiplayer query behavior', () => {
  it('protects six-player matching, the four-player counterexample, and count-model rules', () => {
    const fixture = setup();
    fixture.addCapability('Six Player Co-op', {
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'exact_range',
      minPlayers: 2,
      maxPlayers: 6,
    });
    fixture.addCapability('Four Player Co-op', {
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'exact_range',
      minPlayers: 2,
      maxPlayers: 4,
    });
    fixture.addCapability('Discrete Two or Six', {
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'discrete_set',
      playerCounts: [2, 6],
    });
    fixture.addCapability('Maximum Eight Only', {
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'maximum_only',
      maxPlayers: 8,
    });
    fixture.addCapability('Unknown Capacity', {
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'unknown',
    });

    expect(fixture.titlesFor('online_coop', 6)).toEqual([
      'Discrete Two or Six',
      'Six Player Co-op',
    ]);
    expect(fixture.titlesFor('online_coop', 4)).toEqual(['Four Player Co-op', 'Six Player Co-op']);
    expect(fixture.titlesFor('online_coop', 5)).toEqual(['Six Player Co-op']);
    fixture.close();
  });

  it('keeps platform capabilities isolated instead of combining interaction and capacity', () => {
    const fixture = setup();
    const gameId = fixture.addCapability('Isolated Platform Claims', {
      platformKey: 'windows-record-a',
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'exact_range',
      minPlayers: 2,
      maxPlayers: 4,
    });
    fixture.addCapability('Isolated Platform Claims', {
      gameId,
      platformKey: 'windows-record-b',
      capabilityType: 'multiplayer_unspecified',
      connectionType: 'online',
      countModel: 'exact_range',
      minPlayers: 2,
      maxPlayers: 8,
    });

    expect(fixture.titlesFor('online_coop', 6)).toEqual([]);
    expect(fixture.titlesFor('online_multiplayer', 6)).toEqual(['Isolated Platform Claims']);
    const details = fixture.repositories.games.getDetails(gameId)!;
    expect(details.platforms).toHaveLength(2);
    expect(details.platforms.map((platform) => platform.capabilities[0]?.capabilityType)).toEqual([
      'cooperative',
      'multiplayer_unspecified',
    ]);
    fixture.close();
  });

  it('requires supported capability evidence and never uses Steam activity as capacity', () => {
    const fixture = setup();
    fixture.addCapability('Supported Six', {
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'exact_range',
      minPlayers: 2,
      maxPlayers: 6,
      supportState: 'supported',
    });
    fixture.addCapability('Unknown Six', {
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'exact_range',
      minPlayers: 2,
      maxPlayers: 6,
      supportState: 'unknown',
    });
    fixture.addCapability('Unsupported Six', {
      capabilityType: 'cooperative',
      connectionType: 'online',
      countModel: 'exact_range',
      minPlayers: 2,
      maxPlayers: 6,
      supportState: 'unsupported',
    });
    const activityOnly = fixture.addGame('Steam Activity Only');
    fixture.repositories.currentPlayerCounts.upsert({
      gameId: activityOnly,
      provider: 'steam',
      playerCount: 50_000,
      observedAt: '2026-08-14T01:00:00.000Z',
    });

    expect(fixture.titlesFor('online_coop', 6)).toEqual(['Supported Six']);
    expect(fixture.titlesFor('any', 6)).toEqual(['Supported Six']);
    expect(fixture.repositories.games.getDetails(activityOnly)?.steam).toBeNull();
    fixture.close();
  });
});

interface CapabilityOptions {
  gameId?: number;
  platformKey?: string;
  capabilityType: CapabilityType;
  connectionType: ConnectionType;
  supportState?: SupportState;
  countModel: CountModel;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  playerCounts?: number[];
}

function setup() {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-behavior-test-'));
  directories.push(userDataPath);
  const database = openGameScoutDatabase({ userDataPath });
  const { repositories } = database;

  const addGame = (title: string): number =>
    repositories.games.upsert({
      providerGameId: `behavior-${title}`,
      title,
      normalizedTitle: title.toLocaleLowerCase(),
      summary: null,
      releaseDate: null,
      coverUrl: null,
      rating: null,
      ratingCount: null,
      popularity: null,
      providerUpdatedAt: null,
      fetchedAt: '2026-08-14T00:00:00.000Z',
    }).id;

  const addCapability = (title: string, options: CapabilityOptions): number => {
    const gameId = options.gameId ?? addGame(title);
    const platformKey = options.platformKey ?? 'windows';
    const platform = repositories.platforms.upsert({
      providerPlatformId: platformKey,
      name: platformKey === 'windows' ? 'Windows' : platformKey,
      family: 'PC',
      generation: null,
    });
    const gamePlatform = repositories.gamePlatforms.upsert({
      gameId,
      platformId: platform.id,
      releaseDate: null,
      storeUrl: null,
      editionName: null,
      dataStatus: 'complete',
    });
    const capability = repositories.capabilities.upsert({
      gamePlatformId: gamePlatform.id,
      capabilityType: options.capabilityType,
      connectionType: options.connectionType,
      supportState: options.supportState ?? 'supported',
      countModel: options.countModel,
      minPlayers: options.minPlayers ?? null,
      maxPlayers: options.maxPlayers ?? null,
      confidence: options.supportState === 'unknown' ? 'low' : 'verified',
      notes: null,
    });
    repositories.capabilities.replacePlayerCounts(capability.id, options.playerCounts ?? []);
    return gameId;
  };

  const titlesFor = (
    multiplayerFilter: Parameters<typeof repositories.games.browse>[0]['multiplayerFilter'],
    requiredPlayers: number,
  ): string[] =>
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

  return {
    repositories,
    addGame,
    addCapability,
    titlesFor,
    close: () => database.close(),
  };
}
