import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { SitesSourceFile } from './types.js'
import { isUtf8 } from 'node:buffer'
import { ProjectFilesRuntimeCapability, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { SitesScope } from './types.js'
export function sourceScope(scope: SitesScope) {
  if (!scope.hostProjectId || !scope.tenantId || !scope.organizationId || !scope.userId) throw new ForbiddenException('SITES_PROJECT_REQUIRED')
  return { actor: { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId }, projectId: scope.hostProjectId }
}
export const siteSourceRoot = (siteId: string) => `.xpert/sites/${siteId}/source`
export function resolvedSiteSourceRoot(siteId: string, sourcePath?: string | null) {
  const root = sourcePath || siteSourceRoot(siteId)
  const prefix = `.xpert/sites/${siteId}/restores/`
  if (root !== siteSourceRoot(siteId) && !(root.startsWith(prefix) && /^[a-f0-9-]{36}$/.test(root.slice(prefix.length)))) throw new ForbiddenException('SITES_SOURCE_PATH_INVALID')
  return root
}
export function siteSourcePath(siteId: string, path: string, sourcePath?: string | null) {
  if (!path || path.length > 300 || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new BadRequestException('SITES_SOURCE_PATH_INVALID')
  return `${resolvedSiteSourceRoot(siteId, sourcePath)}/${path}`
}
export async function readProjectSiteSource(runtime: RuntimeCapabilityRegistry | undefined, scope: SitesScope, siteId: string, sourcePath?: string | null) {
  if (!runtime) throw new BadRequestException('SITES_PROJECT_FILES_UNAVAILABLE')
  const api = runtime.require(ProjectFilesRuntimeCapability), scoped = sourceScope(scope), root = resolvedSiteSourceRoot(siteId, sourcePath)
  const entries = await api.list({ ...scoped, path: root, depth: 12 })
  const files = entries.filter(entry => entry.kind === 'file')
  if (files.length > 200 || files.reduce((size, file) => size + file.size, 0) > 10_000_000) throw new BadRequestException('SITES_SOURCE_TOO_LARGE')
  const source = await Promise.all(files.map(async file => {
    if (!file.path.startsWith(`${root}/`)) throw new ForbiddenException('SITES_SOURCE_PATH_INVALID')
    const { buffer, sha256 } = await api.read({ ...scoped, path: file.path })
    const encoding = isUtf8(buffer) ? 'utf8' as const : 'base64' as const
    return { path: file.path.slice(root.length + 1), content: buffer.toString(encoding), encoding, sha256 }
  }))
  // Native writes share the site row lock. Detect direct Project file writes during
  // capture as well; a changed tree/hash requires a new snapshot attempt.
  const after = (await api.list({ ...scoped, path: root, depth: 12 })).filter(entry => entry.kind === 'file')
  if (after.length !== files.length || after.some(file => !files.some(before => before.path === file.path))) throw new ConflictException('SITES_SOURCE_CHANGED')
  for (const file of source) {
    if ((await api.read({ ...scoped, path: `${root}/${file.path}` })).sha256 !== file.sha256) throw new ConflictException('SITES_SOURCE_CHANGED')
  }
  return { sourcePath: root, files: source }
}

export async function initializeProjectSiteSource(runtime: RuntimeCapabilityRegistry | undefined, scope: SitesScope, siteId: string, initialHtml?: string) {
  if (!runtime) throw new BadRequestException('SITES_PROJECT_FILES_UNAVAILABLE')
  const api = runtime.require(ProjectFilesRuntimeCapability), scoped = sourceScope(scope), root = siteSourceRoot(siteId)
  await api.mkdir({ ...scoped, path: root })
  const path = siteSourcePath(siteId, 'index.html')
  if ((await api.list({ ...scoped, path: root, depth: 1 })).some(file => file.path === path)) return root
  try { await api.write({ ...scoped, path, expectedHash: null,
    buffer: Buffer.from(initialHtml ?? '<!doctype html><html><head><meta charset="utf-8"><title></title></head><body></body></html>') }) }
  catch (error) { if (!(await api.list({ ...scoped, path: root, depth: 1 })).some(file => file.path === path)) throw error }
  return root
}

/** Restore into a complete new generation, then let the caller atomically change the DB
 * pointer with its version. A failed write leaves the current source and deployment intact.
 * Retained generations are recoverable; garbage collection belongs to retention policy. */
export async function stageProjectSiteRestore(runtime: RuntimeCapabilityRegistry | undefined, scope: SitesScope, siteId: string, files: SitesSourceFile[]) {
  if (!runtime) throw new BadRequestException('SITES_PROJECT_FILES_UNAVAILABLE')
  const api = runtime.require(ProjectFilesRuntimeCapability), scoped = sourceScope(scope)
  const root = resolvedSiteSourceRoot(siteId, `.xpert/sites/${siteId}/restores/${randomUUID()}`)
  await api.mkdir({ ...scoped, path: root })
  for (const file of files) {
    const path = siteSourcePath(siteId, file.path, root), parent = path.slice(0, path.lastIndexOf('/'))
    await api.mkdir({ ...scoped, path: parent })
    await api.write({ ...scoped, path, buffer: Buffer.from(file.content, file.encoding ?? 'utf8'), expectedHash: null })
  }
  return root
}
