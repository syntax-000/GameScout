import {
  createSteamCatalogRequestPolicy,
  normalizeSteamApiKey,
  type ProviderRequestPolicy,
} from './authentication';
import { fetchProviderJson, ProviderRequestError, type FetchFunction } from './transport';

export interface VerifiedSteamAssociation {
  appId: number;
  evidence: {
    provider: string;
    externalRecordId: string;
  };
}

export type SteamPlayerObservationResult =
  | { state: 'missing_association' }
  | { state: 'unavailable'; appId: number }
  | { state: 'available'; appId: number; playerCount: number; observedAt: string };

export interface SteamStoreCategoryDto {
  id: number;
  description: string;
}

export interface SteamStoreGenreDto {
  id: string;
  description: string;
}

export interface SteamCatalogGameDto {
  appId: number;
  name: string;
  summary: string | null;
  releaseDate: string | null;
  headerImage: string | null;
  rating: number | null;
  popularity: number | null;
  lastModified: number;
  genres: SteamStoreGenreDto[];
  categories: SteamStoreCategoryDto[];
  storeUrl: string;
}

export interface SteamCatalogResult {
  games: SteamCatalogGameDto[];
  requestedLimit: number;
  requestCount: number;
}

const endpoint = 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/';
const appListEndpoint = 'https://api.steampowered.com/IStoreService/GetAppList/v1/';
const storeDetailsEndpoint = 'https://store.steampowered.com/api/appdetails';
const maximumCatalogLimit = 40;
const appListPageSize = 50_000;

export async function retrieveSteamCatalog(options: {
  apiKey: string;
  limit: number;
  fetchFunction?: FetchFunction;
  sleep?: (milliseconds: number) => Promise<void>;
  listEndpoint?: string;
  detailsEndpoint?: string;
}): Promise<SteamCatalogResult> {
  const apiKey = normalizeSteamApiKey(options.apiKey);
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > maximumCatalogLimit
  ) {
    throw new RangeError(`Steam catalog limit must be between 1 and ${maximumCatalogLimit}.`);
  }

  const policy = createSteamCatalogRequestPolicy({ sleep: options.sleep });
  const candidates: SteamAppListEntry[] = [];
  let lastAppId = 0;
  let requestCount = 0;

  for (let page = 0; page < 10; page += 1) {
    const url = new URL(options.listEndpoint ?? appListEndpoint);
    url.searchParams.set('key', apiKey);
    url.searchParams.set(
      'input_json',
      JSON.stringify({
        include_games: true,
        include_dlc: false,
        include_software: false,
        include_videos: false,
        include_hardware: false,
        last_appid: lastAppId,
        max_results: appListPageSize,
      }),
    );
    const pageResult = parseAppList(
      await fetchProviderJson({ url, policy, fetchFunction: options.fetchFunction }),
    );
    requestCount += 1;
    candidates.push(...pageResult.apps);
    if (!pageResult.haveMoreResults) break;
    if (pageResult.lastAppId <= lastAppId) invalidResponse();
    lastAppId = pageResult.lastAppId;
    if (page === 9) invalidResponse();
  }

  const selected = candidates
    .sort((left, right) => right.lastModified - left.lastModified || right.appId - left.appId)
    .slice(0, options.limit);
  const games: SteamCatalogGameDto[] = [];
  for (const candidate of selected) {
    const url = new URL(options.detailsEndpoint ?? storeDetailsEndpoint);
    url.searchParams.set('appids', String(candidate.appId));
    url.searchParams.set('cc', 'US');
    url.searchParams.set('l', 'en');
    const response = await fetchProviderJson({
      url,
      policy,
      fetchFunction: options.fetchFunction,
    });
    requestCount += 1;
    const game = parseStoreDetails(response, candidate);
    if (game !== null) games.push(game);
  }

  if (games.length === 0) {
    throw new ProviderRequestError({
      provider: 'steam',
      code: 'empty_response',
      message: 'Steam returned no usable Windows game records.',
      retryable: true,
    });
  }
  return { games, requestedLimit: options.limit, requestCount };
}

