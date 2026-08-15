import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  areForeignKeysEnabled,
  getDatabasePath,
  openGameScoutDatabase,
  toDatabaseErrorHealth,
  toDatabaseHealth,
} from '../../src/main/db/database';
import type { DatabaseMigration } from '../../src/main/db/migrations';

const temporaryDirectories: string[] = [];

function createUserDataDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'gamescout-db-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory?.startsWith(tmpdir())) rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite initialization and migrations', () => {
  it('creates the database in app data, records the schema version, and reopens safely', () => {
    const userDataPath = createUserDataDirectory();
    const first = openGameScoutDatabase({ userDataPath });

    expect(first.path).toBe(getDatabasePath(userDataPath));
    expect(first.schemaVersion).toBe(2);
    expect(areForeignKeysEnabled(first.connection)).toBe(true);
    expect(
      first.connection
        .prepare("SELECT value FROM _gamescout_metadata WHERE key = 'database_format'")
        .get(),
    ).toEqual({ value: 'gamescout-v0.1' });
    expect(toDatabaseHealth(first)).toEqual({
      state: 'ready',
      schemaVersion: 2,
      foreignKeysEnabled: true,
    });
    first.close();

    const reopened = openGameScoutDatabase({ userDataPath });
    expect(reopened.schemaVersion).toBe(2);
    expect(
      reopened.connection.prepare('SELECT COUNT(*) AS count FROM _gamescout_migrations').get(),
    ).toEqual({ count: 2 });
    reopened.close();
  });

  it('enforces foreign keys for every opened connection', () => {
    const userDataPath = createUserDataDirectory();
    const migrations: DatabaseMigration[] = [
      {
        version: 1,
        name: 'foreign_key_test',
        sql: `
          CREATE TABLE parents (id INTEGER PRIMARY KEY) STRICT;
          CREATE TABLE children (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER NOT NULL REFERENCES parents(id)
          ) STRICT;
        `,
      },
    ];
    const database = openGameScoutDatabase({ userDataPath, migrations });

    expect(() =>
      database.connection.prepare('INSERT INTO children (id, parent_id) VALUES (1, 999)').run(),
    ).toThrow();
    database.close();
  });

  it('rolls back a failed migration and can recover on the next open', () => {
    const userDataPath = createUserDataDirectory();
    const failedMigrations: DatabaseMigration[] = [
      {
        version: 1,
        name: 'broken_migration',
        sql: `
          CREATE TABLE should_be_rolled_back (id INTEGER PRIMARY KEY) STRICT;
          INSERT INTO missing_table (id) VALUES (1);
        `,
      },
    ];

    expect(() => openGameScoutDatabase({ userDataPath, migrations: failedMigrations })).toThrow(
      'Database migration 1 (broken_migration) failed.',
    );

    const inspection = new DatabaseSync(getDatabasePath(userDataPath));
    expect(
      inspection
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'should_be_rolled_back'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(inspection.prepare('SELECT COUNT(*) AS count FROM _gamescout_migrations').get()).toEqual(
      { count: 0 },
    );
    inspection.close();

    const recovered = openGameScoutDatabase({ userDataPath });
    expect(recovered.schemaVersion).toBe(2);
    recovered.close();
  });

  it('rejects invalid migration ordering and exposes controlled error health', () => {
    const userDataPath = createUserDataDirectory();
    const invalidMigrations: DatabaseMigration[] = [
      { version: 2, name: 'skipped_version', sql: 'SELECT 1;' },
    ];

    let capturedError: unknown;
    try {
      openGameScoutDatabase({ userDataPath, migrations: invalidMigrations });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(Error);
    expect(toDatabaseErrorHealth(capturedError)).toEqual({
      state: 'error',
      schemaVersion: null,
      foreignKeysEnabled: false,
      error: 'Database migrations must use contiguous positive versions starting at 1.',
    });
  });
});
