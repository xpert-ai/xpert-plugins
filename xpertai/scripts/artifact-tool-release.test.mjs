import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { planReleasePreparation } from './release-preparation.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const changesetsRequire = createRequire(require.resolve('@changesets/cli/package.json'));
const { getPackages } = changesetsRequire('@manypkg/get-packages');
const { load: yaml } = changesetsRequire('js-yaml');
const json = async (path) => JSON.parse(await readFile(join(repo, path), 'utf8'));
const text = (path) => readFile(join(repo, path), 'utf8');
const artifactName = '@xpert-ai/artifact-tool';

test('only the official workspace discovers artifact-tool for publication', async () => {
  const official = await getPackages(join(repo, 'xpertai'));
  const community = await getPackages(join(repo, 'community'));
  assert.ok(official.packages.some((pkg) => pkg.packageJson.name === artifactName));
  assert.ok(!community.packages.some((pkg) => pkg.packageJson.name === artifactName));
  assert.ok(community.packages.some((pkg) => pkg.packageJson.name === '@xpert-ai/plugin-shadcn-ui'));
});

test('version PR includes the shared package version and changelog without changing the root alias', async () => {
  const root = await mkdtemp(join(tmpdir(), 'artifact-changesets-'));
  try {
    for (const path of ['package.json', 'pnpm-workspace.yaml', 'xpertai/package.json',
      'xpertai/pnpm-workspace.yaml', 'xpertai/.changeset/config.json', 'packages/artifact-tool/package.json']) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), await text(path));
    }
    const manifestPath = join(root, 'packages/artifact-tool/package.json');
    const manifest = await json('packages/artifact-tool/package.json');
    await writeFile(manifestPath, JSON.stringify({ ...manifest, version: '1.2.3' }, null, 2));
    await writeFile(join(root, 'xpertai/.changeset/release-test.md'),
      `---\n"${artifactName}": patch\n---\n\nVerify the shared package release.\n`);
    await symlink(join(repo, 'xpertai/node_modules'), join(root, 'xpertai/node_modules'), 'dir');
    await writeFile(join(root, '.gitignore'), 'node_modules/\n');
    const git = (args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      return result.stdout;
    };
    git(['init', '-q']);
    git(['add', '.']);
    git(['-c', 'user.name=Release Test', '-c', 'user.email=release@example.test',
      '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture']);
    await writeFile(join(root, 'unrelated.txt'), 'must remain unstaged');
    const result = spawnSync(process.execPath, [join(repo, 'xpertai/scripts/release-version.mjs')], {
      cwd: join(root, 'xpertai'), encoding: 'utf8', timeout: 30000
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).version, '1.2.4');
    const changelog = await readFile(join(root, 'packages/artifact-tool/CHANGELOG.md'), 'utf8');
    assert.match(changelog, /## 1\.2\.4/);
    assert.match(changelog, /Verify the shared package release/);
    // Simulate the action's final staging step, which is scoped to its cwd.
    git(['-C', 'xpertai', 'add', '.']);
    assert.deepEqual(git(['diff', '--cached', '--name-only']).trim().split('\n'), [
      'packages/artifact-tool/CHANGELOG.md', 'packages/artifact-tool/package.json',
      'xpertai/.changeset/release-test.md'
    ]);
    await assert.rejects(readFile(join(root, 'xpertai/.changeset/release-test.md')), { code: 'ENOENT' });
    await assert.rejects(readFile(join(root, '.changeset')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source package preparation keeps ordinary plugins on the existing Nx build path', async () => {
  const manifest = await json('packages/artifact-tool/package.json');
  const dir = resolve(repo, 'packages/artifact-tool');
  const packages = [
    { dir, packageJson: manifest },
    { dir: '/plugin', packageJson: { name: 'plugin' } }
  ];
  assert.deepEqual(planReleasePreparation(packages, [artifactName, 'plugin']), {
    scriptPackages: [{ name: artifactName, dir }], nxPackages: ['plugin']
  });
  assert.deepEqual(planReleasePreparation(packages, ['plugin']), { scriptPackages: [], nxPackages: ['plugin'] });
  assert.throws(() => planReleasePreparation(packages, ['missing']), /Unknown release package/);
  assert.throws(() => planReleasePreparation([
    { dir, packageJson: { name: 'bad', scripts: { 'release:prepare': '' } } }
  ], ['bad']), /Invalid release:prepare/);
});

test('release workflow covers shared-package changes and runs Changesets in its workspace', async () => {
  const workflow = yaml(await text('.github/workflows/release-plugin.yml'));
  assert.ok(workflow.on.push.paths.includes('packages/artifact-tool/**'));
  const filter = workflow.jobs.detect.steps.find((step) => step.uses?.startsWith('dorny/paths-filter@'));
  const paths = yaml(filter.with.filters);
  assert.ok(paths.xpertai.includes('packages/artifact-tool/**'));
  assert.ok(!paths.community.includes('packages/artifact-tool/**'));
  const steps = workflow.jobs.release.steps;
  const version = steps.find((step) => step.uses === 'changesets/action@v1');
  assert.equal(version.with.cwd, '${{ matrix.changesets_cwd }}');
  assert.equal(version.with.version, '${{ matrix.version_command }}');
  const publish = steps.find((step) => step.name === 'Publish packages');
  assert.ok(publish.run.includes('package_paths+=("packages/artifact-tool")'));
  const official = workflow.jobs.release.strategy.matrix.include.find((row) => row.workspace === 'xpertai');
  assert.equal(official.changesets_cwd, 'xpertai');
  assert.equal(official.version_command, 'node scripts/release-version.mjs');
  const community = workflow.jobs.release.strategy.matrix.include.find((row) => row.workspace === 'community');
  assert.equal(community.changesets_cwd, '.');
  assert.equal(community.version_command, 'pnpm -C community exec changeset version');
  const manager = (await json('xpertai/package.json')).packageManager;
  assert.equal(official.pnpm_version, manager.split('@')[1].split('+')[0]);
});

test('npm publication metadata identifies the public package and monorepo path', async () => {
  const manifest = await json('packages/artifact-tool/package.json');
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.publishConfig.access, 'public');
  assert.equal(manifest.repository.url, 'git+https://github.com/xpert-ai/xpert-plugins.git');
  assert.equal(manifest.repository.directory, 'packages/artifact-tool');
  assert.equal(manifest.scripts['release:prepare'], 'npm test');
});
