import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getWorkspacePackagePatterns() {
  const rootPackageJsonPath = resolve(process.cwd(), 'package.json');
  const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8'));
  const workspaces = Array.isArray(rootPackageJson.workspaces)
    ? rootPackageJson.workspaces
    : Array.isArray(rootPackageJson.workspaces?.packages)
      ? rootPackageJson.workspaces.packages
      : [];

  if (workspaces.length === 0) {
    throw new Error('No workspaces found in package.json');
  }

  return workspaces.map((workspacePattern) => {
    const normalizedPattern = workspacePattern.replace(/\/$/, '');
    return normalizedPattern.endsWith('package.json')
      ? normalizedPattern
      : `${normalizedPattern}/package.json`;
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runForOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }

  return result.stdout.trim();
}

function getChangedWorkspacePackageFiles() {
  const workspacePackagePatterns = getWorkspacePackagePatterns();

  try {
    const diffOutput = runForOutput('git', [
      'diff',
      '--name-only',
      '--diff-filter=ACMRT',
      'HEAD^',
      'HEAD',
      '--',
      ...workspacePackagePatterns
    ]);

    return diffOutput.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    console.warn('Could not diff HEAD^..HEAD. Continue with npm publish-state detection only.');
    return [];
  }
}

function getWorkspacePackageFiles() {
  const workspacePackagePatterns = getWorkspacePackagePatterns();
  const fileListOutput = runForOutput('git', ['ls-files', ...workspacePackagePatterns]);
  return fileListOutput.split('\n').map((line) => line.trim()).filter(Boolean);
}

function resolvePackageNames(workspacePackageFiles, changedPackageFiles) {
  const changedPackageFileSet = new Set(changedPackageFiles);
  const packageNames = new Set();

  for (const relativePath of workspacePackageFiles) {
    const absolutePath = resolve(process.cwd(), relativePath);
    const pkg = JSON.parse(readFileSync(absolutePath, 'utf8'));

    if (pkg.private === true) {
      continue;
    }

    const hasChangedVersion =
      changedPackageFileSet.has(relativePath) && hasVersionChange(relativePath);
    const isUnpublished = !hasChangedVersion && !isVersionPublished(pkg.name, pkg.version);

    if ((hasChangedVersion || isUnpublished) && typeof pkg.name === 'string' && pkg.name.length > 0) {
      packageNames.add(pkg.name);
    }
  }

  return Array.from(packageNames);
}

function isVersionPublished(packageName, version) {
  if (typeof packageName !== 'string' || packageName.length === 0) {
    return true;
  }
  if (typeof version !== 'string' || version.length === 0) {
    return true;
  }

  const result = spawnSync('npm', ['view', `${packageName}@${version}`, 'version', '--json'], {
    encoding: 'utf8'
  });

  if (result.status === 0) {
    return true;
  }

  const errorOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (/E404|404 Not Found|No match found for version/i.test(errorOutput)) {
    return false;
  }

  console.warn(
    `Could not verify publish status for ${packageName}@${version}. Build it to be safe.`
  );
  return false;
}

function hasVersionChange(relativePath) {
  const result = spawnSync(
    'git',
    ['diff', '--unified=0', 'HEAD^', 'HEAD', '--', relativePath],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    return false;
  }

  return /(^[-+]\s*"version"\s*:)/m.test(result.stdout);
}

const workspacePackageFiles = getWorkspacePackageFiles();
const changedPackageFiles = getChangedWorkspacePackageFiles();
const changedPackageNames = resolvePackageNames(workspacePackageFiles, changedPackageFiles);

if (changedPackageNames.length > 0) {
  console.log(
    `Building ${changedPackageNames.length} package(s): ${changedPackageNames.join(', ')}`
  );
  run('pnpm', ['exec', 'nx', 'run-many', '-t', 'build', '-p', changedPackageNames.join(',')]);
} else {
  console.log('No publish-target workspace packages detected. Skip build.');
}

run('pnpm', ['exec', 'changeset', 'publish', '--access', 'public']);
