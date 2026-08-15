import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProviderSettingsStore } from '../../src/main/settings/provider-settings';
const directories: string[] = [];
afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});
function setup() {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-settings-'));
  directories.push(userDataPath);
  return {
    userDataPath,
    store: createProviderSettingsStore({
      userDataPath,
      now: () => new Date('2026-08-14T01:02:03Z'),
    }),
  };
}
describe('provider settings store', () => {
  it('persists Steam terms acceptance without storing the API key', () => {
    const { userDataPath, store } = setup();
    expect(store.save(true)).toEqual({ attributionAcceptedAt: '2026-08-14T01:02:03.000Z' });
    expect(createProviderSettingsStore({ userDataPath }).isConfigured()).toBe(true);
    expect(readFileSync(path.join(userDataPath, 'settings', 'settings.json'), 'utf8')).not.toMatch(
      /api[_-]?key|secret|token|password/i,
    );
  });
  it('rejects refusal and corrupt settings', () => {
    const { userDataPath, store } = setup();
    expect(() => store.save(false)).toThrow('Accept the Steam');
    store.save(true);
    writeFileSync(path.join(userDataPath, 'settings', 'settings.json'), '{broken', 'utf8');
    expect(() => store.read()).toThrow('settings are invalid');
  });
});
