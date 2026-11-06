import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { sourceDigest } from './verify-dist.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shared = resolve(root, '../../../packages/shadcn-ui/src')
await mkdir(resolve(root, 'dist/remote'), { recursive: true })
// Reuse this repository's shared UI source; do not reference another checkout.
const sharedExports = ['button','input','textarea','label','alert-dialog']
const shim = sharedExports.map(name => `export * from ${JSON.stringify(resolve(shared, `components/ui/${name}.tsx`))}`).join('\n')
const result = await build({ stdin: { contents: shim, loader: 'ts', resolveDir: root }, bundle: false, write: false, format: 'esm' })
await mkdir(resolve(root, '.cache'), { recursive: true })
await writeFile(resolve(root, '.cache/ui.ts'), result.outputFiles[0].text)
await build({ entryPoints: [resolve(root,'remote/app.tsx')], outfile: resolve(root,'dist/remote/app.js'), bundle: true,
  format: 'iife', platform: 'browser', target: 'es2022', jsx: 'automatic', minify: true,
  nodePaths: [resolve(root,'node_modules')], conditions: ['shadcn-ui-source'],
  alias: {
    '@xpert-ai/plugin-shadcn-ui/i18n': resolve(shared,'i18n.tsx'),
    '@xpert-ai/plugin-shadcn-ui/theme': resolve(shared,'theme.ts'),
    '@xpert-ai/plugin-shadcn-ui': resolve(root,'.cache/ui.ts')
  }, define: { 'process.env.NODE_ENV': '"production"' }
})
const tailwind = spawnSync(process.execPath, [resolve(root,'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i',resolve(root,'remote/styles.css'),'-o',resolve(root,'dist/remote/app.css'),'--minify'], { cwd: root, encoding: 'utf8' })
if (tailwind.status !== 0) throw new Error(tailwind.stderr || 'Tailwind build failed')
for (const file of ['remote/app.tsx','remote/bridge.ts']) {
  const source = await readFile(resolve(root,file),'utf8')
  if (/\b(?:localStorage|sessionStorage)\b/.test(source)) throw new Error('Sandboxed view must not access Web Storage')
}
console.log('Remote workbench built using repository-local shared UI.')
await writeFile(resolve(root,'dist/build-manifest.json'),JSON.stringify({sourceDigest:await sourceDigest()},null,2))
