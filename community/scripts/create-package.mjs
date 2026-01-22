#!/usr/bin/env node
import { mkdir, writeFile, access } from 'fs/promises';
import path from 'path';

const scopes = new Set(['tools', 'middlewares', 'models', 'packages']);

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const trimmed = raw.slice(2);
    const [key, value] = trimmed.split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function usage() {
  console.error('Usage: pnpm create:package --scope <tools|middlewares|models|packages> --name <package-name> [--description "text"] [--public]');
}

async function ensureNotExists(target) {
  try {
    await access(target);
    console.error(`Target already exists: ${target}`);
    process.exit(1);
  } catch (err) {
    // expected if missing
  }
}

async function main() {
  const args = parseArgs();
  const scope = String(args.scope || '').trim();
  const name = String(args.name || '').trim();
  const description = String(args.description || '').trim();
  const isPublic = Boolean(args.public);

  if (!scope || !name || !scopes.has(scope)) {
    usage();
    process.exit(1);
  }

  const normalizedName = name.replace(/\s+/g, '-').toLowerCase();
  const rootDir = process.cwd();
  const packageDir = path.join(rootDir, scope, normalizedName);

  await ensureNotExists(packageDir);

  const packageName = `@community/${scope}-${normalizedName}`;
  const tsconfigBase = path.relative(packageDir, path.join(rootDir, 'tsconfig.base.json')).split(path.sep).join('/');

  await mkdir(path.join(packageDir, 'src'), { recursive: true });

  const pkg = {
    name: packageName,
    version: '0.0.0',
    description: description || `${scope} ${normalizedName} package`,
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        import: './dist/index.js',
        types: './dist/index.d.ts'
      }
    },
    files: ['dist'],
    scripts: {
      build: 'tsc -p tsconfig.json',
      lint: 'echo "(todo) add lint"',
      test: 'echo "(todo) add tests"'
    },
    license: 'MIT',
    publishConfig: {
      access: isPublic ? 'public' : 'restricted'
    }
  };

  const tsconfig = {
    extends: tsconfigBase,
    compilerOptions: {
      outDir: './dist',
      rootDir: './src'
    },
    include: ['src/**/*']
  };

  const indexContent = `// TODO: replace with real implementation\nexport function placeholder() {\n  return '${packageName} is ready to build.';\n}\n`;

  const readmeContent = `# ${packageName}\n\n${description || 'New package scaffolded via create-package script.'}\n\n## Scripts\n- build: \`pnpm build\`\n- test: \`pnpm test\` (placeholder)\n- lint: \`pnpm lint\` (placeholder)\n\n## Notes\n- Update exports and add dependencies as needed.\n- Replace \`src/index.ts\` with real code and tests.\n`;

  await Promise.all([
    writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`),
    writeFile(path.join(packageDir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`),
    writeFile(path.join(packageDir, 'src', 'index.ts'), indexContent),
    writeFile(path.join(packageDir, 'README.md'), readmeContent)
  ]);

  console.log(`Created ${packageName} at ${packageDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
