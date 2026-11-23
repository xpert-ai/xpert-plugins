import type { JSONValue } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import type { SetupContext } from './application-models'
import { materializeBundle, digest } from './bootstrap-bundle'
import { bindReader, type ManagementRequest, type BootstrapAccess } from './bootstrap-access'

export type Selection = { workspaceId: string; dataSourceId: string; mode: string; userIds: string[] }
const uuid = z.string().uuid()
const model = z.object({
  id: uuid,
  key: z.string().nullable(),
  name: z.string(),
  workspaceId: uuid,
  organizationId: uuid,
  tenantId: uuid,
  dataSourceId: uuid,
  type: z.string().nullable(),
  catalog: z.string().nullish(),
  businessAreaId: uuid.nullish(),
  draftRevision: z.number().int(),
  publishedVersion: z.number().int(),
  status: z.string(),
  draft: z.record(z.unknown()),
  published: z.record(z.unknown()),
  options: z.record(z.unknown())
})
type Model = z.output<typeof model>
export function createBootstrap(
  requestFor: (context: SetupContext) => ManagementRequest,
  readableLegacyModels: (context: SetupContext) => Promise<ReadonlySet<string>>
) {
  async function workspaces(ctx: SetupContext) {
    const request = requestFor(ctx)
    const [access, catalog] = await Promise.all([
      request('/assistant-management/access'),
      request('/workspace-discovery/workspaces')
    ])
    z.object({
      tenantId: z.literal(ctx.actor.tenantId),
      organizationId: z.literal(ctx.actor.organizationId),
      userId: z.literal(ctx.actor.userId),
      hasAdminAccess: z.literal(true)
    }).parse(access)
    const response = z.object({
      organizationId: z.literal(ctx.actor.organizationId),
      workspaces: z.array(z.object({ id: uuid, name: z.string() }))
    }).parse(catalog)
    return response.workspaces.map(({ id, name }) => ({ id, label: name }))
  }
  async function sources(ctx: SetupContext, workspaceId: string) {
    const request = requestFor(ctx)
    const base = '/workspaces/' + workspaceId + '/data-sources'
    // Each catalog endpoint authorizes the actor and workspace independently.
    const [visible, catalog, kinds] = await Promise.all([workspaces(ctx), request(base), request(base + '/types')])
    if (!visible.some((w) => w.id === workspaceId)) throw Error('DATAX_BOOTSTRAP_WORKSPACE_UNAVAILABLE')
    const driver = z.object({ id: uuid, type: z.string() })
    const drivers = z
      .union([z.array(driver), z.object({ items: z.array(driver) }).transform((x) => x.items)])
      .parse(kinds)
    const allowed = new Set(
      drivers
        .filter((t) => ['mysql', 'postgres', 'postgresql', 'doris', 'mssql', 'sqlserver'].includes(t.type))
        .map((t) => t.id)
    )
    return z
      .object({
        authorized: z.array(z.object({ id: uuid, name: z.string(), typeId: uuid.nullish(), type: driver.nullish() }))
      })
      .parse(catalog)
      .authorized.filter((s) => allowed.has(s.typeId ?? s.type?.id ?? ''))
      .map((s) => ({ id: s.id, label: s.name }))
  }
  async function matchingModels(ctx: SetupContext, request: ManagementRequest, base: string, sel: Selection, key: string, legacyKey: string) {
    const matches: Model[] = []
    let skip = 0
    for (;;) {
      const page = z
        .object({ items: z.array(model), total: z.number().int().nonnegative() })
        .parse(await request(base + '?take=50&skip=' + skip))
      for (const item of page.items) {
        if (
          item.tenantId !== ctx.actor.tenantId ||
          item.organizationId !== ctx.actor.organizationId ||
          item.workspaceId !== sel.workspaceId
        )
          throw Error('DATAX_BOOTSTRAP_SCOPE_CHANGED')
        if (
          item.key === key ||
          (sel.mode === 'existing-tables' && item.key === legacyKey && item.dataSourceId === sel.dataSourceId)
        )
          matches.push(item)
      }
      skip += page.items.length
      if (skip >= page.total) break
      if (!page.items.length || skip > 10000) throw Error('DATAX_BOOTSTRAP_CATALOG_INCOMPLETE')
    }
    return matches
  }
  async function resolve(ctx: SetupContext, raw: JSONValue, sel: Selection) {
    const request = requestFor(ctx)
    const spec = materializeBundle(raw, sel.mode)
    const suffix = digest([
      ctx.actor.tenantId,
      ctx.actor.organizationId,
      sel.workspaceId,
      sel.dataSourceId,
      sel.mode
    ]).slice(0, 12)
    const key = spec.bundle.key + '_' + suffix
    const base = '/workspaces/' + sel.workspaceId + '/semantic-models'
    const currentActorOnly = sel.userIds.length === 1 && sel.userIds[0] === ctx.actor.userId
    // A manually published model retains its existing grants. Discover the actor's
    // authorized models alongside the scoped catalogs without delaying managed models on a missing reader.
    const visibility = sel.mode === 'existing-tables' && currentActorOnly
      ? Promise.allSettled([readableLegacyModels(ctx)])
      : undefined
    const [authorized, matches, readable] = await Promise.all([
      sources(ctx, sel.workspaceId),
      matchingModels(ctx, request, base, sel, key, spec.bundle.key),
      visibility
    ])
    if (!authorized.some((source) => source.id === sel.dataSourceId)) throw Error('DATAX_BOOTSTRAP_SOURCE_UNAVAILABLE')
    const item = matches[0]
    const managed = item?.key === key
    const label = item?.name ?? spec.bundle.name + ' · ' + suffix
    const marker = { key: spec.bundle.key, version: spec.bundle.version, mode: sel.mode }
    const differences: string[] = []
    if (matches.length > 1) differences.push('key')
    if (item) {
      if (item.dataSourceId !== sel.dataSourceId) differences.push('dataSourceId')
      if (item.type !== 'SQL' || (item.catalog ?? undefined) !== spec.catalog) differences.push('model')
      if (managed && digest(item.options.applicationModel ?? null) !== digest(marker)) differences.push('version')
      if (digest(item.draft) !== digest(spec.draft)) differences.push('draft')
      if (item.publishedVersion && digest(item.published) !== digest(spec.draft)) differences.push('published')
      if (item.publishedVersion && item.status !== 'published') differences.push('status')
      if (!managed) {
        const visible = readable?.[0]
        if (visible?.status === 'rejected') throw visible.reason
        if (!item.publishedVersion || !visible?.value.has('datax-semantic-model-' + item.id))
          differences.push('existingAccess')
      }
    }
    const state = differences.length
      ? ('conflict' as const)
      : !item
        ? ('create' as const)
        : item.publishedVersion
          ? ('reuse' as const)
          : ('resume' as const)
    const plan = {
      state,
      modelLabel: label,
      differences,
      fingerprint: digest([
        key,
        marker,
        spec.draft,
        sel.dataSourceId,
        item?.id,
        item?.draftRevision,
        item?.businessAreaId,
        state,
        differences
      ])
    }
    return { request, base, key, item, managed, marker, spec, plan }
  }
  return {
    workspaces,
    sources,
    inspect: async (ctx: SetupContext, raw: JSONValue, sel: Selection) => (await resolve(ctx, raw, sel)).plan,
    apply: async (ctx: SetupContext, raw: JSONValue, sel: Selection, fingerprint: string, access: BootstrapAccess) => {
      const { request, base, key, item, managed, marker, spec, plan } = await resolve(ctx, raw, sel)
      if (plan.state === 'conflict' || fingerprint !== plan.fingerprint) throw Error('DATAX_BOOTSTRAP_CHANGED')
      if (item && !managed) return { id: 'datax-semantic-model-' + item.id, label: item.name }
      const businessAreaId = await access.area(key, plan.modelLabel)
      if (item && item.businessAreaId !== businessAreaId) throw Error('DATAX_BOOTSTRAP_EXISTING_AREA')
      let current =
        item ??
        model.parse(
          await request(base, 'POST', {
            type: 'SQL',
            key,
            name: plan.modelLabel,
            catalog: spec.catalog,
            businessAreaId,
            dataSourceId: sel.dataSourceId,
            draft: spec.draft,
            options: { applicationModel: marker }
          })
        )
      const path = base + '/' + current.id
      if (
        current.workspaceId !== sel.workspaceId ||
        current.organizationId !== ctx.actor.organizationId ||
        current.tenantId !== ctx.actor.tenantId ||
        current.dataSourceId !== sel.dataSourceId ||
        digest(current.draft) !== digest(spec.draft)
      )
        throw Error('DATAX_BOOTSTRAP_CHANGED')
      if (!current.publishedVersion) {
        z.object({ summary: z.object({ errorCount: z.literal(0) }) }).parse(
          await request(path + '/draft/validate', 'POST', {})
        )
        current = model.parse(
          await request(path + '/publish', 'POST', {
            expectedDraftRevision: current.draftRevision,
            releaseNotes: spec.bundle.name + ' ' + spec.bundle.version
          })
        )
      }
      if (current.status !== 'published' || digest(current.published) !== digest(spec.draft))
        throw Error('DATAX_BOOTSTRAP_CHANGED')
      await bindReader(request, ctx, current, sel.userIds, access)
      return { id: 'datax-semantic-model-' + current.id, label: current.name }
    }
  }
}
