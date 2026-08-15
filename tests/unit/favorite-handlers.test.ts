import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import { createFavoriteHandlers } from '../../src/main/ipc/favorite-handlers';
import { createFavoriteGameRequest, createStatusRequest } from '../../src/shared/ipc/contracts';

const directories: string[] = [];
afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
});

function setup() {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-favorite-test-'));
  directories.push(userDataPath);
  const database = openGameScoutDatabase({ userDataPath });
  const game = database.repositories.games.upsert({
    providerGameId: 'favorite-game',
    title: 'Favorite Game',
    normalizedTitle: 'favorite game',
    summary: null,
    releaseDate: null,
    coverUrl: null,
    rating: null,
    ratingCount: null,
    popularity: null,
    providerUpdatedAt: null,
    fetchedAt: '2026-08-14T00:00:00.000Z',
  });
  return { database, game };
}

describe('favorite IPC handlers', () => {
  it('adds idempotently, reports status, lists, and removes safely', () => {
    const { database, game } = setup();
    const handlers = createFavoriteHandlers(
      () => database,
      () => '2026-08-14T01:00:00.000Z',
    );
    const request = createFavoriteGameRequest(game.id);

    expect(handlers.status(request)).toBe(false);
    expect(handlers.add(request)).toEqual({ ok: true, isFavorite: true });
    expect(handlers.add(request)).toEqual({ ok: true, isFavorite: true });
    expect(handlers.status(request)).toBe(true);
    expect(handlers.list(createStatusRequest())).toEqual([
      { gameId: game.id, createdAt: '2026-08-14T01:00:00.000Z' },
    ]);
    expect(handlers.remove(request)).toEqual({ ok: true, isFavorite: false });
    expect(handlers.remove(request)).toEqual({ ok: true, isFavorite: false });
    expect(handlers.list(createStatusRequest())).toEqual([]);
    database.close();
  });

  it('rejects missing games and malformed requests without changing state', () => {
    const { database } = setup();
    const handlers = createFavoriteHandlers(() => database);
    expect(handlers.add(createFavoriteGameRequest(99999))).toEqual({
      ok: false,
      error: 'The game is not in the local catalog.',
    });
    expect(handlers.remove(createFavoriteGameRequest(99999))).toEqual({
      ok: false,
      error: 'The game is not in the local catalog.',
    });
    expect(() => handlers.add(createFavoriteGameRequest(0))).toThrow('ID');
    expect(handlers.list(createStatusRequest())).toEqual([]);
    database.close();
  });

  it('persists favorites after reopening the local database', () => {
    const { database, game } = setup();
    const userDataPath = path.dirname(path.dirname(database.path));
    createFavoriteHandlers(
      () => database,
      () => '2026-08-14T02:00:00.000Z',
    ).add(createFavoriteGameRequest(game.id));
    database.close();
    const reopened = openGameScoutDatabase({ userDataPath });
    expect(reopened.repositories.favorites.has(game.id)).toBe(true);
    expect(reopened.repositories.favorites.list()).toEqual([
      { gameId: game.id, createdAt: '2026-08-14T02:00:00.000Z' },
    ]);
    reopened.close();
  });
});
