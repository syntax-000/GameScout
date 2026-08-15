import type { SteamPlayerObservationResult, VerifiedSteamAssociation } from '../providers/steam';
import type { NormalizedSteamEnrichment } from './models';

export function normalizeSteamEnrichment(
  association: VerifiedSteamAssociation | null,
  observation: SteamPlayerObservationResult,
): NormalizedSteamEnrichment {
  if (association === null || observation.state === 'missing_association') {
    return {
      externalReference: null,
      currentPlayerObservation: null,
      state: 'missing_association',
    };
  }

  const externalReference = {
    provider: 'steam',
    externalId: String(association.appId),
    externalUrl: `https://store.steampowered.com/app/${association.appId}/`,
  };
  if (observation.state !== 'available') {
    return { externalReference, currentPlayerObservation: null, state: 'unavailable' };
  }
  if (observation.appId !== association.appId) {
    throw new TypeError('Steam observation AppID does not match its verified association.');
  }
  return {
    externalReference,
    currentPlayerObservation: {
      provider: 'steam',
      playerCount: observation.playerCount,
      observedAt: observation.observedAt,
    },
    state: 'available',
  };
}
