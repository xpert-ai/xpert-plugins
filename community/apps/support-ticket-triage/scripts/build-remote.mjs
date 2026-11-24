import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entry = resolve(root, 'src/lib/remote-components/ticket-workbench/src/main.tsx')
const outfile = resolve(root, 'src/lib/remote-components/ticket-workbench/app.js')
await mkdir(dirname(outfile), { recursive: true })
await build({ entryPoints: [entry], outfile, bundle: true, format: 'iife', platform: 'browser', target: ['es2020'], jsx: 'automatic', minify: true })
