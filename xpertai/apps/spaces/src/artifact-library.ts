import { Inject, Injectable } from '@nestjs/common'
import { ArtifactLibraryRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { SpaceAccess } from './access.js'
import { SpaceCatalog } from './catalog.js'
import { denied, type SpaceActor } from './domain.js'

@Injectable()
export class SpaceArtifactLibrary {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly access: SpaceAccess, private readonly catalog: SpaceCatalog) {}
  private async scope(actor: SpaceActor) {
    if (!actor.projectId) throw denied()
    await this.access.project(actor)
    return { actor, projectId: actor.projectId, assistantId: actor.assistantId }
  }
  async add(actor: SpaceActor, input: { spaceId: string; parentId: string | null; artifactId: string; versionId: string }) {
    const destination = await this.access.resource(actor, input.parentId ?? input.spaceId, 'write')
    if (destination.space.id !== input.spaceId || (destination.item && destination.item.kind !== 'folder')) throw denied()
    const result = await this.runtime.require(ArtifactLibraryRuntimeCapability).add({ ...await this.scope(actor), artifactId: input.artifactId, versionId: input.versionId })
    await this.catalog.attach(actor, result.contentId, input.parentId)
    return result
  }
  async open(actor: SpaceActor, referenceId: string) { return this.runtime.require(ArtifactLibraryRuntimeCapability).open({ ...await this.scope(actor), referenceId }) }
  async selectVersion(actor: SpaceActor, input: { referenceId: string; versionId: string; expectedRevision: number }) {
    await this.runtime.require(ArtifactLibraryRuntimeCapability).selectVersion({ ...await this.scope(actor), ...input })
    return { success: true }
  }
  async share(actor: SpaceActor, input: { referenceId: string; accessMode: 'organization_all' | 'public_link'; days: number; acknowledgePublic?: boolean }) {
    return this.runtime.require(ArtifactLibraryRuntimeCapability).share({ ...await this.scope(actor), ...input })
  }
  async revoke(actor: SpaceActor, referenceId: string) {
    await this.runtime.require(ArtifactLibraryRuntimeCapability).revoke({ ...await this.scope(actor), referenceId })
    return { success: true }
  }
}
