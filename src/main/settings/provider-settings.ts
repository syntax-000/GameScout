import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export interface ProviderSettings {
  attributionAcceptedAt: string;
}

export interface ProviderSettingsStore {
  read: () => ProviderSettings | null;
  save: (attributionAccepted: boolean) => ProviderSettings;
  isConfigured: () => boolean;
}

interface StoredSettings {
  version: 4;
  provider: ProviderSettings | null;
}

const settingsFilename = 'settings.json';

export function createProviderSettingsStore(options: {
  userDataPath: string;
  now?: () => Date;
}): ProviderSettingsStore {
  const settingsPath = path.join(options.userDataPath, 'settings', settingsFilename);
  const now = options.now ?? (() => new Date());

  return {
    read(): ProviderSettings | null {
      return readStore(settingsPath).provider;
    },
    save(attributionAccepted: boolean): ProviderSettings {
      if (!attributionAccepted) {
        throw new TypeError('Accept the Steam Web API terms notice to continue.');
      }
      const provider = {
        attributionAcceptedAt: now().toISOString(),
      };
      writeStore(settingsPath, { version: 4, provider });
      return provider;
    },
    isConfigured(): boolean {
      return readStore(settingsPath).provider !== null;
    },
  };
}

function readStore(settingsPath: string): StoredSettings {
  let serialized: string;
  try {
    serialized = readFileSync(settingsPath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return emptyStore();
    throw new Error('Provider settings could not be read.');
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (isLegacySettings(parsed)) return emptyStore();
    if (!isStoredSettings(parsed)) throw new Error('invalid format');
    return parsed;
  } catch {
    throw new Error('Provider settings are invalid.');
  }
}

function writeStore(settingsPath: string, settings: StoredSettings): void {
  const directory = path.dirname(settingsPath);
  const temporaryPath = `${settingsPath}.tmp`;
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(temporaryPath, JSON.stringify(settings), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, settingsPath);
  } catch {
    rmSync(temporaryPath, { force: true });
    throw new Error('Provider settings could not be saved.');
  }
}

function emptyStore(): StoredSettings {
  return { version: 4, provider: null };
}

function isStoredSettings(value: unknown): value is StoredSettings {
  if (!isRecord(value) || value.version !== 4) return false;
  if (value.provider === null) return true;
  if (!isRecord(value.provider)) return false;
  return (
    typeof value.provider.attributionAcceptedAt === 'string' &&
    !Number.isNaN(Date.parse(value.provider.attributionAcceptedAt))
  );
}

function isLegacySettings(value: unknown): boolean {
  return isRecord(value) && (value.version === 1 || value.version === 2 || value.version === 3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
