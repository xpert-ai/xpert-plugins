import path from 'node:path'
import { Injectable } from '@nestjs/common'
import { MemoryAudience, MemoryLayer, MemoryScope, MemoryScopeInput } from './types.js'

const PRIVATE_LAYER_DIRECTORY = 'private'
const SHARED_LAYER_DIRECTORY = 'shared'

@Injectable()
export class FileMemoryLayerResolver {
  resolveScope(input: MemoryScopeInput): MemoryScope {
    if (!input.id) {
      throw new Error('Memory scope resolution requires an xpert id.')
    }

    return {
      scopeType: 'xpert',
      scopeId: input.id
    }
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

  resolveScopeDirectory(scope: MemoryScope) {
    return path.posix.join('xperts', scope.scopeId)
  }

  resolveLayerDirectory(layer: MemoryLayer) {
    const scopeDirectory = this.resolveScopeDirectory(layer.scope)
    return path.posix.join(scopeDirectory, layer.audience === 'user' ? PRIVATE_LAYER_DIRECTORY : SHARED_LAYER_DIRECTORY)
  }
}

export function getLayerDirectoryName(audience: MemoryAudience) {
  return audience === 'user' ? PRIVATE_LAYER_DIRECTORY : SHARED_LAYER_DIRECTORY
}
