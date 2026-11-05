import { createHash } from 'node:crypto'
import { DashboardSaveRequests, saveRequestSchema, waitSaveRequestSchema } from './save-requests'
import { DashboardProjectsService, projectSearchSchema } from './projects.service'
import { dashboardSearchSchema } from './projects.schema'
import { BadRequestException, ForbiddenException, Optional } from '@nestjs/common'
import { z } from 'zod/v3'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewQuery, XpertViewFileAccessRequest } from '@xpert-ai/contracts'
import { ARTIFACT_PRESENTATION_OPEN_COMMAND, ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, ASSISTANT_CONTEXT_SET_COMMAND, WORKBENCH_NAVIGATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import { ViewExtensionProvider, type IXpertViewExtensionProvider, type XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import { DashboardService, PLUGIN_NAME } from './dashboard.service'
import { dashboardRemoteEntry } from './remote-entry'
import { DashboardSharingService, shareInput } from './sharing.service'
import { querySchema, queryBindingSchema, saveSchema } from './dashboard.schema'
import { DASHBOARD_MUTATION_TOOLS } from './dashboard-receipt'
import { dashboardNavigationSchema, dashboardNavigationTarget } from './dashboard-navigation'
import { DASHBOARD_PROJECT_TYPE } from './project'
import { dashboardIcon } from './dashboard-icon'
import { publicDashboardManifest } from './dashboard-sources'
import { DashboardArchiveService, importInputSchema, importBrowseSchema } from './archive.service'

export const VIEW_KEY = 'live-dashboard'
export const VIEW_PROVIDER = 'live-dashboard'
export const FEATURE = 'live_dashboard'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

@ViewExtensionProvider(VIEW_PROVIDER)
export class DashboardViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: DashboardService, private readonly sharing: DashboardSharingService, private readonly projects: DashboardProjectsService, private readonly archives: DashboardArchiveService, @Optional() private readonly saves?: DashboardSaveRequests) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench', 'agent.workbench.fixed', 'agent.workbench.main'].includes(slot)) return []
    return [{ key: VIEW_KEY, title: text('Live dashboards', '实时看板'), hostType: context.hostType, slot, order: 35,
      icon: dashboardIcon, refreshable: true, activation: { projectResource: true, requiredFeatures: [FEATURE] },
      source: { provider: VIEW_PROVIDER, plugin: PLUGIN_NAME },
      workbench: { projectType: DASHBOARD_PROJECT_TYPE, fixed: true, openMode: 'on-demand', menu: { enabled: true, label: text('Live dashboards', '实时看板'), icon: dashboardIcon, order: 35 } },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: VIEW_KEY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsSelection: true, supportsParameters: true, supportsPagination: true, defaultPageSize: 50 }, cache: { enabled: false } },
      fileAccess: { purposes: ['download'] },
      clientCommands: [{ key: 'workbench.content.status' }, { key: 'workbench.content.resolve' }, { key: ASSISTANT_CONTEXT_SET_COMMAND, label: text('Select dashboard for Assistant', '设置助理当前看板') },
        { key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, label: text('Create with Assistant', '交给助理制作') },
        { key: ARTIFACT_PRESENTATION_OPEN_COMMAND, label: text('Open shared page', '打开独立页面') },
        { key: WORKBENCH_NAVIGATION_OPEN_COMMAND, label: text('Open dashboard', '打开看板') }],
      hostEvents: { subscriptions: [{ key: 'dashboard-created', event: 'assistant.tool.completed',
        filter: { toolNames: DASHBOARD_MUTATION_TOOLS }, action: { type: 'forward', debounceMs: 0 } }] },
      actions: [
        { key: 'import-preview', label: text('Import dashboard file', '导入看板文件'), actionType: 'invoke', transport: 'file' },
        ...['import-commit', 'import-discard', 'import-browse', 'save-wait', 'save-status'].map(key => ({ key, label: text('Import dashboard', '导入看板'), actionType: 'invoke' as const })),
        ...[
          { key: 'dashboards', label: text('Select dashboard', '选择看板') },
          { key: 'projects', label: text('Select project', '选择项目') },
          { key: 'share-status', label: text('Sharing status', '分享状态') },
          { key: 'share', label: text('Team sharing', '团队分享') },
          { key: 'revoke-share', label: text('Revoke sharing', '撤销分享') }
        ].map(({ key, label }) => ({ key, label, actionType: 'invoke' as const, placement: 'toolbar' as const, inputSchema: { type: 'object' as const, properties: {}, additionalProperties: true } })),
        { key: 'delete', label: text('Delete dashboard', '删除看板'), actionType: 'invoke', placement: 'toolbar', inputSchema: { type: 'object', properties: {}, additionalProperties: true } },
        { key: 'publish', label: text('Publish draft', '发布草稿'), actionType: 'invoke', placement: 'toolbar', inputSchema: { type: 'object', properties: {}, additionalProperties: true } },
        { key: 'save', label: text('Save', '保存'), actionType: 'invoke', placement: 'toolbar', inputSchema: { type: 'object', properties: {}, additionalProperties: true } },
        { key: 'query', label: text('Refresh', '刷新'), actionType: 'invoke', placement: 'toolbar', inputSchema: { type: 'object', properties: {}, additionalProperties: true } },
        { key: 'query-binding', label: text('Query binding', '查询绑定'), actionType: 'invoke', placement: 'toolbar', inputSchema: { type: 'object', properties: {}, additionalProperties: true } }
      ] }]
  }
  getRemoteComponentEntry() { return dashboardRemoteEntry() }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    assertView(viewKey)
    const params = dashboardNavigationSchema.parse(query)
    const access = await this.service.access(context)
    const currentProject = await this.projects.current(context)
    const mode = params.newDashboard ? 'draft' : params.mode ?? (access.canReadDraft ? 'draft' : 'published')
    if (mode === 'draft' && !access.canReadDraft) throw new ForbiddenException('DASHBOARD_DRAFT_ACCESS_DENIED')
    const page = await this.service.listPage(context, params.page, params.pageSize)
    const selectedDashboard = params.artifactId
      ? page.items.find(item => item.artifactId === params.artifactId) ?? await this.service.selectedSummary(context, params.artifactId)
      : undefined
    const versions = params.artifactId ? await this.service.history(context, params.artifactId) : undefined
    const unavailable = params.artifactId && mode === 'published' && !params.versionId && !versions?.some(version => version.current)
    const saved = !unavailable && params.artifactId ? await this.service.openDocument(context, params.artifactId, params.versionId, params.draftRevision, mode) : undefined
    return { meta: { navigationTarget: dashboardNavigationTarget(context), access, mode, currentProject,
      dashboards: page.items, selectedDashboard, pagination: { page: page.page, pageSize: page.pageSize, hasMore: page.hasMore },
      sources: access.canEdit ? await this.service.sources(context) : [],
      ...(unavailable ? { notice: 'not_published' as const } : params.artifactId ? {
        saved: saved && { ...saved, manifest: access.canEdit ? saved.manifest : publicDashboardManifest(saved.manifest) }, versions } : {}) } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, action: string, request: XpertViewActionRequest) {
    assertView(viewKey)
    if (action === 'save-wait' && this.saves) {
      const input = waitSaveRequestSchema.parse(request.input)
      return { success: true, data: await this.saves.wait(context, input.requestId, input.cursor), refresh: false }
    }
    if (action === 'save-status' && this.saves) return { success: true, data: await this.saves.get(context, saveRequestSchema.parse(request.input).requestId), refresh: false }
    if (action === 'import-commit') return { success: true, data: await this.archives.commit(context, importInputSchema.parse(request.input)), refresh: false }
    if (action === 'import-browse') return { success: true, data: await this.archives.browse(context, importBrowseSchema.parse(request.input)), refresh: false }
    if (action === 'import-discard') return { success: true, data: await this.archives.discard(context, z.object({ importId: z.string().uuid() }).strict().parse(request.input).importId), refresh: false }
    if (action === 'dashboards') {
      const parsed = dashboardSearchSchema.safeParse(request.input)
      if (!parsed.success) throw new BadRequestException('DASHBOARD_INVALID_PICKER_QUERY')
      const target = parsed.data.projectId ? await this.projects.pickerContext(context, parsed.data.projectId) : context
      const page = await this.service.searchPage(target, parsed.data)
      const access = await this.service.access(target)
      return { success: true, data: { ...page, canEdit: access.canEdit, mode: access.canReadDraft ? 'draft' : 'published' }, refresh: false }
    }
    if (action === 'projects') return { success: true, data: await this.projects.list(context, projectSearchSchema.parse(request.input)), refresh: false }
    if (action === 'share') return { success: true, data: await this.sharing.share(context, shareInput.parse(request.input)), refresh: false }
    if (action === 'share-status' || action === 'revoke-share') {
      const input = z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid().optional() }).strict().parse(request.input)
      return { success: true, data: action === 'share-status' ? await this.sharing.inspect(context, input.artifactId, input.versionId) : await this.sharing.revoke(context, input.artifactId), refresh: false }
    }
    if (action === 'delete') {
      const parsed = z.object({ artifactId: z.string().uuid(), expectedRevision: z.number().int().positive(), confirmed: z.literal(true), projectId: z.string().uuid().optional() }).strict().safeParse(request.input)
      if (!parsed.success) throw new BadRequestException('DASHBOARD_DELETION_CONFIRMATION_REQUIRED')
      const input = parsed.data
      const target = input.projectId ? await this.projects.pickerContext(context, input.projectId) : context
      return { success: true, data: await this.service.trash(target, input.artifactId, input.expectedRevision), refresh: false }
    }
    if (action === 'publish') {
      const parsed = z.object({ artifactId: z.string().uuid(), expectedRevision: z.number().int().positive(),
        expectedCurrentVersionId: z.string().uuid().nullable(), confirmed: z.literal(true) }).strict().safeParse(request.input)
      if (!parsed.success) throw new BadRequestException('DASHBOARD_PUBLICATION_CONFIRMATION_REQUIRED')
      const input = parsed.data
      return { success: true, data: await this.service.publish(context, input.artifactId, input.expectedRevision, input.expectedCurrentVersionId), refresh: false }
    }
    if (action === 'save') {
      const input = saveSchema.parse(request.input)
      const data = this.saves && input.manifest.bindings.length > 8
        ? await this.saves.submit(context, input.manifest, input.expectedVersionId, input.expectedRevision, createHash('sha256').update(JSON.stringify(input)).digest('hex'))
        : await this.service.save(context, input.manifest, input.expectedVersionId, input.expectedRevision)
      return { success: true, data, refresh: false }
    }
    if (action === 'query') {
      const input = querySchema.parse(request.input)
      const result = await this.service.query(context, input.artifactId, input.versionId, input.controls, input.draftRevision)
      return { success: true, data: { datasets: result.datasets, failures: result.failures, ...('payload' in result ? { payload: result.payload } : {}) }, refresh: false }
    }
    if (action === 'query-binding') {
      const parsed = queryBindingSchema.safeParse(request.input)
      if (!parsed.success) throw new BadRequestException('DASHBOARD_INVALID_QUERY')
      const input = parsed.data
      return { success: true, data: await this.service.queryBinding(context, input.artifactId, input.versionId, input.bindingId, input.controls, input.draftRevision), refresh: false }
    }
    throw new BadRequestException('DASHBOARD_ACTION_UNSUPPORTED')
  }
  async executeViewFileAction(context: XpertResolvedViewHostContext, viewKey: string, action: string, _request: XpertViewActionRequest, file: XpertViewFileActionFile) {
    assertView(viewKey)
    if (action !== 'import-preview') throw new BadRequestException('DASHBOARD_ACTION_UNSUPPORTED')
    return { success: true, data: await this.archives.prepare(context, file.buffer), refresh: false }
  }
  async resolveViewFile(context: XpertResolvedViewHostContext, viewKey: string, request: XpertViewFileAccessRequest) {
    assertView(viewKey)
    if (request.purpose !== 'download') throw new ForbiddenException('DASHBOARD_ACTION_UNSUPPORTED')
    return this.archives.exportFile(context, request.fileKey)
  }
}
function assertView(key: string) { if (key !== VIEW_KEY) throw new BadRequestException('DASHBOARD_VIEW_UNSUPPORTED') }
