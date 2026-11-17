import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { buildExplorePackage } = require('./explore-package.cjs')
const { encodePackage } = require('../dist/lib/library/archive.js')
const destination = process.argv[2]
if (!destination?.endsWith('.zip')) throw Error('Usage: node scripts/export-explore-v2.mjs <new-output.zip>')
const content = buildExplorePackage(), buffer = encodePackage(content)
await writeFile(resolve(destination), buffer, { flag: 'wx' })
console.log(`Wrote ${content.roots.length} tasks, ${content.resources.length} resources, ${content.blobs.size} files (${buffer.length} bytes). Nothing installed or published.`)
