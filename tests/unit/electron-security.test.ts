import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron security boundary', () => {
  it('keeps the renderer sandboxed and blocks renderer-initiated navigation', () => {
    const source = readFileSync(path.join(process.cwd(), 'src', 'main', 'main.ts'), 'utf8');

    expect(source).toContain('contextIsolation: true');
    expect(source).toContain('nodeIntegration: false');
    expect(source).toContain('sandbox: true');
    expect(source).toContain("setWindowOpenHandler(() => ({ action: 'deny' }))");
    expect(source).toContain("on('will-navigate', (event) => event.preventDefault())");
    expect(source).toContain('setPermissionRequestHandler');
  });

  it('applies a restrictive renderer content security policy', () => {
    const html = readFileSync(path.join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8');

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("frame-src 'none'");
  });
});
