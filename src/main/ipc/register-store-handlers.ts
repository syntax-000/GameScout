import { ipcMain } from 'electron';
import type { GameScoutDatabase } from '../db/database';
import { ipcChannels } from '../../shared/ipc/contracts';
import { createStoreHandlers } from './store-handlers';

export function registerStoreHandlers(dependencies: {
  getDatabase: () => GameScoutDatabase | null;
  openExternal: (url: string) => Promise<void>;
}): void {
  const handlers = createStoreHandlers(dependencies);
  ipcMain.handle(ipcChannels.openGameStore, (_event, request: unknown) =>
    handlers.openGameStore(request),
  );
}
