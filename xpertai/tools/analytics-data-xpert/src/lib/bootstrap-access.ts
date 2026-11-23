import { z } from 'zod/v3'
import type { SetupContext } from './application-models'
import { digest } from './bootstrap-bundle'
export type ManagementRequest = (path: string, method?: string, body?: unknown) => Promise<unknown>
export type Reader = { xpertId: string; businessAreaId: string }
export type BootstrapAccess = {
  area(modelKey: string, name: string): Promise<string>
  prepare(resourceId: string, name: string): Promise<Reader>
  grant(resourceId: string, xpertId: string): Promise<void>
}
const uuid = z.string().uuid()
const category = 'application-analytics-reader'
const resourcePrefix = 'datax-semantic-model-'
export const readerCode = (modelId: string) => 'analytics-model-' + uuid.parse(modelId)

export async function readableIdentities(request: ManagementRequest, ctx: SetupContext) {
  const records = z
    .array(
      z.object({
        category: z.string().nullish(),
        code: z.string(),
        workspaceId: uuid.nullish(),
        xpertId: uuid.nullish(),
        scopeType: z.string(),
        organizationId: uuid.nullish()
      })
    )
    .parse(await request('/assistant-management/menu'))
  const readers = []
  for (const row of records.filter(
    (row) =>
      row.category === category && row.scopeType === 'organization' && row.organizationId === ctx.actor.organizationId
  )) {
    const id = z.string().uuid().parse(row.code.slice('analytics-model-'.length))
    if (row.code !== readerCode(id) || !row.xpertId || !row.workspaceId) throw Error('DATAX_BOOTSTRAP_READER_CHANGED')
    const resourceId = resourcePrefix + id
    const effective = z
      .object({
        allowed: z.boolean(),
        configured: z.boolean(),
        enabled: z.boolean(),
        tenantId: z.literal(ctx.actor.tenantId),
        organizationId: z.literal(ctx.actor.organizationId),
        scopeType: z.literal('organization'),
        code: z.literal(row.code),
        xpertId: z.literal(row.xpertId),
        workspaceId: z.literal(row.workspaceId),
        resourceIds: z.array(z.string())
      })
      .parse(await request('/assistant-management/effective/' + row.code))
    if (
      effective.allowed &&
      effective.configured &&
      effective.enabled &&
      effective.resourceIds.length === 1 &&
      effective.resourceIds[0] === resourceId
    )
      readers.push({ resourceId, assistantCode: row.code, assistantXpertId: row.xpertId, workspaceId: row.workspaceId })
  }
  return readers
}

export async function bindReader(
  request: ManagementRequest,
  ctx: SetupContext,
  model: { id: string; name: string; workspaceId: string; businessAreaId?: string | null },
  userIds: string[],
  access: BootstrapAccess
) {
  const resource = resourcePrefix + model.id
  const code = readerCode(model.id)
  const { xpertId, businessAreaId } = await access.prepare(resource, model.name)
  // Preserve the ownership and grants of a pre-existing model.
  if (model.businessAreaId !== businessAreaId) throw Error('DATAX_BOOTSTRAP_EXISTING_AREA')
  const definitions = z
    .array(
      z.object({
        id: uuid,
        code: z.string(),
        category: z.string().nullish(),
        organizationId: uuid.nullish(),
        workspaceId: uuid.nullish(),
        xpertId: uuid.nullish(),
        businessAreaId: uuid.nullish(),
        scopeType: z.string(),
        enabled: z.boolean()
      })
    )
    .parse(await request('/assistant-management/custom'))
  const prior = definitions.find((item) => item.code === code)
  if (
    prior &&
    (prior.category !== category ||
      prior.organizationId !== ctx.actor.organizationId ||
      prior.workspaceId !== model.workspaceId ||
      prior.xpertId !== xpertId ||
      prior.businessAreaId !== businessAreaId ||
      !prior.enabled ||
      prior.scopeType !== 'organization')
  )
    throw Error('DATAX_BOOTSTRAP_READER_CHANGED')
  const definition =
    prior ??
    z.object({ id: uuid }).parse(
      await request('/assistant-management/custom', 'POST', {
        code,
        name: model.name,
        category,
        workspaceId: model.workspaceId,
        assistantId: xpertId,
        enabled: true,
        provisionMode: 'external',
        scopeType: 'organization',
        organizationId: ctx.actor.organizationId,
        resourceIds: [resource],
        businessAreaId
      })
    )
  const grantsPath = '/assistant-management/custom/' + code + '/resources'
  const resources = z.object({ organizationId: z.literal(ctx.actor.organizationId), resourceIds: z.array(z.string()) })
  const current = resources.parse(await request(grantsPath))
  if (!current.resourceIds.length) await request(grantsPath, 'PUT', { resourceIds: [resource] })
  const checked = resources.parse(await request(grantsPath)).resourceIds
  if (checked.length !== 1 || checked[0] !== resource) throw Error('DATAX_BOOTSTRAP_READER_CHANGED')
  const assets = z
    .object({ total: z.number(), items: z.array(z.object({ subjectType: z.string(), subjectId: z.string() })) })
    .parse(await request('/business-areas/' + businessAreaId + '/assets?take=100'))
  if (
    assets.total !== assets.items.length ||
    assets.items.some(
      (a) =>
        !(a.subjectType === 'semantic_model' && a.subjectId === model.id) &&
        !(a.subjectType === 'assistant' && [code, definition.id, xpertId].includes(a.subjectId))
    )
  )
    throw Error('DATAX_BOOTSTRAP_AREA_CHANGED')
  const areaPath = '/business-areas/' + businessAreaId + '/grants'
  const grants = z.array(z.object({ subjectType: z.string(), userId: uuid.nullish() })).parse(await request(areaPath))
  const policyPath = '/uose/policies'
  const policies = z
    .object({ items: z.array(z.object({ policyId: z.string() }).passthrough()) })
    .parse(await request(policyPath + '?resourceId=' + resource)).items
  for (const userId of userIds) {
    const policyId = 'model-read-' + digest([model.id, userId]).slice(0, 40)
    const policy = {
      resourceId: resource,
      policyId,
      scope: 'action',
      effect: 'allow',
      priority: 100,
      requireApproval: false,
      binding: {
        actorIds: [userId],
        sources: ['live_artifact'],
        actionTypeCodes: ['sql.query_cube_slice'],
        entityTypeCodes: ['semantic_cube']
      }
    }
    const old = policies.find((p) => p.policyId === policyId)
    if (old && Object.entries(policy).some(([k, v]) => old[k] === undefined || digest(old[k]) !== digest(v)))
      throw Error('DATAX_BOOTSTRAP_POLICY_CHANGED')
    if (!old) await request(policyPath, 'POST', policy)
    if (!grants.some((g) => g.subjectType === 'user' && g.userId === userId))
      await request(areaPath, 'PUT', { subjectType: 'user', userId, role: 'consumer' })
  }
  await access.grant(resource, xpertId)
}
