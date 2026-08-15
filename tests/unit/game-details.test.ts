import { describe, expect, it } from 'vitest';
import type { GameDetailsCapability } from '../../src/shared/ipc/contracts';
import {
  formatCapabilityName,
  formatConnectionName,
  formatFeatureName,
  formatPlayerCapacity,
  formatTimestamp,
} from '../../src/renderer/src/screens/game-details-helpers';

const capability = (overrides: Partial<GameDetailsCapability>): GameDetailsCapability => ({
  id: 1,
  capabilityType: 'cooperative',
  connectionType: 'online',
  supportState: 'supported',
  countModel: 'unknown',
  minPlayers: null,
  maxPlayers: null,
  playerCounts: [],
  confidence: 'verified',
  notes: null,
  features: [],
  evidence: [],
  ...overrides,
});

describe('game details presentation', () => {
  it('formats capability labels without changing normalized meaning', () => {
    expect(formatCapabilityName('mixed_coop_pvp')).toBe('Co-op and PvP');
    expect(formatConnectionName('local_device')).toBe('Local device');
    expect(formatFeatureName('split_screen')).toBe('Split-screen');
  });

  it('formats known capacity models and keeps incomplete capacity explicit', () => {
    expect(
      formatPlayerCapacity(capability({ countModel: 'exact_range', minPlayers: 2, maxPlayers: 8 })),
    ).toBe('2–8');
    expect(
      formatPlayerCapacity(capability({ countModel: 'discrete_set', playerCounts: [2, 4] })),
    ).toBe('2, 4');
    expect(formatPlayerCapacity(capability({ countModel: 'maximum_only', maxPlayers: 8 }))).toBe(
      'Up to 8 (uncertain)',
    );
    expect(formatPlayerCapacity(capability({ countModel: 'unknown' }))).toBe('Unknown');
  });

  it('labels missing and invalid timestamps safely', () => {
    expect(formatTimestamp(null)).toBe('Unknown');
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });
});
