import { build } from 'esbuild'
import { cp, copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

await mkdir(new URL('../dist/remote/', import.meta.url), { recursive: true })
await cp(new URL('../src/remote/', import.meta.url), new URL('../dist/remote/', import.meta.url), { recursive: true })
await copyFile(new URL('../assistant.yaml', import.meta.url), new URL('../dist/assistant.yaml', import.meta.url))


// The resource readers live in lib/ and resolve ../assistant.yaml and ../remote/.
// Keep the CJS bundle beside those modules so the same relative URLs still work.
await build({
  entryPoints: [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../dist/lib/index.cjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  packages: 'external',
  define: { 'import.meta.url': '__contractModuleUrl' },
  banner: { js: "const __contractModuleUrl = require('node:url').pathToFileURL(__filename).href;" },
  logLevel: 'info'
})

await build({
  stdin: { contents: "const entry = require('./lib/index.cjs'); module.exports = { ...entry, ...entry.default };", sourcefile: 'index.cjs' },
  outfile: fileURLToPath(new URL('../dist/index.cjs', import.meta.url)),
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  logLevel: 'info'
})
