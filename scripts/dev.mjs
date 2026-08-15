import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = new Set();

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    ...options,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function waitForRenderer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await delay(250);
  }
  throw new Error(`Renderer did not start at ${url}.`);
}

function stopChildren() {
  for (const child of children) child.kill();
}

process.once('SIGINT', () => {
  stopChildren();
  process.exit(130);
});
process.once('SIGTERM', () => {
  stopChildren();
  process.exit(143);
});
process.once('exit', stopChildren);

const rendererUrl = 'http://127.0.0.1:5173';

start(npmCommand, ['run', 'build:electron', '--', '--watch']);
const renderer = start(npmCommand, ['run', 'dev:renderer']);

await waitForRenderer(rendererUrl);
await delay(500);

const electron = start(npmCommand, ['run', 'start'], {
  env: { ...process.env, GAMESCOUT_RENDERER_URL: rendererUrl },
});

electron.once('exit', (code) => {
  renderer.kill();
  process.exit(code ?? 0);
});
