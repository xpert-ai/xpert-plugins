import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
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
const paths = after.packages.flatMap((pkg) => {
  const path = relative(cwd, pkg.dir);
  const outside = path === '..' || path.startsWith('../') || isAbsolute(path);
  if (!outside || versions.get(pkg.dir) === pkg.packageJson.version) return [];
  return [join(pkg.dir, 'package.json'), join(pkg.dir, 'CHANGELOG.md')];
});
if (paths.length > 0) execFileSync('git', ['add', '--', ...paths], { cwd, stdio: 'inherit' });