export async function retrieveSteamCurrentPlayers(options: {
  association: VerifiedSteamAssociation | null;
  policy: ProviderRequestPolicy;
  fetchFunction?: FetchFunction;
  now?: () => Date;
}): Promise<SteamPlayerObservationResult> {
  if (options.policy.provider !== 'steam') {
    throw new TypeError('Steam enrichment requires a Steam request policy.');
  }
  if (options.association === null) return { state: 'missing_association' };
  assertAssociation(options.association);

  const url = new URL(endpoint);
  url.searchParams.set('appid', String(options.association.appId));
  let raw: unknown;
  try {
    raw = await fetchProviderJson({
      url,
      policy: options.policy,
      fetchFunction: options.fetchFunction,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404) {
      return { state: 'unavailable', appId: options.association.appId };
    }
    throw error;
  }
  const response = parseResponse(raw);
  if (response.success !== 1 || response.playerCount === null) {
    return { state: 'unavailable', appId: options.association.appId };
  }
  return {
    state: 'available',
    appId: options.association.appId,
    playerCount: response.playerCount,
    observedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
}

interface SteamAppListEntry {
  appId: number;
  name: string;
  lastModified: number;
}

function parseAppList(value: unknown): {
  apps: SteamAppListEntry[];
  haveMoreResults: boolean;
  lastAppId: number;
} {
  if (!isRecord(value) || !isRecord(value.response) || !Array.isArray(value.response.apps)) {
    invalidResponse();
  }
  const apps = value.response.apps.flatMap((item) => {
    if (!isRecord(item)) return [];
    const appId = positiveInteger(item.appid);
    const name = nonEmptyString(item.name);
    const lastModified = nonNegativeInteger(item.last_modified);
    return appId === null || name === null || lastModified === null
      ? []
      : [{ appId, name, lastModified }];
  });
  const haveMoreResults = value.response.have_more_results === true;
  const lastAppId = positiveInteger(value.response.last_appid) ?? apps.at(-1)?.appId ?? 0;
  return { apps, haveMoreResults, lastAppId };
}

function parseStoreDetails(
  value: unknown,
  candidate: SteamAppListEntry,
): SteamCatalogGameDto | null {
  if (!isRecord(value)) invalidResponse();
  const envelope = value[String(candidate.appId)];
  if (!isRecord(envelope) || typeof envelope.success !== 'boolean') invalidResponse();
  if (!envelope.success) return null;
  if (!isRecord(envelope.data)) invalidResponse();
  const data = envelope.data;
  if (data.type !== 'game' || !isRecord(data.platforms) || data.platforms.windows !== true) {
    return null;
  }
  const appId = positiveInteger(data.steam_appid);
  const name = nonEmptyString(data.name);
  if (appId !== candidate.appId || name === null) invalidResponse();
  const release = isRecord(data.release_date) ? nonEmptyString(data.release_date.date) : null;
  const metacritic = isRecord(data.metacritic) ? finiteNumber(data.metacritic.score) : null;
  const recommendations = isRecord(data.recommendations)
    ? nonNegativeInteger(data.recommendations.total)
    : null;
  return {
    appId,
    name,
    summary: nonEmptyString(data.short_description),
    releaseDate: parseStoreDate(release),
    headerImage: httpsUrl(data.header_image),
    rating: metacritic,
    popularity: recommendations,
    lastModified: candidate.lastModified,
    genres: parseGenres(data.genres),
    categories: parseCategories(data.categories),
    storeUrl: `https://store.steampowered.com/app/${appId}/`,
  };
}

function parseGenres(value: unknown): SteamStoreGenreDto[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = nonEmptyString(item.id);
        const description = nonEmptyString(item.description);
        return id && description ? [{ id, description }] : [];
      })
    : [];
}

function parseCategories(value: unknown): SteamStoreCategoryDto[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = positiveInteger(item.id);
        const description = nonEmptyString(item.description);
        return id && description ? [{ id, description }] : [];
      })
    : [];
}

function parseStoreDate(value: string | null): string | null {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function httpsUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseResponse(value: unknown): { success: number; playerCount: number | null } {
  if (!isRecord(value) || !isRecord(value.response)) invalidResponse();
  const success = Number(value.response.result ?? value.response.success);
  const playerCount = value.response.player_count;
  if (!Number.isInteger(success) || (success !== 0 && success !== 1)) invalidResponse();
  if (success === 1 && (!Number.isSafeInteger(playerCount) || Number(playerCount) < 0)) {
    invalidResponse();
  }
  return {
    success,
    playerCount:
      Number.isSafeInteger(playerCount) && Number(playerCount) >= 0 ? Number(playerCount) : null,
  };
}

function assertAssociation(association: VerifiedSteamAssociation): void {
  if (
    !Number.isSafeInteger(association.appId) ||
    association.appId < 1 ||
    association.appId > 4_294_967_295 ||
    !association.evidence.provider.trim() ||
    !association.evidence.externalRecordId.trim()
  ) {
    throw new TypeError('Steam enrichment requires a positive AppID and source-backed evidence.');
  }
}

function invalidResponse(): never {
  throw new ProviderRequestError({
    provider: 'steam',
    code: 'invalid_response',
    message: 'Steam returned an unexpected response shape.',
    retryable: false,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
