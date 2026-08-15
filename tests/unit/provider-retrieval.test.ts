import { describe, expect, it } from 'vitest';
import { createSteamRequestPolicy } from '../../src/main/providers/authentication';
import { retrieveSteamCatalog, retrieveSteamCurrentPlayers } from '../../src/main/providers/steam';

const key = '0123456789ABCDEF0123456789ABCDEF';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Steam catalog retrieval', () => {
  it('retrieves the official game list and bounded Windows Store details', async () => {
    const requests: URL[] = [];
    const result = await retrieveSteamCatalog({
      apiKey: key,
      limit: 1,
      listEndpoint: 'https://fixture.invalid/IStoreService/GetAppList/v1/',
      detailsEndpoint: 'https://fixture.invalid/api/appdetails',
      sleep: async () => undefined,
      fetchFunction: async (input) => {
        const url = new URL(input.toString());
        requests.push(url);
        if (url.pathname.includes('GetAppList')) {
          return json({
            response: {
              apps: [{ appid: 620, name: 'Portal 2', last_modified: 1_723_600_000 }],
              have_more_results: false,
              last_appid: 620,
            },
          });
        }
        return json({
          '620': {
            success: true,
            data: {
              type: 'game',
              steam_appid: 620,
              name: 'Portal 2',
              short_description: 'Cooperative puzzle game.',
              header_image: 'https://example.com/portal.jpg',
              platforms: { windows: true },
              release_date: { coming_soon: false, date: '18 Apr, 2011' },
              metacritic: { score: 95 },
              recommendations: { total: 1000 },
              genres: [{ id: '3', description: 'Puzzle' }],
              categories: [{ id: 38, description: 'Online Co-op' }],
            },
          },
        });
      },
    });

    expect(result.games[0]).toMatchObject({ appId: 620, name: 'Portal 2' });
    expect(result.requestCount).toBe(2);
    expect(requests[0]!.searchParams.get('key')).toBe(key);
    expect(requests[1]!.searchParams.get('appids')).toBe('620');
  });

  it('classifies authentication and empty catalog responses', async () => {
    await expect(
      retrieveSteamCatalog({
        apiKey: key,
        limit: 1,
        fetchFunction: async () => json({}, 403),
      }),
    ).rejects.toMatchObject({ provider: 'steam', code: 'authentication_error' });

    await expect(
      retrieveSteamCatalog({
        apiKey: key,
        limit: 1,
        fetchFunction: async (input) =>
          new URL(input.toString()).hostname === 'api.steampowered.com'
            ? json({
                response: {
                  apps: [{ appid: 620, name: 'Portal 2', last_modified: 1 }],
                  have_more_results: false,
                },
              })
            : json({ '620': { success: false } }),
      }),
    ).rejects.toMatchObject({ code: 'empty_response' });
  });

  it('accepts Steam result responses and treats missing activity endpoints as unavailable', async () => {
    const association = { appId: 620, evidence: { provider: 'steam', externalRecordId: '620' } };
    await expect(
      retrieveSteamCurrentPlayers({
        association,
        policy: createSteamRequestPolicy('0.1.0'),
        fetchFunction: async () => json({ response: { result: 1, player_count: 123 } }),
        now: () => new Date('2026-08-15T09:00:00Z'),
      }),
    ).resolves.toMatchObject({ state: 'available', appId: 620, playerCount: 123 });

    await expect(
      retrieveSteamCurrentPlayers({
        association,
        policy: createSteamRequestPolicy('0.1.0'),
        fetchFunction: async () => json({}, 404),
      }),
    ).resolves.toEqual({ state: 'unavailable', appId: 620 });
  });
});
