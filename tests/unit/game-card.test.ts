import { describe, expect, it } from 'vitest';
import type { BrowseCapability } from '../../src/shared/ipc/contracts';
import {
  formatReleaseDate,
  summarizeCapabilities,
} from '../../src/renderer/src/components/game-card-helpers';

describe('game card presentation', () => {
  it('formats known release dates and labels missing dates explicitly', () => {
    expect(formatReleaseDate(null)).toBe('Release date unknown');
    expect(formatReleaseDate('2025-02-03')).toBe('Feb 3, 2025');
    expect(formatReleaseDate('2025')).toBe('2025');
  });

  it('summarizes only the normalized capabilities it receives', () => {
    const capabilities: BrowseCapability[] = [
      { capabilityType: 'single_player', connectionType: 'none', splitScreen: false },
      { capabilityType: 'cooperative', connectionType: 'online', splitScreen: false },
      { capabilityType: 'pvp', connectionType: 'lan', splitScreen: false },
      { capabilityType: 'mixed_coop_pvp', connectionType: 'local_device', splitScreen: true },
    ];

    expect(summarizeCapabilities(capabilities)).toEqual([
      'Single-player',
      'Online co-op',
      'LAN multiplayer',
      'Local co-op',
      'Split-screen',
    ]);
    expect(summarizeCapabilities([])).toEqual([]);
  });
});
