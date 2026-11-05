import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { I18nObject, JsonSchemaObjectType, XpertExtensionViewManifest, XpertRemoteComponentEntry, XpertRemoteComponentViewSchema, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult, XpertViewDataResult, XpertViewQuery, type IconDefinition } from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { AGENT_WORKBENCH_FIXED_SLOT, AGENT_WORKBENCH_MAIN_SLOT, RELNOTE_FEATURE, RELNOTE_PLUGIN_NAME, RELNOTE_PROVIDER_KEY, RELNOTE_REMOTE_ENTRY_KEY, RELNOTE_TOOL_NAMES, RELNOTE_VIEW_KEY } from './constants.js'
import { RelnoteService, type ConfirmRelnoteReleaseInput, type CreateRelnoteDraftInput, type SaveRelnoteDraftInput } from './relnote.service.js'
import type { RelnoteScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = { type: 'font', value: 'ri-file-list-3-line' } satisfies IconDefinition
const createDraftSchema = { type: 'object', properties: { deviceModel: { type: 'string', title: text('Device model', '目标机型') }, version: { type: 'string', title: text('Version', '版本号') }, changesRaw: { type: 'string', title: text('Change items', '变更条目') } }, required: ['deviceModel', 'version', 'changesRaw'] } satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(RELNOTE_PROVIDER_KEY)
export class RelnoteViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: RelnoteService) {}

  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) return []
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [{
      key: RELNOTE_VIEW_KEY,
      title: text('OTA release review', 'OTA 发布说明审核台'),
      description: text('Human-reviewed OTA release notes with auditable AI runs.', '人工审核 OTA 发布说明、风险清单和 AI 运行记录。'),
      icon: VIEW_ICON, hostType: 'agent', slot, order: fixed ? 31 : 21, refreshable: true,
      activation: { requiredFeatures: [RELNOTE_FEATURE] },
      ...(fixed ? { workbench: { fixed: true, menu: { enabled: true, label: text('OTA release review', 'OTA 发布说明审核台'), order: 31, icon: VIEW_ICON } } } : {}),
      source: { provider: RELNOTE_PROVIDER_KEY, plugin: RELNOTE_PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: RELNOTE_REMOTE_ENTRY_KEY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsPagination: false, supportsSearch: false, supportsSelection: true, supportsParameters: false, defaultPageSize: 50 }, cache: { enabled: false } },
      hostEvents: { subscriptions: [{ key: 'relnote-tool-completed', event: 'assistant.tool.completed', filter: { sources: ['chatkit'], toolNames: [...RELNOTE_TOOL_NAMES] }, action: { type: 'forward', debounceMs: 800 } }] },
      actions: [
        { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
        { key: 'create_draft', label: text('New release', '新建发布单'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke', inputSchema: createDraftSchema },
        { key: 'save_draft', label: text('Save draft', '保存草稿'), icon: 'ri-save-line', placement: 'row', actionType: 'invoke' },
        { key: 'request_ai', label: text('Generate release note', '生成发布说明'), icon: 'ri-sparkling-line', placement: 'row', actionType: 'invoke' },
        { key: 'retry_ai', label: text('Retry AI', '重试'), icon: 'ri-refresh-line', placement: 'row', actionType: 'invoke' },
        { key: 'confirm_release', label: text('Confirm archive', '确认归档'), icon: 'ri-check-line', placement: 'row', actionType: 'invoke' }
      ],
      clientCommands: [{ key: 'assistant.chat.send_message', label: text('Send to Assistant Chat', '发送到 Assistant 对话') }]
    }]
  }

  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== RELNOTE_VIEW_KEY || component.entry !== RELNOTE_REMOTE_ENTRY_KEY) return { html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>', contentType: 'text/html; charset=utf-8' }
    const appScript = await readFile(join(__dirname, 'remote-components', RELNOTE_REMOTE_ENTRY_KEY, 'app.js'), 'utf8')
    return { html: renderRemoteReactIframeHtml({ title: 'OTA 发布说明审核台', lang: 'zh-Hans', reactUmd: await readPackageFile('react', 'umd/react.production.min.js'), reactDomUmd: await readPackageFile('react-dom', 'umd/react-dom.production.min.js'), appScript }), contentType: 'text/html; charset=utf-8' }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, _query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== RELNOTE_VIEW_KEY) return {}
    const data = await this.service.getWorkbenchData(scopeFromContext(context))
    return { ...data, summary: { releases: data.total }, meta: { phase: 'persistence-ready' } }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    if (viewKey !== RELNOTE_VIEW_KEY) return failure('Unsupported view', '不支持的视图')
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') return success('Release-note view refreshed', '发布说明审核台已刷新')
      if (actionKey === 'create_draft') {
        const data = await this.service.createDraft(scope, asCreateInput(request.input))
        return { ...success('Release draft created', '发布草稿已创建'), data }
      }
      if (actionKey === 'save_draft') {
        const data = await this.service.saveDraft(scope, { ...asCreateInput(request.input), releaseId: requireTargetId(request), expectedRevision: requireRevision(request.input) } as SaveRelnoteDraftInput)
        return { ...success('Release draft saved', '发布草稿已保存'), data }
      }
      if (actionKey === 'request_ai') {
        const data = await this.service.requestAi(scope, requireTargetId(request))
        return { ...success('AI release-note generation started', '已请求助手生成发布说明'), data }
      }
      if (actionKey === 'retry_ai') {
        const data = await this.service.retryAi(scope, requireTargetId(request))
        return { ...success('AI generation retry started', '已开始重试 AI 生成'), data }
      }
      if (actionKey === 'confirm_release') {
        const input = request.input ?? {}
        const data = await this.service.confirmRelease(scope, {
          releaseId: requireTargetId(request), expectedRevision: requireRevision(input),
          noteMarkdown: stringInput(input, 'noteMarkdown'), risks: arrayInput(input, 'risks'), rollout: stringInput(input, 'rollout') as ConfirmRelnoteReleaseInput['rollout']
        })
        return { ...success('Release confirmed and archived', '发布单已确认归档'), data }
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = actionErrorMessage(error)
      return failure(message, message)
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): RelnoteScope { return { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, assistantId: context.hostId, conversationId: context.runtimeScope?.conversationId ?? undefined } }
function asCreateInput(input: Record<string, unknown> | null | undefined): CreateRelnoteDraftInput { return { deviceModel: stringInput(input, 'deviceModel') ?? '', version: stringInput(input, 'version') ?? '', changesRaw: stringInput(input, 'changesRaw') ?? '' } }
function requireTargetId(request: XpertViewActionRequest) { if (!request.targetId) throw new Error('请选择一条发布单。'); return request.targetId }
function requireRevision(input: Record<string, unknown> | null | undefined) { const value = input?.expectedRevision; if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('请提供当前 revision 后再保存。'); return value }
function stringInput(input: Record<string, unknown> | null | undefined, key: string) { const value = input?.[key]; return typeof value === 'string' ? value : undefined }
function arrayInput(input: Record<string, unknown> | null | undefined, key: string) { const value = input?.[key]; return Array.isArray(value) ? value : undefined }
function success(en_US: string, zh_Hans: string): XpertViewActionResult { return { success: true, message: text(en_US, zh_Hans) } }
function failure(en_US: string, zh_Hans: string): XpertViewActionResult { return { success: false, message: text(en_US, zh_Hans) } }
function actionErrorMessage(error: unknown) { return error instanceof Error ? error.message : 'OTA 发布说明审核操作失败。' }
async function readPackageFile(pkg: string, file: string) { const packageRoot = dirname(requireFromHere.resolve(pkg + '/package.json')); return readFile(join(packageRoot, file), 'utf8') }
