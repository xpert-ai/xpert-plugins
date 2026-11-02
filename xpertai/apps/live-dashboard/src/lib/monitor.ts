import { ForbiddenException, Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { AgentMiddlewareStrategy, type AgentMiddleware, type IAgentMiddlewareStrategy, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type { TAgentMiddlewareMeta, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { DashboardService } from './dashboard.service'
import { dashboardRuntimeContext } from './runtime-context'
import { dashboardIcon } from './dashboard-icon'

const freshnessRuleSchema = z.object({ bindingId: z.string().min(1), fieldId: z.string().min(1), maxAgeSeconds: z.number().int().min(1).max(31536000) }).strict()
type FreshnessRule = z.infer<typeof freshnessRuleSchema>

@Injectable()
export class DashboardMonitor {
  constructor(private readonly dashboards: DashboardService) {}
  async inspect(context: XpertResolvedViewHostContext, artifactId: string, freshnessRule?: FreshnessRule) {
    const access = await this.dashboards.access(context)
    if (!access.project || access.archived) throw new ForbiddenException('DASHBOARD_ACTIVE_PROJECT_REQUIRED')
    const saved = await this.dashboards.open(context, artifactId, undefined, undefined, 'published')
    if (!saved.versionId) throw new Error('DASHBOARD_NOT_PUBLISHED')
    const result = await this.dashboards.query(context, artifactId, saved.versionId, {})
    // Reauthorize the target after the queries; a receipt is bound to this formal version.
    const current = await this.dashboards.open(context, artifactId, undefined, undefined, 'published')
    if (current.versionId !== saved.versionId || (await this.dashboards.access(context)).archived) throw new Error('DASHBOARD_INSPECTION_CHANGED')
    const freshness = freshnessRule ? assessFreshness(saved.manifest, result.datasets, freshnessRule, Date.now()) : undefined
    return { artifactId, versionId: saved.versionId, title: saved.manifest.title,
      status: result.failures.length || freshness && freshness.status !== 'fresh' ? 'attention' as const : 'healthy' as const,
      checkedAt: new Date().toISOString(), failures: result.failures,
      datasets: result.datasets.map(dataset => ({ datasetId: dataset.datasetId, queryFetchedAt: dataset.freshness.sourceFetchedAt,
        truncated: dataset.completeness.truncated, returnedRows: dataset.completeness.returnedRows })),
      businessFreshness: freshness ?? 'not_asserted' as const,
      availableFreshnessFields: saved.manifest.bindings.flatMap(binding => binding.output.fields.filter(field => field.logicalType === 'timestamp')
        .map(field => ({ bindingId: binding.id, fieldId: field.id, label: field.label }))) }
  }
}

@AgentMiddlewareStrategy('LiveDashboardMonitor')
export class DashboardMonitorMiddleware implements IAgentMiddlewareStrategy {
  readonly meta: TAgentMiddlewareMeta = { name: 'LiveDashboardMonitor', icon: dashboardIcon, features: ['live_dashboard.monitor'],
    label: { en_US: 'Dashboard inspection', zh_Hans: '看板巡检' },
    description: { en_US: 'Inspect published Project dashboards without editing or publishing.', zh_Hans: '检查项目正式看板，不修改或发布。' },
    configSchema: { type: 'object', properties: {}, additionalProperties: false } }
  constructor(private readonly monitor: DashboardMonitor, private readonly dashboards: DashboardService) {}
  createMiddleware(options: unknown, context: IAgentMiddlewareContext): AgentMiddleware {
    z.object({}).strict().parse(options ?? {})
    const scope = dashboardRuntimeContext(context)
    return { name: 'LiveDashboardMonitor', tools: [
      tool(async ({ artifactId, freshness }) => JSON.stringify(await this.monitor.inspect(scope, artifactId, freshness)), {
        name: 'dashboard_inspect', description: 'Check one explicitly selected published Project dashboard as the current run actor. Returns compact binding availability and query timestamps, never data rows. Does not modify or publish. Query time is not proof of business-data freshness. Only an explicitly configured freshness rule checks the latest returned declared timestamp, and incomplete results remain unknown. Scheduled runs retain this receipt in platform execution history.',
        schema: z.object({ artifactId: z.string().uuid(), freshness: freshnessRuleSchema.optional() }).strict(), verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Inspect published dashboard', zh_Hans: '巡检正式看板' } } }),
      tool(async ({ page }) => {
        const access = await this.dashboards.access(scope)
        if (!access.project || access.archived) throw new ForbiddenException('DASHBOARD_ACTIVE_PROJECT_REQUIRED')
        const result = await this.dashboards.listPage(scope, page, 50)
        return JSON.stringify({ ...result, items: result.items.filter(item => !!item.versionId).map(({ artifactId, versionId, versionNumber, title }) => ({ artifactId, versionId, versionNumber, title })) })
      }, { name: 'dashboard_list_published', description: 'List published dashboards in the current Project. Follow hasMore/page; never infer the target from recency.',
        schema: z.object({ page: z.number().int().positive().default(1) }).strict(), verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'List published dashboards', zh_Hans: '列出正式看板' } } })
    ] }
  }
}

/** Business freshness must be an explicit data contract, never the query fetch timestamp. */
export function assessFreshness(manifest: import('./dashboard.schema').DashboardManifest, datasets: import('@xpert-ai/contracts').AnalyticalDataset[], input: FreshnessRule, now: number) {
  const rule = freshnessRuleSchema.parse(input)
  const binding = manifest.bindings.find(binding => binding.id === rule.bindingId)
  const field = binding?.output.fields.find(field => field.id === rule.fieldId && field.logicalType === 'timestamp')
  const dataset = datasets.find(dataset => dataset.datasetId === binding?.output.datasetId)
  const values = dataset?.rows.map(row => row[rule.fieldId]) ?? []
  const times = values.map(value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN)
  const unknown = !field || !dataset || dataset.completeness.truncated || !times.length || times.some(time => !Number.isFinite(time) || time > now + 60000)
  const latest = unknown ? null : times.reduce((latest, time) => Math.max(latest, time), -Infinity)
  return { ...rule, status: unknown ? 'unknown' as const : now - latest! > rule.maxAgeSeconds * 1000 ? 'stale' as const : 'fresh' as const,
    latestTimestamp: latest === null ? null : new Date(latest).toISOString(), coverage: 'latest_returned_timestamp' as const }
}
