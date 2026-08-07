import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const remoteRoot = join(packageRoot, 'src', 'lib', 'remote-components')
const workspaceRoot = join(packageRoot, '..', '..', '..')
const executeFile = promisify(execFile)
const shadcnUiEntry = join(
  workspaceRoot,
  'packages',
  'shadcn-ui',
  'dist',
  'index.js'
)
const componentNames = ['story-studio-workbench']
const sourceExtensions = new Set(['.ts', '.tsx'])

async function listTypeScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        return listTypeScriptFiles(fullPath)
      }
      return entry.isFile() && sourceExtensions.has(extname(entry.name))
        ? [fullPath]
        : []
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

function localWorkspacePackagesPlugin() {
  return {
    name: 'xpert-local-workspace-packages',
    setup(buildApi) {
      buildApi.onResolve(
        { filter: /^@xpert-ai\/plugin-shadcn-ui$/ },
        () => ({ path: shadcnUiEntry })
      )
    }
  }
}

async function compileTailwind(componentName) {
  const componentDir = join(remoteRoot, componentName)
  const inputPath = join(componentDir, 'src', 'tailwind.css')
  if (!existsSync(inputPath)) return null

  const outputDir = await mkdtemp(
    join(tmpdir(), `${componentName}-tailwind-`)
  )
  const outputPath = join(outputDir, 'tailwind.generated.css')
  const executable = join(
    packageRoot,
    'node_modules',
    '.bin',
    'tailwindcss'
  )
  if (!existsSync(executable)) {
    throw new Error(
      'Tailwind CLI is missing. Run pnpm install in the plugin workspace.'
    )
  }
  try {
    await executeFile(
      executable,
      ['-i', inputPath, '-o', outputPath, '--minify'],
      { cwd: componentDir }
    )
    return await readFile(outputPath, 'utf8')
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
}

function compiledTailwindPlugin(componentName, css) {
  const tailwindPath = join(
    remoteRoot,
    componentName,
    'src',
    'tailwind.css'
  )
  return {
    name: 'xpert-compiled-tailwind',
    setup(buildApi) {
      buildApi.onLoad({ filter: /tailwind\.css$/ }, (args) =>
        args.path === tailwindPath
          ? { contents: css ?? '', loader: 'css', resolveDir: dirname(args.path) }
          : undefined
      )
    }
  }
}

async function bundleComponent(componentName) {
  const componentDir = join(remoteRoot, componentName)
  const sourceDir = join(componentDir, 'src')
  const entryPoint = join(sourceDir, 'main.tsx')

  if (!existsSync(entryPoint)) {
    throw new Error(
      `Missing remote component entry: ${relative(process.cwd(), entryPoint)}`
    )
  }
  if (!existsSync(shadcnUiEntry)) {
    throw new Error(
      'Shared shadcn UI output is missing. Run the package build first.'
    )
  }

  await validateSources(sourceDir)
  const tailwindCss = await compileTailwind(componentName)
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
      '.png': 'dataurl',
      '.woff2': 'dataurl',
      '.svg': 'text'
    },
    plugins: [
      compiledTailwindPlugin(componentName, tailwindCss),
      localWorkspacePackagesPlugin(),
      reactShimPlugin(componentName)
    ],
    banner: {
      js: ';'
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.IS_PREACT': '"false"'
    }
  })
  const jsOutput = result.outputFiles?.find((outputFile) =>
    outputFile.path.endsWith('.js')
  )
  if (!jsOutput) {
    throw new Error(
      `esbuild did not produce ${componentName}/app.js output`
    )
  }
  const cssOutput = result.outputFiles?.find((outputFile) =>
    outputFile.path.endsWith('.css')
  )
  return {
    outputPath: join(componentDir, 'app.js'),
    text: normalizeGeneratedOutput(jsOutput.text),
    cssOutputPath: join(componentDir, 'app.css'),
    cssText: cssOutput ? normalizeGeneratedOutput(cssOutput.text) : ''
  }
}

function normalizeGeneratedOutput(text) {
  return text.replace(/[ \t]+$/gm, '')
}

const outputs = await Promise.all(componentNames.map(bundleComponent))

if (process.argv.includes('--check')) {
  let hasOutdatedOutput = false
  await Promise.all(
    outputs.flatMap(({ outputPath, text, cssOutputPath, cssText }) => [
      (async () => {
        const currentOutput = existsSync(outputPath)
          ? await readFile(outputPath, 'utf8')
          : ''
        if (currentOutput !== text) {
          console.error(
            `${relative(process.cwd(), outputPath)} is out of date. Run pnpm build.`
          )
          hasOutdatedOutput = true
        }
      })(),
      (async () => {
        const currentCss = existsSync(cssOutputPath)
          ? await readFile(cssOutputPath, 'utf8')
          : ''
        if (currentCss !== cssText) {
          console.error(
            `${relative(process.cwd(), cssOutputPath)} is out of date. Run pnpm build.`
          )
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
