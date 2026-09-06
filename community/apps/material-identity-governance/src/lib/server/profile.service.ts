import { ForbiddenException, Injectable } from '@nestjs/common'
import type { XpertResolvedViewHostContext, XpertViewQuery } from '@xpert-ai/contracts'
import { In } from 'typeorm'
import { z } from 'zod/v3'
import { MaterialCaseService } from './case.service.js'
import { MaterialCaseEntity, MaterialExecutionEntity, MaterialNodeEntity } from './entities.js'
import { viewScope, scoped, type RuntimeScope } from './scope.js'
import { profileTab } from './profile.views.js'
import type { MaterialProfileCase, MaterialProfileData, ProfileDecision } from '../profile-contracts.js'
import { FLOW_DEFINITION } from '../flow-definition.js'
import { artifactKey, VIEW_KEYS } from '../artifact-namespace.js'
const idSchema = z.string().uuid()
export const profileDecisionSchema = z.object({ caseId: idSchema, expectedRevision: z.number().int().positive(), operationId: idSchema,
  decision: z.enum(['approved', 'rejected']), reason: z.string().trim().min(3).max(1000) }).strict()
export function profileScope(context: XpertResolvedViewHostContext): RuntimeScope {
  const identity = context.assistant
  if (!identity?.instanceId || !identity.versionIds?.includes(identity.instanceId)) throw new ForbiddenException('assistant_identity_required')
  return { ...viewScope(context), assistantId: identity.instanceId, assistantVersionIds: identity.versionIds }
}
@Injectable()
export class MaterialProfileService {
  constructor(private readonly cases: MaterialCaseService) {}
  async readable(context: XpertResolvedViewHostContext) {
    const scope = profileScope(context), access = await this.cases.readableProjects(scope)
    const projectIds = access.map(item => item.projectId)
    const builder = this.cases.db.getRepository(MaterialCaseEntity).createQueryBuilder('c')
      .where('c.tenantId = :tenantId AND c.organizationId = :organizationId', scoped(scope))
      .andWhere(projectIds.length ? 'c.projectId IN (:...projectIds)' : '1 = 0', { projectIds })
      .andWhere('(c.assignedAssistantIds ?| ARRAY[:...assistantIds]::text[] OR c.coordinatorId IN (:...assistantIds))', { assistantIds: scope.assistantVersionIds })
    return { scope, access, builder }
  }
  async getData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<MaterialProfileData> {
    const tab = profileTab(viewKey)
    if (!tab) throw new ForbiddenException('unsupported_profile_view')
    const { scope, access, builder } = await this.readable(context)
    const selectedEntity = query.selectionId ? await builder.clone().andWhere('c.id = :caseId', { caseId: idSchema.parse(query.selectionId) }).getOne() : null
    if (query.selectionId && !selectedEntity) throw new ForbiddenException('profile_case_forbidden')
    if (tab.mode === 'attention') {
      if (tab.role === 'coordinator' || tab.role === 'governance') builder.andWhere("c.status IN ('review_required', 'blocked')")
      else {
        const pending = builder.subQuery().select('1').from(MaterialNodeEntity, 'n').where('n.caseId = c.id AND n.tenantId = c.tenantId AND n.organizationId = c.organizationId')
          .andWhere('n.roleKey = :role').andWhere("n.status IN ('ready', 'running', 'blocked')").getQuery()
        builder.andWhere(`(EXISTS ${pending}${tab.role === 'quality' ? " OR (c.criticalConflict = true AND c.status NOT IN ('completed', 'rejected'))" : ''})`, { role: tab.role })
      }
    }
    if (query.search?.trim()) builder.andWhere('(c.title ILIKE :search OR c.caseKey ILIKE :search)', { search: `%${query.search.trim().slice(0, 100).replaceAll('%', '\\%').replaceAll('_', '\\_')}%` })
    const page = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1))), pageSize = 5
    const [entities, total] = await builder.orderBy('c.updatedAt', 'DESC').addOrderBy('c.id', 'ASC').skip((page - 1) * pageSize).take(pageSize).getManyAndCount()
    const all = selectedEntity && !entities.some(e => e.id === selectedEntity.id) ? [...entities, selectedEntity] : entities
    const nodes = all.length ? await this.cases.db.getRepository(MaterialNodeEntity).findBy({ ...scoped(scope), caseId: In(all.map(e => e.id)) }) : []
    const records = all.length ? await this.cases.db.getRepository(MaterialExecutionEntity).createQueryBuilder('r')
      .where('r.tenantId = :tenantId AND r.organizationId = :organizationId', scoped(scope))
      .andWhere('r.caseId IN (:...caseIds)', { caseIds: all.map(e => e.id) })
      .andWhere('r.executorId IN (:...assistantIds) AND r.roleKey = :role', { assistantIds: scope.assistantVersionIds, role: tab.role })
      .distinctOn(['r.caseId']).orderBy('r.caseId').addOrderBy('r.createdAt', 'DESC').addOrderBy('r.id', 'DESC').getMany() : []
    const projected = all.map((e): MaterialProfileCase => {
      const caseNodes = nodes.filter(n => n.caseId === e.id), record = records.find(r => r.caseId === e.id)?.record
      const tasks = caseNodes.filter(n => (tab.role === 'coordinator' || n.roleKey === tab.role) && FLOW_DEFINITION.nodes.some(node => node.key === n.nodeKey && node.kind === 'task'))
      const canManage = access.some(p => p.projectId === e.projectId && p.canManage && !p.archived)
      return { id: e.id, caseKey: e.caseKey, title: e.title, kind: e.kind, status: e.status, revision: e.revision, updatedAt: e.updatedAt.toISOString(),
        completedTasks: tasks.filter(n => n.status === 'completed').length, totalTasks: tasks.filter(n => n.status !== 'skipped').length,
        tasks: tasks.map(n => ({ key: n.nodeKey, title: FLOW_DEFINITION.nodes.find(node => node.key === n.nodeKey)?.title ?? n.nodeKey, status: n.status })),
        latestActivity: record ? { summary: record.safeSummary, at: record.finishedAt ?? record.startedAt, status: record.status } : null,
        facts: { sources: e.snapshot.materials.length, drawings: e.snapshot.drawings.length, conflicts: e.snapshot.candidates.flatMap(c => c.differences).filter(d => d.result === 'conflict' && d.critical).length, exposure: e.exposure, publications: e.snapshot.publications.filter(p => p.status === 'confirmed').length },
        allowedActions: canManage && e.status === 'review_required' && (tab.role === 'coordinator' || tab.role === 'governance') ? ['approve', 'reject'] : [],
      }
    })
    return { role: tab.role, mode: tab.mode, items: projected.slice(0, entities.length), total, page, pageSize,
      selected: selectedEntity ? { case: projected.find(item => item.id === selectedEntity.id)!, proposal: selectedEntity.snapshot.proposal,
        materials: selectedEntity.snapshot.materials.map(({ code, name, plant, drawing, revision }) => ({ code, name, plant, drawing, revision })), evidence: selectedEntity.snapshot.evidence.slice(0, 40) } : null,
      simulation: true, workspaceViewKey: `${artifactKey('views')}__${VIEW_KEYS.workspace}` }
  }
  async decide(context: XpertResolvedViewHostContext, viewKey: string, input: ProfileDecision) {
    const tab = profileTab(viewKey)
    if (!tab || (tab.role !== 'coordinator' && tab.role !== 'governance')) throw new ForbiddenException('profile_action_forbidden')
    const { scope, builder } = await this.readable(context)
    if (!await builder.andWhere('c.id = :caseId', { caseId: input.caseId }).getOne()) throw new ForbiddenException('profile_case_forbidden')
    return this.cases.decide(scope, input)
  }
}
