import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build as esbuildBuild, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const componentDir = join(packageRoot, 'src', 'lib', 'remote-components', 'cut-workbench')
const sourceDir = join(componentDir, 'src')
const workspaceRoot = join(packageRoot, '..', '..', '..')
const shadcnUiDistEntry = join(workspaceRoot, 'packages', 'shadcn-ui', 'dist', 'index.js')
const workspaceRequire = createRequire(join(workspaceRoot, 'packages', 'shadcn-ui', 'package.json'))
const tailwindcss = (await import(pathToFileURL(workspaceRequire.resolve('@tailwindcss/vite')).href)).default
const { build: viteBuild } = await import(pathToFileURL(workspaceRequire.resolve('vite')).href)

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : []
  }))).flat()
}

for (const file of await sourceFiles(sourceDir)) {
  await transform(await readFile(file, 'utf8'), {
    loader: extname(file) === '.tsx' ? 'tsx' : 'ts', jsxFactory: 'h', jsxFragment: 'React.Fragment', sourcefile: file, format: 'esm', target: 'es2020'
  })
}

const shims = new Map([
  ['react', join(sourceDir, 'react-shim.ts')],
  ['react-dom', join(sourceDir, 'react-dom-shim.ts')],
  ['react-dom/client', join(sourceDir, 'react-dom-client-shim.ts')],
  ['react/jsx-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')],
  ['react/jsx-dev-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')]
])
const workerResult = await esbuildBuild({
  entryPoints: [join(sourceDir, 'cut-transcription.worker.ts')], bundle: true, format: 'iife', platform: 'browser', target: ['es2022'],
  write: false, logLevel: 'silent', legalComments: 'none', minify: true,
  conditions: ['onnxruntime-web-use-extern-wasm'],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
})
const transcriptionWorkerSource = workerResult.outputFiles?.find((file) => file.path.endsWith('.js'))?.text
  ?? workerResult.outputFiles?.[0]?.text
  ?? ''
if (!transcriptionWorkerSource) throw new Error('Cut transcription worker build produced no JavaScript output.')
const result = await viteBuild({
  configFile: false,
  root: componentDir,
  logLevel: 'error',
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      { find: 'tailwindcss', replacement: workspaceRequire.resolve('tailwindcss/index.css') },
      { find: '@xpert-ai/plugin-shadcn-ui/style.css', replacement: join(workspaceRoot, 'packages', 'shadcn-ui', 'dist', 'style.css') },
      { find: '@xpert-ai/plugin-shadcn-ui', replacement: shadcnUiDistEntry },
      ...[...shims.entries()].sort(([left], [right]) => right.length - left.length).map(([find, replacement]) => ({ find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement }))
    ]
  },
  esbuild: { jsxFactory: 'h', jsxFragment: 'React.Fragment' },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.IS_PREACT': '"false"',
    __CUT_TRANSCRIPTION_WORKER_SOURCE__: JSON.stringify(transcriptionWorkerSource)
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
      name: 'CutWorkbench',
      formats: ['iife'],
      fileName: () => 'app.js'
    }
  }
})
const buildOutputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output)
const js = buildOutputs.find((item) => item.type === 'chunk' && item.isEntry)?.code ?? ''
const css = String(buildOutputs.find((item) => item.type === 'asset' && item.fileName.endsWith('.css'))?.source ?? '')
const artifacts = [[join(componentDir, 'app.js'), js], [join(componentDir, 'app.css'), css]]

if (process.argv.includes('--check')) {
  let stale = false
  for (const [path, output] of artifacts) {
    const current = existsSync(path) ? await readFile(path, 'utf8') : ''
    if (current !== output) { console.error(`${relative(process.cwd(), path)} is out of date. Run pnpm build.`); stale = true }
  }
  if (stale) process.exit(1)
} else {
  await Promise.all(artifacts.map(([path, output]) => writeFile(path, output)))
}
