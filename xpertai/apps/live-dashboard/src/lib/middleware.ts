import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import type { AnalyticsBinding, AnalyticsDiscoveryResult, AnalyticsValue, TAgentMiddlewareMeta, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy, RequestContext, validateAnalyticsPayload, workspaceFileMutationPath, WorkspaceFilesRuntimeCapability, analyticsBindingSchema, type AgentMiddleware, type IAgentMiddlewareStrategy, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { artifactDocumentHtml, type ArtifactDocumentDependencyLock } from '@xpert-ai/plugin-sdk/artifact-document'
import { libraryLocks } from './document-libraries'
import { discoverToolSchema, previewToolSchema, createToolSchema, createHtmlToolSchema, htmlPathSchema, fromAgentBinding, parseObjectJson } from './agent.schema'
import { HTML_DASHBOARD_GUIDANCE } from './html-guidance'
import { DashboardService } from './dashboard.service'
import { dashboardSchema, type DashboardManifest } from './dashboard.schema'
import { FEATURE } from './view.provider'
import { createEditingTools, dashboardContextSchema, EDITING_GUIDANCE } from './editing'
import { DASHBOARD_MUTATION_TOOLS } from './dashboard-receipt'
import { createFilterEvidence } from './filter-evidence'
import { dashboardSaveEvidence } from './save-evidence'
import { emitDashboardCard } from './resource-card'
import { dashboardIcon } from './dashboard-icon'

const middlewareOptionsSchema = z.object({ allowedFinalProviders: z.array(z.string().min(1)).min(1).max(20).optional() }).strict()

export const DASHBOARD_GUIDANCE = `For a new independent dashboard, use a new unused HTML file path. An existing filename or matching title is not authorization to edit another Artifact; do not switch from creation to dashboard_open/update because a file already exists. For a new dashboard, call dashboard_list_sources before searching raw files, reading old scripts or creating transformations. Named governed sources may already provide the required query; inspect their provider contracts first. File-backed sources do not imply that a script must be written. For creating or editing live dashboards, first read the installed live-dashboard skill using read_skill_file and follow only the references relevant to the task. Use SandboxFile tools for all source-file authoring; HTML alone is not a saved dashboard. Follow preview.validation.checks immediately before authoring HTML; each suggestedCall must actually succeed. Business definitions, real data previews and nullable-filter tests are required before saving new or changed Bindings. Do not invent business data or substitute a different metric without agreement. Report completion only from a successful dashboard_create/dashboard_create_html/dashboard_update draft receipt. Human publication is separate. Successful create, update and open tools emit a chat resource card automatically; resourceCard.status reports emission. Its Open button selects the exact dashboard in Workbench. Never fabricate a link, call present_files for dashboard HTML, or output card JSON as text. If card delivery is unavailable, report the saved receipt and use the Workbench picker.`

@AgentMiddlewareStrategy('LiveDashboard')
export class DashboardMiddleware implements IAgentMiddlewareStrategy {
  readonly meta: TAgentMiddlewareMeta = {
    name: 'LiveDashboard', label: { en_US: 'Live dashboards', zh_Hans: '实时看板' },
    description: { en_US: 'Discover, preview, create and update governed live dashboards.', zh_Hans: '发现业务数据、验证查询并持续修改实时看板。' },
    // Tools inherit this self-contained icon through the platform middleware metadata.
    icon: dashboardIcon, features: [FEATURE], configSchema: { type: 'object', properties: {
      allowedFinalProviders: { type: 'array', items: { type: 'string' }, title: { en_US: 'Allowed final dashboard providers', zh_Hans: '最终看板允许的 Provider' },
        description: { en_US: 'Optional provider IDs required for saved Agent dashboards. Upstream previews remain available.', zh_Hans: '可选的最终看板 Provider ID 列表，不限制上游来源预览。' } }
    }, additionalProperties: false }
  }
  constructor(private readonly service: DashboardService) {}
  createMiddleware(_options: object, context: IAgentMiddlewareContext): AgentMiddleware {
    const options = middlewareOptionsSchema.parse(_options)
    if (!context.xpertId) throw new Error('DASHBOARD_ASSISTANT_REQUIRED')
    const scope: XpertResolvedViewHostContext = {
      tenantId: context.tenantId ?? RequestContext.currentTenantId(), organizationId: context.organizationId ?? RequestContext.getOrganizationId(),
      userId: context.userId ?? RequestContext.currentUserId(), hostType: context.projectId ? 'project' : 'agent', hostId: context.projectId ?? context.xpertId, slots: []
    }
    // Evidence belongs to this run and actor, never a process-wide cache of business data.
    const discovered = new Map<string, AnalyticsDiscoveryResult['queryContract']>(), previews = new Map<string, AnalyticsBinding>()
    let listedSources: Awaited<ReturnType<DashboardService['sources']>> | undefined
    const filterEvidence = createFilterEvidence(this.service, scope, previews)
    const created = new Map<string, { manifest: DashboardManifest; receipt: Awaited<ReturnType<DashboardService['save']>> }>()
    const preview = async (binding: AnalyticsBinding) => {
      const contract = discovered.get(`${binding.dataSourceId}/${binding.providerId}`)
      if (!contract) throw new Error('DASHBOARD_DISCOVER_REQUIRED')
      validateAnalyticsPayload(binding.payload, contract.payloadSchema)
        const controls = Object.fromEntries(binding.parameters.map((parameter) => [parameter.controlId, parameter.defaultValue ?? null]))
        const dataset = await this.service.preview(scope, { binding, controls })
        const previewId = previewKey(binding, controls)
        if (previews.size >= 24 && !previews.has(previewId)) throw new Error('DASHBOARD_PREVIEW_LIMIT')
        previews.set(previewId, binding)
        const rows = dataset.rows.slice(0, 20)
        while (Buffer.byteLength(JSON.stringify(rows)) > 32000) rows.pop()
        return JSON.stringify({ ...dataset, previewId, bindingJson: JSON.stringify(binding), rows, validation: filterEvidence.requirements(binding, previewId, rows), preview: { displayedRows: rows.length,
          omittedRows: dataset.rows.length - rows.length, note: 'Display sample only; completeness describes the full bounded query. Verify business semantics before create.' } })
    }
    const resolvePreviews = (previewIds: string[]) => previewIds.map(id => {
        const binding = previews.get(id)
        if (!binding) throw new Error('DASHBOARD_PREVIEW_REQUIRED: use a previewId returned in this run')
        return binding
      })
    const validateFinal = (manifest: DashboardManifest, requirePreviews: boolean) => {
      const allowedProviders = options.allowedFinalProviders
      if (allowedProviders && manifest.bindings.some(binding => !allowedProviders.includes(binding.providerId)))
        throw new Error(`DASHBOARD_PROVIDER_REQUIRED: final bindings must use ${allowedProviders.join(', ')}`)
      if (requirePreviews) {
        const controls = Object.fromEntries(manifest.controls.filter(item => item.defaultValue !== undefined).map(item => [item.controlId, item.defaultValue ?? null]))
        for (const binding of manifest.bindings) {
          const previewId = previewKey(binding, controls)
          if (!previews.has(previewId)) throw new Error('DASHBOARD_PREVIEW_REQUIRED: preview the exact binding and default controls before saving')
          filterEvidence.assert(binding, previewId)
        }
      }
    }
    const save = async (input: z.infer<typeof createToolSchema>, config?: RunnableConfig, html?: string, dependencies: ArtifactDocumentDependencyLock[] = []) => {
      const { previewIds, supersedesPaths, ...definition } = input
      const bindings = resolvePreviews(previewIds)
      const manifest = dashboardSchema.parse({ ...definition, bindings, schema: 'xpert.live-dashboard/v1', id: randomUUID(),
        ...(html ? { presentation: { type: 'html', html, ...(dependencies.length ? { dependencies } : {}) } } : {}) })
      validateFinal(manifest, true)
      const key = hash({ input: { ...definition, previewIds }, html, dependencies })
      const previous = created.get(key)
      if (previous) {
        const receipt = await this.service.save(scope, previous.manifest, previous.receipt.baseVersionId, previous.receipt.draftRevision)
        created.set(key, { manifest: previous.manifest, receipt })
        const resourceCard = await emitDashboardCard(scope, { ...receipt, state: 'draft', revision: receipt.draftRevision }, config)
        return JSON.stringify({ dashboard: receipt, resourceCard })
      }
      const sameTitle = [...created.values()].find(item => item.manifest.title === manifest.title)
      if (sameTitle) throw new Error(`DASHBOARD_ALREADY_CREATED: this run already saved this dashboard. Use dashboard_open with artifactId ${sameTitle.receipt.artifactId}, then dashboard_update with fresh previewIds for data changes; preserve the Artifact instead of creating another one.`)
      const result = await this.service.save(scope, manifest, null)
      created.set(key, { manifest, receipt: result })
      const resourceCard = await emitDashboardCard(scope, { ...result, state: 'draft', revision: result.draftRevision }, config)
      return JSON.stringify({ dashboard: result, resourceCard })
    }
    const evidence = dashboardSaveEvidence(() => {
      const files = context.runtime?.capabilities?.require(WorkspaceFilesRuntimeCapability)
      if (!files) throw new Error('DASHBOARD_WORKSPACE_REQUIRED')
      return files
    })
    let modelCalls = 0
    return { name: 'LiveDashboard', contextSchema: dashboardContextSchema,
      wrapToolCall: async (request, handler) => {
        const name = request.toolCall.name
        const args = request.toolCall.args
        const path = workspaceFileMutationPath(request.tool && 'metadata' in request.tool ? request.tool.metadata : undefined, args)
        const creation = name === 'dashboard_create_html' ? createHtmlToolSchema.safeParse(args)
          : name === 'dashboard_create' ? createToolSchema.safeParse(args) : undefined
        const save = DASHBOARD_MUTATION_TOOLS.includes(name) ? evidence.beginSave(creation?.success ? creation.data.supersedesPaths : undefined, name === 'dashboard_create' ? 'draft' : 'source') : undefined
        const result = path && (evidence.has(path) || previews.size > 0 && htmlPathSchema.safeParse(path).success)
          ? await evidence.trackWrite(path, async () => handler(request)) : await handler(request)
        if (save && 'content' in result && (!('status' in result) || result.status !== 'error')) await evidence.accept(save, result.content)
        return result
      }, wrapModelCall: async (request, handler) => {
      const exhausted = ++modelCalls > 24
      if (exhausted && evidence.pending) throw new Error('DASHBOARD_SAVE_NOT_CONFIRMED: no successful draft save receipt; Workspace changes have not been saved to the dashboard.')
      const result = await handler({ ...request, ...(evidence.pending ? { toolChoice: 'required' as const } : {}), ...(exhausted ? { tools: [] } : {}), systemMessage: new SystemMessage({ content: [
        ...(typeof request.systemMessage?.content === 'string' ? [{ type: 'text' as const, text: request.systemMessage.content }] : request.systemMessage?.content ?? []),
        { type: 'text', text: DASHBOARD_GUIDANCE + '\n' + HTML_DASHBOARD_GUIDANCE + '\n' + EDITING_GUIDANCE + (evidence.pending ? `\nDashboard changes are pending without a matching draft save receipt. Unsaved files: ${JSON.stringify(evidence.pendingPaths)}. Continue reading/repairing and call dashboard_create_html or dashboard_update with the exact file path; do not finish or claim it was saved. When abandoning earlier unsaved HTML creation candidates, explicitly pass their exact paths as supersedesPaths to dashboard_create or dashboard_create_html, matching the requested presentation mode. If a standard dashboard is already saved, repeat dashboard_create with the same definition/previewIds and supersedesPaths; do not create an unwanted HTML dashboard. This only abandons those candidates after a successful save; it never discards another Artifact editing copy.` : '') + (options.allowedFinalProviders ? `\nThis Assistant requires every saved dashboard binding to use one of these providers: ${options.allowedFinalProviders.join(', ')}. Other providers may be previewed only as upstream inputs. Do not save a direct-source substitute.` : '') + (exhausted ? '\nThe dashboard tool budget is exhausted. Stop calls; report only saved receipts or explain the concrete blocker truthfully.' : '') }
      ] }) })
      if (evidence.pending && result && !result.tool_calls?.length) throw new Error('DASHBOARD_SAVE_NOT_CONFIRMED: the model stopped without a successful draft save receipt.')
      return result
    }, tools: [
      filterEvidence.tool,
      tool(async () => JSON.stringify({ libraries: await libraryLocks(['echarts', 'three']),
        pageRuntime: {
          global: 'window.xpertLiveArtifact',
          bindingIds: [...new Set([...previews.values()].map(binding => binding.id))],
          startup: 'const live = window.xpertLiveArtifact; live.subscribe(bindingId, renderDataset); await live.ready(); await live.query(bindingId, typedControls); Use an async function, with the exact binding IDs from saved previews.',
          refresh: 'live.refresh(bindingId) requires a Binding ID. live.refresh() without an ID is invalid. For a page refresh button or timer, call Promise.all(bindingIds.map(id => live.refresh(id))). Each subscription redraws its KPI, chart and details.',
          filters: 'Mark native data selects with data-dashboard-control="<exact controlId>". Mark purely visual selects with data-dashboard-presentation instead. Changing a data select must call live.query for every affected Binding, not only filter cached rows in JS. bindSelect updates one Binding only. Read references/html-lifecycle.md before writing the page.'
        },
        usage: { echarts: 'window.echarts: init(element, null, {renderer:"svg"}) then setOption(completeOption, {notMerge:true}). Canvas is also available. Derive active series/legend dimensions from each received Dataset, including filtered results; never retain excluded groups as zero-valued series. Aggregate repeated categories using all grain dimensions, clear empty results, and redraw KPI, chart and details together in subscribe. Use ResizeObserver to resize and reuse the instance on filter/refresh.',
          three: 'window.THREE: bundled core including WebGLRenderer. Requires WebGL2; catch unavailable GPU contexts and show a clear fallback. External textures/models, loaders/addons, WebGPU and workers are not bundled.' },
        lifecycle: 'Pass libraries IDs to dashboard_create_html or dashboard_update. Actual version and bytes are pinned on save; omitted libraries on update preserves saved locks. No CDN, imports or network access.' }),
      { name: 'dashboard_libraries', description: 'Discover packaged frontend libraries and exact versions available to HTML dashboards. Read before using ECharts/Three.js. Returns metadata, never library source.',
        schema: z.object({}).strict(), verboseParsingErrors: true, metadata: { toolName: { en_US: 'Discover dashboard libraries', zh_Hans: '查看看板前端图库' } } }),
      ...createEditingTools(this.service, scope, context, resolvePreviews, validateFinal, (path, artifactId) => evidence.opened(path, artifactId)),
      tool(async () => {
        listedSources = await this.service.sources(scope)
        return JSON.stringify(listedSources)
      }, {
        name: 'dashboard_list_sources', description: 'List authorized analytics sources and versioned providers. Start here; IDs must come from this list.',
        schema: z.object({}).strict(), verboseParsingErrors: true, metadata: { toolName: { en_US: 'List analytics sources', zh_Hans: '发现分析数据源' } }
      }),
      tool(async (input: z.infer<typeof discoverToolSchema>) => {
        if (listedSources && !listedSources.some(source => source.id === input.dataSourceId && source.providers.some(provider => provider.id === input.providerId)))
          throw new Error(`DASHBOARD_SOURCE_SELECTION_INVALID: copy an exact dataSourceId/providerId pair from dashboard_list_sources; do not invent or combine IDs. Known pairs: ${JSON.stringify(listedSources.map(source => ({ dataSourceId: source.id, name: source.name, providerIds: source.providers.map(provider => provider.id) })))}. Refresh the list if the source changed. Initial requestJson is "{}"; then follow inspectRequest/nextRequest.`)
        const parsed = { dataSourceId: input.dataSourceId, providerId: input.providerId, request: parseObjectJson(input.requestJson) }
        const result = await this.service.discover(scope, parsed)
        discovered.set(`${parsed.dataSourceId}/${parsed.providerId}`, result.queryContract)
        return JSON.stringify(result)
      }, { name: 'dashboard_discover', description: 'Discover provider-owned business metadata. Start requestJson="{}" then serialize inspectRequest/nextRequest. Inspect dataset fields, comments, measures and native query format before preview.',
        schema: discoverToolSchema, verboseParsingErrors: true, metadata: { toolName: { en_US: 'Inspect business data', zh_Hans: '理解业务数据与指标' } } }),
      tool(async (input: z.infer<typeof previewToolSchema>) => {
        const contract = discovered.get(`${input.binding.dataSourceId}/${input.binding.providerId}`)
        if (!contract) throw new Error('DASHBOARD_DISCOVER_REQUIRED: discover the source before preview')
        const binding = fromAgentBinding(input.binding, contract)
        return preview(binding)
      }, { name: 'dashboard_preview', description: 'Run one read-only binding using parameters[].defaultValue. Returns validated Dataset fields, first 20 rows, full query completeness and audit. Required before create; changes to binding/defaults require another preview.',
        schema: previewToolSchema, verboseParsingErrors: true, metadata: { toolName: { en_US: 'Verify dashboard data', zh_Hans: '预览并验证看板数据' } } }),
      tool(async ({ bindingJson }: { bindingJson: string }) => preview(analyticsBindingSchema.parse(JSON.parse(bindingJson))), {
        name: 'dashboard_preview_binding', description: 'Preview a complete canonical AnalyticsBinding returned by another tool. Serialize the complete canonical Binding (for example discovery items[].metadata.binding), including parameters[].controlId. bindingPayload is only the payload, not a Binding. If adding a parameter, include name, controlId, type, required and defaultValue. Do not convert it to the simplified dashboard_preview input. Discovery of the source is still required. Returns the same previewId receipt for dashboard_create.',
        schema: z.object({ bindingJson: z.string().min(2).max(200000) }).strict(), verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Verify registered dataset', zh_Hans: '验证已注册数据集' } }
      }),
      tool(async (input: z.infer<typeof createToolSchema>, config) => save(input, config), { name: 'dashboard_create', description: 'Save a standard chart/table dashboard from previewId receipts. For custom HTML use dashboard_create_html. Fields and defaults must match previewed parameters. Returns a saved Artifact receipt after current access/data revalidation.',
        schema: createToolSchema, verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Save live dashboard', zh_Hans: '生成并保存实时看板' } } }),
      tool(async (input: z.infer<typeof createHtmlToolSchema>, config) => {
        if (input.supersedesPaths?.includes(input.path)) throw new Error('DASHBOARD_SUPERSEDE_INVALID: the saved path cannot supersede itself')
        const files = context.runtime?.capabilities?.require(WorkspaceFilesRuntimeCapability)
        if (!files) throw new Error('DASHBOARD_WORKSPACE_REQUIRED')
        const file = await files.readRuntimeBuffer(input.path)
        if (file.buffer.byteLength > 300000) throw new Error('DASHBOARD_HTML_TOO_LARGE')
        const html = artifactDocumentHtml.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.buffer))
        const { path, libraries, supersedesPaths, ...definition } = input
        const result = JSON.parse(await save({ ...definition, charts: [], tables: [] }, config, html, await libraryLocks(libraries ?? [])))
        return JSON.stringify({ ...result, sourceFile: { path, sha256: createHash('sha256').update(file.buffer).digest('hex') } })
      }, { name: 'dashboard_create_html', description: 'Save custom HTML from a Workspace path together with run-local preview receipts and controls in one persistent draft (human publication is separate). Requires real data preview; does not accept query payloads or cached rows.',
        schema: createHtmlToolSchema, verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Save HTML dashboard', zh_Hans: '保存自由样式看板' } } })
    ] }
  }
}
function previewKey(binding: AnalyticsBinding, controls: Record<string, AnalyticsValue>) {
  return hash({ binding, controls: Object.fromEntries(binding.parameters.map((parameter) => [parameter.controlId, Object.hasOwn(controls, parameter.controlId) ? controls[parameter.controlId] : parameter.defaultValue ?? null])) })
}
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest('hex')
}
