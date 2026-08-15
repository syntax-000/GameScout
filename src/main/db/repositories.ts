import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type {
  CapabilityEvidenceInput,
  CapabilityEvidenceRecord,
  CapabilityFeatureRecord,
  CapabilityInput,
  CapabilityRecord,
  CurrentPlayerCountRecord,
  ExternalGameReferenceRecord,
  FavoriteRecord,
  GameInput,
  BrowsePageRecord,
  BrowseOptions,
  BrowseSort,
  GameDetailsRecord,
  MultiplayerFilter,
  GamePlatformInput,
  GamePlatformRecord,
  GameRecord,
  GenreInput,
  GenreRecord,
  PlatformInput,
  PlatformRecord,
  SyncStateInput,
  SyncStateRecord,
} from './models';

const gameColumns = `
  id,
  provider_game_id AS providerGameId,
  title,
  normalized_title AS normalizedTitle,
  summary,
  release_date AS releaseDate,
  cover_url AS coverUrl,
  rating,
  rating_count AS ratingCount,
  popularity,
  provider_updated_at AS providerUpdatedAt,
  fetched_at AS fetchedAt
`;

const gamePlatformColumns = `
  id,
  game_id AS gameId,
  platform_id AS platformId,
  release_date AS releaseDate,
  store_url AS storeUrl,
  edition_name AS editionName,
  data_status AS dataStatus
`;

const capabilityColumns = `
  id,
  game_platform_id AS gamePlatformId,
  capability_type AS capabilityType,
  connection_type AS connectionType,
  support_state AS supportState,
  count_model AS countModel,
  min_players AS minPlayers,
  max_players AS maxPlayers,
  confidence,
  notes
`;

interface BrowseGameRow {
  id: number;
  title: string;
  releaseDate: string | null;
  coverUrl: string | null;
  genresJson: string;
  platformsJson: string;
  capabilitiesJson: string;
  isFavorite: number;
}

export function createDatabaseRepositories(connection: DatabaseSync) {
  return {
    games: createGameRepository(connection),
    genres: createGenreRepository(connection),
    platforms: createPlatformRepository(connection),
    gamePlatforms: createGamePlatformRepository(connection),
    capabilities: createCapabilityRepository(connection),
    evidence: createEvidenceRepository(connection),
    externalReferences: createExternalReferenceRepository(connection),
    currentPlayerCounts: createCurrentPlayerCountRepository(connection),
    favorites: createFavoriteRepository(connection),
    syncState: createSyncStateRepository(connection),
  };
}

