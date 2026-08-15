import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SecretProtector {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
}

export interface CredentialStore {
  save: (credentialId: string, value: string) => void;
  read: (credentialId: string) => string | null;
  delete: (credentialId: string) => boolean;
  isConfigured: (credentialId: string) => boolean;
}

interface StoredCredentials {
  version: 1;
  credentials: Record<string, string>;
}

const credentialFilename = 'credentials.secure.json';
const credentialIdPattern = /^[a-z][a-z0-9_.-]{0,63}$/;

export function createCredentialStore(options: {
  userDataPath: string;
  protector: SecretProtector;
}): CredentialStore {
  const storePath = path.join(options.userDataPath, 'secure-storage', credentialFilename);

  return {
    save(credentialId: string, value: string): void {
      assertCredentialId(credentialId);
      if (!value) throw new TypeError('Credential value must not be empty.');
      assertEncryptionAvailable(options.protector);

      const stored = readStore(storePath);
      stored.credentials[credentialId] = options.protector.encryptString(value).toString('base64');
      writeStore(storePath, stored);
    },
    read(credentialId: string): string | null {
      assertCredentialId(credentialId);
      const encrypted = readStore(storePath).credentials[credentialId];
      if (encrypted === undefined) return null;
      assertEncryptionAvailable(options.protector);

      try {
        return options.protector.decryptString(Buffer.from(encrypted, 'base64'));
      } catch {
        throw new Error('Stored credential could not be decrypted.');
      }
    },
    delete(credentialId: string): boolean {
      assertCredentialId(credentialId);
      const stored = readStore(storePath);
      if (stored.credentials[credentialId] === undefined) return false;
      delete stored.credentials[credentialId];
      writeStore(storePath, stored);
      return true;
    },
    isConfigured(credentialId: string): boolean {
      assertCredentialId(credentialId);
      return readStore(storePath).credentials[credentialId] !== undefined;
    },
  };
}

function readStore(storePath: string): StoredCredentials {
  let serialized: string;
  try {
    serialized = readFileSync(storePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return emptyStore();
    throw new Error('Secure credential store could not be read.');
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!isStoredCredentials(parsed)) throw new Error('invalid format');
    return parsed;
  } catch {
    throw new Error('Secure credential store is invalid.');
  }
}

function writeStore(storePath: string, stored: StoredCredentials): void {
  const directory = path.dirname(storePath);
  const temporaryPath = `${storePath}.tmp`;
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(temporaryPath, JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, storePath);
  } catch {
    rmSync(temporaryPath, { force: true });
    throw new Error('Secure credential store could not be written.');
  }
}

function emptyStore(): StoredCredentials {
  return { version: 1, credentials: {} };
}

function isStoredCredentials(value: unknown): value is StoredCredentials {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as { version?: unknown; credentials?: unknown };
  if (candidate.version !== 1 || !isStringRecord(candidate.credentials)) return false;
  return Object.keys(candidate.credentials).every((key) => credentialIdPattern.test(key));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function assertCredentialId(credentialId: string): void {
  if (!credentialIdPattern.test(credentialId)) {
    throw new TypeError('Credential identifier is invalid.');
  }
}

function assertEncryptionAvailable(protector: SecretProtector): void {
  if (!protector.isEncryptionAvailable()) {
    throw new Error('OS-backed credential encryption is unavailable.');
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
