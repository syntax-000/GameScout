import { ipcMain } from 'electron';
import { ipcChannels } from '../../shared/ipc/contracts';
import type { CatalogRefreshService } from '../sync/catalog-refresh';
import { createRefreshHandlers } from './refresh-handlers';

export function registerRefreshHandlers(getService: () => CatalogRefreshService | null): void {
  const handlers = createRefreshHandlers(getService);
  ipcMain.handle(ipcChannels.refreshCatalog, (_event, request: unknown) =>
    handlers.refresh(request),
  );
}
