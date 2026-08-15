import type { GameSteamEnrichment } from './catalog-import';
import { ImportCancelledError } from './catalog-import';
import type { NormalizedGame } from '../normalization/models';
import type { SynchronizationService } from '../sync/sync-service';
import { classifyImportError, type ImportErrorState } from './import-errors';

export type ImportPhase = 'primary' | 'steam';
export type ImportProgressEvent =
  | { type: 'phase_started'; phase: ImportPhase; total: number }
  | {
      type: 'progress';
      phase: ImportPhase;
      processed: number;
      imported: number;
      errors: number;
      total: number;
    }
  | { type: 'item_error'; phase: 'steam'; providerGameId: string; error: ImportErrorState }
  | {
      type: 'item_partial';
      phase: 'steam';
      providerGameId: string;
      state: 'missing_association' | 'unavailable';
      message: string;
    }
  | {
      type: 'phase_completed';
      phase: ImportPhase;
      processed: number;
      imported: number;
      errors: number;
      partial?: number;
    }
  | { type: 'phase_failed'; phase: ImportPhase; error: ImportErrorState }
  | { type: 'cancelled'; phase: ImportPhase };

export interface ImportRunResult {
  state: 'completed' | 'failed' | 'cancelled';
  primaryCompleted: boolean;
  steamCompleted: boolean;
  error: ImportErrorState | null;
}

export interface ImportRunInput {
  games: readonly NormalizedGame[];
  steamEnrichments: readonly GameSteamEnrichment[];
}

export interface ImportRun {
  cancel: () => void;
  completion: Promise<ImportRunResult>;
  retry: () => ImportRun;
}

export function createImportCoordinator(
  synchronization: SynchronizationService,
  yieldToEventLoop: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
) {
  return {
    start(input: ImportRunInput, onEvent: (event: ImportProgressEvent) => void): ImportRun {
      return startRun(synchronization, input, onEvent, yieldToEventLoop);
    },
  };
}

function startRun(
  synchronization: SynchronizationService,
  input: ImportRunInput,
  onEvent: (event: ImportProgressEvent) => void,
  yieldToEventLoop: () => Promise<void>,
): ImportRun {
  let cancelled = false;
  const throwIfCancelled = () => {
    if (cancelled) throw new ImportCancelledError();
  };
  const completion = (async (): Promise<ImportRunResult> => {
    await yieldToEventLoop();
    onEvent({ type: 'phase_started', phase: 'primary', total: input.games.length });
    try {
      const primary = synchronization.importPrimary(input.games, {
        throwIfCancelled,
        onPrimaryProcessed: (processed, imported) =>
          onEvent({
            type: 'progress',
            phase: 'primary',
            processed,
            imported,
            errors: 0,
            total: input.games.length,
          }),
      });
      onEvent({
        type: 'phase_completed',
        phase: 'primary',
        processed: primary.imported,
        imported: primary.imported,
        errors: 0,
      });
    } catch (error) {
      return finishError('primary', error, onEvent, false);
    }

    await yieldToEventLoop();
    if (cancelled) {
      onEvent({ type: 'cancelled', phase: 'steam' });
      return { state: 'cancelled', primaryCompleted: true, steamCompleted: false, error: null };
    }
    onEvent({ type: 'phase_started', phase: 'steam', total: input.steamEnrichments.length });
    try {
      const steam = synchronization.importSteam(input.steamEnrichments, {
        throwIfCancelled,
        onSteamProcessed: (processed, imported, errors) =>
          onEvent({
            type: 'progress',
            phase: 'steam',
            processed,
            imported,
            errors,
            total: input.steamEnrichments.length,
          }),
      });
      for (const failure of steam.failures) {
        onEvent({
          type: 'item_error',
          phase: 'steam',
          providerGameId: failure.providerGameId,
          error: classifyImportError(new Error(failure.error), 'steam'),
        });
      }
      const failedIds = new Set(steam.failures.map((failure) => failure.providerGameId));
      for (const item of input.steamEnrichments) {
        if (failedIds.has(item.providerGameId) || item.enrichment.state === 'available') continue;
        const missingAssociation = item.enrichment.state === 'missing_association';
        onEvent({
          type: 'item_partial',
          phase: 'steam',
          providerGameId: item.providerGameId,
          state: item.enrichment.state,
          message: missingAssociation
            ? 'No source-verified Steam AppID is available; Steam enrichment remains unknown.'
            : 'Steam returned no current-player observation; the prior cached value remains unchanged.',
        });
      }
      onEvent({
        type: 'phase_completed',
        phase: 'steam',
        processed: input.steamEnrichments.length,
        imported: steam.updatedObservations,
        errors: steam.failures.length,
        partial: steam.unavailable + steam.skipped,
      });
      return { state: 'completed', primaryCompleted: true, steamCompleted: true, error: null };
    } catch (error) {
      return finishError('steam', error, onEvent, true);
    }
  })();

  return {
    cancel: () => {
      cancelled = true;
    },
    completion,
    retry: () => startRun(synchronization, input, onEvent, yieldToEventLoop),
  };
}

function finishError(
  phase: ImportPhase,
  error: unknown,
  onEvent: (event: ImportProgressEvent) => void,
  primaryCompleted: boolean,
): ImportRunResult {
  if (error instanceof ImportCancelledError) {
    onEvent({ type: 'cancelled', phase });
    return { state: 'cancelled', primaryCompleted, steamCompleted: false, error: null };
  }
  const classified = classifyImportError(error, 'steam');
  onEvent({ type: 'phase_failed', phase, error: classified });
  return { state: 'failed', primaryCompleted, steamCompleted: false, error: classified };
}

export type ImportCoordinator = ReturnType<typeof createImportCoordinator>;
