import { Injectable, Logger } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext, XpertExtensionViewManifest, XpertRemoteComponentViewSchema, XpertViewQuery, XpertViewActionRequest, XpertViewActionResult } from '@xpert-ai/contracts'
import { localGitImportSchema } from './local-git.js'
import { Reviews, submitSchema } from './backend.js'
import { Automation } from './automation.js'
import { repositoryInput, savePolicySchema, runStatusSchema } from './automation-domain.js'
import { FEATURE, PROVIDER, PLUGIN, VIEW, idSchema, ReviewError } from './domain.js'
import { viewScope as scope } from './runtime-scope.js'
import { ASSISTANT_CONTEXT_SET_COMMAND, ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, WORKBENCH_NAVIGATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import type { Review } from './entity.js'
import { ReviewWorkbench } from './workbench.js'
import { workbenchQuerySchema } from './workbench-contract.js'
import { ReviewPipelineService } from './pipeline/service.js'
import { attachPipelineSchema } from './pipeline/contract.js'
import { ReviewPipelineCatalog } from './pipeline/catalog.js'
import { reviewPipelineConfigureSchema, reviewSourceSchema } from './pipeline/setup-contract.js'
export const reviewDto = (r: Review) => ({ id: r.id, revision: r.revision, ref: r.ref, snapshot: r.snapshot, status: r.status, access: r.access, pinned: r.pinned, viewed: r.viewed, summary: r.summary, findings: r.findings, errorCode: r.errorCode, submissionUrl: r.submissionUrl, taskId: r.taskId, threadId: r.threadId, conversationId: r.conversationId, executionId: r.executionId, automationRunId: r.automationRunId, pipelineProjectId: r.pipelineProjectId })
export const icon = { type: 'svg' as const, value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="5" r="3"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="19" r="3"/><path d="M6 8v8m12 0V9a4 4 0 0 0-4-4h-2m2-3-3 3 3 3"/></svg>' }
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const selection = z.object({ id: idSchema, revision: z.number().int().positive() }).strict()
const logger = new Logger('CodeReviewView')

@Injectable()
@ViewExtensionProvider(PROVIDER)
export class ReviewView implements IXpertViewExtensionProvider {
  constructor(private readonly reviews: Reviews, private readonly automation: Automation, private readonly pipelines: ReviewPipelineService, private readonly workbench: ReviewWorkbench) {}
  supports(c: XpertResolvedViewHostContext) { return c.hostType === 'agent' }
  getViewManifests(_c: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!['agent.workbench.fixed', 'agent.workbench.main'].includes(slot)) return []
    return [{ key: VIEW, title: text('Code review', '代码审查'), icon, hostType: 'agent', slot, order: 35,
      activation: { requiredFeatures: [FEATURE] }, source: { provider: PROVIDER, plugin: PLUGIN }, refreshable: true,
      clientCommands: [ASSISTANT_CONTEXT_SET_COMMAND, ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, WORKBENCH_NAVIGATION_OPEN_COMMAND, 'workspace.connector.connect'].map(key => ({ key })),
      hostEvents: { subscriptions: [{ key: 'code-review-completed', event: 'assistant.tool.completed', filter: { sources: ['chatkit'], toolNames: ['code_review_complete'] }, action: { type: 'forward', debounceMs: 500 } }] },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true, label: text('Code review', '代码审查'), icon, order: 35 } } } : {}),
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: 'code-review' }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: true, supportsSelection: true, supportsParameters: true, defaultPageSize: 20 }, cache: { enabled: false } },
      actions: [...['open', 'refresh', 'start', 'cancel', 'mark', 'submit'].map(key => ({ key, label: text(key, key), actionType: 'invoke' as const })),
        ...['import-local', 'repository.add', 'repository.save', 'repository.trial', 'run.confirm', 'run.retry', 'pipeline.start', 'pipeline.start-saved', 'pipeline.configurations', 'pipeline.catalog', 'pipeline.configure'].map(key => ({ key, label: text(key, key), actionType: 'invoke' as const, requiredHostAccess: 'manage' as const }))],
      parameters: [{ key: 'inbox', type: 'string', label: text('Inbox', '收件箱') }] }]
  }
  async getRemoteComponentEntry(c: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']) {
    if (viewKey !== VIEW || component.entry !== 'code-review') throw new ReviewError('view_not_found')
    const [appScript, appCss] = await Promise.all(['app.js', 'app.css'].map(f => readFile(new URL(`./remote-components/code-review/${f}`, import.meta.url), 'utf8')))
    return { html: renderRemoteReactIframeHtml({ title: c.locale?.startsWith('zh') ? '代码审查' : 'Code review', reactUmd: '', reactDomUmd: '', appScript, appCss }), contentType: 'text/html; charset=utf-8' as const }
  }
  async getViewData(c: XpertResolvedViewHostContext, viewKey: string, q: XpertViewQuery) {
    if (viewKey !== VIEW) throw new ReviewError('view_not_found')
    const s = scope(c), page = z.number().int().min(1).max(50).parse(q.page ?? 1)
    if (q.parameters?.workbench) return this.workbench.page(s, workbenchQuerySchema.parse({ ...q.parameters, page }))
    if (q.parameters?.githubConnection) return { items: [], meta: { connection: await this.automation.repositories.app.connection(s) } }
    if (q.parameters?.automation) return { items: [], meta: await this.automation.overview(s, page, q.parameters.status ? runStatusSchema.parse(q.parameters.status) : undefined) }
    if (q.selectionId) return { items: [], meta: { detail: reviewDto(await this.reviews.reconcile(s, idSchema.parse(q.selectionId))) } }
    if (q.parameters?.inbox) return (await this.reviews.github(s, 'connected')).inbox(z.enum(['requested', 'authored']).parse(q.parameters.inbox), page)
    return this.reviews.list(s, page)
  }
  async executeViewAction(c: XpertResolvedViewHostContext, viewKey: string, key: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== VIEW) throw new ReviewError('view_not_found')
      const s = scope(c)
      if (key === 'pipeline.catalog' || key === 'pipeline.configure') {
        if (!c.runtimeScope?.projectId) throw new ReviewError('project_required')
        const catalog = new ReviewPipelineCatalog(this.pipelines.capabilities)
        return { success: true, data: key === 'pipeline.catalog'
          ? await catalog.list(s, c.runtimeScope.projectId, z.object({ sourceKind: reviewSourceSchema }).strict().parse(request.input).sourceKind)
          : await catalog.configure(s, c.runtimeScope.projectId, reviewPipelineConfigureSchema.parse(request.input)) }
      }
      if (key === 'pipeline.configurations') {
        const input = z.object({ after: idSchema.optional() }).strict().parse(request.input)
        if (!c.runtimeScope?.projectId) throw new ReviewError('project_required')
        return { success: true, data: await this.pipelines.configurations(s, c.runtimeScope.projectId, input.after) }
      }
      if (key === 'pipeline.start-saved') {
        const input = selection.extend({ requestId: idSchema, bindingId: idSchema, instructions: z.string().max(6000).optional() }).strict().parse(request.input)
        if (!c.runtimeScope?.projectId) throw new ReviewError('project_required')
        const { instructions, ...start } = input
        if (instructions !== undefined) start.revision = (await this.reviews.guidance(s, input.id, input.revision, instructions)).revision
        return { success: true, data: await this.pipelines.attach(s, { ...start, projectId: c.runtimeScope.projectId }), refresh: true }
      }
      if (key === 'pipeline.start') return { success: true, data: await this.pipelines.attach(s, attachPipelineSchema.parse(request.input)), refresh: true }
      if (key === 'repository.add') {
        const v = repositoryInput.parse(request.input), p = await this.automation.repositories.add(s, v.owner, v.repository)
        await this.automation.schedule(p)
        return { success: true, data: { id: p.id }, refresh: true }
      }
      if (key === 'repository.save') {
        const v = savePolicySchema.parse(request.input), p = await this.automation.repositories.save(s, v.id, v.revision, v.settings)
        await this.automation.schedule(p)
        return { success: true, data: { id: p.id }, refresh: true }
      }
      if (key === 'repository.trial') {
        const v = z.object({ id: idSchema, number: z.number().int().positive() }).strict().parse(request.input)
        return { success: true, data: await this.automation.trial(s, v.id, v.number), refresh: true }
      }
      if (key === 'run.retry') {
        const v = z.object({ id: idSchema }).strict().parse(request.input)
        return { success: true, data: await this.automation.retry(s, v.id), refresh: true }
      }
      if (key === 'run.confirm') {
        const v = z.object({ id: idSchema, confirmed: z.literal(true) }).strict().parse(request.input)
        return { success: true, data: await this.automation.confirm(s, v.id), refresh: true }
      }
      let result: Review
      switch (key) {
        case 'import-local': result = await this.reviews.importLocal(s, localGitImportSchema.parse(request.input)); break
        case 'open': { const v = z.object({ url: z.string().url(), access: z.enum(['public', 'connected']) }).strict().parse(request.input); result = await this.reviews.open(s, v.url, v.access); break }
        case 'refresh': { const v = selection.parse(request.input); result = await this.reviews.refresh(s, v.id, v.revision); break }
        case 'start': throw new ReviewError('pipeline_binding_required')
        case 'cancel': { const v = selection.parse(request.input); result = await this.reviews.cancel(s, v.id, v.revision); break }
        case 'mark': { const v = selection.extend({ pinned: z.boolean().optional(), viewed: z.array(z.string()).max(3000).optional() }).parse(request.input); result = await this.reviews.mark(s, v.id, v.revision, { ...(v.pinned !== undefined ? { pinned: v.pinned } : {}), ...(v.viewed ? { viewed: v.viewed } : {}) }); break }
        case 'submit': result = await this.reviews.submit(s, submitSchema.parse(request.input)); break
        default: throw new ReviewError('unknown_action')
      }
      return { success: true, data: reviewDto(result), refresh: true }
    } catch (error) {
      if (!(error instanceof ReviewError) && !(error instanceof z.ZodError)) logger.error(error instanceof Error ? error.name : 'Unknown error')
      return { success: false, refresh: false, data: { code: error instanceof ReviewError ? error.code : error instanceof z.ZodError ? 'invalid_input' : 'operation_failed' } }
    }
  }
}
