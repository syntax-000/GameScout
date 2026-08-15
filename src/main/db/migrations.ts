export interface DatabaseMigration {
  version: number;
  name: string;
  sql: string;
}

export const databaseMigrations: readonly DatabaseMigration[] = [
  {
    version: 1,
    name: 'initialize_database_metadata',
    sql: `
      CREATE TABLE _gamescout_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      ) STRICT;

      INSERT INTO _gamescout_metadata (key, value)
      VALUES ('database_format', 'gamescout-v0.1');
    `,
  },
  {
    version: 2,
    name: 'create_v0_1_domain_schema',
    sql: `
      CREATE TABLE games (
        id INTEGER PRIMARY KEY,
        provider_game_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        summary TEXT,
        release_date TEXT,
        cover_url TEXT,
        rating REAL,
        rating_count INTEGER CHECK (rating_count IS NULL OR rating_count >= 0),
        popularity REAL,
        provider_updated_at TEXT,
        fetched_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE genres (
        id INTEGER PRIMARY KEY,
        provider_genre_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      ) STRICT;

      CREATE TABLE game_genres (
        game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
        PRIMARY KEY (game_id, genre_id)
      ) STRICT;

      CREATE TABLE platforms (
        id INTEGER PRIMARY KEY,
        provider_platform_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        family TEXT,
        generation TEXT
      ) STRICT;

      CREATE TABLE game_platforms (
        id INTEGER PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        platform_id INTEGER NOT NULL REFERENCES platforms(id),
        release_date TEXT,
        store_url TEXT,
        edition_name TEXT,
        data_status TEXT NOT NULL CHECK (data_status IN ('complete', 'partial', 'unknown'))
      ) STRICT;

      CREATE UNIQUE INDEX game_platforms_identity_idx
        ON game_platforms (game_id, platform_id, COALESCE(edition_name, ''));

      CREATE TABLE multiplayer_capabilities (
        id INTEGER PRIMARY KEY,
        game_platform_id INTEGER NOT NULL REFERENCES game_platforms(id) ON DELETE CASCADE,
        capability_type TEXT NOT NULL CHECK (
          capability_type IN (
            'single_player',
            'multiplayer_unspecified',
            'cooperative',
            'pvp',
            'mixed_coop_pvp'
          )
        ),
        connection_type TEXT NOT NULL CHECK (
          connection_type IN ('none', 'local_device', 'lan', 'online')
        ),
        support_state TEXT NOT NULL CHECK (
          support_state IN ('supported', 'unsupported', 'unknown')
        ),
        count_model TEXT NOT NULL CHECK (
          count_model IN ('exact_range', 'discrete_set', 'maximum_only', 'unknown')
        ),
        min_players INTEGER CHECK (min_players IS NULL OR min_players > 0),
        max_players INTEGER CHECK (max_players IS NULL OR max_players > 0),
        confidence TEXT NOT NULL CHECK (confidence IN ('verified', 'high', 'medium', 'low')),
        notes TEXT,
        UNIQUE (game_platform_id, capability_type, connection_type),
        CHECK (min_players IS NULL OR max_players IS NULL OR min_players <= max_players),
        CHECK (
          (count_model = 'exact_range' AND min_players IS NOT NULL AND max_players IS NOT NULL)
          OR (count_model = 'maximum_only' AND min_players IS NULL AND max_players IS NOT NULL)
          OR (count_model IN ('discrete_set', 'unknown') AND min_players IS NULL AND max_players IS NULL)
        )
      ) STRICT;

      CREATE TABLE capability_player_counts (
        capability_id INTEGER NOT NULL REFERENCES multiplayer_capabilities(id) ON DELETE CASCADE,
        player_count INTEGER NOT NULL CHECK (player_count > 0),
        PRIMARY KEY (capability_id, player_count)
      ) STRICT;

      CREATE TABLE capability_features (
        capability_id INTEGER NOT NULL REFERENCES multiplayer_capabilities(id) ON DELETE CASCADE,
        feature_type TEXT NOT NULL CHECK (
          feature_type IN ('split_screen', 'shared_screen', 'hot_seat')
        ),
        support_state TEXT NOT NULL CHECK (
          support_state IN ('supported', 'unsupported', 'unknown')
        ),
        PRIMARY KEY (capability_id, feature_type)
      ) STRICT;

      CREATE TABLE external_game_references (
        game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        external_url TEXT,
        PRIMARY KEY (game_id, provider, external_id),
        UNIQUE (provider, external_id)
      ) STRICT;

      CREATE TABLE current_player_counts (
        game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        player_count INTEGER NOT NULL CHECK (player_count >= 0),
        observed_at TEXT NOT NULL,
        PRIMARY KEY (game_id, provider)
      ) STRICT;

      CREATE TABLE capability_evidence (
        id INTEGER PRIMARY KEY,
        capability_id INTEGER NOT NULL REFERENCES multiplayer_capabilities(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_record_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        source_field TEXT,
        confidence TEXT NOT NULL CHECK (confidence IN ('verified', 'high', 'medium', 'low')),
        notes TEXT
      ) STRICT;

      CREATE TABLE favorites (
        game_id INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sync_state (
        id INTEGER PRIMARY KEY,
        provider_name TEXT NOT NULL UNIQUE,
        last_attempt_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        imported_count INTEGER CHECK (imported_count IS NULL OR imported_count >= 0)
      ) STRICT;

      CREATE INDEX games_normalized_title_idx ON games (normalized_title);
      CREATE INDEX games_release_date_idx ON games (release_date);
      CREATE INDEX games_popularity_idx ON games (popularity);
      CREATE INDEX game_genres_genre_id_idx ON game_genres (genre_id, game_id);
      CREATE INDEX game_platforms_platform_id_idx ON game_platforms (platform_id, game_id);
      CREATE INDEX multiplayer_capabilities_lookup_idx ON multiplayer_capabilities (
        capability_type,
        connection_type,
        support_state,
        max_players,
        game_platform_id
      );
      CREATE INDEX capability_features_lookup_idx ON capability_features (
        feature_type,
        support_state,
        capability_id
      );
      CREATE INDEX external_game_references_game_id_idx ON external_game_references (game_id);
      CREATE INDEX current_player_counts_provider_idx ON current_player_counts (provider);
      CREATE INDEX capability_evidence_capability_id_idx ON capability_evidence (capability_id);
    `,
  },
];
