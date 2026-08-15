import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

rmSync(resolve(import.meta.dirname, '..', 'dist-electron'), {
  recursive: true,
  force: true,
});
