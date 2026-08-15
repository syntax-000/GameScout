/// <reference types="vite/client" />

import type { GameScoutDesktopApi } from '../shared/ipc/contracts';

declare global {
  interface Window {
    gameScoutDesktop?: GameScoutDesktopApi;
  }
}

export {};