function createGameRepository(connection: DatabaseSync) {
  return {
    upsert(input: GameInput): GameRecord {
      return getRequired<GameRecord>(
        connection
          .prepare(
            `INSERT INTO games (
               provider_game_id, title, normalized_title, summary, release_date, cover_url,
               rating, rating_count, popularity, provider_updated_at, fetched_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(provider_game_id) DO UPDATE SET
               title = excluded.title,
               normalized_title = excluded.normalized_title,
               summary = excluded.summary,
               release_date = excluded.release_date,
               cover_url = excluded.cover_url,
               rating = excluded.rating,
               rating_count = excluded.rating_count,
               popularity = excluded.popularity,
               provider_updated_at = excluded.provider_updated_at,
               fetched_at = excluded.fetched_at
             RETURNING ${gameColumns}`,
          )
          .get(...gameValues(input)),
      );
    },
    getById(id: number): GameRecord | null {
      return getOptional<GameRecord>(
        connection.prepare(`SELECT ${gameColumns} FROM games WHERE id = ?`).get(id),
      );
    },
    getByProviderId(providerGameId: string): GameRecord | null {
      return getOptional<GameRecord>(
        connection
          .prepare(`SELECT ${gameColumns} FROM games WHERE provider_game_id = ?`)
          .get(providerGameId),
      );
    },
    getDetails(id: number): GameDetailsRecord | null {
      const game = getOptional<GameRecord>(
        connection.prepare(`SELECT ${gameColumns} FROM games WHERE id = ?`).get(id),
      );
      if (game === null) return null;
      const genres = createGenreRepository(connection)
        .listForGame(id)
        .map((genre) => genre.name);
      const platforms = all<GameDetailsRecord['platforms'][number]>(
        connection
          .prepare(
            `SELECT game_platforms.id, platforms.name, platforms.family,
                    game_platforms.release_date AS releaseDate,
                    game_platforms.store_url AS storeUrl,
                    game_platforms.data_status AS dataStatus
             FROM game_platforms
             JOIN platforms ON platforms.id = game_platforms.platform_id
             WHERE game_platforms.game_id = ?
             ORDER BY platforms.name, game_platforms.id`,
          )
          .all(id)
          .map((platform) => ({
            ...(platform as Omit<GameDetailsRecord['platforms'][number], 'capabilities'>),
            capabilities: [],
          })),
      );
      for (const platform of platforms) {
        const capabilities = createCapabilityRepository(connection).listForGamePlatform(
          platform.id,
        );
        platform.capabilities = capabilities.map((capability) => ({
          ...capability,
          playerCounts: createCapabilityRepository(connection).listPlayerCounts(capability.id),
          features: createCapabilityRepository(connection).listFeatures(capability.id),
          evidence: createEvidenceRepository(connection).listForCapability(capability.id),
        }));
      }
      const steamReference = getOptional<ExternalGameReferenceRecord>(
        connection
          .prepare(
            `SELECT game_id AS gameId, provider, external_id AS externalId,
                    external_url AS externalUrl
             FROM external_game_references
             WHERE game_id = ? AND provider = 'steam'`,
          )
          .get(id),
      );
      const steamObservation = connection
        .prepare(
          `SELECT player_count AS playerCount, observed_at AS observedAt
           FROM current_player_counts WHERE game_id = ? AND provider = 'steam'`,
        )
        .get(id) as { playerCount: number; observedAt: string } | undefined;
      return {
        id: game.id,
        title: game.title,
        summary: game.summary,
        releaseDate: game.releaseDate,
        coverUrl: game.coverUrl,
        genres,
        fetchedAt: game.fetchedAt,
        providerUpdatedAt: game.providerUpdatedAt,
        isFavorite: createFavoriteRepository(connection).has(id),
        platforms,
        steam: steamReference
          ? {
              appId: steamReference.externalId,
              storeUrl: steamReference.externalUrl,
              currentPlayerCount: steamObservation?.playerCount ?? null,
              observedAt: steamObservation?.observedAt ?? null,
            }
          : null,
      };
    },
    list(): GameRecord[] {
      return all<GameRecord>(
        connection.prepare(`SELECT ${gameColumns} FROM games ORDER BY normalized_title, id`).all(),
      );
    },
    browse(options: BrowseOptions): BrowsePageRecord {
      assertBrowseOptions(options);
      const orderBy = browseOrderBy[options.sort];
      const normalizedQuery = normalizeSearchQuery(options.query);
      const searchPattern = `%${escapeLikePattern(normalizedQuery)}%`;
      const predicates: string[] = [];
      const filterParameters: SQLInputValue[] = [];
      if (normalizedQuery !== '') {
        predicates.push(`games.normalized_title LIKE ? ESCAPE '\\'`);
        filterParameters.push(searchPattern);
      }
      if (options.genreId !== null) {
        predicates.push(`EXISTS (
          SELECT 1 FROM game_genres
          WHERE game_genres.game_id = games.id AND game_genres.genre_id = ?
        )`);
        filterParameters.push(options.genreId);
      }
      const capabilityPredicate = createCapabilityPredicate(
        options.multiplayerFilter,
        options.requiredPlayers,
      );
      if (capabilityPredicate !== null) {
        predicates.push(capabilityPredicate.sql);
        filterParameters.push(...capabilityPredicate.parameters);
      }
      const filterWhere = predicates.length === 0 ? '' : `WHERE ${predicates.join(' AND ')}`;
      const total = getRequired<{ totalCount: number }>(
        connection
          .prepare(`SELECT COUNT(*) AS totalCount FROM games ${filterWhere}`)
          .get(...filterParameters),
      );
      const rows = all<BrowseGameRow>(
        connection
          .prepare(
            `SELECT
               games.id,
               games.title,
               games.release_date AS releaseDate,
               games.cover_url AS coverUrl,
               COALESCE((
                 SELECT json_group_array(name)
                 FROM (
                   SELECT genres.name
                   FROM genres
                   JOIN game_genres ON game_genres.genre_id = genres.id
                   WHERE game_genres.game_id = games.id
                   ORDER BY genres.name, genres.id
                 )
               ), '[]') AS genresJson,
               COALESCE((
                 SELECT json_group_array(name)
                 FROM (
                   SELECT DISTINCT platforms.name
                   FROM platforms
                   JOIN game_platforms ON game_platforms.platform_id = platforms.id
                   WHERE game_platforms.game_id = games.id
                   ORDER BY platforms.name
                 )
               ), '[]') AS platformsJson,
               COALESCE((
                 SELECT json_group_array(json_object(
                   'capabilityType', capability_type,
                   'connectionType', connection_type,
                   'splitScreen', split_screen
                 ))
                 FROM (
                   SELECT
                     multiplayer_capabilities.capability_type,
                     multiplayer_capabilities.connection_type,
                     EXISTS(
                       SELECT 1 FROM capability_features
                       WHERE capability_features.capability_id = multiplayer_capabilities.id
                         AND capability_features.feature_type = 'split_screen'
                         AND capability_features.support_state = 'supported'
                     ) AS split_screen
                   FROM multiplayer_capabilities
                   JOIN game_platforms
                     ON game_platforms.id = multiplayer_capabilities.game_platform_id
                   WHERE game_platforms.game_id = games.id
                     AND multiplayer_capabilities.support_state = 'supported'
                   ORDER BY
                     multiplayer_capabilities.connection_type,
                     multiplayer_capabilities.capability_type,
                     multiplayer_capabilities.id
                 )
               ), '[]') AS capabilitiesJson,
               EXISTS(SELECT 1 FROM favorites WHERE favorites.game_id = games.id) AS isFavorite
             FROM games
             ${filterWhere}
             ORDER BY ${orderBy}
             LIMIT ? OFFSET ?`,
          )
          .all(...filterParameters, options.pageSize, options.offset),
      );
      const games = rows.map(toBrowseGameRecord);
      return {
        games,
        totalCount: Number(total.totalCount),
        offset: options.offset,
        pageSize: options.pageSize,
      };
    },
  };
}

