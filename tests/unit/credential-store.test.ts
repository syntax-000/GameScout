import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCredentialStore,
  type SecretProtector,
} from '../../src/main/credentials/credential-store';

const directories: string[] = [];

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function setup(protector: SecretProtector = createTestProtector()) {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'gamescout-credential-test-'));
  directories.push(userDataPath);
  return {
    userDataPath,
    store: createCredentialStore({ userDataPath, protector }),
  };
}

describe('secure credential store', () => {
  it('round-trips encrypted values without writing plaintext', () => {
    const { userDataPath, store } = setup();
    store.save('steam.api_key', 'super-secret-token');

    expect(store.isConfigured('steam.api_key')).toBe(true);
    expect(store.read('steam.api_key')).toBe('super-secret-token');
    const serialized = readFileSync(
      path.join(userDataPath, 'secure-storage', 'credentials.secure.json'),
      'utf8',
    );
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).toContain('c3VwZXItc2VjcmV0LXRva2Vu');
  });

  it('supports idempotent replacement, deletion, and missing reads', () => {
    const { store } = setup();
    expect(store.read('steam.api_key')).toBeNull();
    expect(store.delete('steam.api_key')).toBe(false);
    store.save('steam.api_key', 'first');
    store.save('steam.api_key', 'second');
    expect(store.read('steam.api_key')).toBe('second');
    expect(
      createCredentialStore({
        userDataPath: directories.at(-1)!,
        protector: createTestProtector(),
      }).read('steam.api_key'),
    ).toBe('second');
    expect(store.delete('steam.api_key')).toBe(true);
    expect(store.read('steam.api_key')).toBeNull();
  });

  it('rejects invalid identifiers, empty values, unavailable encryption, and corrupt data', () => {
    const { store, userDataPath } = setup();
    expect(() => store.save('Steam API Key', 'value')).toThrow('identifier is invalid');
    expect(() => store.save('steam.api_key', '')).toThrow('must not be empty');

    const unavailable = setup({
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.from('never'),
      decryptString: () => 'never',
    });
    expect(() => unavailable.store.save('steam.api_key', 'value')).toThrow('unavailable');

    const corruptPath = path.join(userDataPath, 'secure-storage', 'credentials.secure.json');
    store.save('steam.api_key', 'value');
    writeFileSync(corruptPath, '{not-json', 'utf8');
    expect(() => store.read('steam.api_key')).toThrow('store is invalid');
  });
});

function createTestProtector(): SecretProtector {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, 'utf8'),
    decryptString: (value) => value.toString('utf8'),
  };
}
