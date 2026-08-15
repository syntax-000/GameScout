import type { GameDetailsCapability } from '../../../shared/ipc/contracts';

export function formatCapabilityName(value: GameDetailsCapability['capabilityType']): string {
  return {
    single_player: 'Single-player',
    multiplayer_unspecified: 'Multiplayer',
    cooperative: 'Co-op',
    pvp: 'PvP',
    mixed_coop_pvp: 'Co-op and PvP',
  }[value];
}

export function formatConnectionName(value: GameDetailsCapability['connectionType']): string {
  return { none: 'None', local_device: 'Local device', lan: 'LAN', online: 'Online' }[value];
}

export function formatFeatureName(
  value: GameDetailsCapability['features'][number]['featureType'],
): string {
  return { split_screen: 'Split-screen', shared_screen: 'Shared screen', hot_seat: 'Hot seat' }[
    value
  ];
}

export function formatPlayerCapacity(capability: GameDetailsCapability): string {
  if (
    capability.countModel === 'exact_range' &&
    capability.minPlayers !== null &&
    capability.maxPlayers !== null
  ) {
    return capability.minPlayers === capability.maxPlayers
      ? `${capability.minPlayers}`
      : `${capability.minPlayers}–${capability.maxPlayers}`;
  }
  if (capability.countModel === 'discrete_set' && capability.playerCounts.length > 0)
    return capability.playerCounts.join(', ');
  if (capability.countModel === 'maximum_only' && capability.maxPlayers !== null)
    return `Up to ${capability.maxPlayers} (uncertain)`;
  return 'Unknown';
}

export function formatTimestamp(value: string | null): string {
  if (value === null) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