function toBrowseGameRecord(row: BrowseGameRow): BrowsePageRecord['games'][number] {
  return {
    id: Number(row.id),
    title: row.title,
    releaseDate: row.releaseDate,
    coverUrl: row.coverUrl,
    genres: parseJsonArray<string>(row.genresJson),
    platforms: parseJsonArray<string>(row.platformsJson),
    capabilities: parseJsonArray<BrowsePageRecord['games'][number]['capabilities'][number]>(
      row.capabilitiesJson,
    ).map((capability) => ({ ...capability, splitScreen: Boolean(capability.splitScreen) })),
    isFavorite: Boolean(row.isFavorite),
  };
}

function parseJsonArray<T>(value: string): T[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Browse metadata is invalid.');
  return parsed as T[];
}

const browseOrderBy: Record<BrowseSort, string> = {
  title_asc: 'games.normalized_title ASC, games.title ASC, games.id ASC',
  release_date_desc:
    'games.release_date IS NULL ASC, games.release_date DESC, games.normalized_title ASC, games.title ASC, games.id ASC',
  rating_desc:
    'games.rating IS NULL ASC, games.rating DESC, games.normalized_title ASC, games.title ASC, games.id ASC',
  popularity_desc:
    'games.popularity IS NULL ASC, games.popularity DESC, games.normalized_title ASC, games.title ASC, games.id ASC',
};

