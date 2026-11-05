import { createHash } from 'node:crypto'
import { zipSync, Unzip, UnzipInflate } from 'fflate'
import { z } from 'zod/v3'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { decodeDashboardPackage, encodeDashboardPackage, MAX_DASHBOARD_PACKAGE_BYTES } from './document-package'
import type { DashboardManifest } from './dashboard.schema'
import type { ArtifactDocumentDependencyAsset } from '@xpert-ai/plugin-sdk/artifact-document'

export const MAX_DASHBOARD_ARCHIVE_BYTES = 12_000_000
const entryNames = ['dashboard.json', 'dashboard.html', 'requirements.json'] as const
const archiveIndex = z.object({
  schema: z.literal('xpert.live-dashboard.archive'), version: z.literal(1),
  files: z.array(z.object({ name: z.enum(entryNames), bytes: z.number().int().nonnegative().max(MAX_DASHBOARD_PACKAGE_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(2).max(3)
}).strict()
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')

export function dashboardRequirements(manifest: DashboardManifest) {
  const externalResources = new Set<string>()
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('attrs' in node) for (const attr of node.attrs) {
      if (['src', 'href'].includes(attr.name) && /^(https?:)?\/\//i.test(attr.value)) externalResources.add(attr.value)
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  if (manifest.presentation) visit(parse(manifest.presentation.html))
  return { schema: 'xpert.live-dashboard.requirements', version: 1,
    bindings: manifest.bindings.map(({ id, providerId, operation, contractVersion, source }) => ({ id, providerId, operation, contractVersion, source })),
    externalResources: [...externalResources], dynamicResourcesMayExist: !!manifest.presentation,
    includesQueryResults: false, requiresAuthorizedHost: true }
}

export function encodeDashboardArchive(manifest: DashboardManifest, dependencies: ArtifactDocumentDependencyAsset[]) {
  const entries: Record<string, Uint8Array> = {
    'dashboard.json': encodeDashboardPackage(manifest, dependencies),
    'requirements.json': Buffer.from(JSON.stringify(dashboardRequirements(manifest), null, 2))
  }
  if (entries['dashboard.json'].length > MAX_DASHBOARD_PACKAGE_BYTES) throw new Error('DASHBOARD_PACKAGE_TOO_LARGE')
  if (manifest.presentation) entries['dashboard.html'] = Buffer.from(manifest.presentation.html)
  const index = { schema: 'xpert.live-dashboard.archive', version: 1,
    files: Object.entries(entries).map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: hash(bytes) })) }
  entries['package.json'] = Buffer.from(JSON.stringify(index, null, 2))
  const bytes = Buffer.from(zipSync(entries, { level: 6 }))
  if (bytes.length > MAX_DASHBOARD_ARCHIVE_BYTES) throw new Error('DASHBOARD_ARCHIVE_TOO_LARGE')
  return bytes
}

/** Never extracts paths to disk. Bound both advertised and actually inflated bytes. */
function unzipBounded(bytes: Buffer) {
  const files = new Map<string, Buffer>(), seen = new Set<string>()
  let total = 0, active = 0, failed: Error | undefined
  const unzip = new Unzip(file => {
    if (seen.has(file.name) || !['package.json', ...entryNames].includes(file.name) || (file.originalSize ?? 0) > MAX_DASHBOARD_PACKAGE_BYTES)
      throw new Error('DASHBOARD_ARCHIVE_ENTRY_INVALID')
    seen.add(file.name); active++
    const chunks: Uint8Array[] = []
    let size = 0
    file.ondata = (error, data, final) => {
      if (error) { failed = error; file.terminate(); return }
      size += data.length; total += data.length
      if (size > MAX_DASHBOARD_PACKAGE_BYTES || total > MAX_DASHBOARD_ARCHIVE_BYTES) {
        failed = new Error('DASHBOARD_ARCHIVE_TOO_LARGE'); file.terminate(); return
      }
      chunks.push(data)
      if (final) { files.set(file.name, Buffer.concat(chunks)); active-- }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  for (let offset = 0; offset < bytes.length; offset += 1024) {
    unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
    if (failed) throw failed
  }
  if (active || !files.has('package.json') || !files.has('dashboard.json') || !files.has('requirements.json')) throw new Error('DASHBOARD_ARCHIVE_INCOMPLETE')
  return files
}

export function decodeDashboardArchive(bytes: Buffer) {
  if (bytes.length > MAX_DASHBOARD_ARCHIVE_BYTES) throw new Error('DASHBOARD_ARCHIVE_TOO_LARGE')
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return decodeDashboardPackage(bytes)
  const files = unzipBounded(bytes)
  const index = archiveIndex.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files.get('package.json')!)))
  if (new Set(index.files.map(entry => entry.name)).size !== index.files.length || files.size !== index.files.length + 1) throw new Error('DASHBOARD_ARCHIVE_ENTRY_INVALID')
  for (const entry of index.files) {
    const file = files.get(entry.name)
    if (!file || file.length !== entry.bytes || hash(file) !== entry.sha256) throw new Error('DASHBOARD_ARCHIVE_INTEGRITY_FAILED')
  }
  if (!index.files.some(entry => entry.name === 'dashboard.json') || !index.files.some(entry => entry.name === 'requirements.json')) throw new Error('DASHBOARD_ARCHIVE_INCOMPLETE')
  const result = decodeDashboardPackage(files.get('dashboard.json')!)
  if (result.manifest.presentation ? !files.get('dashboard.html')?.equals(Buffer.from(result.manifest.presentation.html)) : files.has('dashboard.html'))
    throw new Error('DASHBOARD_ARCHIVE_HTML_MISMATCH')
  if (!files.get('requirements.json')?.equals(Buffer.from(JSON.stringify(dashboardRequirements(result.manifest), null, 2)))) throw new Error('DASHBOARD_ARCHIVE_REQUIREMENTS_MISMATCH')
  return result
}
