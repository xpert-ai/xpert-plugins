import { Injectable, ForbiddenException, ConflictException, Inject } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import {
  ProjectProvisioningRuntimeCapability,
  AssistantTaskRuntimeCapability,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  type AgentMiddlewareRuntimeServiceApi,
  type ProjectPipelineContext,
} from '@xpert-ai/plugin-sdk'
import { advance, successor, type Actor, type Command, type Order } from './domain.js'
import {
  roles,
  agentKey,
  templateKey,
  projectType,
  name,
  type Role,
  type ScenarioMode,
  type Variant,
} from './process.js'
import { MotorOrder } from './entity.js'
export type Scope = {
  tenantId: string
  organizationId: string
  userId: string
}
export function scope(c: ProjectPipelineContext): Scope {
  if (!c.actor.organizationId || !c.actor.tenantId || !c.actor.userId)
    throw new ForbiddenException('organization_user_required')
  return {
    organizationId: c.actor.organizationId,
    tenantId: c.actor.tenantId,
    userId: c.actor.userId,
  }
}
export const tenant = (s: Scope) => ({
  tenantId: s.tenantId,
  organizationId: s.organizationId,
})
export const owned = (s: Scope) => ({ ...tenant(s), ownerId: s.userId })
export function stableId(...parts: string[]) {
  const h = createHash('sha256').update(JSON.stringify(parts)).digest('hex')
  return [h.slice(0, 8), h.slice(8, 12), '5' + h.slice(13, 16), 'a' + h.slice(17, 20), h.slice(20, 32)].join(
    '-',
  )
}
@Injectable()
export class MotorStore {
  constructor(
    @InjectDataSource() readonly db: DataSource,
    @Inject(XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN)
    private runtime: Pick<AgentMiddlewareRuntimeServiceApi, 'createScopedApi'>,
  ) {}
  list(s: Scope) {
    return this.db
      .getRepository(MotorOrder)
      .find({ where: owned(s), order: { createdAt: 'DESC' }, take: 100 })
  }
  get(s: Scope, id: string) {
    return this.db.getRepository(MotorOrder).findOneByOrFail({ ...owned(s), id })
  }
  async create(
    s: Scope,
    coordinatorId: string,
    operation: string,
    mode: ScenarioMode,
    parentId?: string,
    variant: Variant = 'shortage',
  ) {
    const repo = this.db.getRepository(MotorOrder),
      id = stableId('motor', s.tenantId, s.organizationId, s.userId, operation)
    const parent = parentId ? await this.get(s, parentId) : null,
      code = 'EV-' + id.slice(0, 8).toUpperCase()
    const data: Order = parent
      ? successor(parent.data, id, code)
      : { id, code, mode, variant, rule: 'R1', events: [] }
    await repo
      .createQueryBuilder()
      .insert()
      .values({
        ...owned(s),
        id,
        coordinatorId,
        projectId: randomUUID(),
        data,
        assistants: {},
      })
      .orIgnore()
      .execute()
    const e = await this.get(s, id)
    if (
      e.data.mode !== data.mode ||
      e.data.parent !== data.parent ||
      (e.data.variant && e.data.variant !== data.variant) ||
      e.coordinatorId !== coordinatorId
    )
      throw new ConflictException('operation_conflict')
    return e
  }
  async apply(s: Scope, id: string, c: Command, a: Actor) {
    return this.db.transaction(async (m) => {
      const r = m.getRepository(MotorOrder),
        e = await r.findOneOrFail({
          where: { ...owned(s), id },
          lock: { mode: 'pessimistic_write' },
        })
      const next = advance(e.data, c, a, new Date().toISOString())
      if (next !== e.data) {
        e.data = next
        await r.save(e)
      }
      return e
    })
  }
  async provision(s: Scope, e: MotorOrder) {
    const caps = this.runtime.createScopedApi({
      ...s,
      xpertId: e.coordinatorId,
    }).capabilities
    if (!caps) throw new ConflictException('scoped_capabilities_required')
    const keys = (Object.keys(roles) as Role[]).filter((k) => k !== 'coordinator')
    const expectation = (key: Role) => ({
      pluginName: name,
      templateKey: templateKey(key),
      agentKey: agentKey(key),
    })
    const result = await caps.require(ProjectProvisioningRuntimeCapability).ensure({
      projectType,
      projectId: e.projectId,
      xpertId: e.coordinatorId,
      requesterAgentKey: agentKey('coordinator'),
      externalAssistantExpectations: keys.map(expectation),
      name: e.data.code + ' · EM-160',
      status: 'active',
    })
    const api = caps.require(AssistantTaskRuntimeCapability)
    if (!api.resolvePublishedAgent || !api.assertExternalAssistantBinding)
      throw new ConflictException('assistant_bindings_unavailable')
    const assistants: Record<string, string> = {}
    for (const key of keys) {
      const target = await api.resolvePublishedAgent({
        requesterXpertId: e.coordinatorId,
        expectation: expectation(key),
      })
      await api.assertExternalAssistantBinding({
        requesterXpertId: e.coordinatorId,
        requesterAgentKey: agentKey('coordinator'),
        executorXpertId: target.xpertId,
        expectation: expectation(key),
      })
      if (!result.xpertIds.includes(target.xpertId)) throw new ConflictException('assistant_not_in_project')
      assistants[key] = target.xpertId
    }
    await this.db.getRepository(MotorOrder).update({ ...owned(s), id: e.id }, { assistants })
    return assistants
  }
}
