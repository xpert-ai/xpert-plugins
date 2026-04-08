import path from 'node:path'
import { Injectable } from '@nestjs/common'
import { FileMemoryPathPolicy } from './path-policy.js'
import { MemoryAudience, MemoryLayer, MemoryScope, MemoryScopeInput } from './types.js'

@Injectable()
export class FileMemoryLayerResolver {
  constructor(private readonly pathPolicy: FileMemoryPathPolicy) {}

  resolveScope(input: MemoryScopeInput): MemoryScope {
    if (!input.id) {
      throw new Error('Memory scope resolution requires an xpert id.')
    }

    const scope: MemoryScope = {
      scopeType: 'xpert',
      scopeId: input.id
    }

    if (input.workspaceId) {
      scope.parentScope = {
        scopeType: 'workspace',
        scopeId: input.workspaceId
      }
    }

    return scope
  }

  resolveVisibleLayers(scope: MemoryScope, userId: string, audience: MemoryAudience | 'all' = 'all'): MemoryLayer[] {
    const layers: MemoryLayer[] = []
    if (audience !== 'shared') {
      layers.push({
        scope,
        audience: 'user',
        ownerUserId: userId,
        layerLabel: 'My Memory'
      })
    }
    if (audience !== 'user') {
      layers.push({
        scope,
        audience: 'shared',
        layerLabel: 'Shared Memory'
      })
    }
    return layers
  }

  resolveScopeDirectory(tenantId: string, scope: MemoryScope) {
    const root = this.resolveScopeRoot(tenantId, scope)
    return path.join(root, '.xpert', 'memory', `${scope.scopeType}s`, scope.scopeId)
  }

  resolveLayerDirectory(tenantId: string, layer: MemoryLayer) {
    const scopeDirectory = this.resolveScopeDirectory(tenantId, layer.scope)
    if (layer.audience === 'user') {
      return path.join(scopeDirectory, 'users', layer.ownerUserId || 'unknown')
    }
    return path.join(scopeDirectory, 'shared')
  }

  private resolveScopeRoot(tenantId: string, scope: MemoryScope) {
    if (scope.scopeType === 'workspace') {
      return this.pathPolicy.getWorkspaceRootPath(tenantId, scope.scopeId)
    }

    if (scope.parentScope?.scopeType === 'workspace') {
      return this.pathPolicy.getWorkspaceRootPath(tenantId, scope.parentScope.scopeId)
    }

    return this.pathPolicy.getHostedRootPath(tenantId)
  }
}
