import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface SteamCatalogFixture {
  id: string;
  categories: Array<{ id: number }>;
  expected: {
    capabilities?: Array<{ type: string; connection: string; count_model: string }>;
    exact_player_count_confirmed?: boolean;
  };
}
interface SteamActivityFixture {
  expected: { capacity_binding: string };
}

async function loadFixture<T>(filename: string): Promise<T> {
  const path = resolve(process.cwd(), 'tests', 'fixtures', 'providers', filename);
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

describe('provider fixture invariants', () => {
  it('maps explicit Steam Online Co-op without inventing player capacity', async () => {
    const document = await loadFixture<{ fixtures: SteamCatalogFixture[] }>(
      'steam-catalog-fixtures.json',
    );
    const fixture = document.fixtures.find(({ id }) => id === 'steam-online-coop');
    expect(fixture?.categories).toContainEqual(expect.objectContaining({ id: 38 }));
    expect(fixture?.expected.capabilities).toContainEqual({
      type: 'cooperative',
      connection: 'online',
      count_model: 'unknown',
    });
    expect(fixture?.expected.exact_player_count_confirmed).toBe(false);
  });

  it('keeps generic Steam multiplayer categories ambiguous', async () => {
    const document = await loadFixture<{ fixtures: SteamCatalogFixture[] }>(
      'steam-catalog-fixtures.json',
    );
    const fixture = document.fixtures.find(
      ({ id }) => id === 'steam-generic-category-is-ambiguous',
    );
    expect(fixture?.expected.capabilities).toEqual([]);
  });

  it('never treats Steam activity as multiplayer capacity', async () => {
    const document = await loadFixture<{ fixtures: SteamActivityFixture[] }>('steam-fixtures.json');
    expect(document.fixtures).not.toHaveLength(0);
    expect(document.fixtures.every(({ expected }) => expected.capacity_binding === 'none')).toBe(
      true,
    );
  });
});
