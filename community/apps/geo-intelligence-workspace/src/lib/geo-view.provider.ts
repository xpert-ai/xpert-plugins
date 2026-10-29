import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type {
  I18nObject, XpertExtensionViewManifest, XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema, XpertResolvedViewHostContext,
  XpertViewActionRequest, XpertViewActionResult, XpertViewDataResult, XpertViewQuery
} from '@xpert-ai/contracts'
import { ViewExtensionProvider, type IXpertViewExtensionProvider, renderRemoteReactIframeHtml } from '@xpert-ai/plugin-sdk'
import { GEO_FEATURE, GEO_ICON, GEO_PLUGIN_NAME, GEO_PROVIDER, GEO_REMOTE_ENTRY, GEO_VIEW_KEY } from './constants'
import { GeoEngineClient, GeoRequestError } from './geo.service'

const localRequire = createRequire(__filename)
const label = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(GEO_PROVIDER)
export class GeoViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly engine: GeoEngineClient) {}

  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== 'agent.workbench.main' && slot !== 'agent.workbench.fixed') return []
    const fixed = slot === 'agent.workbench.fixed'
    return [{
      key: GEO_VIEW_KEY,
      title: label('GEO Intelligence Workspace', 'GEO 智能工作台'),
      description: label('Monitor prompts and review results.', '监测问题并审核结果。'),
      icon: { type: 'svg', value: GEO_ICON, color: '#2563eb' },
      hostType: 'agent', slot, order: 30, refreshable: true,
      ...(fixed ? { activation: { requiredFeatures: [GEO_FEATURE] }, workbench: { fixed: true, menu: { enabled: true, label: label('GEO Workbench', 'GEO 工作台'), order: 30, icon: { type: 'svg' as const, value: GEO_ICON, color: '#2563eb' } } } } : {}),
      source: { provider: GEO_PROVIDER, plugin: GEO_PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: GEO_REMOTE_ENTRY }, dataSource: { mode: 'platform' } } as XpertRemoteComponentViewSchema,
      dataSource: { mode: 'platform', querySchema: { supportsPagination: false, supportsSearch: false, supportsSort: false, supportsFilter: false, supportsParameters: false }, cache: { enabled: false } },
      actions: [
        { key: 'save_prompt', label: label('Save prompt', '保存问题'), actionType: 'invoke' },
        { key: 'refresh', label: label('Refresh', '刷新'), actionType: 'refresh' },
        { key: 'monitor', label: label('Run monitor', '执行监测'), actionType: 'invoke' },
        { key: 'retry', label: label('Retry monitor', '重新监测'), actionType: 'invoke' },
        { key: 'save_content', label: label('Save draft', '保存草稿'), actionType: 'invoke' },
        { key: 'approve_content', label: label('Approve draft', '审核通过'), actionType: 'invoke' },
        { key: 'list_content', label: label('List drafts', '查看草稿'), actionType: 'invoke' }
      ]
    }]
  }

  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== GEO_VIEW_KEY || component.entry !== GEO_REMOTE_ENTRY) return { html: '<!doctype html><title>Unsupported GEO view</title>', contentType: 'text/html; charset=utf-8' }
    const sourceScript = await readFile(join(__dirname, 'remote-components', GEO_REMOTE_ENTRY, 'app.js'), 'utf8')
    const origins = (process.env['GEO_PARENT_ORIGINS'] || 'http://localhost:8088').split(',').map(value => new URL(value.trim()).origin)
    const appScript = `window.__GEO_PARENT_ORIGINS=${JSON.stringify(origins).replace(/</g, '\\u003c')};\n${sourceScript}`
    const reactUmd = await this.readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await this.readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return { html: renderRemoteReactIframeHtml({ title: 'GEO Intelligence Workspace', lang: 'zh-Hans', reactUmd, reactDomUmd, appScript }), contentType: 'text/html; charset=utf-8' }
  }

  async getViewData(_context: XpertResolvedViewHostContext, viewKey: string, _query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== GEO_VIEW_KEY) return {}
    this.engine.assertScope(_context)
    const runs = await this.engine.listRuns()
    return { items: runs, total: runs.length, meta: { prompts: await this.engine.listPrompts() } }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    if (viewKey !== GEO_VIEW_KEY) return { success: false, message: label('Unsupported view', '不支持的视图') }
    if (actionKey === 'refresh') return { success: true, refresh: true }
    const input = request.input ?? {}
    try {
      this.engine.assertScope(context)
      if (actionKey === 'save_prompt') {
        if (!context.userId) throw new Error('User identity required')
        return { success: true, data: await this.engine.savePrompt({ query: input.query, brand: input.brand, actor: context.userId }) }
      }
      if (actionKey === 'monitor') {
        const query = typeof input.query === 'string' ? input.query.trim() : ''
        const brand = typeof input.brand === 'string' ? input.brand.trim() : ''
        if (!query || !brand) return { success: false, message: label('Query and brand are required', '请输入问题与品牌') }
        const run = await this.engine.monitor({ query, brand: { name: brand }, run_id: typeof input.runId === 'string' ? input.runId : undefined })
        return { success: true, data: run, refresh: true }
      }
      const runId = typeof input.runId === 'string' ? input.runId : ''
      if (actionKey === 'retry' && runId) {
        const previous = await this.engine.getRun(runId)
        const run = await this.engine.monitor({ query: previous.query, brand: { name: previous.brand, aliases: previous.aliases, competitors: previous.competitors }, retry_of: runId, run_id: typeof input.requestId === 'string' ? input.requestId : undefined })
        return { success: true, data: run, refresh: true }
      }
      if (actionKey === 'list_content' && runId) return { success: true, data: await this.engine.listContent(runId) }
      const actor = context.userId
      if (!actor) return { success: false, message: label('User identity required', '需要用户身份') }
      if (actionKey === 'save_content' && runId) {
        const text = typeof input.text === 'string' ? input.text.trim() : ''
        const evidenceIds = Array.isArray(input.evidenceIds) ? input.evidenceIds.filter((x): x is string => typeof x === 'string') : []
        if (!text || evidenceIds.length === 0) return { success: false, message: label('Draft and approved evidence required', '需要草稿和已审核证据') }
        return { success: true, data: await this.engine.saveContent({ run_id: runId, text, actor, evidence_ids: evidenceIds, previous_version_id: typeof input.previousVersionId === 'string' ? input.previousVersionId : undefined }), refresh: true }
      }
      if (actionKey === 'approve_content' && typeof input.contentId === 'string') {
        return { success: true, data: await this.engine.approveContent(input.contentId, actor), refresh: true }
      }
      return { success: false, message: label('Unsupported action', '不支持的操作') }
    } catch (error) {
      if (error instanceof GeoRequestError) {
        const messages: Record<string, I18nObject> = {
          'Author and reviewer must be different people': label('Ask another reviewer to approve this draft.', '请由另一位审核人审批，作者不能自审。'),
          'Evidence changed; save a new draft for review': label('Evidence changed. Save a new draft.', '依据版本已变化，请核对后保存新草稿。'),
          'Run is processing; refresh instead of submitting again': label('Still processing. Refresh later.', '任务仍在处理，请稍后刷新，避免重复提交。'),
          'Run id already belongs to a different request': label('Request identifier conflict. Refresh the page.', '请求编号冲突，请刷新页面。')
        }
        return { success: false, message: messages[error.detail] || label(`Request rejected (${error.status}). Check input and service configuration.`, `请求未通过（${error.status}），请检查输入及服务配置。`) }
      }
      return { success: false, message: label('GEO action failed', 'GEO 操作失败，请检查服务与审核权限') }
    }
  }

  private async readPackageFile(packageName: string, relativePath: string) {
    const root = dirname(localRequire.resolve(`${packageName}/package.json`))
    return readFile(join(root, relativePath), 'utf8')
  }
}
