import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
export async function buildWorkbookView() {
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: [join(root, 'remote-workbook/main.tsx')], outdir: join(root, '.workbook-build'),
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', minify: true,
    // Shared UI lives across a pnpm workspace boundary; all hooks and renderers
    // must resolve to the same React instance, including transitive imports.
    alias: { react: dirname(require.resolve('react/package.json')), 'react-dom': dirname(require.resolve('react-dom/package.json')) },
    metafile: true,
    legalComments: 'none', loader: { '.woff2': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' } })
  if (Object.keys(result.metafile.inputs).filter(path => /react\/cjs\/react.production.min.js$/.test(path)).length !== 1)
    throw new Error('The workbook view must bundle exactly one React runtime')
  const css = (await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8')) + '\n' +
    (result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '') + '\n' + await readFile(join(root, 'remote-workbook/styles.css'), 'utf8')
  const output = join(root, 'src/lib/remote-components/office-workbook'); await mkdir(output, { recursive: true })
  return { outputPath: join(output, 'app.js'), text: result.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/[ \t]+$/gm, ''),
    cssOutputPath: join(output, 'app.css'), cssText: css.replace(/[ \t]+$/gm, '') }
}
