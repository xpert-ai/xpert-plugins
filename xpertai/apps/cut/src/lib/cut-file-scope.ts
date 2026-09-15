import type { WorkspaceFileScope } from '@xpert-ai/plugin-sdk'
import type { CutScope } from './types.js'

/** Background output must return to the storage owner selected by the host. */
export function cutFileDestination(scope: CutScope): WorkspaceFileScope {
  const identity = { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId }
  if (scope.fileScope) {
    const files = scope.fileScope
    if (files.tenantId !== scope.tenantId || files.userId !== scope.userId ||
        (files.organizationId ?? null) !== (scope.organizationId ?? null)) {
      throw new Error('Cut file scope does not match the queued execution identity.')
    }
    if (files.knowledgeId || files.rootId ||
        (files.projectId && files.projectId !== scope.projectId) ||
        (files.xpertId && files.xpertId !== scope.assistantId)) {
      throw new Error('Cut file scope contains a foreign storage binding.')
    }
    if (files.catalog === 'users' && scope.userId && files.scopeId === scope.userId && !scope.projectId && !scope.assistantId && !files.isolateByUser) {
      return { ...identity, catalog: 'users', scopeId: scope.userId, isolateByUser: false }
    }
    if (scope.projectId && files.catalog === 'projects' && files.scopeId === scope.projectId && !files.isolateByUser) {
      return { ...identity, catalog: 'projects', scopeId: scope.projectId, projectId: scope.projectId, xpertId: scope.assistantId, isolateByUser: false }
    }
    if (scope.assistantId && (files.catalog === 'xperts' || files.catalog === 'user-xperts') && files.scopeId === scope.assistantId) {
      return { ...identity, catalog: files.catalog, scopeId: scope.assistantId, xpertId: scope.assistantId, isolateByUser: files.catalog === 'user-xperts' }
    }
    throw new Error('Cut file scope does not match the host Project or Assistant binding.')
  }
  // Existing native jobs predate the explicit scope field.
  if (scope.projectId) return { ...identity, catalog: 'projects', scopeId: scope.projectId, projectId: scope.projectId }
  if (scope.assistantId) return { ...identity, catalog: 'xperts', scopeId: scope.assistantId, xpertId: scope.assistantId }
  throw new Error('Cut background files require an explicit host storage binding.')
}
