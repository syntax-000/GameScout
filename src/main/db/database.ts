import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DatabaseHealth } from '../../shared/ipc/contracts';
import type { DatabaseMigration } from './migrations';
import { databaseMigrations } from './migrations';
import { createDatabaseRepositories, type DatabaseRepositories } from './repositories';
import { createDatabaseTransaction } from './transaction';

const databaseFilename = 'gamescout.sqlite3';

interface MigrationRow {
  version: number;
}

export interface OpenDatabaseOptions {
  userDataPath: string;
  migrations?: readonly DatabaseMigration[];
}

export interface GameScoutDatabase {
  connection: DatabaseSync;
  path: string;
  schemaVersion: number;
  repositories: DatabaseRepositories;
  transaction: (operation: () => void) => void;
  close: () => void;
}

export function getDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, 'database', databaseFilename);
}

export function openGameScoutDatabase({
  userDataPath,
  migrations = databaseMigrations,
}: OpenDatabaseOptions): GameScoutDatabase {
  const databasePath = getDatabasePath(userDataPath);
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const connection = new DatabaseSync(databasePath);
  try {
    connection.exec('PRAGMA foreign_keys = ON;');
    connection.exec('PRAGMA journal_mode = WAL;');
    connection.exec(`
      CREATE TABLE IF NOT EXISTS _gamescout_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);

    applyMigrations(connection, migrations);
    const schemaVersion = getSchemaVersion(connection);

    return {
      connection,
      path: databasePath,
      schemaVersion,
      repositories: createDatabaseRepositories(connection),
      transaction: (operation) => createDatabaseTransaction(connection, operation),
      close: () => connection.close(),
    };
  } catch (error) {
    connection.close();
    throw error;
  }
}

export function applyMigrations(
  connection: DatabaseSync,
  migrations: readonly DatabaseMigration[],
): void {
  validateMigrationSequence(migrations);
  const currentVersion = getSchemaVersion(connection);
  const latestVersion = migrations.at(-1)?.version ?? 0;
  if (currentVersion > latestVersion) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${latestVersion}.`,
    );
  }
  const pending = migrations.filter(({ version }) => version > currentVersion);
  const insertMigration = connection.prepare(`
    INSERT INTO _gamescout_migrations (version, name, applied_at)
    VALUES (?, ?, ?)
  `);

  for (const migration of pending) {
    connection.exec('BEGIN IMMEDIATE;');
    try {
      connection.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, new Date().toISOString());
      connection.exec('COMMIT;');
    } catch (error) {
      connection.exec('ROLLBACK;');
      throw new Error(`Database migration ${migration.version} (${migration.name}) failed.`, {
        cause: error,
      });
    }
  }
}

export function getSchemaVersion(connection: DatabaseSync): number {
  const row = connection
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM _gamescout_migrations')
    .get() as unknown as MigrationRow;
  return Number(row.version);
}

export function areForeignKeysEnabled(connection: DatabaseSync): boolean {
  const row = connection.prepare('PRAGMA foreign_keys').get() as unknown as {
    foreign_keys: number;
  };
  return row.foreign_keys === 1;
}

export function toDatabaseHealth(
  database: GameScoutDatabase,
): Extract<DatabaseHealth, { state: 'ready' }> {
  return {
    state: 'ready',
    schemaVersion: database.schemaVersion,
    foreignKeysEnabled: areForeignKeysEnabled(database.connection),
  };
}

export function toDatabaseErrorHealth(error: unknown): Extract<DatabaseHealth, { state: 'error' }> {
  return {
    state: 'error',
    schemaVersion: null,
    foreignKeysEnabled: false,
    error: error instanceof Error ? error.message : 'Database initialization failed.',
  };
}

function validateMigrationSequence(migrations: readonly DatabaseMigration[]): void {
  let expectedVersion = 1;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version !== expectedVersion) {
      throw new Error('Database migrations must use contiguous positive versions starting at 1.');
    }
    if (!migration.name.trim() || !migration.sql.trim()) {
      throw new Error(`Database migration ${migration.version} is incomplete.`);
    }
    expectedVersion += 1;
  }
}
