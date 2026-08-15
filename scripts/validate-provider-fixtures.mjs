import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const catalog = JSON.parse(
  await readFile(resolve(root, 'tests/fixtures/providers/steam-catalog-fixtures.json'), 'utf8'),
);
const activity = JSON.parse(
  await readFile(resolve(root, 'tests/fixtures/providers/steam-fixtures.json'), 'utf8'),
);

function check(condition, message) {
  if (!condition) throw new Error(message);
}
check(catalog.provider === 'steam', 'Steam catalog fixture provider is incorrect.');
check(
  Array.isArray(catalog.fixtures) && catalog.fixtures.length >= 5,
  'Steam catalog fixture coverage is incomplete.',
);
const ids = new Set();
for (const fixture of catalog.fixtures) {
  check(!ids.has(fixture.id), `Duplicate Steam fixture id: ${fixture.id}`);
  ids.add(fixture.id);
  check(Number.isSafeInteger(fixture.app_id) && fixture.app_id > 0, `${fixture.id} has no AppID.`);
  for (const capability of fixture.expected.capabilities ?? []) {
    check(capability.count_model === 'unknown', `${fixture.id} invents an exact player capacity.`);
    check(
      !('min_players' in capability) && !('max_players' in capability),
      `${fixture.id} contains unsupported capacity.`,
    );
  }
}
const online = catalog.fixtures.find((fixture) => fixture.id === 'steam-online-coop');
check(
  online?.categories.some((category) => category.id === 38),
  'Online Co-op fixture is missing.',
);
check(
  online?.expected.exact_player_count_confirmed === false,
  'Steam categories must not confirm exact capacity.',
);
const generic = catalog.fixtures.find(
  (fixture) => fixture.id === 'steam-generic-category-is-ambiguous',
);
check(generic?.expected.capabilities?.length === 0, 'Generic multiplayer must stay ambiguous.');
check(
  activity.fixtures.every((fixture) => fixture.expected.capacity_binding === 'none'),
  'Steam activity must not become capacity.',
);
const serialized = JSON.stringify({ catalog, activity });
check(
  !/api[_-]?key|client[_-]?secret|access[_-]?token|bearer/i.test(serialized),
  'Fixture contains a secret-shaped field.',
);
console.log(`PASS: ${catalog.fixtures.length} Steam catalog fixtures validated.`);
console.log(`PASS: ${activity.fixtures.length} Steam activity fixtures validated.`);
