import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const output = path.resolve(process.argv[2] ?? '.aws-release');
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Expected a full Git revision.');
if (existsSync(output)) throw new Error('Choose an empty output directory.');
const release = path.join(output, 'release');
const standalone = path.join(root, '.next-node-proof/standalone');
if (!existsSync(path.join(standalone, 'server.js'))) throw new Error('Build the standalone Node release first.');
mkdirSync(output, { recursive: true });
cpSync(standalone, release, { recursive: true, dereference: true });
for (const directory of ['public', 'runtime', 'drizzle']) {
  cpSync(path.join(root, directory), path.join(release, directory), { recursive: true, dereference: true });
}
cpSync(path.join(root, '.next-node-proof/static'), path.join(release, '.next-node-proof/static'), { recursive: true });
// Complete Next's runtime dependency closure, including dependencies that tracing
// can miss with pnpm. Resolve each package from its parent to preserve versions.
const copied = new Set();
function copyPackage(name, parent, destination) {
  const require = createRequire(path.join(parent, 'package.json'));
  let manifest;
  try { manifest = require.resolve(name + '/package.json'); }
  catch {
    let directory = path.dirname(require.resolve(name));
    while (directory !== path.dirname(directory)) {
      const candidate = path.join(directory, 'package.json');
      if (existsSync(candidate) && JSON.parse(readFileSync(candidate, 'utf8')).name === name) { manifest = candidate; break; }
      directory = path.dirname(directory);
    }
  }
  if (!manifest) throw new Error('Could not resolve runtime dependency ' + name);
  const source = path.dirname(realpathSync(manifest));
  const target = path.join(destination, name);
  const identity = source + ':' + target;
  if (copied.has(identity)) return;
  copied.add(identity);
  cpSync(source, target, { recursive: true, dereference: true });
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  // Flat packages are sufficient when versions agree. Different versions remain
  // nested under their consuming package.
  for (const dependency of Object.keys(pkg.dependencies ?? {})) {
    copyPackage(dependency, source, path.join(target, 'node_modules'));
  }
}
for (const name of ['next', 'react', 'react-dom', 'jose']) {
  copyPackage(name, root, path.join(release, 'node_modules'));
}
// React peers must resolve to one shared runtime instance.
for (const name of ['react', 'react-dom']) {
  rmSync(path.join(release, 'node_modules/next/node_modules', name), { recursive: true, force: true });
}
writeFileSync(path.join(release, 'REVISION'), revision + '\n');
cpSync(path.join(root, 'scripts/aws/start.sh'), path.join(release, 'start.sh'));
const archive = path.join(output, 'release.tar.gz');
execFileSync('tar', ['-czf', archive, '-C', output, 'release']);
const checksum = execFileSync('sha256sum', [archive], { encoding: 'utf8' }).split(' ')[0];
writeFileSync(path.join(output, 'release.sha256'), checksum + '  release.tar.gz\n');
console.log(JSON.stringify({ revision, archive, checksum }));
