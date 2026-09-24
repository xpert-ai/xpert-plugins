import { build } from 'esbuild'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shared = resolve(root, '../../..', 'packages/shadcn-ui')
const aliases = {
  react: join(root, 'src/remote/react-shim.ts'),
  'react-dom': join(root, 'src/remote/dom-shim.ts'),
  'react-dom/client': join(root, 'src/remote/dom-shim.ts'),
  'react/jsx-runtime': join(root, 'src/remote/jsx-shim.ts'),
  'react/jsx-dev-runtime': join(root, 'src/remote/jsx-shim.ts'),
  '@xpert-ai/plugin-shadcn-ui': join(shared, 'dist/index.js'),
  '@xpert-ai/plugin-shadcn-ui/theme': join(shared, 'dist/theme.js'),
  '@xpert-ai/plugin-shadcn-ui/style.css': join(shared, 'dist/style.css')
}
const temp = await mkdtemp(join(tmpdir(), 'lease-css-'))
try {
  const cssPath = join(temp, 'utilities.css')
  const cssRun = spawnSync(
    'corepack',
    [
      'pnpm',
      'exec',
      'tailwindcss',
      '-i',
      'scripts/tailwind.css',
      '-o',
      cssPath,
      '--minify'
    ],
    { cwd: root, encoding: 'utf8' }
  )
  if (cssRun.status !== 0) throw new Error(cssRun.stderr || 'CSS build failed')
  const result = await build({
    entryPoints: [join(root, 'src/remote/main.tsx')],
    outdir: join(root, 'dist/remote'),
    entryNames: 'app',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    minify: true,
    write: false,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'host-react',
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(react($|\/)|react-dom($|\/)|@xpert-ai\/plugin-shadcn-ui($|\/))/
            },
            (args) =>
              aliases[args.path] ? { path: aliases[args.path] } : undefined
          )
        }
      }
    ]
  })
  await mkdir(join(root, 'dist/remote'), { recursive: true })
  for (const file of result.outputFiles) {
    const content = file.path.endsWith('.css')
      ? file.text + '\n' + (await readFile(cssPath, 'utf8'))
      : file.text
    if (process.argv.includes('--check')) {
      if ((await readFile(file.path, 'utf8')) !== content)
        throw new Error('Stale asset: ' + file.path)
    } else await writeFile(file.path, content)
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}
