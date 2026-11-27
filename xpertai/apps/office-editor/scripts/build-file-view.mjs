import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
/** Independent file-mode entry; it shares neither a grid protocol nor a bundle with Spaces. */
export async function buildFileView() {
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: [join(root, 'remote-file/main.tsx')], bundle: true, write: false, outfile: join(root, 'file-view.js'),
    platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', minify: true, legalComments: 'none',
    alias: { react: dirname(require.resolve('react/package.json')), 'react-dom': dirname(require.resolve('react-dom/package.json')) },
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' } })
  if (Object.keys(result.metafile.inputs).filter(path => /react\/cjs\/react.production.min.js$/.test(path)).length !== 1)
    throw new Error('The file view must bundle exactly one React runtime')
  const css = (result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '') + '\n' + await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8') + '\n' + await readFile(join(root, 'remote-file/styles.css'), 'utf8')
  const output = join(root, 'src/lib/remote-components/office-file')
  await mkdir(output, { recursive: true })
  return { outputPath: join(output, 'app.js'), text: result.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/[ \t]+$/gm, ''),
    cssOutputPath: join(output, 'app.css'), cssText: css }
}