function assertBrowseOptions(options: BrowseOptions): void {
  if (!Number.isSafeInteger(options.offset) || options.offset < 0) {
    throw new RangeError('Browse offset must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 100) {
    throw new RangeError('Browse page size must be between 1 and 100.');
  }
  if (!(options.sort in browseOrderBy)) throw new TypeError('Browse sort is not supported.');
  if (typeof options.query !== 'string' || options.query.length > 200) {
    throw new TypeError('Browse query must be a string of at most 200 characters.');
  }
  if (options.genreId !== null && (!Number.isSafeInteger(options.genreId) || options.genreId < 1)) {
    throw new TypeError('Browse genre must be a positive integer or null.');
  }
  if (!(options.multiplayerFilter in multiplayerPredicates)) {
    throw new TypeError('Browse multiplayer filter is not supported.');
  }
  if (
    options.requiredPlayers !== null &&
    (!Number.isSafeInteger(options.requiredPlayers) ||
      options.requiredPlayers < 1 ||
      options.requiredPlayers > 16)
  ) {
    throw new TypeError('Required players must be an integer from 1 through 16 or null.');
  }
}

function createCapabilityPredicate(
  multiplayerFilter: MultiplayerFilter,
  requiredPlayers: number | null,
): { sql: string; parameters: SQLInputValue[] } | null {
  const modeCondition = multiplayerPredicates[multiplayerFilter];
  if (modeCondition === null && requiredPlayers === null) return null;
  const conditions = [modeCondition].filter((condition): condition is string => condition !== null);
  const parameters: SQLInputValue[] = [];
  if (requiredPlayers !== null) {
    conditions.push(`(
      (filtered_capability.count_model = 'exact_range'
       AND filtered_capability.min_players <= ?
       AND filtered_capability.max_players >= ?)
      OR
      (filtered_capability.count_model = 'discrete_set'
       AND EXISTS (
         SELECT 1 FROM capability_player_counts AS filtered_count
         WHERE filtered_count.capability_id = filtered_capability.id
           AND filtered_count.player_count = ?
       ))
    )`);
    parameters.push(requiredPlayers, requiredPlayers, requiredPlayers);
  }
  return {
    sql: `EXISTS (
  SELECT 1
  FROM multiplayer_capabilities AS filtered_capability
  JOIN game_platforms AS filtered_game_platform
    ON filtered_game_platform.id = filtered_capability.game_platform_id
  WHERE filtered_game_platform.game_id = games.id
    AND filtered_capability.support_state = 'supported'
    AND ${conditions.join('\n    AND ')}
)`,
    parameters,
  };
}

const multiplayerPredicates: Record<MultiplayerFilter, string | null> = {
  any: null,
  single_player: `filtered_capability.capability_type = 'single_player'
     AND filtered_capability.connection_type = 'none'`,
  online_multiplayer: `filtered_capability.connection_type = 'online'
     AND filtered_capability.capability_type IN ('multiplayer_unspecified', 'pvp', 'mixed_coop_pvp')`,
  online_coop: `filtered_capability.connection_type = 'online'
     AND filtered_capability.capability_type IN ('cooperative', 'mixed_coop_pvp')`,
  local_multiplayer: `filtered_capability.connection_type = 'local_device'
     AND filtered_capability.capability_type IN ('multiplayer_unspecified', 'pvp', 'mixed_coop_pvp')`,
  local_coop: `filtered_capability.connection_type = 'local_device'
     AND filtered_capability.capability_type IN ('cooperative', 'mixed_coop_pvp')`,
  lan_coop: `filtered_capability.connection_type = 'lan'
     AND filtered_capability.capability_type IN ('cooperative', 'mixed_coop_pvp')`,
  split_screen: `filtered_capability.connection_type = 'local_device'
     AND EXISTS (
       SELECT 1 FROM capability_features AS filtered_feature
       WHERE filtered_feature.capability_id = filtered_capability.id
         AND filtered_feature.feature_type = 'split_screen'
         AND filtered_feature.support_state = 'supported'
     )`,
};

function normalizeSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function createGenreRepository(connection: DatabaseSync) {
  return {
    upsert(input: GenreInput): GenreRecord {
      return getRequired<GenreRecord>(
        connection
          .prepare(
            `INSERT INTO genres (provider_genre_id, name) VALUES (?, ?)
             ON CONFLICT(provider_genre_id) DO UPDATE SET name = excluded.name
             RETURNING id, provider_genre_id AS providerGenreId, name`,
          )
          .get(input.providerGenreId, input.name),
      );
    },
    list(): GenreRecord[] {
      return all<GenreRecord>(
        connection
          .prepare(
            'SELECT id, provider_genre_id AS providerGenreId, name FROM genres ORDER BY name, id',
          )
          .all(),
      );
    },
    listUsed(): GenreRecord[] {
      return all<GenreRecord>(
        connection
          .prepare(
            `SELECT DISTINCT genres.id, genres.provider_genre_id AS providerGenreId, genres.name
             FROM genres
             JOIN game_genres ON game_genres.genre_id = genres.id
             ORDER BY genres.name, genres.id`,
          )
          .all(),
      );
    },
    replaceForGame(gameId: number, genreIds: readonly number[]): void {
      transaction(connection, () => {
        connection.prepare('DELETE FROM game_genres WHERE game_id = ?').run(gameId);
        const insert = connection.prepare(
          'INSERT INTO game_genres (game_id, genre_id) VALUES (?, ?)',
        );
        for (const genreId of new Set(genreIds)) insert.run(gameId, genreId);
      });
    },
    listForGame(gameId: number): GenreRecord[] {
      return all<GenreRecord>(
        connection
          .prepare(
            `SELECT g.id, g.provider_genre_id AS providerGenreId, g.name
             FROM genres g
             JOIN game_genres gg ON gg.genre_id = g.id
             WHERE gg.game_id = ?
             ORDER BY g.name, g.id`,
          )
          .all(gameId),
      );
    },
  };
}

function createPlatformRepository(connection: DatabaseSync) {
  return {
    upsert(input: PlatformInput): PlatformRecord {
      return getRequired<PlatformRecord>(
        connection
          .prepare(
            `INSERT INTO platforms (provider_platform_id, name, family, generation)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(provider_platform_id) DO UPDATE SET
               name = excluded.name,
               family = excluded.family,
               generation = excluded.generation
             RETURNING id, provider_platform_id AS providerPlatformId, name, family, generation`,
          )
          .get(input.providerPlatformId, input.name, input.family, input.generation),
      );
    },
    list(): PlatformRecord[] {
      return all<PlatformRecord>(
        connection
          .prepare(
            `SELECT id, provider_platform_id AS providerPlatformId, name, family, generation
             FROM platforms ORDER BY name, id`,
          )
          .all(),
      );
    },
  };
}

function createGamePlatformRepository(connection: DatabaseSync) {
  return {
    removeForGame(gameId: number): void {
      connection.prepare('DELETE FROM game_platforms WHERE game_id = ?').run(gameId);
    },
    upsert(input: GamePlatformInput): GamePlatformRecord {
      return getRequired<GamePlatformRecord>(
        connection
          .prepare(
            `INSERT INTO game_platforms (
               game_id, platform_id, release_date, store_url, edition_name, data_status
             ) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT DO UPDATE SET
               release_date = excluded.release_date,
               store_url = excluded.store_url,
               data_status = excluded.data_status
             RETURNING ${gamePlatformColumns}`,
          )
          .get(
            input.gameId,
            input.platformId,
            input.releaseDate,
            input.storeUrl,
            input.editionName,
            input.dataStatus,
          ),
      );
    },
    getById(id: number): GamePlatformRecord | null {
      return getOptional<GamePlatformRecord>(
        connection
          .prepare(`SELECT ${gamePlatformColumns} FROM game_platforms WHERE id = ?`)
          .get(id),
      );
    },
    listForGame(gameId: number): GamePlatformRecord[] {
      return all<GamePlatformRecord>(
        connection
          .prepare(
            `SELECT ${gamePlatformColumns} FROM game_platforms
             WHERE game_id = ? ORDER BY platform_id, COALESCE(edition_name, ''), id`,
          )
          .all(gameId),
      );
    },
  };
}

function createCapabilityRepository(connection: DatabaseSync) {
  return {
    upsert(input: CapabilityInput): CapabilityRecord {
      return getRequired<CapabilityRecord>(
        connection
          .prepare(
            `INSERT INTO multiplayer_capabilities (
               game_platform_id, capability_type, connection_type, support_state,
               count_model, min_players, max_players, confidence, notes
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(game_platform_id, capability_type, connection_type) DO UPDATE SET
               support_state = excluded.support_state,
               count_model = excluded.count_model,
               min_players = excluded.min_players,
               max_players = excluded.max_players,
               confidence = excluded.confidence,
               notes = excluded.notes
             RETURNING ${capabilityColumns}`,
          )
          .get(
            input.gamePlatformId,
            input.capabilityType,
            input.connectionType,
            input.supportState,
            input.countModel,
            input.minPlayers,
            input.maxPlayers,
            input.confidence,
            input.notes,
          ),
      );
    },
    listForGamePlatform(gamePlatformId: number): CapabilityRecord[] {
      return all<CapabilityRecord>(
        connection
          .prepare(
            `SELECT ${capabilityColumns} FROM multiplayer_capabilities
             WHERE game_platform_id = ? ORDER BY capability_type, connection_type, id`,
          )
          .all(gamePlatformId),
      );
    },
    replacePlayerCounts(capabilityId: number, playerCounts: readonly number[]): void {
      transaction(connection, () => {
        connection
          .prepare('DELETE FROM capability_player_counts WHERE capability_id = ?')
          .run(capabilityId);
        const insert = connection.prepare(
          'INSERT INTO capability_player_counts (capability_id, player_count) VALUES (?, ?)',
        );
        for (const playerCount of new Set(playerCounts)) insert.run(capabilityId, playerCount);
      });
    },
    listPlayerCounts(capabilityId: number): number[] {
      return connection
        .prepare(
          `SELECT player_count AS playerCount FROM capability_player_counts
           WHERE capability_id = ? ORDER BY player_count`,
        )
        .all(capabilityId)
        .map((row) => Number((row as { playerCount: number }).playerCount));
    },
    upsertFeature(input: CapabilityFeatureRecord): CapabilityFeatureRecord {
      return getRequired<CapabilityFeatureRecord>(
        connection
          .prepare(
            `INSERT INTO capability_features (capability_id, feature_type, support_state)
             VALUES (?, ?, ?)
             ON CONFLICT(capability_id, feature_type) DO UPDATE SET
               support_state = excluded.support_state
             RETURNING capability_id AS capabilityId, feature_type AS featureType,
               support_state AS supportState`,
          )
          .get(input.capabilityId, input.featureType, input.supportState),
      );
    },
    listFeatures(capabilityId: number): CapabilityFeatureRecord[] {
      return all<CapabilityFeatureRecord>(
        connection
          .prepare(
            `SELECT capability_id AS capabilityId, feature_type AS featureType,
               support_state AS supportState
             FROM capability_features WHERE capability_id = ? ORDER BY feature_type`,
          )
          .all(capabilityId),
      );
    },
  };
}

function createEvidenceRepository(connection: DatabaseSync) {
  const insertEvidence = (input: CapabilityEvidenceInput): CapabilityEvidenceRecord =>
    getRequired<CapabilityEvidenceRecord>(
      connection
        .prepare(
          `INSERT INTO capability_evidence (
             capability_id, provider, external_record_id, observed_at,
             source_field, confidence, notes
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING id, capability_id AS capabilityId, provider,
             external_record_id AS externalRecordId, observed_at AS observedAt,
             source_field AS sourceField, confidence, notes`,
        )
        .get(
          input.capabilityId,
          input.provider,
          input.externalRecordId,
          input.observedAt,
          input.sourceField,
          input.confidence,
          input.notes,
        ),
    );
  return {
    insert(input: CapabilityEvidenceInput): CapabilityEvidenceRecord {
      return insertEvidence(input);
    },
    replaceForCapability(
      capabilityId: number,
      inputs: readonly Omit<CapabilityEvidenceInput, 'capabilityId'>[],
    ): CapabilityEvidenceRecord[] {
      const records: CapabilityEvidenceRecord[] = [];
      transaction(connection, () => {
        connection
          .prepare('DELETE FROM capability_evidence WHERE capability_id = ?')
          .run(capabilityId);
        for (const input of inputs) {
          records.push(
            insertEvidence({
              capabilityId,
              ...input,
            }),
          );
        }
      });
      return records;
    },
    listForCapability(capabilityId: number): CapabilityEvidenceRecord[] {
      return all<CapabilityEvidenceRecord>(
        connection
          .prepare(
            `SELECT id, capability_id AS capabilityId, provider,
               external_record_id AS externalRecordId, observed_at AS observedAt,
               source_field AS sourceField, confidence, notes
             FROM capability_evidence WHERE capability_id = ? ORDER BY id`,
          )
          .all(capabilityId),
      );
    },
  };
}

function createExternalReferenceRepository(connection: DatabaseSync) {
  return {
    removeForGame(gameId: number): void {
      connection.prepare('DELETE FROM external_game_references WHERE game_id = ?').run(gameId);
    },
    upsert(input: ExternalGameReferenceRecord): ExternalGameReferenceRecord {
      return getRequired<ExternalGameReferenceRecord>(
        connection
          .prepare(
            `INSERT INTO external_game_references (game_id, provider, external_id, external_url)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(provider, external_id) DO UPDATE SET
               game_id = excluded.game_id,
               external_url = excluded.external_url
             RETURNING game_id AS gameId, provider, external_id AS externalId,
               external_url AS externalUrl`,
          )
          .get(input.gameId, input.provider, input.externalId, input.externalUrl),
      );
    },
    get(provider: string, externalId: string): ExternalGameReferenceRecord | null {
      return getOptional<ExternalGameReferenceRecord>(
        connection
          .prepare(
            `SELECT game_id AS gameId, provider, external_id AS externalId,
               external_url AS externalUrl
             FROM external_game_references WHERE provider = ? AND external_id = ?`,
          )
          .get(provider, externalId),
      );
    },
    listForGame(gameId: number): ExternalGameReferenceRecord[] {
      return all<ExternalGameReferenceRecord>(
        connection
          .prepare(
            `SELECT game_id AS gameId, provider, external_id AS externalId,
               external_url AS externalUrl
             FROM external_game_references WHERE game_id = ? ORDER BY provider, external_id`,
          )
          .all(gameId),
      );
    },
  };
}

function createCurrentPlayerCountRepository(connection: DatabaseSync) {
  return {
    upsert(input: CurrentPlayerCountRecord): CurrentPlayerCountRecord {
      return getRequired<CurrentPlayerCountRecord>(
        connection
          .prepare(
            `INSERT INTO current_player_counts (game_id, provider, player_count, observed_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(game_id, provider) DO UPDATE SET
               player_count = excluded.player_count,
               observed_at = excluded.observed_at
             RETURNING game_id AS gameId, provider, player_count AS playerCount,
               observed_at AS observedAt`,
          )
          .get(input.gameId, input.provider, input.playerCount, input.observedAt),
      );
    },
    get(gameId: number, provider: string): CurrentPlayerCountRecord | null {
      return getOptional<CurrentPlayerCountRecord>(
        connection
          .prepare(
            `SELECT game_id AS gameId, provider, player_count AS playerCount,
               observed_at AS observedAt
             FROM current_player_counts WHERE game_id = ? AND provider = ?`,
          )
          .get(gameId, provider),
      );
    },
    getLatestObservedAt(provider: string): string | null {
      const row = connection
        .prepare(
          `SELECT MAX(observed_at) AS observedAt
           FROM current_player_counts WHERE provider = ?`,
        )
        .get(provider) as unknown as { observedAt: string | null };
      return row.observedAt;
    },
  };
}

function createFavoriteRepository(connection: DatabaseSync) {
  return {
    add(gameId: number, createdAt: string): FavoriteRecord {
      return getRequired<FavoriteRecord>(
        connection
          .prepare(
            `INSERT INTO favorites (game_id, created_at) VALUES (?, ?)
             ON CONFLICT(game_id) DO UPDATE SET created_at = favorites.created_at
             RETURNING game_id AS gameId, created_at AS createdAt`,
          )
          .get(gameId, createdAt),
      );
    },
    remove(gameId: number): boolean {
      return connection.prepare('DELETE FROM favorites WHERE game_id = ?').run(gameId).changes > 0;
    },
    has(gameId: number): boolean {
      return (
        connection.prepare('SELECT 1 FROM favorites WHERE game_id = ?').get(gameId) !== undefined
      );
    },
    list(): FavoriteRecord[] {
      return all<FavoriteRecord>(
        connection
          .prepare(
            `SELECT game_id AS gameId, created_at AS createdAt
             FROM favorites ORDER BY created_at DESC, game_id`,
          )
          .all(),
      );
    },
  };
}

function createSyncStateRepository(connection: DatabaseSync) {
  const columns = `
    id,
    provider_name AS providerName,
    last_attempt_at AS lastAttemptAt,
    last_success_at AS lastSuccessAt,
    last_error AS lastError,
    imported_count AS importedCount
  `;
  return {
    upsert(input: SyncStateInput): SyncStateRecord {
      return getRequired<SyncStateRecord>(
        connection
          .prepare(
            `INSERT INTO sync_state (
               provider_name, last_attempt_at, last_success_at, last_error, imported_count
             ) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(provider_name) DO UPDATE SET
               last_attempt_at = excluded.last_attempt_at,
               last_success_at = excluded.last_success_at,
               last_error = excluded.last_error,
               imported_count = excluded.imported_count
             RETURNING ${columns}`,
          )
          .get(
            input.providerName,
            input.lastAttemptAt,
            input.lastSuccessAt,
            input.lastError,
            input.importedCount,
          ),
      );
    },
    get(providerName: string): SyncStateRecord | null {
      return getOptional<SyncStateRecord>(
        connection
          .prepare(`SELECT ${columns} FROM sync_state WHERE provider_name = ?`)
          .get(providerName),
      );
    },
    list(): SyncStateRecord[] {
      return all<SyncStateRecord>(
        connection.prepare(`SELECT ${columns} FROM sync_state ORDER BY provider_name`).all(),
      );
    },
  };
}

function gameValues(input: GameInput): SQLInputValue[] {
  return [
    input.providerGameId,
    input.title,
    input.normalizedTitle,
    input.summary,
    input.releaseDate,
    input.coverUrl,
    input.rating,
    input.ratingCount,
    input.popularity,
    input.providerUpdatedAt,
    input.fetchedAt,
  ];
}

function transaction(connection: DatabaseSync, operation: () => void): void {
  connection.exec('SAVEPOINT gamescout_repository_operation;');
  try {
    operation();
    connection.exec('RELEASE SAVEPOINT gamescout_repository_operation;');
  } catch (error) {
    connection.exec('ROLLBACK TO SAVEPOINT gamescout_repository_operation;');
    connection.exec('RELEASE SAVEPOINT gamescout_repository_operation;');
    throw error;
  }
}

function getRequired<T>(row: unknown): T {
  if (row === undefined) throw new Error('Database operation did not return a record.');
  return row as T;
}

function getOptional<T>(row: unknown): T | null {
  return row === undefined ? null : (row as T);
}

function all<T>(rows: unknown[]): T[] {
  return rows as T[];
}

export type DatabaseRepositories = ReturnType<typeof createDatabaseRepositories>;
