// Builds the Supplier Delivery Workbench remote view into app.js / app.css.
// Adapted from community/apps/valve-business-workbench/scripts/build-remote-components.mjs.
// `--check` fails when the committed assets are stale instead of writing them.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const componentName = 'supplier-delivery-workbench'
const componentDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName)
const sourceDir = join(componentDir, 'src')
const workspaceRoot = join(packageRoot, '..', '..', '..')
const shadcnUiPackageRoot = join(workspaceRoot, 'packages', 'shadcn-ui')
const shadcnUiDist = join(shadcnUiPackageRoot, 'dist')
const workspaceRequire = createRequire(join(shadcnUiPackageRoot, 'package.json'))
const tailwindcss = (await import(pathToFileURL(workspaceRequire.resolve('@tailwindcss/vite')).href)).default
const { build: viteBuild } = await import(pathToFileURL(workspaceRequire.resolve('vite')).href)

if (!existsSync(join(shadcnUiDist, 'index.js'))) {
  throw new Error('Build @xpert-ai/plugin-shadcn-ui first: pnpm run build:ui')
}

// Remote views run against the React instance supplied by the host iframe runtime.
const shims = new Map([
  ['react', join(sourceDir, 'react-shim.ts')],
  ['react-dom', join(sourceDir, 'react-dom-shim.ts')],
  ['react-dom/client', join(sourceDir, 'react-dom-client-shim.ts')],
  ['react/jsx-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')],
  ['react/jsx-dev-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')]
])

const result = await viteBuild({
  configFile: false,
  root: componentDir,
  logLevel: 'error',
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      { find: 'tailwindcss', replacement: workspaceRequire.resolve('tailwindcss/index.css') },
      { find: '@xpert-ai/plugin-shadcn-ui/style.css', replacement: join(shadcnUiDist, 'style.css') },
      { find: '@xpert-ai/plugin-shadcn-ui/i18n', replacement: join(shadcnUiDist, 'i18n.js') },
      { find: '@xpert-ai/plugin-shadcn-ui/theme', replacement: join(shadcnUiDist, 'theme.js') },
      { find: /^@xpert-ai\/plugin-shadcn-ui$/, replacement: join(shadcnUiDist, 'index.js') },
      ...[...shims.entries()]
        .sort(([left], [right]) => right.length - left.length)
        .map(([find, replacement]) => ({
          find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
          replacement
        }))
    ]
  },
  esbuild: {
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment'
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.IS_PREACT': '"false"'
  },
  build: {
    write: false,
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: join(sourceDir, 'main.tsx'),
      name: 'XpertSupplierDeliveryWorkbench',
      formats: ['iife'],
      fileName: () => 'app.js'
    }
  }
})

const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output)
const normalizeArtifact = (output) => output.replace(/[\t ]+(?=\r?\n)/g, '')
const js = normalizeArtifact(outputs.find((item) => item.type === 'chunk' && item.isEntry)?.code ?? '')
const css = normalizeArtifact(
  String(outputs.find((item) => item.type === 'asset' && item.fileName.endsWith('.css'))?.source ?? '')
)
if (!js || !css) throw new Error('Supplier Delivery Workbench build did not produce both JavaScript and CSS assets.')

const artifacts = [
  [join(componentDir, 'app.js'), js],
  [join(componentDir, 'app.css'), css]
]

if (process.argv.includes('--check')) {
  let stale = false
  for (const [path, output] of artifacts) {
    const current = existsSync(path) ? await readFile(path, 'utf8') : ''
    if (current !== output) {
      console.error(`${relative(process.cwd(), path)} is out of date. Run pnpm generate:remote.`)
      stale = true
    }
  }
  if (stale) process.exit(1)
  console.log('Remote view assets are up to date.')
} else {
  await Promise.all(artifacts.map(([path, output]) => writeFile(path, output)))
  console.log(`Built ${componentName}: app.js ${js.length} bytes, app.css ${css.length} bytes`)
}
