import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const cli = require.resolve('@changesets/cli/bin.js');
const { getPackages } = createRequire(cli)('@manypkg/get-packages');
const cwd = process.cwd();
const before = await getPackages(cwd);
const versions = new Map(before.packages.map((pkg) => [pkg.dir, pkg.packageJson.version]));

execFileSync(process.execPath, [cli, 'version'], { cwd, stdio: 'inherit' });

// changesets/action commits with `git add .` in xpertai. Include versioned
// shared packages outside that directory in the same release PR commit.
const after = await getPackages(cwd);
// Bundle metadata is shipped alongside package.json and must advance in the
// same version PR, before build/prepack validates the distribution.
for (const pkg of after.packages) {
  if (versions.get(pkg.dir) === pkg.packageJson.version) continue;
  const manifestPath = join(pkg.dir, '.xpertai-plugin/plugin.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.name !== pkg.packageJson.name) {
    throw new Error(`Plugin bundle name does not match package.json: ${manifestPath}`);
  }
  manifest.version = pkg.packageJson.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
const paths = after.packages.flatMap((pkg) => {
  const path = relative(cwd, pkg.dir);
  const outside = path === '..' || path.startsWith('../') || isAbsolute(path);
  if (!outside || versions.get(pkg.dir) === pkg.packageJson.version) return [];
  return [join(pkg.dir, 'package.json'), join(pkg.dir, 'CHANGELOG.md'),
    join(pkg.dir, '.xpertai-plugin/plugin.json')].filter(existsSync);
});
if (paths.length > 0) execFileSync('git', ['add', '--', ...paths], { cwd, stdio: 'inherit' });
