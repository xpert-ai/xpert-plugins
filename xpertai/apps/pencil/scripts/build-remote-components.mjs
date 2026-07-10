import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build as viteBuild } from 'vite'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const canvasKitJsPath = require.resolve('canvaskit-wasm/bin/canvaskit.js', { paths: [packageRoot] })
const canvasKitWasmPath = require.resolve('canvaskit-wasm/bin/canvaskit.wasm', { paths: [packageRoot] })
const cjkFontPackageRoot = dirname(require.resolve('@fontsource-variable/noto-sans-sc/package.json', { paths: [packageRoot] }))
const cjkFontFilesRoot = join(cjkFontPackageRoot, 'files')
const pencilCorePackageName = ['@open', 'pencil/core'].join('-')
const pencilCoreDistRoot = dirname(require.resolve(pencilCorePackageName, { paths: [packageRoot] }))
const yogaLayoutEntryPath = require.resolve('yoga-layout', { paths: [pencilCoreDistRoot] })
const yogaLayoutPackageRoot = dirname(dirname(dirname(yogaLayoutEntryPath)))
const yogaBinaryModulePath = join(yogaLayoutPackageRoot, 'dist', 'binaries', 'yoga-wasm-base64-esm.js')
const yogaWrapAssemblyPath = join(yogaLayoutPackageRoot, 'dist', 'src', 'wrapAssembly.js')
const yogaEnumsPath = join(yogaLayoutPackageRoot, 'dist', 'src', 'generated', 'YGEnums.js')
const remoteRoot = join(packageRoot, 'src', 'lib', 'remote-components')
const componentNames = ['pencil-workbench']
const virtualPrefix = '\0pencil:'
const virtual = (name) => `${virtualPrefix}${name}`
const cjkFontChunkFiles = (await readdir(cjkFontFilesRoot))
  .map((name) => {
    const match = /^noto-sans-sc-(\d+)-wght-normal\.woff2$/.exec(name)
    return match ? { name, order: Number(match[1]) } : null
  })
  .filter(Boolean)
  .sort((left, right) => left.order - right.order)

if (!cjkFontChunkFiles.length) {
  throw new Error('No bundled CJK font chunks were found.')
}

