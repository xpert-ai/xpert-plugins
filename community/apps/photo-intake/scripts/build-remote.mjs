// Builds the browser view into dist/remote and copies the Assistant template into dist.
// The approach (host-provided React through shims, Tailwind utilities appended to the
// shared stylesheet) follows community/apps/material-identity-governance.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const component = join(root, 'src/lib/remote-components/workbench')
const shims = join(component, 'src/shims')
const output = join(root, 'dist/remote')

// React is loaded once by the host iframe; every import of it resolves to that global.
const hostRuntime = {
  react: join(shims, 'react-shim.ts'),
  'react-dom': join(shims, 'react-dom-shim.ts'),
  'react-dom/client': join(shims, 'react-dom-client-shim.ts'),
  'react/jsx-runtime': join(shims, 'react-jsx-runtime-shim.ts'),
  'react/jsx-dev-runtime': join(shims, 'react-jsx-runtime-shim.ts')
}

const bundle = await build({
  absWorkingDir: root,
  entryPoints: [join(component, 'src/main.tsx')],
  outdir: output,
  entryNames: 'app',
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'host-runtime',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^react(-dom)?($|\/)/ }, args => {
        const path = hostRuntime[args.path]
        if (!path) return { errors: [{ text: `No host shim for "${args.path}"` }] }
        return { path }
      })
    }
  }]
})
const script = bundle.outputFiles.find(file => file.path.endsWith('.js'))
const styles = bundle.outputFiles.find(file => file.path.endsWith('.css'))
if (!script) throw new Error('The view bundle produced no script')

const temporary = await mkdtemp(join(tmpdir(), 'photo-intake-css-'))
let utilities
try {
  const utilitiesPath = join(temporary, 'utilities.css')
  // Run the CLI's script with this Node: the node_modules/.bin launcher is a shell
  // script on POSIX and a .cmd on Windows, which cannot be spawned without a shell.
  const cliPackage = join(root, 'node_modules/@tailwindcss/cli')
  const cliManifest = JSON.parse(await readFile(join(cliPackage, 'package.json'), 'utf8'))
  const tailwind = spawnSync(
    process.execPath,
    [join(cliPackage, cliManifest.bin.tailwindcss), '-i', join(root, 'scripts/tailwind.css'), '-o', utilitiesPath, '--minify'],
    { cwd: root, encoding: 'utf8' }
  )
  if (tailwind.error) throw tailwind.error
  if (tailwind.status !== 0) throw new Error(`Tailwind failed: ${tailwind.stderr}`)
  utilities = await readFile(utilitiesPath, 'utf8')
} finally {
  await rm(temporary, { recursive: true, force: true })
}

// Tailwind's reset leaves border colour unset; bind it to the host theme.
const borderBase = '@layer base { *,::before,::after,::backdrop,::file-selector-button { border-color: var(--border, var(--xui-color-border, #e4e4e7)); } }'

await mkdir(output, { recursive: true })
await writeFile(join(output, 'app.js'), script.text)
await writeFile(join(output, 'app.css'), [styles?.text ?? '', utilities, borderBase].join('\n'))
await copyFile(join(root, 'src/photo-intake-assistant.yaml'), join(root, 'dist/photo-intake-assistant.yaml'))

console.log(`Built view (${Buffer.byteLength(script.text)} bytes of script) and copied the Assistant template`)
