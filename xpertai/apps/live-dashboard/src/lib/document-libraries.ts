import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod/v3'
import { artifactDocumentDependencyLocks, verifyArtifactDocumentDependencies,
  type ArtifactDocumentDependencyAsset, type ArtifactDocumentDependencyLock } from '@xpert-ai/plugin-sdk/artifact-document'

/** The plugin owns its catalog. The platform owns verification and isolated execution. */
export const libraryRequestsSchema = z.array(z.enum(['echarts', 'three'])).max(2)
  .refine(ids => new Set(ids).size === ids.length, 'Duplicate library')
export type LibraryRequests = z.output<typeof libraryRequestsSchema>
export async function bundledLibraries() {
  return verifyArtifactDocumentDependencies(JSON.parse(await readFile(join(__dirname, '../libraries/catalog.json'), 'utf8')))
}
export async function libraryLocks(ids: LibraryRequests): Promise<ArtifactDocumentDependencyLock[]> {
  const catalog = await bundledLibraries()
  return libraryRequestsSchema.parse(ids).map(id => {
    const asset = catalog.find(item => item.id === id)
    if (!asset) throw new Error('DASHBOARD_LIBRARY_UNAVAILABLE')
    const { source, ...lock } = asset
    return lock
  })
}
export async function resolveLibraryAssets(locks: ArtifactDocumentDependencyLock[], previous: ArtifactDocumentDependencyAsset[] = [], loadCatalog = bundledLibraries) {
  const requested = artifactDocumentDependencyLocks.parse(locks)
  if (!requested.length) return []
  const hasPrevious = (lock: ArtifactDocumentDependencyLock) => previous.some(item => item.id === lock.id && item.version === lock.version && item.sha256 === lock.sha256 && item.global === lock.global && item.format === lock.format)
  const catalog = requested.every(hasPrevious) ? [] : await loadCatalog()
  const assets = requested.map(lock => {
    // Authorized prior bytes take precedence, including after a plugin/library upgrade.
    const asset = [...previous, ...catalog].find(item => item.id === lock.id && item.version === lock.version && item.sha256 === lock.sha256 && item.global === lock.global && item.format === lock.format)
    if (!asset) throw new Error(`DASHBOARD_LIBRARY_LOCK_UNAVAILABLE: ${lock.id}@${lock.version}`)
    return asset
  })
  return verifyArtifactDocumentDependencies(assets, requested)
}
