import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sandboxed preload', () => {
  it('has no runtime imports outside Electron', () => {
    const source = readFileSync(path.join(process.cwd(), 'src', 'preload', 'index.ts'), 'utf8');
    const runtimeImports = [
      ...source.matchAll(/^import(?!\s+type\b).*?from\s+['"]([^'"]+)['"]/gm),
    ].map((match) => match[1]);
    expect(runtimeImports).toEqual(['electron']);
  });
});
