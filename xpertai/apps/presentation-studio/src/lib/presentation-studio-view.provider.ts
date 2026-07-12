import { Injectable } from '@nestjs/common'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  IconDefinition,
  I18nObject,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { ASSISTANT_CONTEXT_SET_COMMAND } from '@xpert-ai/contracts'
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  type XpertViewFileActionFile
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  PRESENTATION_FEATURE,
  PRESENTATION_ICON,
  PRESENTATION_MUTATION_TOOL_NAMES,
  PRESENTATION_PLUGIN_NAME,
  PRESENTATION_PROVIDER_KEY,
  PRESENTATION_REMOTE_ENTRY_KEY,
  PRESENTATION_VIEW_KEY,
  PRESENTATION_WORKBENCH_CAPABILITY,
  PROJECT_DETAIL_SECTIONS_SLOT
} from './constants.js'
import { PresentationStudioService } from './presentation-studio.service.js'
import type { PresentationExportKind, PresentationJsonObject, PresentationScope, PresentationStatus, PresentationThemePack } from './types.js'

const moduleFilename = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilename)
const requireFromHere = createRequire(moduleFilename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = { type: 'svg', value: PRESENTATION_ICON, alt: 'Presentation Studio' } satisfies IconDefinition
const VIEW_ICON_COMPAT = VIEW_ICON as XpertExtensionViewManifest['icon']
const UNCACHED_PLATFORM_DATA_SOURCE = { mode: 'platform' as const, cache: { enabled: false } }

@Injectable()
@ViewExtensionProvider(PRESENTATION_PROVIDER_KEY)
export class PresentationStudioViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: PresentationStudioService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'project' || context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!isSupportedSlot(context, slot)) return []
    const fixed = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT
    return [{
      key: PRESENTATION_VIEW_KEY,
      title: text('Presentation Studio', '演示文稿工作室'),
      description: text('Agentic DashiAI presentation generation, collaboration, review, and export.', '基于 DashiAI 的演示文稿生成、协作、审阅与导出。'),
      icon: VIEW_ICON_COMPAT,
      hostType: context.hostType,
      slot,
      order: 43,
      refreshable: true,
      activation: { requiredFeatures: [PRESENTATION_FEATURE] },
      ...(fixed ? { workbench: { fixed: true, menu: { enabled: true, label: text('Presentation Studio', '演示文稿'), order: 43, icon: VIEW_ICON_COMPAT } } } : {}),
      source: { provider: PRESENTATION_PROVIDER_KEY, plugin: PRESENTATION_PLUGIN_NAME },
      view: {
        type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: PRESENTATION_REMOTE_ENTRY_KEY },
        dataSource: UNCACHED_PLATFORM_DATA_SOURCE
      },
      dataSource: {
        mode: 'platform', querySchema: { supportsPagination: true, supportsSearch: true, supportsParameters: true, defaultPageSize: 20 },
        cache: { enabled: false }
      },
      hostEvents: {
        subscriptions: [{
          key: 'presentation-studio-tool-completed', event: 'assistant.tool.completed',
          filter: { sources: ['chatkit'], toolNames: [...PRESENTATION_MUTATION_TOOL_NAMES] },
          action: { type: 'forward', debounceMs: 750 }
        }]
      },
      clientCommands: [{
        key: ASSISTANT_CONTEXT_SET_COMMAND,
        label: text('Set Assistant Context', '设置 Assistant 上下文')
      }],
      actions: [
        { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
        { key: 'create_deck', label: text('New deck', '新建演示稿'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
        { key: 'open_deck', label: text('Open deck', '打开演示稿'), actionType: 'invoke' },
        { key: 'load_theme_runtime', label: text('Load theme runtime', '加载主题运行时'), actionType: 'invoke' },
        { key: 'load_asset_previews', label: text('Load asset previews', '加载素材预览'), actionType: 'invoke' },
        { key: 'set_current_context', label: text('Set current presentation context', '设置当前演示文稿上下文'), actionType: 'invoke' },
        { key: 'rename_deck', label: text('Rename deck', '重命名演示稿'), actionType: 'invoke' },
        { key: 'finalize_deck', label: text('Save version', '保存版本'), icon: 'ri-save-line', actionType: 'invoke' },
        { key: 'restore_version', label: text('Restore version', '恢复版本'), actionType: 'invoke' },
        { key: 'delete_version', label: text('Delete version', '删除版本'), actionType: 'invoke' },
        { key: 'update_status', label: text('Update status', '更新状态'), actionType: 'invoke' },
        { key: 'request_export', label: text('Export', '导出'), icon: 'ri-download-line', actionType: 'invoke' },
        { key: 'share_deck_html', label: text('Share current deck HTML', '分享当前演示稿 HTML'), icon: 'ri-share-forward-line', actionType: 'invoke' },
        { key: 'share_export', label: text('Share HTML', '分享 HTML'), icon: 'ri-share-line', actionType: 'invoke' },
        { key: 'cancel_export', label: text('Cancel export', '取消导出'), actionType: 'invoke' },
        { key: 'delete_export', label: text('Delete export', '删除导出'), actionType: 'invoke' },
        { key: 'upload_asset', label: text('Upload media', '上传媒体'), icon: 'ri-upload-cloud-2-line', placement: 'toolbar', actionType: 'invoke', transport: 'file' }
      ]
    }]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== PRESENTATION_VIEW_KEY || component.entry !== PRESENTATION_REMOTE_ENTRY_KEY) {
      return { html: '<!doctype html><html><body>Unsupported Presentation Studio component.</body></html>', contentType: 'text/html; charset=utf-8' }
    }
    const componentDir = join(moduleDir, 'remote-components', PRESENTATION_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const cssPath = join(componentDir, 'app.css')
    const appCss = existsSync(cssPath) ? await readFile(cssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({ title: 'Presentation Studio', lang: 'zh-Hans', reactUmd: react, reactDomUmd: reactDom, appScript, appCss }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== PRESENTATION_VIEW_KEY) return {}
    const result = await this.service.getWorkbenchData(scopeFromContext(context), {
      table: stringParameter(query.parameters, 'table') as 'decks' | 'deck_detail' | 'exports' | 'versions' | undefined,
      deckId: stringParameter(query.parameters, 'deckId') ?? query.selectionId,
      versionId: stringParameter(query.parameters, 'versionId'),
      checksum: stringParameter(query.parameters, 'checksum'),
      status: stringParameter(query.parameters, 'status') as PresentationStatus | undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
    return result
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== PRESENTATION_VIEW_KEY) return failure('Unsupported view')
    const scope = scopeFromContext(context)
    try {
      if (actionKey === 'refresh') return success('Presentation Studio refreshed')
      if (actionKey === 'create_deck') {
        const result = await this.service.createDeck(scope, {
          title: requiredInput(request, 'title'), goal: requiredInput(request, 'goal'), audience: stringInput(request, 'audience'),
          owner: stringInput(request, 'owner'), themePack: requiredInput(request, 'themePack') as PresentationThemePack,
          pageCount: numberInput(request, 'pageCount') ?? 8
        })
        return { ...success('Presentation created'), data: result }
      }
      if (actionKey === 'open_deck') {
        return { ...success('Presentation opened', false), data: await this.service.openDeck(scope, deckId(request)) }
      }
      if (actionKey === 'load_theme_runtime') {
        return { ...success('Presentation theme runtime loaded', false), data: await this.service.loadThemeRuntime(scope, deckId(request)) }
      }
      if (actionKey === 'load_asset_previews') {
        return {
          ...success('Presentation asset previews loaded', false),
          data: await this.service.loadAssetPreviews(scope, deckId(request), stringArrayInput(request, 'assetIds'))
        }
      }
      if (actionKey === 'set_current_context') {
        return {
          ...success('Presentation context updated', false),
          data: await this.service.setWorkbenchAgentContext(scope, {
            deckId: deckId(request),
            slideId: stringInput(request, 'slideId') ?? null,
            deckTitle: stringInput(request, 'deckTitle') ?? null,
            themePack: stringInput(request, 'themePack') ?? null,
            slideLayout: stringInput(request, 'slideLayout') ?? null,
            slideLabel: stringInput(request, 'slideLabel') ?? null,
            activeIndex: numberInput(request, 'activeIndex') ?? null,
            slideCount: numberInput(request, 'slideCount') ?? null,
            revision: numberInput(request, 'revision') ?? null,
            currentVersionNumber: numberInput(request, 'currentVersionNumber') ?? null,
            assistantDisplayName: stringInput(request, 'assistantDisplayName') ?? scope.assistantDisplayName ?? null
          })
        }
      }
      if (actionKey === 'rename_deck') {
        const result = await this.service.renameDeck(scope, deckId(request), requiredInput(request, 'title'), requiredNumberInput(request, 'expectedRevision'))
        return { ...success('Presentation renamed'), data: result }
      }
      if (actionKey === 'finalize_deck') {
        const result = await this.service.finalizeDeck(scope, deckId(request), requiredNumberInput(request, 'expectedRevision'), 'workbench', stringInput(request, 'changeSummary'))
        return { ...success('Presentation version saved'), data: result }
      }
      if (actionKey === 'restore_version') {
        const result = await this.service.restoreVersion(scope, deckId(request), requiredInput(request, 'versionId'), requiredNumberInput(request, 'expectedRevision'))
        return { ...success('Presentation version restored'), data: result }
      }
      if (actionKey === 'delete_version') {
        const result = await this.service.deleteVersion(scope, deckId(request), requiredInput(request, 'versionId'))
        return { ...success('Presentation version deleted'), data: result }
      }
      if (actionKey === 'update_status') {
        const result = await this.service.updateStatus(scope, deckId(request), requiredInput(request, 'status') as PresentationStatus, stringInput(request, 'reason'), 'workbench')
        return { ...success('Presentation status updated'), data: result }
      }
      if (actionKey === 'request_export') {
        const result = await this.service.requestExport(scope, {
          deckId: deckId(request), versionId: stringInput(request, 'versionId'), kind: requiredInput(request, 'kind') as PresentationExportKind,
          fileName: stringInput(request, 'fileName'), expectedRevision: numberInput(request, 'expectedRevision')
        })
        return { ...success('Presentation export queued'), data: result }
      }
      if (actionKey === 'share_export') {
        const result = await this.service.shareHtmlExport(scope, {
          deckId: deckId(request),
          exportId: requiredInput(request, 'exportId'),
          versionMode: stringInput(request, 'versionMode') as 'latest' | 'version' | undefined,
          accessMode: stringInput(request, 'accessMode') as 'public_link' | 'organization_all' | 'workspace_all' | 'owner_only' | undefined,
          allowDownload: booleanInput(request, 'allowDownload')
        })
        return { ...success('Presentation HTML share link created', false), data: result }
      }
      if (actionKey === 'share_deck_html') {
        const result = await this.service.shareDeckHtmlExport(scope, {
          deckId: deckId(request),
          expectedRevision: numberInput(request, 'expectedRevision'),
          versionMode: stringInput(request, 'versionMode') as 'latest' | 'version' | undefined,
          accessMode: stringInput(request, 'accessMode') as 'public_link' | 'organization_all' | 'workspace_all' | 'owner_only' | undefined,
          allowDownload: booleanInput(request, 'allowDownload')
        })
        return { ...success('Presentation HTML share started', false), data: result }
      }
      if (actionKey === 'cancel_export') {
        const result = await this.service.cancelExport(scope, requiredInput(request, 'exportId'))
        return { ...success('Presentation export cancelled'), data: result }
      }
      if (actionKey === 'delete_export') {
        const result = await this.service.deleteExport(scope, requiredInput(request, 'exportId'))
        return { ...success('Presentation export deleted'), data: result }
      }
      return failure('Unsupported action')
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Presentation Studio action failed')
    }
  }

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (viewKey !== PRESENTATION_VIEW_KEY || actionKey !== 'upload_asset') return failure('Unsupported file action')
    try {
      const result = await this.service.uploadAsset(scopeFromContext(context), {
        deckId: deckId(request), role: stringInput(request, 'role') ?? 'media', slideId: stringInput(request, 'slideId'),
        fileName: file.originalname || 'asset', mimeType: file.mimetype
      }, file.buffer)
      return { ...success('Presentation media uploaded'), data: result }
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Presentation media upload failed')
    }
  }
}

async function readPackageFile(packageName: string, path: string) {
  const root = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(root, path), 'utf8')
}

