import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { buildHotelPackage } = require('./hotel-package.cjs')
const { encodePackage } = require('../dist/lib/library/archive.js')
const destination = process.argv[2]
if (!destination || !destination.endsWith('.zip')) throw new Error('Usage: node scripts/export-hotel-v2.mjs <new-output.zip>')
const buffer = encodePackage(buildHotelPackage())
await writeFile(resolve(destination), buffer, { flag: 'wx' })
console.log(`Wrote hotel V2 resource package (${buffer.length} bytes); no resource has been installed or published.`)
