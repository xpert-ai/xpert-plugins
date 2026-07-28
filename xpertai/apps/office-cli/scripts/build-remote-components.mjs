import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const remoteRoot = join(packageRoot, 'src', 'lib', 'remote-components')
const componentName = 'office-cli-workbench'
const sourceExtensions = new Set(['.ts', '.tsx'])
const requireFromHere = createRequire(import.meta.url)
const fallbackRequire = createRequire(join(packageRoot, '..', 'office-editor', 'package.json'))
const esbuildPath = resolveDependency('esbuild')
const { build, transform } = await import(esbuildPath)

function resolveDependency(name) {
  try {
    return requireFromHere.resolve(name)
  } catch {
    return fallbackRequire.resolve(name)
  }
}

async function listTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return listTypeScriptFiles(fullPath)
    return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [fullPath] : []
  }))
  return files.flat()
}

function reactShimPlugin(sourceDir) {
  const shims = new Map([
    ['react', join(sourceDir, 'react-shim.ts')],
    ['react-dom', join(sourceDir, 'react-dom-shim.ts')],
    ['react-dom/client', join(sourceDir, 'react-dom-client-shim.ts')],
    ['react/jsx-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')],
    ['react/jsx-dev-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')]
  ])
  return {
    name: 'xpert-react-global-shims',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => {
        const path = shims.get(args.path)
        return path ? { path } : undefined
      })
    }
  }
}

async function buildComponent() {
  const componentDir = join(remoteRoot, componentName)
  const sourceDir = join(componentDir, 'src')
  const entryPoint = join(sourceDir, 'main.tsx')
  const files = await listTypeScriptFiles(sourceDir)
  await Promise.all(files.map(async (file) => {
    const source = await readFile(file, 'utf8')
    await transform(source, {
      loader: extname(file) === '.tsx' ? 'tsx' : 'ts',
      jsxFactory: 'h',
      jsxFragment: 'React.Fragment',
      sourcefile: file,
      format: 'esm',
      target: 'es2020'
    })
  }))
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    outdir: componentDir,
    entryNames: 'app',
    write: false,
    logLevel: 'silent',
    legalComments: 'none',
    minify: true,
    jsxFactory: 'h',
    jsxFragment: 'React.Fragment',
    loader: { '.css': 'css' },
    plugins: [reactShimPlugin(sourceDir)],
    banner: { js: ';' },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.IS_PREACT': '"false"'
    }
  })
  const jsOutput = result.outputFiles?.find((file) => file.path.endsWith('.js'))
  if (!jsOutput) throw new Error('OfficeCLI Workbench bundle did not produce app.js.')
  const cssOutput = result.outputFiles?.find((file) => file.path.endsWith('.css'))
  return {
    jsPath: join(componentDir, 'app.js'),
    js: normalize(jsOutput.text),
    cssPath: join(componentDir, 'app.css'),
    css: cssOutput ? normalize(cssOutput.text) : ''
  }
}

function normalize(value) {
  return value.replace(/[ \t]+$/gm, '')
}

const output = await buildComponent()
if (process.argv.includes('--check')) {
  const currentJs = existsSync(output.jsPath) ? await readFile(output.jsPath, 'utf8') : ''
  const currentCss = existsSync(output.cssPath) ? await readFile(output.cssPath, 'utf8') : ''
  if (currentJs !== output.js || currentCss !== output.css) {
    console.error(`${relative(process.cwd(), dirname(output.jsPath))} is out of date. Run npm run build.`)
    process.exit(1)
  }
} else {
  await Promise.all([
    writeFile(output.jsPath, output.js),
    writeFile(output.cssPath, output.css)
  ])
}
