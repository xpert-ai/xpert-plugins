import type { SpaceActor } from './domain.js'
import { Inject, Injectable } from '@nestjs/common'
import { ArtifactsRuntimeCapability, XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN, type AgentMiddlewareRuntimeServiceApi } from '@xpert-ai/plugin-sdk'
import { SpaceAccess } from './access.js'
import { PLUGIN, scoped } from './domain.js'

@Injectable()
export class SpaceArtifacts {
  constructor(private readonly access: SpaceAccess,
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN) private readonly runtime: AgentMiddlewareRuntimeServiceApi) {}
  async initializePage(actor: SpaceActor, itemId: string, title: string) {
    const { space } = await this.access.resource(actor, itemId, 'write')
    const api = this.runtime.createScopedApi(actor).capabilities?.get(ArtifactsRuntimeCapability)
    if (!api) throw new Error('spaces.artifacts_unavailable')
    const artifact = await api.createArtifact({ source: { pluginName: PLUGIN, resourceType: 'space-item', resourceId: itemId },
      authorizationProviderKey: 'spaces', scope: { projectId: space.projectId, userId: null }, kind: 'markdown', title })
    await this.access.items.update({ ...scoped(actor), id: itemId }, { artifactId: artifact.id })
    return artifact.id
  }
}
