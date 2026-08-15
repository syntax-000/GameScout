import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase, type GameScoutDatabase } from '../../src/main/db/database';

let database: GameScoutDatabase;
let userDataPath: string;

beforeEach(() => {
  userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-schema-test-'));
  database = openGameScoutDatabase({ userDataPath });
});

afterEach(() => {
  database.close();
  if (userDataPath.startsWith(tmpdir())) rmSync(userDataPath, { recursive: true, force: true });
});

describe('V0.1 database schema', () => {
  it('creates every authoritative table and required lookup index', () => {
    const tableNames = database.connection
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tableNames).toEqual([
      '_gamescout_metadata',
      '_gamescout_migrations',
      'capability_evidence',
      'capability_features',
      'capability_player_counts',
      'current_player_counts',
      'external_game_references',
      'favorites',
      'game_genres',
      'game_platforms',
      'games',
      'genres',
      'multiplayer_capabilities',
      'platforms',
      'sync_state',
    ]);

    const indexNames = database.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'games_normalized_title_idx',
        'games_release_date_idx',
        'games_popularity_idx',
        'game_genres_genre_id_idx',
        'game_platforms_identity_idx',
        'multiplayer_capabilities_lookup_idx',
        'capability_features_lookup_idx',
      ]),
    );
  });

  it('accepts a complete canonical game-platform capability graph', () => {
    insertBaseRecords(database.connection);

    database.connection
      .prepare(
        `INSERT INTO capability_player_counts (capability_id, player_count)
         VALUES (1, 2), (1, 4)`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO capability_features (capability_id, feature_type, support_state)
         VALUES (1, 'split_screen', 'supported')`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO external_game_references (game_id, provider, external_id, external_url)
         VALUES (1, 'steam', '12345', 'https://store.steampowered.com/app/12345/')`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO current_player_counts (game_id, provider, player_count, observed_at)
         VALUES (1, 'steam', 0, '2026-08-14T00:00:00.000Z')`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO capability_evidence (
           id, capability_id, provider, external_record_id, observed_at, source_field, confidence
         ) VALUES (1, 1, 'steam', 'Example_Game', '2026-08-14T00:00:00.000Z', 'Multiplayer', 'verified')`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO favorites (game_id, created_at)
         VALUES (1, '2026-08-14T00:00:00.000Z')`,
      )
      .run();
    database.connection
      .prepare(
        `INSERT INTO sync_state (provider_name, last_success_at, imported_count)
         VALUES ('steam', '2026-08-14T00:00:00.000Z', 1)`,
      )
      .run();

    expect(database.connection.prepare('SELECT COUNT(*) AS count FROM games').get()).toEqual({
      count: 1,
    });
    expect(
      database.connection.prepare('SELECT player_count FROM current_player_counts').get(),
    ).toEqual({ player_count: 0 });
  });

  it('enforces provider, relationship, and capability uniqueness', () => {
    insertBaseRecords(database.connection);

    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO games (provider_game_id, title, normalized_title, fetched_at)
           VALUES ('example-game', 'Duplicate', 'duplicate', '2026-08-14T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow();
    expect(() =>
      database.connection
        .prepare('INSERT INTO game_genres (game_id, genre_id) VALUES (1, 1)')
        .run(),
    ).toThrow();
    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO game_platforms (game_id, platform_id, edition_name, data_status)
           VALUES (1, 1, '', 'partial')`,
        )
        .run(),
    ).toThrow();
    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO multiplayer_capabilities (
             game_platform_id, capability_type, connection_type, support_state,
             count_model, confidence
           ) VALUES (1, 'cooperative', 'online', 'unknown', 'unknown', 'low')`,
        )
        .run(),
    ).toThrow();
  });

  it('enforces foreign keys, tri-state values, and player-count rules', () => {
    expect(() =>
      database.connection
        .prepare('INSERT INTO favorites (game_id, created_at) VALUES (999, ?)')
        .run('2026-08-14T00:00:00.000Z'),
    ).toThrow();

    insertBaseRecords(database.connection);

    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO capability_features (capability_id, feature_type, support_state)
           VALUES (1, 'split_screen', 'maybe')`,
        )
        .run(),
    ).toThrow();
    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO multiplayer_capabilities (
             game_platform_id, capability_type, connection_type, support_state,
             count_model, min_players, max_players, confidence
           ) VALUES (1, 'pvp', 'lan', 'supported', 'exact_range', 8, 4, 'verified')`,
        )
        .run(),
    ).toThrow();
    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO current_player_counts (game_id, provider, player_count, observed_at)
           VALUES (1, 'steam', -1, '2026-08-14T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow();
  });
});

function insertBaseRecords(connection: DatabaseSync): void {
  connection
    .prepare(
      `INSERT INTO games (
         id, provider_game_id, title, normalized_title, release_date, fetched_at
       ) VALUES (1, 'example-game', 'Example Game', 'example game', '2025-01-01', '2026-08-14T00:00:00.000Z')`,
    )
    .run();
  connection
    .prepare("INSERT INTO genres (id, provider_genre_id, name) VALUES (1, 'action', 'Action')")
    .run();
  connection.prepare('INSERT INTO game_genres (game_id, genre_id) VALUES (1, 1)').run();
  connection
    .prepare(
      "INSERT INTO platforms (id, provider_platform_id, name, family) VALUES (1, 'windows', 'Windows', 'PC')",
    )
    .run();
  connection
    .prepare(
      `INSERT INTO game_platforms (id, game_id, platform_id, data_status)
       VALUES (1, 1, 1, 'complete')`,
    )
    .run();
  connection
    .prepare(
      `INSERT INTO multiplayer_capabilities (
         id, game_platform_id, capability_type, connection_type, support_state,
         count_model, confidence
       ) VALUES (1, 1, 'cooperative', 'online', 'supported', 'discrete_set', 'verified')`,
    )
    .run();
}
