import type { ProviderName, ProviderRequestPolicy } from './authentication';

export type ProviderRequestErrorCode =
  | 'network_error'
  | 'timeout'
  | 'rate_limited'
  | 'authentication_error'
  | 'http_error'
  | 'api_error'
  | 'invalid_response'
  | 'empty_response';

export class ProviderRequestError extends Error {
  readonly provider: ProviderName;
  readonly code: ProviderRequestErrorCode;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(options: {
    provider: ProviderName;
    code: ProviderRequestErrorCode;
    message: string;
    retryable: boolean;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'ProviderRequestError';
    this.provider = options.provider;
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status ?? null;
  }
}

export type FetchFunction = typeof fetch;

export async function fetchProviderJson(options: {
  url: URL;
  policy: ProviderRequestPolicy;
  fetchFunction?: FetchFunction;
  timeoutMs?: number;
  method?: 'GET' | 'POST';
  body?: string;
}): Promise<unknown> {
  const fetchFunction = options.fetchFunction ?? fetch;
  await options.policy.throttle.waitForTurn();

  let response: Response;
  try {
    response = await fetchFunction(options.url, {
      method: options.method ?? 'GET',
      headers: options.policy.headers,
      body: options.body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    throw new ProviderRequestError({
      provider: options.policy.provider,
      code: timeout ? 'timeout' : 'network_error',
      message: timeout
        ? 'Provider request timed out.'
        : 'Provider request failed before a response.',
      retryable: true,
      cause: error,
    });
  }

  if (!response.ok) {
    const rateLimited = response.status === 429;
    const authenticationError = response.status === 401 || response.status === 403;
    throw new ProviderRequestError({
      provider: options.policy.provider,
      code: rateLimited
        ? 'rate_limited'
        : authenticationError
          ? 'authentication_error'
          : 'http_error',
      message: rateLimited
        ? 'Provider rate limit was reached.'
        : authenticationError
          ? 'Provider denied access to this endpoint.'
          : `Provider returned HTTP ${response.status}.`,
      retryable: rateLimited || response.status >= 500,
      status: response.status,
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ProviderRequestError({
      provider: options.policy.provider,
      code: 'invalid_response',
      message: 'Provider returned invalid JSON.',
      retryable: false,
      cause: error,
    });
  }
}
