import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
export async function buildWorkbookView() {
  const result = await build({ entryPoints: [join(root, 'remote-workbook/main.tsx')], outdir: join(root, '.workbook-build'),
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', minify: true,
    legalComments: 'none', loader: { '.woff2': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' } })
  const require = createRequire(import.meta.url)
  const css = (await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8')) + '\n' +
    (result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '') + '\n' + await readFile(join(root, 'remote-workbook/styles.css'), 'utf8')
  const output = join(root, 'src/lib/remote-components/office-workbook'); await mkdir(output, { recursive: true })
  return { outputPath: join(output, 'app.js'), text: result.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/[ \t]+$/gm, ''),
    cssOutputPath: join(output, 'app.css'), cssText: css.replace(/[ \t]+$/gm, '') }
}
