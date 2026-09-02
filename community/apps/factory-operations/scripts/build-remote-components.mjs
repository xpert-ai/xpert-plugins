import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const componentNames = [
  'factory-operations-center',
  'factory-case-workspace',
  'factory-operations-dashboard'
]
const sharedSourceDir = join(
  packageRoot,
  'src',
  'lib',
  'remote-components',
  'factory-operations-center',
  'src'
)

const tailwindTempDir = await mkdtemp(join(tmpdir(), 'factory-ops-tailwind-'))
const tailwindOutput = join(tailwindTempDir, 'shadcn.css')
const tailwindResult = spawnSync(
  'corepack',
  [
    'pnpm',
    'exec',
    'tailwindcss',
    '-i',
    join(packageRoot, 'src', 'lib', 'ui', 'globals.css'),
    '-o',
    tailwindOutput,
    '--minify'
  ],
  { cwd: packageRoot, encoding: 'utf8' }
)
if (tailwindResult.error) throw tailwindResult.error
if (tailwindResult.status !== 0) {
  throw new Error(tailwindResult.stderr || 'Local shadcn Tailwind compilation failed.')
}
const shadcnCss = await readFile(tailwindOutput, 'utf8')
await rm(tailwindTempDir, { recursive: true, force: true })

async function validateSource(file) {
  const source = await readFile(file, 'utf8')
  await transform(source, {
    loader: extname(file) === '.tsx' ? 'tsx' : 'ts',
    jsx: 'automatic',
    sourcefile: file,
    format: 'esm',
    target: 'es2020'
  })
}

async function collectSourceFiles(directory) {
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(fullPath)
      return entry.isFile() && ['.ts', '.tsx'].includes(extname(entry.name))
        ? [fullPath]
        : []
    })
  )
  return nested.flat()
}

function reactShimPlugin() {
  const shims = new Map([
    ['react', join(sharedSourceDir, 'react-shim.ts')],
    ['react-dom', join(sharedSourceDir, 'react-dom-shim.ts')],
    ['react-dom/client', join(sharedSourceDir, 'react-dom-client-shim.ts')],
    ['react/jsx-runtime', join(sharedSourceDir, 'react-jsx-runtime-shim.ts')],
    ['react/jsx-dev-runtime', join(sharedSourceDir, 'react-jsx-runtime-shim.ts')]
  ])
  return {
    name: 'xpert-react-global-shims',
    setup(buildApi) {
      buildApi.onResolve(
        {
          filter:
            /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/
        },
        (args) => {
          const path = shims.get(args.path)
          return path ? { path } : undefined
        }
      )
    }
  }
}

const outputs = []
for (const componentName of componentNames) {
  const componentDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName)
  const sourceDir = join(componentDir, 'src')
  const sourceFiles = await collectSourceFiles(sourceDir)
  await Promise.all(sourceFiles.map(validateSource))
  const result = await build({
    entryPoints: [join(sourceDir, 'main.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    outdir: componentDir,
    entryNames: 'app',
    write: false,
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent',
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.IS_PREACT': '"false"'
    },
    loader: {
      '.svg': 'text',
      '.woff2': 'dataurl'
    },
    plugins: [reactShimPlugin()]
  })
  const jsOutput = result.outputFiles?.find((file) => file.path.endsWith('.js'))
  if (!jsOutput) throw new Error(`${componentName} build produced no JavaScript.`)
  const cssOutput = result.outputFiles?.find((file) => file.path.endsWith('.css'))
  outputs.push(
    { path: join(componentDir, 'app.js'), text: normalize(jsOutput.text) },
    {
      path: join(componentDir, 'app.css'),
      text: normalize(`${shadcnCss}\n${cssOutput?.text ?? ''}`)
    }
  )
}

if (process.argv.includes('--check')) {
  let stale = false
  for (const output of outputs) {
    const current = existsSync(output.path) ? await readFile(output.path, 'utf8') : ''
    if (current !== output.text) {
      console.error(`${relative(packageRoot, output.path)} is out of date.`)
      stale = true
    }
  }
  if (stale) process.exit(1)
} else {
  await Promise.all(outputs.map((output) => writeFile(output.path, output.text)))
}

function normalize(value) {
  return value.replace(/[ \t]+$/gm, '')
}
