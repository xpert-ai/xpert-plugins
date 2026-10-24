import type { SpaceActor } from './domain.js'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  AssistantMiddlewareAccessRuntimeCapability, ProjectAccessRuntimeCapability, ContentResourcesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ContentOperation, type ContentPrincipal, type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { Space, SpaceItem } from './entities.js'
import { actorSchema, denied, id, scoped } from './domain.js'

@Injectable()
export class SpaceAccess {
  constructor(
    @InjectRepository(Space) readonly spaces: Repository<Space>,
    @InjectRepository(SpaceItem) readonly items: Repository<SpaceItem>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry
  ) {}
  async principal(actor: SpaceActor) {
    const checked = actorSchema.parse(actor)
    const principal = await this.runtime.require(ContentResourcesRuntimeCapability).identities.principal(checked)
    return { ...principal, assistantId: checked.assistantId, projectId: checked.projectId }
  }
  /** Capability entry guard only. Resource ACLs below deliberately remain Project-owned. */
  assistant(actor: SpaceActor, assistantId = actor.assistantId) {
    if (!assistantId) throw denied()
    return this.runtime.require(AssistantMiddlewareAccessRuntimeCapability).assertAccess({ actor, assistantId,
      scope: actor.projectId ? { type: 'project', projectId: actor.projectId } : { type: 'assistant' },
      provider: 'spaces', requiredFeature: 'spaces' })
  }
  async project(actor: SpaceActor, projectId = actor.projectId, operation: ContentOperation = 'read') {
    if (!projectId) throw denied()
    const api = this.runtime.require(ProjectAccessRuntimeCapability)
    const access = actor.assistantId
      ? await api.assertAssistant({ actor, projectId, assistantId: actor.assistantId })
      : (await api.listReadable({ actor, projectIds: [projectId] }))[0]
    if (!access || access.applicationKey !== 'platform' || access.projectTypeKey !== 'space') throw denied()
    if (operation === 'manage') await api.assertManage({ actor, projectId })
    else if (operation !== 'read') await api.assertEdit({ actor, projectId })
    return access
  }
  async resource(actor: SpaceActor, resourceId: string, operation: ContentOperation, deleted = false) {
    return this.resolve(await this.principal(actor), resourceId, operation, deleted)
  }
  async resolve(principal: ContentPrincipal & { assistantId?: string; projectId?: string }, resourceId: string, operation: ContentOperation, deleted = false) {
    id.parse(resourceId)
    const scope = scoped(principal)
    const item = await this.items.findOneBy({ ...scope, id: resourceId })
    const space = await this.spaces.findOneBy({ ...scope, id: item?.spaceId ?? resourceId })
    if (!space || space.deleted || !space.projectId) throw denied()
    // Resource identity never grants access independently of the owning Project.
    if (principal.projectId && principal.projectId !== space.projectId) throw denied()
    const project = await this.project(principal, space.projectId, operation)
    const role = project.role
    const canWrite = !project.archived && ['owner', 'manager', 'editor'].includes(role)
    const canManage = project.canManage
    let current = item
    const seen = new Set<string>()
    while (current) {
      if (seen.has(current.id) || current.spaceId !== space.id || (current.deleted && !deleted)) throw denied()
      seen.add(current.id)
      if (!current.parentId) break
      current = await this.items.findOneBy({ ...scope, id: current.parentId, spaceId: space.id })
      if (!current) throw denied()
    }
    return { space, item, role, canWrite, canManage }
  }
}
