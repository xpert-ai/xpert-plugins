import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { analyticsDiscoveryRequestSchema, analyticsQueryRequestSchema } from '@xpert-ai/plugin-sdk/analytics'
import type { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewQuery } from '@xpert-ai/contracts'
import { DashboardService, PLUGIN_NAME } from './dashboard.service'
import { DashboardDatasetService } from './dataset.service'
import { DashboardTemplateService } from './template.service'
import { libraryPages, libraryQuerySchema, datasetSaveSchema, datasetTargetSchema, datasetDeleteSchema, templateCreateSchema, type LibraryPage } from './library.schema'
import { dashboardRemoteEntry } from './remote-entry'
import { dashboardIcon } from './dashboard-icon'
import { FEATURE } from './view.provider'
import { z } from 'zod/v3'

export const LIBRARY_PROVIDER = 'live-dashboard-library'
const titles = { data: { en_US: 'Add data', zh_Hans: '添加数据', zh_Hant: '新增資料' } }
const actions = ['discover', 'preview-query', 'dataset-open', 'dataset-save', 'dataset-preview', 'dataset-delete', 'template-create', 'dashboard-bindings']
function assertPage(key: string): asserts key is LibraryPage { if (!libraryPages.some(page => page === key)) throw new BadRequestException('DASHBOARD_VIEW_UNSUPPORTED') }

/**
 * @beta Data-view manifests and action contracts may change incompatibly during
 * beta; consumers must not assume stable view keys, actions or payload formats.
 */
@ViewExtensionProvider(LIBRARY_PROVIDER)
export class DashboardLibraryViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly dashboards: DashboardService, private readonly library: DashboardDatasetService, private readonly templates: DashboardTemplateService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench','agent.workbench.fixed','agent.workbench.main'].includes(slot)) return []
    return libraryPages.map((key, index) => ({ key, title: titles[key], hostType: 'agent', slot, order: 36 + index, icon: dashboardIcon,
      activation: { projectResource: true, requiredFeatures: [FEATURE] }, source: { provider: LIBRARY_PROVIDER, plugin: PLUGIN_NAME }, refreshable: true,
      workbench: { fixed: true, openMode: 'on-demand', menu: { enabled: true, label: titles[key], icon: dashboardIcon, order: 36 + index } },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: key }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsSelection: true, supportsParameters: true, supportsPagination: true, defaultPageSize: 30 }, cache: { enabled: false } },
      actions: actions.map(key => ({ key, label: { en_US: key, zh_Hans: key }, actionType: 'invoke' })) }))
  }
  getRemoteComponentEntry(_context: XpertResolvedViewHostContext, entry: string) { assertPage(entry); return dashboardRemoteEntry(false, entry) }
  async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    assertPage(key)
    const params = libraryQuerySchema.parse(query), access = await this.dashboards.access(context)
    if (!access.canEdit) return { meta: { canEdit: false, sources: [], datasets: [], page: params.page, hasMore: false } }
    const [sources, datasets] = await Promise.all([this.dashboards.sources(context), this.library.list(context, params.page, params.pageSize, params.parameters?.search)])
    return { meta: { canEdit: true, sources, datasets: datasets.items, page: datasets.page, hasMore: datasets.hasMore } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest) {
    assertPage(key)
    if (!(await this.dashboards.access(context)).canEdit) throw new ForbiddenException('DASHBOARD_DEFINITION_ACCESS_DENIED')
    let data: unknown
    switch (action) {
      case 'discover': data = await this.dashboards.discover(context, analyticsDiscoveryRequestSchema.parse(request.input)); break
      case 'preview-query': data = await this.dashboards.preview(context, analyticsQueryRequestSchema.parse(request.input)); break
      case 'dataset-open': data = await this.library.open(context, datasetTargetSchema.parse(request.input).artifactId); break
      case 'dataset-save': data = await this.library.save(context, datasetSaveSchema.parse(request.input)); break
      case 'dataset-preview': data = await this.library.preview(context, datasetTargetSchema.parse(request.input).artifactId); break
      case 'dataset-delete': { const input = datasetDeleteSchema.parse(request.input); data = await this.library.remove(context, input.artifactId, input.expectedRevision); break }
      case 'template-create': data = await this.templates.create(context, templateCreateSchema.parse(request.input)); break
      case 'dashboard-bindings': {
        const input = z.union([datasetTargetSchema, z.object({}).strict()]).parse(request.input)
        data = 'artifactId' in input ? (await this.dashboards.open(context, input.artifactId)).manifest : await this.dashboards.listPage(context, 1, 100)
        break
      }
      default: throw new BadRequestException('DASHBOARD_ACTION_UNSUPPORTED')
    }
    return { success: true, data, refresh: false }
  }
}
