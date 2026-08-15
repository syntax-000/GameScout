import { assertStatusRequest, type CatalogRefreshResult } from '../../shared/ipc/contracts';
import type { CatalogRefreshService } from '../sync/catalog-refresh';

export function createRefreshHandlers(getService: () => CatalogRefreshService | null) {
  return {
    async refresh(request: unknown): Promise<CatalogRefreshResult> {
      assertStatusRequest(request);
      const service = getService();
      if (service === null) {
        throw new Error('Catalog synchronization is unavailable.');
      }
      return service.refresh();
    },
  };
}
