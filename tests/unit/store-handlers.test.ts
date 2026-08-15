import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openGameScoutDatabase } from '../../src/main/db/database';
import { createSteamStoreUrl, createStoreHandlers } from '../../src/main/ipc/store-handlers';
import { createOpenGameStoreRequest } from '../../src/shared/ipc/contracts';

const directories: string[] = [];
afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true });
});

function setup(storeUrl: string | null = 'https://store.steampowered.com/app/12345/') {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-store-test-'));
  directories.push(userDataPath);
  const database = openGameScoutDatabase({ userDataPath });
  const game = database.repositories.games.upsert({
    providerGameId: 'store-game',
    title: 'Store Game',
    normalizedTitle: 'store game',
    summary: null,
    releaseDate: null,
    coverUrl: null,
    rating: null,
    ratingCount: null,
    popularity: null,
    providerUpdatedAt: null,
    fetchedAt: '2026-08-14T00:00:00.000Z',
  });
  const windows = database.repositories.platforms.upsert({
    providerPlatformId: 'windows',
    name: 'Windows',
    family: 'PC',
    generation: null,
  });
  const platform = database.repositories.gamePlatforms.upsert({
    gameId: game.id,
    platformId: windows.id,
    releaseDate: null,
    storeUrl,
    editionName: null,
    dataStatus: 'complete',
  });
  return { database, game, platform };
}

describe('safe store handlers', () => {
  it('opens only the canonical Steam URL for a verified numeric AppID', async () => {
    const { database, game, platform } = setup();
    database.repositories.externalReferences.upsert({
      gameId: game.id,
      provider: 'steam',
      externalId: '12345',
      externalUrl: 'https://store.steampowered.com/app/12345/',
    });
    const openExternal = vi.fn(async () => undefined);
    const handlers = createStoreHandlers({ getDatabase: () => database, openExternal });
    await expect(
      handlers.openGameStore(createOpenGameStoreRequest(game.id, platform.id)),
    ).resolves.toEqual({ ok: true });
    expect(openExternal).toHaveBeenCalledWith('https://store.steampowered.com/app/12345/');
    database.close();
  });

  it('rejects absent, mismatched, malformed, and unapproved links', async () => {
    const missing = setup(null);
    const openExternal = vi.fn(async () => undefined);
    let handlers = createStoreHandlers({ getDatabase: () => missing.database, openExternal });
    await expect(
      handlers.openGameStore(createOpenGameStoreRequest(missing.game.id, missing.platform.id)),
    ).resolves.toMatchObject({ ok: false });
    missing.database.close();

    const unsafe = setup('javascript:alert(1)');
    unsafe.database.repositories.externalReferences.upsert({
      gameId: unsafe.game.id,
      provider: 'steam',
      externalId: '12345',
      externalUrl: 'javascript:alert(1)',
    });
    handlers = createStoreHandlers({ getDatabase: () => unsafe.database, openExternal });
    await expect(
      handlers.openGameStore(createOpenGameStoreRequest(unsafe.game.id, unsafe.platform.id)),
    ).resolves.toMatchObject({ ok: false });
    expect(openExternal).not.toHaveBeenCalled();
    unsafe.database.close();
    expect(() => createSteamStoreUrl('12/../evil')).toThrow('numeric');
    expect(() => createSteamStoreUrl('0')).toThrow('positive');
    expect(() => createSteamStoreUrl('000123')).toThrow('positive');
    expect(() => createSteamStoreUrl('4294967296')).toThrow('positive');
    expect(createSteamStoreUrl('4294967295')).toBe(
      'https://store.steampowered.com/app/4294967295/',
    );
  });

  it('returns an actionable error when the system browser fails', async () => {
    const { database, game, platform } = setup();
    database.repositories.externalReferences.upsert({
      gameId: game.id,
      provider: 'steam',
      externalId: '12345',
      externalUrl: null,
    });
    const handlers = createStoreHandlers({
      getDatabase: () => database,
      openExternal: vi.fn(async () => {
        throw new Error('failed');
      }),
    });
    await expect(
      handlers.openGameStore(createOpenGameStoreRequest(game.id, platform.id)),
    ).resolves.toEqual({
      ok: false,
      error: 'The Steam store page could not be opened.',
    });
    database.close();
  });
});
