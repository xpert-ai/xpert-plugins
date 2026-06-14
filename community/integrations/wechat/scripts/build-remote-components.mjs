import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const remoteRoot = join(packageRoot, 'src', 'lib', 'remote-components')
const componentNames = ['wechat-personal-workbench']
const sourceExtensions = new Set(['.ts', '.tsx'])
const requireFromPackage = createRequire(join(packageRoot, 'package.json'))

function candidateEchartsPaths() {
  const candidates = []
  try {
    candidates.push(requireFromPackage.resolve('echarts/dist/echarts.min.js'))
  } catch {
    // Continue with workspace fallbacks below.
  }

  let current = packageRoot
  for (let depth = 0; depth < 8; depth += 1) {
    candidates.push(join(current, 'node_modules', 'echarts', 'dist', 'echarts.min.js'))
    candidates.push(join(dirname(current), 'xpert-pro', 'node_modules', 'echarts', 'dist', 'echarts.min.js'))
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  return Array.from(new Set(candidates))
}

async function readEchartsUmd() {
  const path = candidateEchartsPaths().find((candidate) => existsSync(candidate))
  if (!path) {
    throw new Error('Cannot locate echarts/dist/echarts.min.js. Install echarts or build beside the xpert-pro workspace.')
  }
  return readFile(path, 'utf8')
}

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

async function bundleComponent(componentName) {
  const componentDir = join(remoteRoot, componentName)
  const sourceDir = join(componentDir, 'src')
  const entryPoint = join(sourceDir, 'main.tsx')

  await validateSources(sourceDir)
  const echartsUmd = await readEchartsUmd()
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    write: false,
    logLevel: 'silent',
    legalComments: 'none',
    jsxFactory: 'h',
    jsxFragment: 'React.Fragment',
    banner: {
      js: ';'
    }
  })
  const output = result.outputFiles?.[0]
  if (!output) {
    throw new Error(`esbuild did not produce ${componentName}/app.js output`)
  }
  return {
    outputPath: join(componentDir, 'app.js'),
    text: `${echartsUmd}\n${output.text}`
  }
}

const outputs = await Promise.all(componentNames.map(bundleComponent))

if (process.argv.includes('--check')) {
  let hasOutdatedOutput = false
  await Promise.all(
    outputs.map(async ({ outputPath, text }) => {
      const currentOutput = await readFile(outputPath, 'utf8')
      if (currentOutput !== text) {
        console.error(`${relative(process.cwd(), outputPath)} is out of date. Run pnpm build.`)
        hasOutdatedOutput = true
      }
    })
  )
  if (hasOutdatedOutput) {
    process.exit(1)
  }
} else {
  await Promise.all(outputs.map(({ outputPath, text }) => writeFile(outputPath, text)))
}
