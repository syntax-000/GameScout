import { ipcMain } from 'electron';
import type { GameScoutDatabase } from '../db/database';
import { ipcChannels } from '../../shared/ipc/contracts';
import { createBrowseHandlers } from './browse-handlers';

export function registerBrowseHandlers(getDatabase: () => GameScoutDatabase | null): void {
  const handlers = createBrowseHandlers(getDatabase);
  ipcMain.handle(ipcChannels.getBrowsePage, (_event, request: unknown) =>
    handlers.getBrowsePage(request),
  );
  ipcMain.handle(ipcChannels.getBrowseGenres, (_event, request: unknown) =>
    handlers.getBrowseGenres(request),
  );
  ipcMain.handle(ipcChannels.getGameDetails, (_event, request: unknown) =>
    handlers.getGameDetails(request),
  );
}
