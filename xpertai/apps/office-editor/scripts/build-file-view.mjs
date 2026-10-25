import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
/** Independent file-mode entry; it shares neither a grid protocol nor a bundle with Spaces. */
export async function buildFileView() {
  const result = await build({ entryPoints: [join(root, 'remote-file/main.tsx')], bundle: true, write: false,
    platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', minify: true, legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' } })
  const require = createRequire(import.meta.url)
  const css = await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8') + '\n' + await readFile(join(root, 'remote-file/styles.css'), 'utf8')
  const output = join(root, 'src/lib/remote-components/office-file')
  await mkdir(output, { recursive: true })
  return { outputPath: join(output, 'app.js'), text: result.outputFiles[0].text.replace(/[ \t]+$/gm, ''),
    cssOutputPath: join(output, 'app.css'), cssText: css }
}
