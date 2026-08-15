# Provider fixtures

These minimized synthetic fixtures test the Steam catalog and activity boundaries without retaining complete responses or credentials.

- `steam-catalog-fixtures.json` covers explicit Store categories, ambiguity, connection types, and split-screen. Store categories never establish exact supported player capacity.
- `steam-fixtures.json` covers AppID references and point-in-time current-player activity. Activity never represents supported capacity.

Run `node scripts/validate-provider-fixtures.mjs` to verify these invariants.
