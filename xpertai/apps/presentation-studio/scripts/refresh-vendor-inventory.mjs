#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstreamRoot = path.join(root, 'assets', 'upstream')
const vendorRoot = path.join(upstreamRoot, 'dashiai-ppt')
const metadataPath = path.join(upstreamRoot, 'UPSTREAM.json')
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))

for (const relativePath of Object.keys(metadata.sha256 || {})) {
  metadata.sha256[relativePath] = sha256(await readFile(path.join(upstreamRoot, relativePath)))
}
const files = (await listFiles(vendorRoot)).sort()
const tree = createHash('sha256')
for (const file of files) {
  const relativePath = path.relative(vendorRoot, file).split(path.sep).join('/')
  tree.update(`${relativePath}\0${sha256(await readFile(file))}\n`)
}
metadata.fileCount = files.length
metadata.treeSha256 = tree.digest('hex')
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ fileCount: metadata.fileCount, treeSha256: metadata.treeSha256 })}\n`)

async function listFiles(directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.name !== '.DS_Store')
  const result = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await listFiles(target))
    else if (entry.isFile()) result.push(target)
    else throw new Error(`Vendor inventory contains a non-regular entry: ${target}`)
  }
  return result
}
function sha256(value) { return createHash('sha256').update(value).digest('hex') }
