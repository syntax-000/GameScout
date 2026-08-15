import type { BrowseCapability } from '../../../shared/ipc/contracts';

export function summarizeCapabilities(capabilities: BrowseCapability[]): string[] {
  const summaries = new Set<string>();
  for (const capability of capabilities) {
    if (capability.capabilityType === 'single_player') summaries.add('Single-player');
    if (capability.connectionType === 'online') {
      summaries.add(hasCoop(capability) ? 'Online co-op' : 'Online multiplayer');
    }
    if (capability.connectionType === 'lan') {
      summaries.add(hasCoop(capability) ? 'LAN co-op' : 'LAN multiplayer');
    }
    if (capability.connectionType === 'local_device') {
      summaries.add(hasCoop(capability) ? 'Local co-op' : 'Local multiplayer');
    }
    if (capability.splitScreen) summaries.add('Split-screen');
  }
  return [...summaries];
}

export function formatReleaseDate(value: string | null): string {
  if (value === null) return 'Release date unknown';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function hasCoop(capability: BrowseCapability): boolean {
  return (
    capability.capabilityType === 'cooperative' || capability.capabilityType === 'mixed_coop_pvp'
  );
}