/** Keeps Node-only package branches out of the self-contained browser runtime. */
const browserShimPlugin = {
  name: 'pencil-browser-shims',
  enforce: 'pre',
  resolveId(id) {
    if (/^(node:fs\/promises|node:path|node:url|fs|path)$/.test(id)) return virtual('node-empty')
    if (id === 'canvaskit-wasm') return virtual('canvaskit')
    if (/^yoga-layout(?:\/load)?$/.test(id)) return virtual('yoga')
    if (id === 'pencil-cjk-font-chunks') return virtual('cjk-font-chunks')
    if (id === 'pencil-yoga-wrap-assembly') return yogaWrapAssemblyPath
    if (id === 'pencil-yoga-enums') return yogaEnumsPath
    return null
  },
  async load(id) {
    if (id === virtual('node-empty')) {
      return `
        export async function readFile() { throw new Error('Node file APIs are not available in the Pencil browser bundle.'); }
        export function resolve(...parts) { return parts.filter(Boolean).join('/'); }
        export function dirname(value) { const text = String(value || ''); const index = text.lastIndexOf('/'); return index > 0 ? text.slice(0, index) : '.'; }
        export function fileURLToPath(value) { return new URL(String(value)).pathname; }
        export default {};
      `
    }
    if (id === virtual('canvaskit')) {
      const [canvasKitSource, wasmBytes] = await Promise.all([readFile(canvasKitJsPath, 'utf8'), readFile(canvasKitWasmPath)])
      const wasmUrl = `data:application/wasm;base64,${wasmBytes.toString('base64')}`
      return `
        const canvasKitSource = ${JSON.stringify(canvasKitSource)};
        const wasmUrl = ${JSON.stringify(wasmUrl)};
        let canvasKitInit;
        function loadCanvasKitInit() {
          if (canvasKitInit) return canvasKitInit;
          canvasKitInit = new Function(canvasKitSource + '\\nreturn CanvasKitInit;')();
          if (typeof canvasKitInit !== 'function') {
            throw new Error('CanvasKitInit was not created by the bundled CanvasKit runtime.');
          }
          return canvasKitInit;
        }
        export default function initCanvasKit(options = {}) {
          const CanvasKitInit = loadCanvasKitInit();
          const upstreamLocateFile = options.locateFile;
          return CanvasKitInit({
            ...options,
            locateFile(file) {
              if (String(file).endsWith('.wasm')) return wasmUrl;
              return upstreamLocateFile ? upstreamLocateFile(file) : file;
            }
          });
        }
      `
    }
    if (id === virtual('yoga')) {
      const yogaBinaryModuleSource = await readFile(yogaBinaryModulePath, 'utf8')
      return `
        import wrapAssembly from 'pencil-yoga-wrap-assembly';
        export * from 'pencil-yoga-enums';
        const yogaBinaryModuleSource = ${JSON.stringify(yogaBinaryModuleSource)};
        let yogaPromise;
        async function loadYogaImpl() {
          const url = URL.createObjectURL(new Blob([yogaBinaryModuleSource], { type: 'text/javascript' }));
          try {
            const mod = await import(/* @vite-ignore */ url);
            return mod.default;
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        export function loadYoga() {
          return yogaPromise ??= loadYogaImpl().then(async (load) => wrapAssembly(await load()));
        }
        const Yoga = await loadYoga();
        export default Yoga;
      `
    }
    if (id === virtual('cjk-font-chunks')) {
      const urls = await Promise.all(
        cjkFontChunkFiles.map(async (chunk) => {
          const bytes = await readFile(join(cjkFontFilesRoot, chunk.name))
          return `data:font/woff2;base64,${bytes.toString('base64')}`
        })
      )
      return `export const CJK_FONT_CHUNK_URLS = ${JSON.stringify(urls)};`
    }
    return null
  },
  transform(source, id) {
    // The Xpert iframe receives script text, so optional package workers must use their main-thread fallbacks.
    if (id.endsWith('/io/formats/fig/read.js')) {
      return source
        .replace('if (typeof Worker !== "undefined" && IS_BROWSER)', 'if (false)')
        .replace(/new Worker\(new URL\("[^"]+", import\.meta\.url\),/g, 'new Worker("",')
    }
    if (id.endsWith('/io/formats/fig/export.js')) {
      return source
        .replace(/function canUseWorker\(\) \{[^}]+\}/, 'function canUseWorker() { return false; }')
        .replace(/new Worker\(new URL\("[^"]+", import\.meta\.url\),/g, 'new Worker("",')
    }
    return null
  },
}

/** Produces one ESM script and one stylesheet for the Xpert remote iframe contract. */
async function bundleComponent(componentName) {
  const componentDir = join(remoteRoot, componentName)
  const entryPoint = join(componentDir, 'src', 'main.ts')

  if (!existsSync(entryPoint)) {
    throw new Error(`Missing remote component entry: ${relative(process.cwd(), entryPoint)}`)
  }

  const result = await viteBuild({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    plugins: [browserShimPlugin, vue()],
    resolve: {
      conditions: ['@xpert-plugins-starter/source', 'production']
    },
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    build: {
      target: 'es2022',
      minify: 'esbuild',
      sourcemap: false,
      write: false,
      emptyOutDir: false,
      cssCodeSplit: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      lib: {
        entry: entryPoint,
        formats: ['es'],
        fileName: 'app',
        cssFileName: 'app'
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  })
  const rollupOutputs = Array.isArray(result) ? result : [result]
  const outputItems = rollupOutputs.flatMap((output) => output.output)
  const jsOutput = outputItems.find((output) => output.type === 'chunk' && output.isEntry)
  if (!jsOutput || jsOutput.type !== 'chunk') {
    throw new Error(`Vite did not produce ${componentName}/app.js output`)
  }
  const cssOutput = outputItems.find((output) => output.type === 'asset' && output.fileName.endsWith('.css'))
  const primaryOutputs = new Set([jsOutput.fileName, cssOutput?.fileName].filter(Boolean))
  const assetOutputs = outputItems
    .filter((output) => output.type === 'asset' && !primaryOutputs.has(output.fileName))
    .map((output) => ({
      outputPath: join(componentDir, output.fileName),
      contents: Buffer.from(output.source)
    }))
  if (assetOutputs.length) {
    throw new Error(
      `${componentName} emitted external assets (${assetOutputs.map((output) => relative(componentDir, output.outputPath)).join(', ')}). ` +
        'The Xpert remote iframe contract requires a self-contained script and stylesheet.'
    )
  }

  return [
    {
      outputPath: join(componentDir, 'app.js'),
      contents: Buffer.from(normalizeGeneratedOutput(jsOutput.code), 'utf8')
    },
    {
      outputPath: join(componentDir, 'app.css'),
      contents: Buffer.from(cssOutput ? normalizeGeneratedOutput(String(cssOutput.source)) : '', 'utf8')
    }
  ]
}

function normalizeGeneratedOutput(text) {
  return text.replace(/open\x2dpencil/g, 'open\\u002dpencil').replace(/[ \t]+$/gm, '')
}

const outputs = (await Promise.all(componentNames.map(bundleComponent))).flat()

if (process.argv.includes('--check')) {
  let hasOutdatedOutput = false
  await Promise.all(
    outputs.map(async ({ outputPath, contents }) => {
      const currentOutput = existsSync(outputPath) ? await readFile(outputPath) : Buffer.alloc(0)
      if (!currentOutput.equals(Buffer.from(contents))) {
        console.error(`${relative(process.cwd(), outputPath)} is out of date. Run pnpm build.`)
        hasOutdatedOutput = true
      }
    })
  )
  if (hasOutdatedOutput) {
    process.exit(1)
  }
} else {
  await Promise.all(componentNames.map((componentName) => rm(join(remoteRoot, componentName, 'assets'), { recursive: true, force: true })))
  await Promise.all(
    outputs.map(async ({ outputPath, contents }) => {
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, contents)
    })
  )
}
