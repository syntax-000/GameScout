import type { DatabaseSync } from 'node:sqlite';

export function createDatabaseTransaction(connection: DatabaseSync, operation: () => void): void {
  connection.exec('BEGIN IMMEDIATE;');
  try {
    operation();
    connection.exec('COMMIT;');
  } catch (error) {
    connection.exec('ROLLBACK;');
    throw error;
  }
}
