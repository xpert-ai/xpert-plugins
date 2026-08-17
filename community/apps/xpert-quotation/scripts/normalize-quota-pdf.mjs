import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { normalizeQuotaPdf, summarizeNormalization } from './quota-normalizer.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const defaults = {
  input: join(packageRoot, 'docs', '1．江苏省建筑与装饰工程消耗量.pdf'),
  output: join(packageRoot, 'docs', 'knowledgebase', 'normalized', 'jiangsu-building-decoration-2026.quota-items.ndjson'),
  manifest: join(packageRoot, 'docs', 'knowledgebase', 'normalized', 'jiangsu-building-decoration-2026.manifest.json')
}
const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    manifest: { type: 'string' },
    pages: { type: 'string' },
    quiet: { type: 'boolean', default: false }
  }
})
const inputPath = resolve(values.input ?? defaults.input)
const outputPath = resolve(values.output ?? defaults.output)
const manifestPath = resolve(values.manifest ?? defaults.manifest)
const data = await readFile(inputPath)
const sourceHash = createHash('sha256').update(data).digest('hex')
const pageRange = parsePageRange(values.pages)
let lastProgressPage = 0
const result = await normalizeQuotaPdf({
  data,
  sourceFile: inputPath.slice(packageRoot.length + 1),
  sourceHash,
  pageRange,
  onProgress: values.quiet ? undefined : ({ pageNumber, itemCount }) => {
    if (pageNumber - lastProgressPage >= 50 || pageNumber === pageRange?.end) {
      process.stdout.write(`Processed PDF page ${pageNumber}; normalized ${itemCount} quota items.\n`)
      lastProgressPage = pageNumber
    }
  }
})

validateResult(result, Boolean(pageRange))
const generatedAt = new Date().toISOString()
const manifest = summarizeNormalization(result, {
  sourceFile: inputPath.slice(packageRoot.length + 1),
  sourceHash,
  generatedAt
})
await atomicWrite(outputPath, `${result.chunks.map((chunk) => JSON.stringify(chunk)).join('\n')}\n`)
await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(
  `Wrote ${manifest.counts.quotaItems} quota items (${manifest.counts.ingestionReady} structurally ready, ` +
  `${manifest.counts.reviewRequired} requiring review) to ${outputPath}.\n`
)
process.stdout.write(`Wrote normalization manifest to ${manifestPath}.\n`)

function parsePageRange(value) {
  if (!value) return undefined
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim())
  if (!match) throw new Error('--pages must be a page number or inclusive range such as 615-617.')
  const start = Number(match[1])
  const end = Number(match[2] ?? match[1])
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw new Error('--pages contains an invalid page range.')
  }
  return { start, end }
}

function validateResult(result, partialRun) {
  if (!result.chunks.length) throw new Error('No quota items were normalized from the selected PDF pages.')
  const keys = new Set()
  for (const chunk of result.chunks) {
    if (keys.has(chunk.writeKey)) throw new Error(`Duplicate writeKey ${chunk.writeKey}.`)
    keys.add(chunk.writeKey)
  }
  if (partialRun) return
  const expected = [
    ['13-47', '12330300', '12.900'],
    ['15-152', '11450342', '19.845'],
    ['15-161', '11010304', '2.884']
  ]
  for (const [quotaCode, resourceCode, consumption] of expected) {
    const chunk = result.chunks.find((item) => item.data.quotaCode === quotaCode)
    const resource = chunk?.data.resources.find((item) => item.code === resourceCode)
    if (!chunk || resource?.consumption !== consumption) {
      throw new Error(`Quality gate failed for ${quotaCode}/${resourceCode}/${consumption}.`)
    }
  }
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp-${process.pid}`
  await writeFile(temporaryPath, content, 'utf8')
  await rename(temporaryPath, path)
}
