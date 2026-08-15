import { describe, expect, it } from 'vitest';
import {
  createIntervalThrottle,
  createSteamCatalogRequestPolicy,
  createSteamRequestPolicy,
  normalizeSteamApiKey,
  ProviderAuthenticationError,
} from '../../src/main/providers/authentication';

describe('provider authentication and request policy', () => {
  it('configures serialized Steam catalog requests', async () => {
    let clock = 10_000;
    const sleeps: number[] = [];
    const policy = createSteamCatalogRequestPolicy({
      now: () => clock,
      sleep: async (milliseconds: number) => {
        sleeps.push(milliseconds);
        clock += milliseconds;
      },
    });
    expect(policy).toMatchObject({ provider: 'steam', authentication: 'api_key' });
    await Promise.all([
      policy.throttle.waitForTurn(),
      policy.throttle.waitForTurn(),
      policy.throttle.waitForTurn(),
    ]);
    expect(sleeps).toEqual([200, 200]);
  });

  it('validates Steam Web API keys and keeps activity requests anonymous', () => {
    expect(normalizeSteamApiKey(' 0123456789abcdef0123456789abcdef ')).toBe(
      '0123456789ABCDEF0123456789ABCDEF',
    );
    expect(() => normalizeSteamApiKey('bad')).toThrow(ProviderAuthenticationError);
    expect(createSteamRequestPolicy('0.1.0').headers).not.toHaveProperty('Authorization');
    expect(() => createIntervalThrottle(-1)).toThrow('non-negative finite number');
  });
});
