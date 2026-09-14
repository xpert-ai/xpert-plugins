/** Stage only the public application and its documented downloads, not CI internals. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, '_site');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageFilename = `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`;
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--tarball')) throw new Error('Usage: node scripts/stage-pages.mjs [--tarball path]');
fs.rmSync(site, {recursive: true, force: true});
fs.mkdirSync(site, {recursive: true});
for (const name of ['index.html', 'standalone.html', 'src', 'dist', 'sample', 'docs', 'README.md', 'LICENSE', 'NOTICE.md', '.nojekyll']) {
  fs.cpSync(path.join(root, name), path.join(site, name), {recursive: true});
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
fs.writeFileSync(path.join(site, 'deployment.json'), JSON.stringify({repository: 'wieslawsoltes/Dockyard', commit, version: pkg.version, packageFilename, builtAt: new Date().toISOString()}, null, 2) + '\n');
const downloads = path.join(site, 'downloads');
fs.mkdirSync(downloads);
execFileSync('git', ['archive', '--format=zip', '--output=' + path.join(downloads, 'dockyard-source.zip'), 'HEAD'], {cwd: root});
if (args.length) fs.copyFileSync(path.resolve(args[1]), path.join(downloads, packageFilename));
else execFileSync('npm', ['pack', '--pack-destination', downloads], {cwd: root, stdio: 'inherit'});
console.log(`Staged ${site} from ${commit}`);
