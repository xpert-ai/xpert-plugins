import { BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewQuery } from '@xpert-ai/contracts'
import { ARTIFACT_PRESENTATION_OPEN_COMMAND, ASSISTANT_CONTEXT_SET_COMMAND, WORKBENCH_NAVIGATION_OPEN_COMMAND } from '@xpert-ai/contracts'
import { ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { DashboardService, PLUGIN_NAME } from './dashboard.service'
import { dashboardRemoteEntry } from './remote-entry'
import { DashboardSharingService, shareInput } from './sharing.service'
import { querySchema, queryBindingSchema, saveSchema } from './dashboard.schema'
import { DASHBOARD_MUTATION_TOOLS } from './dashboard-receipt'
import { dashboardNavigationSchema, dashboardNavigationTarget } from './dashboard-navigation'
import { dashboardIcon } from './dashboard-icon'

export const VIEW_KEY = 'live-dashboard'
export const VIEW_PROVIDER = 'live-dashboard'
export const FEATURE = 'live_dashboard'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

@ViewExtensionProvider(VIEW_PROVIDER)
export class DashboardViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: DashboardService, private readonly sharing: DashboardSharingService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' || context.hostType === 'project' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!(context.hostType === 'agent' && ['agent.workbench', 'agent.workbench.fixed', 'agent.workbench.main'].includes(slot) || context.hostType === 'project' && slot === 'detail.sections')) return []
    return [{ key: VIEW_KEY, title: text('Live dashboards', '实时看板'), hostType: context.hostType, slot, order: 35,
      icon: dashboardIcon, refreshable: true, activation: { projectResource: true, requiredFeatures: [FEATURE] },
      source: { provider: VIEW_PROVIDER, plugin: PLUGIN_NAME },
      workbench: { fixed: true, openMode: 'on-demand', menu: { enabled: true, label: text('Live dashboards', '实时看板'), icon: dashboardIcon, order: 35 } },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: VIEW_KEY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsSelection: true, supportsParameters: true }, cache: { enabled: false } },
      clientCommands: [{ key: 'workbench.content.status' }, { key: 'workbench.content.resolve' }, { key: ASSISTANT_CONTEXT_SET_COMMAND, label: text('Select dashboard for Assistant', '设置助理当前看板') },
        { key: ARTIFACT_PRESENTATION_OPEN_COMMAND, label: text('Open shared page', '打开独立页面') },
        { key: WORKBENCH_NAVIGATION_OPEN_COMMAND, label: text('Open dashboard', '打开看板') }],
      hostEvents: { subscriptions: [{ key: 'dashboard-created', event: 'assistant.tool.completed',
        filter: { toolNames: DASHBOARD_MUTATION_TOOLS }, action: { type: 'forward', debounceMs: 0 } }] },
      actions: [
        ...['share-status', 'share', 'revoke-share'].map(key => ({ key, label: text('Team sharing', '团队分享'), actionType: 'invoke' as const, placement: 'toolbar' as const, inputSchema: { type: 'object' as const, properties: {}, additionalProperties: true } })),
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
    return { meta: { navigationTarget: dashboardNavigationTarget(context), dashboards: await this.service.list(context), sources: await this.service.sources(context),
      ...(params.artifactId ? { saved: await this.service.openDocument(context, params.artifactId, params.versionId),
        versions: await this.service.history(context, params.artifactId) } : {}) } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, action: string, request: XpertViewActionRequest) {
    assertView(viewKey)
    if (action === 'share') return { success: true, data: await this.sharing.share(context, shareInput.parse(request.input)), refresh: false }
    if (action === 'share-status' || action === 'revoke-share') {
      const input = z.object({ artifactId: z.string().uuid(), versionId: z.string().uuid().optional() }).strict().parse(request.input)
      return { success: true, data: action === 'share-status' ? await this.sharing.inspect(context, input.artifactId, input.versionId) : await this.sharing.revoke(context, input.artifactId), refresh: false }
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
      return { success: true, data: await this.service.save(context, input.manifest, input.expectedVersionId, input.expectedRevision), refresh: false }
    }
    if (action === 'query') {
      const input = querySchema.parse(request.input)
      return { success: true, data: await this.service.query(context, input.artifactId, input.versionId, input.controls, input.draftRevision), refresh: false }
    }
    if (action === 'query-binding') {
      const parsed = queryBindingSchema.safeParse(request.input)
      if (!parsed.success) throw new BadRequestException('DASHBOARD_INVALID_QUERY')
      const input = parsed.data
      return { success: true, data: await this.service.queryBinding(context, input.artifactId, input.versionId, input.bindingId, input.controls, input.draftRevision), refresh: false }
    }
    throw new BadRequestException('DASHBOARD_ACTION_UNSUPPORTED')
  }
}
function assertView(key: string) { if (key !== VIEW_KEY) throw new BadRequestException('DASHBOARD_VIEW_UNSUPPORTED') }
