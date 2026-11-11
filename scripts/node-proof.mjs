import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrateSQLite } from '../runtime/sqlite.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const [action] = process.argv.slice(2);
if (!['build', 'start', 'migrate'].includes(action)) throw new Error('Use node-proof.mjs build, migrate, or start.');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node.js 24 for this proof.');
const beta = process.env.FORREST_AWS_BETA === '1';
if (beta && action !== 'build' && !process.env.FORREST_SQLITE_PATH) throw new Error('Set a separate SQLite path for the AWS beta.');
const filename = process.env.FORREST_SQLITE_PATH ?? path.join(root, '.sites-runtime/node-proof/training.sqlite');
if (action !== 'build') migrateSQLite(filename, root);
if (action !== 'migrate') {
  const port = process.env.FORREST_PROOF_PORT ?? '4180';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Choose a valid local proof port.');
  const env = { ...process.env, FORREST_NODE_PROOF: '1', FORREST_SQLITE_PATH: filename };
  if (!beta) env.FORREST_PROOF_SESSION_SECRET ??= randomBytes(32).toString('hex');
  const args = action === 'build' ? ['build', '--webpack'] : ['start', '--hostname', '127.0.0.1', '--port', port];
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), ...args], { cwd: root, env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
