import { BadRequestException } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewQuery } from '@xpert-ai/contracts'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { DashboardService, PLUGIN_NAME } from './dashboard.service'
import { querySchema, queryBindingSchema, saveSchema } from './dashboard.schema'

export const VIEW_KEY = 'live-dashboard'
export const VIEW_PROVIDER = 'live-dashboard'
export const FEATURE = 'live_dashboard'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

@ViewExtensionProvider(VIEW_PROVIDER)
export class DashboardViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: DashboardService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' || context.hostType === 'project' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!(context.hostType === 'agent' && slot === 'agent.workbench' || context.hostType === 'project' && slot === 'detail.sections')) return []
    return [{ key: VIEW_KEY, title: text('Live dashboards', '实时看板'), hostType: context.hostType, slot, order: 35,
      icon: { type: 'font', value: 'ri-bar-chart-box-line' }, refreshable: true, activation: { requiredFeatures: [FEATURE] },
      source: { provider: VIEW_PROVIDER, plugin: PLUGIN_NAME },
      workbench: { fixed: true, menu: { enabled: true, label: text('Live dashboards', '实时看板'), order: 35 } },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: VIEW_KEY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      hostEvents: { subscriptions: [{ key: 'dashboard-created', event: 'assistant.tool.completed',
        filter: { toolNames: ['dashboard_create', 'dashboard_create_html'] }, action: { type: 'forward', debounceMs: 0 } }] },
      actions: [
        { key: 'save', label: text('Save', '保存'), actionType: 'invoke', placement: 'toolbar', inputSchema: { type: 'object', properties: {}, additionalProperties: true } },
        { key: 'query', label: text('Refresh', '刷新'), actionType: 'invoke', placement: 'toolbar', inputSchema: { type: 'object', properties: {}, additionalProperties: true } },
        { key: 'query-binding', label: text('Query binding', '查询绑定'), actionType: 'invoke', placement: 'toolbar', inputSchema: { type: 'object', properties: {}, additionalProperties: true } }
      ] }]
  }
  async getRemoteComponentEntry() {
    const [appScript, appCss, renderer] = await Promise.all([readFile(join(__dirname, '../remote/app.js'), 'utf8'), readFile(join(__dirname, '../remote/app.css'), 'utf8'), readFile(join(__dirname, '../remote/renderer.html'), 'utf8')])
    return { html: renderRemoteReactIframeHtml({ title: 'Live dashboards', reactUmd: '', reactDomUmd: '',
      appScript: `window.__ANALYTICS_RENDERER_HTML__=${JSON.stringify(renderer).replace(/</g, '\\u003c')};\n${appScript}`, appCss }),
      contentType: 'text/html; charset=utf-8' as const }
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    assertView(viewKey)
    const params = z.object({ artifactId: z.string().uuid().optional(), versionId: z.string().uuid().optional() }).strict()
      .refine(value => !value.versionId || !!value.artifactId, 'A version requires an Artifact').parse(query.parameters ?? {})
    return { meta: { dashboards: await this.service.list(context), sources: await this.service.sources(context),
      ...(params.artifactId ? { saved: await this.service.openDocument(context, params.artifactId, params.versionId) } : {}) } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, action: string, request: XpertViewActionRequest) {
    assertView(viewKey)
    if (action === 'save') {
      const input = saveSchema.parse(request.input)
      return { success: true, data: await this.service.save(context, input.manifest, input.expectedVersionId), refresh: false }
    }
    if (action === 'query') {
      const input = querySchema.parse(request.input)
      return { success: true, data: await this.service.query(context, input.artifactId, input.versionId, input.controls), refresh: false }
    }
    if (action === 'query-binding') {
      const parsed = queryBindingSchema.safeParse(request.input)
      if (!parsed.success) throw new BadRequestException('DASHBOARD_INVALID_QUERY')
      const input = parsed.data
      return { success: true, data: await this.service.queryBinding(context, input.artifactId, input.versionId, input.bindingId, input.controls), refresh: false }
    }
    throw new BadRequestException('DASHBOARD_ACTION_UNSUPPORTED')
  }
}
function assertView(key: string) { if (key !== VIEW_KEY) throw new BadRequestException('DASHBOARD_VIEW_UNSUPPORTED') }
