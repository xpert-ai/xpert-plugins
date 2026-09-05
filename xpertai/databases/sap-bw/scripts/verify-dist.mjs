import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = path.join(packageRoot, 'dist', 'bundle.js')

await access(bundlePath)
const bundle = await readFile(bundlePath, 'utf8')

if (bundle.includes("from '@xpert-ai/plugin-xmla'") || bundle.includes('from "@xpert-ai/plugin-xmla"')) {
  throw new Error('SAP BW dist/bundle.js still contains a runtime import of @xpert-ai/plugin-xmla')
}

const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
if (packageJson.main !== './dist/bundle.js' || packageJson.exports?.['.']?.import !== './dist/bundle.js') {
  throw new Error('SAP BW package entrypoints must resolve to dist/bundle.js')
}

console.log('SAP BW deployable bundle verified')
