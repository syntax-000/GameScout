export type ProviderName = 'steam';
export type ProviderAuthenticationErrorCode =
  'invalid_configuration' | 'credential_required' | 'invalid_credential';

export class ProviderAuthenticationError extends Error {
  readonly code: ProviderAuthenticationErrorCode;
  readonly provider: ProviderName;

  constructor(provider: ProviderName, code: ProviderAuthenticationErrorCode, message: string) {
    super(message);
    this.name = 'ProviderAuthenticationError';
    this.provider = provider;
    this.code = code;
  }
}

export interface ProviderRequestPolicy {
  provider: ProviderName;
  authentication: 'anonymous' | 'api_key';
  headers: Readonly<Record<string, string>>;
  throttle: RequestThrottle;
}

export interface RequestThrottle {
  waitForTurn: () => Promise<void>;
}
export interface ThrottleDependencies {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export function createSteamCatalogRequestPolicy(
  dependencies: ThrottleDependencies = {},
): ProviderRequestPolicy {
  return {
    provider: 'steam',
    authentication: 'api_key',
    headers: Object.freeze({ Accept: 'application/json', 'User-Agent': 'GameScout/0.1' }),
    throttle: createIntervalThrottle(200, dependencies),
  };
}

export function createSteamRequestPolicy(applicationVersion: string): ProviderRequestPolicy {
  const version = applicationVersion.trim().replace(/[()\s]/g, '-');
  if (!version)
    throw new ProviderAuthenticationError(
      'steam',
      'invalid_configuration',
      'Application version is required.',
    );
  return {
    provider: 'steam',
    authentication: 'anonymous',
    headers: Object.freeze({ Accept: 'application/json', 'User-Agent': `GameScout/${version}` }),
    throttle: createIntervalThrottle(0),
  };
}

export function normalizeSteamApiKey(value: string): string {
  const apiKey = value.trim();
  if (!/^[A-Fa-f0-9]{32}$/.test(apiKey)) {
    throw new ProviderAuthenticationError(
      'steam',
      'invalid_credential',
      'Enter a valid 32-character Steam Web API key.',
    );
  }
  return apiKey.toUpperCase();
}

export function createIntervalThrottle(
  minimumIntervalMs: number,
  dependencies: ThrottleDependencies = {},
): RequestThrottle {
  if (!Number.isFinite(minimumIntervalMs) || minimumIntervalMs < 0)
    throw new TypeError('Throttle interval must be a non-negative finite number.');
  const now = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let nextAvailableAt = 0;
  let queue = Promise.resolve();
  return {
    waitForTurn(): Promise<void> {
      const turn = queue.then(async () => {
        const delay = Math.max(0, nextAvailableAt - now());
        if (delay > 0) await sleep(delay);
        nextAvailableAt = Math.max(nextAvailableAt, now()) + minimumIntervalMs;
      });
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
}