function isSupportedSlot(context: XpertResolvedViewHostContext, slot: string) {
  if (context.hostType === 'project') return slot === PROJECT_DETAIL_SECTIONS_SLOT
  return context.hostType === 'agent' && (slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT)
}

function scopeFromContext(context: XpertResolvedViewHostContext): PresentationScope {
  return {
    tenantId: context.tenantId, organizationId: context.organizationId ?? null, workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null, userId: context.userId,
    xpertId: context.hostType === 'agent' ? context.hostId : null,
    assistantId: context.hostType === 'agent' ? context.hostId : null,
    assistantDisplayName: hostDisplayName(context),
    conversationId: conversationIdFromContext(context)
  }
}

function objectInput(request: XpertViewActionRequest): PresentationJsonObject {
  return request.input && typeof request.input === 'object' && !Array.isArray(request.input) ? request.input as PresentationJsonObject : {}
}
function stringInput(request: XpertViewActionRequest, key: string) { const value = objectInput(request)[key]; return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function requiredInput(request: XpertViewActionRequest, key: string) { const value = stringInput(request, key); if (!value) throw new Error(`${key} is required.`); return value }
function numberInput(request: XpertViewActionRequest, key: string) { const value = objectInput(request)[key]; return typeof value === 'number' && Number.isFinite(value) ? value : undefined }
function booleanInput(request: XpertViewActionRequest, key: string) { const value = objectInput(request)[key]; return typeof value === 'boolean' ? value : undefined }
function stringArrayInput(request: XpertViewActionRequest, key: string) {
  const value = objectInput(request)[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : []
}
function requiredNumberInput(request: XpertViewActionRequest, key: string) { const value = numberInput(request, key); if (value === undefined) throw new Error(`${key} is required.`); return value }
function deckId(request: XpertViewActionRequest) { return stringInput(request, 'deckId') ?? stringParameter(request.parameters, 'deckId') ?? requiredTarget(request.targetId) }
function requiredTarget(value: string | null | undefined) { if (!value) throw new Error('deckId is required.'); return value }
function stringParameter(parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'], key: string) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function success(message: string, refresh = true): XpertViewActionResult { return { success: true, message: text(message, message), refresh } }
function failure(message: string): XpertViewActionResult { return { success: false, message: text(message, message) } }

function conversationIdFromContext(context: XpertResolvedViewHostContext) {
  const direct = stringFromRecord(context.hostState, 'conversationId') ?? stringFromRecord(context.hostSnapshot, 'conversationId')
  if (direct) return direct
  const route = typeof context.route === 'string' ? context.route : ''
  const match = route.match(/\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i)
  return match?.[1] ?? null
}

function hostDisplayName(context: XpertResolvedViewHostContext) {
  return displayNameFromUnknown(context.hostSnapshot)
    ?? displayNameFromUnknown(context.hostState)
    ?? null
}

function displayNameFromUnknown(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return stringFromRecord(record, 'title')
    ?? stringFromRecord(record, 'name')
    ?? stringFromRecord(record, 'displayName')
    ?? stringFromRecord(record, 'label')
}

function stringFromRecord(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = (value as Record<string, unknown>)[key]
  if (typeof item === 'string' && item.trim()) return item.trim().slice(0, 128)
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const record = item as Record<string, unknown>
    const localized = record.zh_Hans ?? record.en_US ?? record.name ?? record.title
    return typeof localized === 'string' && localized.trim() ? localized.trim().slice(0, 128) : null
  }
  return null
}
