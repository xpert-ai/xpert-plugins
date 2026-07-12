import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const remoteRoot = join(packageRoot, 'src', 'lib', 'remote-components')
const artifactViewerRoot = join(packageRoot, 'src', 'lib', 'artifact-viewer')
const workspaceRoot = join(packageRoot, '..', '..', '..')
const pluginSdkCollaborationClientEntry = join(workspaceRoot, '..', 'xpert', 'packages', 'plugin-sdk', 'src', 'lib', 'collaboration', 'client.ts')
const componentNames = ['excalidraw-workbench']
const sourceExtensions = new Set(['.ts', '.tsx'])

async function listTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        return listTypeScriptFiles(fullPath)
      }
      return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [fullPath] : []
    })
  )
  return files.flat()
}

async function validateSources(sourceDir) {
  const files = await listTypeScriptFiles(sourceDir)
  await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, 'utf8')
      await transform(source, {
        loader: extname(file) === '.tsx' ? 'tsx' : 'ts',
        jsxFactory: 'h',
        jsxFragment: 'React.Fragment',
        sourcefile: file,
        format: 'esm',
        target: 'es2020'
      })
    })
  )
}

function reactShimPlugin(componentName) {
  const sourceDir = join(remoteRoot, componentName, 'src')
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

function localWorkspacePackagesPlugin() {
  return {
    name: 'xpert-local-workspace-packages',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@xpert-ai\/plugin-sdk$/ }, () => ({ path: pluginSdkCollaborationClientEntry }))
    }
  }
}

function workspaceCssDependenciesPlugin() {
  const shadcnNodeModules = join(workspaceRoot, 'packages', 'shadcn-ui', 'node_modules')
  const paths = new Map([
    ['tailwindcss', join(shadcnNodeModules, 'tailwindcss', 'index.css')],
    ['tw-animate-css', join(shadcnNodeModules, 'tw-animate-css', 'dist', 'tw-animate.css')],
    ['shadcn/tailwind.css', join(shadcnNodeModules, 'shadcn', 'dist', 'tailwind.css')]
  ])
  return {
    name: 'xpert-workspace-css-dependencies',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^(tailwindcss|tw-animate-css|shadcn\/tailwind\.css)$/ }, (args) => ({
        path: paths.get(args.path)
      }))
    }
  }
}

async function bundleComponent(componentName) {
  const componentDir = join(remoteRoot, componentName)
  const sourceDir = join(componentDir, 'src')
  const entryPoint = join(sourceDir, 'main.tsx')

  if (!existsSync(entryPoint)) {
    throw new Error(`Missing remote component entry: ${relative(process.cwd(), entryPoint)}`)
  }

  await validateSources(sourceDir)
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    conditions: ['@xpert-plugins-starter/source', 'production'],
    outdir: componentDir,
    entryNames: 'app',
    assetNames: 'assets/[name]-[hash]',
    write: false,
    logLevel: 'silent',
    legalComments: 'none',
    minify: true,
    jsxFactory: 'h',
    jsxFragment: 'React.Fragment',
    loader: {
      '.woff2': 'dataurl'
    },
    plugins: [localWorkspacePackagesPlugin(), workspaceCssDependenciesPlugin(), reactShimPlugin(componentName)],
    banner: {
      js: ';'
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.IS_PREACT': '"false"'
    }
  })
  const jsOutput = result.outputFiles?.find((outputFile) => outputFile.path.endsWith('.js'))
  if (!jsOutput) {
    throw new Error(`esbuild did not produce ${componentName}/app.js output`)
  }
  const cssOutput = result.outputFiles?.find((outputFile) => outputFile.path.endsWith('.css'))
  return {
    outputPath: join(componentDir, 'app.js'),
    text: normalize(jsOutput.text),
    cssOutputPath: join(componentDir, 'app.css'),
    cssText: normalize(cssOutput ? cssOutput.text : '')
  }
}

async function bundleArtifactViewer() {
  const sourceDir = join(artifactViewerRoot, 'src')
  const entryPoint = join(sourceDir, 'main.tsx')

  if (!existsSync(entryPoint)) {
    throw new Error(`Missing Artifact viewer entry: ${relative(process.cwd(), entryPoint)}`)
  }

  await validateSources(sourceDir)
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    conditions: ['production'],
    outdir: artifactViewerRoot,
    entryNames: 'app',
    assetNames: 'assets/[name]-[hash]',
    write: false,
    logLevel: 'silent',
    legalComments: 'none',
    minify: true,
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: {
      '.woff2': 'dataurl',
      '.woff': 'dataurl',
      '.ttf': 'dataurl',
      '.png': 'dataurl',
      '.svg': 'dataurl'
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.IS_PREACT': '"false"'
    }
  })
  const jsOutput = result.outputFiles?.find((outputFile) => outputFile.path.endsWith('.js'))
  if (!jsOutput) throw new Error('esbuild did not produce Artifact viewer app.js output')
  const cssOutput = result.outputFiles?.find((outputFile) => outputFile.path.endsWith('.css'))
  return {
    outputPath: join(artifactViewerRoot, 'app.js'),
    text: normalize(jsOutput.text),
    cssOutputPath: join(artifactViewerRoot, 'app.css'),
    cssText: normalize(cssOutput ? cssOutput.text : '')
  }
}

function normalize(value) {
  return value.replace(/[ \t]+$/gm, '')
}

const outputs = await Promise.all([
  ...componentNames.map(bundleComponent),
  bundleArtifactViewer()
])

if (process.argv.includes('--check')) {
  let hasOutdatedOutput = false
  await Promise.all(
    outputs.flatMap(({ outputPath, text, cssOutputPath, cssText }) => [
      (async () => {
      const currentOutput = existsSync(outputPath) ? await readFile(outputPath, 'utf8') : ''
      if (currentOutput !== text) {
        console.error(`${relative(process.cwd(), outputPath)} is out of date. Run pnpm build.`)
        hasOutdatedOutput = true
      }
      })(),
      (async () => {
        const currentCss = existsSync(cssOutputPath) ? await readFile(cssOutputPath, 'utf8') : ''
        if (currentCss !== cssText) {
          console.error(`${relative(process.cwd(), cssOutputPath)} is out of date. Run pnpm build.`)
          hasOutdatedOutput = true
        }
      })()
    ])
  )
  if (hasOutdatedOutput) {
    process.exit(1)
  }
} else {
  await Promise.all(
    outputs.flatMap(({ outputPath, text, cssOutputPath, cssText }) => [
      writeFile(outputPath, text),
      writeFile(cssOutputPath, cssText)
    ])
  )
}
