import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ViewExtensionProvider, type IXpertViewExtensionProvider, type XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import { analyticsDiscoveryRequestSchema, analyticsQueryRequestSchema } from '@xpert-ai/plugin-sdk/analytics'
import { WORKBENCH_NAVIGATION_OPEN_COMMAND, type XpertExtensionViewManifest, type XpertResolvedViewHostContext, type XpertViewActionRequest, type XpertViewQuery, type XpertViewFileAccessRequest } from '@xpert-ai/contracts'
import { DashboardService, PLUGIN_NAME } from './dashboard.service'
import { DashboardDatasetService } from './dataset.service'
import { DashboardTemplateService } from './template.service'
import { libraryPages, libraryQuerySchema, datasetSaveSchema, datasetTargetSchema, datasetDeleteSchema, templateCreateSchema, type LibraryPage } from './library.schema'
import { dashboardRemoteEntry } from './remote-entry'
import { dashboardIcon } from './dashboard-icon'
import { FEATURE } from './view.provider'
import { z } from 'zod/v3'
import { LibraryCatalogService } from './library/catalog.service'
import { LibraryTransfersService } from './library/transfers.service'
import { assetSchema } from './library/resource-contract'
import { executeResourceAction, resourceActions, resourceFileActions } from './library/actions'
import { LibraryTemplateExecutionService } from './library/template-execution.service'
import { LibraryTaskPreparationService } from './library/task-preparation.service'
import { instantiateSchema, prepareTaskSchema, executionTargetSchema } from './library/execution-contract'

import { LibraryDirectoryService } from './library/directory.service'
import { directoryQuerySchema } from './library/directory-contract'

export const LIBRARY_PROVIDER = 'live-dashboard-library'
const titles = { explore: { en_US: 'Explore examples', zh_Hans: '探索示例', zh_Hant: '探索範例' }, templates: { en_US: 'Template library', zh_Hans: '模板库', zh_Hant: '範本庫' }, data: { en_US: 'Add data', zh_Hans: '添加数据', zh_Hant: '新增資料' } }
const actions = ['resource-directory', 'discover', 'preview-query', 'dataset-open', 'dataset-save', 'dataset-preview', 'dataset-delete', 'template-create', 'dashboard-bindings']
function assertPage(key: string): asserts key is LibraryPage { if (!libraryPages.some(page => page === key)) throw new BadRequestException('DASHBOARD_VIEW_UNSUPPORTED') }

/**
 * @beta Data-view manifests and action contracts may change incompatibly during
 * beta; consumers must not assume stable view keys, actions or payload formats.
 */
@ViewExtensionProvider(LIBRARY_PROVIDER)
export class DashboardLibraryViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly dashboards: DashboardService, private readonly library: DashboardDatasetService, private readonly templates: DashboardTemplateService,
    private readonly resources: LibraryCatalogService, private readonly transfers: LibraryTransfersService,
    private readonly execution: LibraryTemplateExecutionService, private readonly tasks: LibraryTaskPreparationService, private readonly directory: LibraryDirectoryService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench','agent.workbench.fixed','agent.workbench.main'].includes(slot)) return []
    return libraryPages.map((key, index) => ({ key, title: titles[key], hostType: 'agent', slot, order: 36 + index, icon: dashboardIcon,
      activation: { projectResource: true, requiredFeatures: [FEATURE] }, source: { provider: LIBRARY_PROVIDER, plugin: PLUGIN_NAME }, refreshable: true,
      workbench: { fixed: true, openMode: 'on-demand', menu: { enabled: true, label: titles[key], icon: dashboardIcon, order: 36 + index } },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: key }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsSelection: true, supportsParameters: true, supportsPagination: true, defaultPageSize: 30 }, cache: { enabled: false } },
      clientCommands: [{ key: WORKBENCH_NAVIGATION_OPEN_COMMAND }, { key: 'assistant.composer.insert' }],
      fileAccess: { purposes: ['download'] },
      actions: [...actions, ...resourceActions].map(key => ({ key, label: { en_US: key, zh_Hans: key }, actionType: 'invoke',
        ...(resourceFileActions.includes(key) ? { transport: 'file' as const } : {}) })) }))
  }
  getRemoteComponentEntry(_context: XpertResolvedViewHostContext, entry: string) { assertPage(entry); return dashboardRemoteEntry(false, entry) }
  async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    assertPage(key)
    const params = libraryQuerySchema.parse(query), access = await this.dashboards.access(context)
    if (key !== 'data') {
      const datasets = access.canEdit && key === 'templates' ? await this.library.list(context, params.page, params.pageSize) : { items: [], hasMore: false }
      return { meta: { canEdit: access.canEdit, sources: [], datasets: datasets.items, page: params.page, hasMore: datasets.hasMore } }
    }
    if (!access.canEdit) return { meta: { canEdit: false, sources: [], datasets: [], page: params.page, hasMore: false } }
    const [sources, datasets] = await Promise.all([this.dashboards.sources(context), this.library.list(context, params.page, params.pageSize, params.parameters?.search)])
    return { meta: { canEdit: true, sources, datasets: datasets.items, page: datasets.page, hasMore: datasets.hasMore } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest) {
    assertPage(key)
    if (action === 'resource-directory') return { success: true, data: await this.directory.list(context, directoryQuerySchema.parse(request.input)), refresh: false }
    if (action === 'resource-open') {
      const input = z.object({ releaseId: z.string().uuid() }).strict().parse(request.input)
      const detail = await this.resources.read(context, input.releaseId)
      return { success: true, data: { ...detail, execution: await this.execution.availability(context, input.releaseId) }, refresh: false }
    }
    if (action === 'resource-prepare-task') {
      const input = prepareTaskSchema.parse(request.input)
      return { success: true, data: await this.tasks.prepare(context, input.releaseId, input.requestId), refresh: false }
    }
    if (action === 'resource-prepare-template') return { success: true,
      data: await this.tasks.prepareTemplate(context, instantiateSchema.parse(request.input)), refresh: false }
    // Only the Agent may create instances, preserving middleware provider restrictions.
    if (action === 'resource-execution-status') return { success: true,
      data: await this.execution.status(context, executionTargetSchema.parse(request.input).executionId), refresh: false }
    if (resourceActions.includes(action)) return { success: true,
      data: await executeResourceAction(this.resources, this.transfers, context, action, request.input), refresh: false }
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
  async executeViewFileAction(context: XpertResolvedViewHostContext, key: string, action: string,
    request: XpertViewActionRequest, file: XpertViewFileActionFile) {
    assertPage(key)
    if (action === 'resource-import') {
      const input = z.object({ mode: z.enum(['reuse', 'copy']), requestId: z.string().uuid() }).strict().parse(request.input)
      return { success: true, data: await this.transfers.prepare(context, file.buffer, input.mode, input.requestId), refresh: false }
    }
    if (action === 'resource-upload-asset') return { success: true,
      data: await this.resources.upload(context, assetSchema.parse(request.input), file.buffer), refresh: false }
    throw new BadRequestException('DASHBOARD_ACTION_UNSUPPORTED')
  }
  async resolveViewFile(context: XpertResolvedViewHostContext, key: string, request: XpertViewFileAccessRequest) {
    assertPage(key)
    if (request.purpose !== 'download' || !request.fileKey.startsWith('library-v2/')) throw new ForbiddenException('LIBRARY_RESOURCE_DENIED')
    return this.transfers.exportFile(context, z.string().uuid().parse(request.fileKey.slice('library-v2/'.length)))
  }
}
