// Builds the Workbench iframe bundle (dist/remote/app.js + app.css) from the TSX source and copies the
// Assistant template next to the compiled code. `--check` rebuilds in memory and fails when dist is
// stale, so a deployment can never ship generated assets that drifted from their source.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ['src/lib/remote/entry.tsx'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' }
})

const outputs = [
  { file: 'dist/remote/app.js', content: bundle.outputFiles[0].text },
  { file: 'dist/remote/app.css', content: await readFile(path.join(root, 'src/lib/remote/app.css'), 'utf8') },
  { file: 'dist/complaint-triage-assistant.yaml', content: await readFile(path.join(root, 'src/complaint-triage-assistant.yaml'), 'utf8') }
]

// The iframe is sandboxed without allow-same-origin: touching Web Storage throws SecurityError.
for (const forbidden of ['localStorage', 'sessionStorage']) {
  if (outputs[0].content.includes(forbidden)) throw new Error(`Remote bundle must not reference ${forbidden}`)
}

for (const { file, content } of outputs) {
  const target = path.join(root, file)
  if (check) {
    const current = await readFile(target, 'utf8').catch(() => null)
    if (current !== content) throw new Error(`${file} is stale or missing; run the build`)
  } else {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
}

console.log(check ? 'Remote bundle and Assistant template match their sources' : `Built remote bundle (${Buffer.byteLength(outputs[0].content)} bytes) and Assistant template`)
