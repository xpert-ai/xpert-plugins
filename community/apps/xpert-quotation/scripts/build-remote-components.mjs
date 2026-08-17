import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const componentName = 'xpert-quotation-workbench'
const componentDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName)
const sourceDir = join(componentDir, 'src')
const workspaceRoot = process.env.XPERT_PLUGIN_WORKSPACE_ROOT
  ? resolve(process.env.XPERT_PLUGIN_WORKSPACE_ROOT)
  : join(packageRoot, '..', '..', '..')
const shadcnUiRoot = join(workspaceRoot, 'packages', 'shadcn-ui')

async function listSources(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? listSources(path) : entry.isFile() && ['.ts', '.tsx'].includes(extname(path)) ? [path] : []
  }))).flat()
}

for (const file of await listSources(sourceDir)) {
  await transform(await readFile(file, 'utf8'), { loader: extname(file) === '.tsx' ? 'tsx' : 'ts', jsx: 'automatic', sourcefile: file, format: 'esm', target: 'es2020' })
}

const shims = new Map([
  ['react', join(sourceDir, 'react-shim.ts')],
  ['react-dom', join(sourceDir, 'react-dom-shim.ts')],
  ['react-dom/client', join(sourceDir, 'react-dom-client-shim.ts')],
  ['react/jsx-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')],
  ['react/jsx-dev-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')]
])

const result = await build({
  entryPoints: [join(sourceDir, 'main.tsx')], bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
  conditions: ['shadcn-ui-source', '@xpert-plugins-starter/source', 'production'], outdir: componentDir, entryNames: 'app', write: false,
  logLevel: 'silent', legalComments: 'none', minify: true, jsx: 'automatic', loader: { '.css': 'css', '.woff2': 'dataurl' },
  plugins: [
    { name: 'xpert-local-plugin-shadcn-ui', setup(api) {
      api.onResolve({ filter: /^@xpert-ai\/plugin-shadcn-ui$/ }, () => ({ path: join(shadcnUiRoot, 'src', 'index.ts') }))
      api.onResolve({ filter: /^#(?:components|lib|hooks)\// }, (args) => ({ path: resolveShadcnUiSource(args.path.slice(1)) }))
    } },
    { name: 'xpert-react-shims', setup(api) { api.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => { const path = shims.get(args.path); return path ? { path } : undefined }) } }
  ],
  banner: { js: ';' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' }
})

const js = result.outputFiles?.find((file) => file.path.endsWith('.js'))?.text.replace(/[ \t]+$/gm, '') ?? ''
const bundledCss = result.outputFiles?.find((file) => file.path.endsWith('.css'))?.text.replace(/[ \t]+$/gm, '') ?? ''
const css = [bundledCss, await buildTailwindCss()].filter(Boolean).join('\n')
assertWorkbenchLayoutCss(css)
const outputs = [[join(componentDir, 'app.js'), js], [join(componentDir, 'app.css'), css]]
if (process.argv.includes('--check')) {
  let stale = false
  for (const [path, content] of outputs) {
    if (!existsSync(path) || await readFile(path, 'utf8') !== content) { console.error(`${relative(process.cwd(), path)} is out of date. Run pnpm build.`); stale = true }
  }
  if (stale) process.exit(1)
} else {
  await Promise.all(outputs.map(([path, content]) => writeFile(path, content)))
}

function resolveShadcnUiSource(path) {
  const base = join(shadcnUiRoot, 'src', path)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate)) return candidate
  }
  return base
}

async function buildTailwindCss() {
  const temporaryDir = await mkdtemp(join(tmpdir(), 'xpert-quotation-css-'))
  const outputPath = join(temporaryDir, 'app.css')
  try {
    execFileSync(resolveTailwindBin(), ['-i', join(componentDir, 'tailwind.css'), '-o', outputPath, '--minify'], {
      cwd: workspaceRoot,
      stdio: 'pipe'
    })
    return (await readFile(outputPath, 'utf8')).replace(/[ \t]+$/gm, '')
  } finally {
    await rm(temporaryDir, { recursive: true, force: true })
  }
}

function resolveTailwindBin() {
  const executable = process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss'
  for (const path of [
    resolve(packageRoot, 'node_modules', '.bin', executable),
    resolve(workspaceRoot, 'node_modules', '.bin', executable),
    resolve(workspaceRoot, 'bid-studio', 'node_modules', '.bin', executable)
  ]) {
    if (existsSync(path)) return path
  }
  throw new Error("Missing local binary 'tailwindcss'. Run pnpm install before building remote components.")
}

function assertWorkbenchLayoutCss(css) {
  const requiredDeclarations = [
    'display:grid!important',
    'grid-template-columns:208px minmax(0,1fr)',
    'grid-template-rows:auto minmax(0,1fr)',
    'grid-row-start:2'
  ]
  const missing = requiredDeclarations.filter((declaration) => !css.includes(declaration))
  if (missing.length) {
    throw new Error(`Generated Workbench CSS is missing required layout declarations: ${missing.join(', ')}`)
  }
}
