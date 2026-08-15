import { ipcMain } from 'electron';
import type { GameScoutDatabase } from '../db/database';
import { ipcChannels } from '../../shared/ipc/contracts';
import { createFavoriteHandlers } from './favorite-handlers';

export function registerFavoriteHandlers(getDatabase: () => GameScoutDatabase | null): void {
  const handlers = createFavoriteHandlers(getDatabase);
  ipcMain.handle(ipcChannels.addFavorite, (_event, request: unknown) => handlers.add(request));
  ipcMain.handle(ipcChannels.removeFavorite, (_event, request: unknown) =>
    handlers.remove(request),
  );
  ipcMain.handle(ipcChannels.getFavoriteStatus, (_event, request: unknown) =>
    handlers.status(request),
  );
  ipcMain.handle(ipcChannels.listFavorites, (_event, request: unknown) => handlers.list(request));
}
