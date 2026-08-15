import { ProviderAuthenticationError, type ProviderName } from '../providers/authentication';
import { ProviderRequestError } from '../providers/transport';

export type ImportErrorCode =
  | 'configuration'
  | 'credential_required'
  | 'authentication'
  | 'network_unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_response'
  | 'empty_response'
  | 'provider_error'
  | 'import_error';

export interface ImportErrorState {
  source: ProviderName;
  code: ImportErrorCode;
  message: string;
  retryable: boolean;
}

export function classifyImportError(error: unknown, source: ProviderName): ImportErrorState {
  if (error instanceof ProviderAuthenticationError) return authenticationError(error);
  if (error instanceof ProviderRequestError) return requestError(error);
  return {
    source,
    code: 'import_error',
    message: `${providerLabel(source)} data could not be imported. Existing local data was kept.`,
    retryable: false,
  };
}

function authenticationError(error: ProviderAuthenticationError): ImportErrorState {
  if (error.code === 'invalid_configuration') {
    return {
      source: error.provider,
      code: 'configuration',
      message: `${providerLabel(error.provider)} setup is incomplete. Update Setup, then retry.`,
      retryable: false,
    };
  }
  if (error.code === 'credential_required') {
    return {
      source: error.provider,
      code: 'credential_required',
      message: `${providerLabel(error.provider)} requires credentials for the configured endpoint. Update Setup, then retry.`,
      retryable: false,
    };
  }
  return {
    source: error.provider,
    code: 'authentication',
    message: `${providerLabel(error.provider)} rejected the configured credentials. Update Setup, then retry.`,
    retryable: false,
  };
}

function requestError(error: ProviderRequestError): ImportErrorState {
  const source = error.provider;
  switch (error.code) {
    case 'network_error':
      return retryable(
        source,
        'network_unavailable',
        'could not be reached. Check your network and retry.',
      );
    case 'timeout':
      return retryable(
        source,
        'timeout',
        'did not respond in time. Retry when the connection is stable.',
      );
    case 'rate_limited':
      return retryable(source, 'rate_limited', 'is rate limiting requests. Wait and retry.');
    case 'authentication_error':
      return {
        source,
        code: 'authentication',
        message: `${providerLabel(source)} denied access to the configured endpoint. Check Setup, then retry.`,
        retryable: false,
      };
    case 'invalid_response':
      return {
        source,
        code: 'invalid_response',
        message: `${providerLabel(source)} returned data GameScout could not validate. Existing local data was kept.`,
        retryable: error.retryable,
      };
    case 'empty_response':
      return {
        source,
        code: 'empty_response',
        message: `${providerLabel(source)} returned no usable records. Existing local data was kept; retry later.`,
        retryable: error.retryable,
      };
    case 'api_error':
    case 'http_error':
      return {
        source,
        code: 'provider_error',
        message: `${providerLabel(source)} could not complete the request. Existing local data was kept.${error.retryable ? ' Retry later.' : ''}`,
        retryable: error.retryable,
      };
  }
}

function retryable(source: ProviderName, code: ImportErrorCode, detail: string): ImportErrorState {
  return {
    source,
    code,
    message: `${providerLabel(source)} ${detail}`,
    retryable: true,
  };
}

function providerLabel(source: ProviderName): string {
  return source === 'steam' ? 'Steam' : source;
}
