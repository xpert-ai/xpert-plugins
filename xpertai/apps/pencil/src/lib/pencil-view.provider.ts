import { Injectable } from '@nestjs/common'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
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
import { IXpertViewExtensionProvider, ViewExtensionProvider, XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
  PENCIL_BASE_MIDDLEWARE_TOOL_NAMES,
  PENCIL_CREATE_DOCUMENT_TOOL_NAME,
  PENCIL_CREATE_SAMPLE_DOCUMENT_TOOL_NAME,
  PENCIL_CORE_TOOL_PREFIX,
  PENCIL_FEATURE,
  PENCIL_ICON,
  PENCIL_PLUGIN_NAME,
  PENCIL_PROVIDER_KEY,
  PENCIL_REMOTE_ENTRY_KEY,
  PENCIL_WORKBENCH_VIEW_KEY
} from './constants.js'
import { PencilService } from './pencil.service.js'
import { renderPencilRemoteVueIframeHtml } from './pencil-remote-html.js'
import type {
  PencilDocumentKind,
  PencilDocumentStatus,
  PencilExportFormat,
  PencilGraphSnapshot,
  PencilJsonObject,
  PencilJsonValue,
  PencilScope
} from './types.js'

const moduleFilename = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const PENCIL_REMOTE_RUNTIME = 'vue' as XpertRemoteComponentViewSchema['runtime']

/** Platform payload consumed by the Vue remote component on first load and refresh. */
type PencilWorkbenchViewData = XpertViewDataResult & {
  tableKey: 'documents'
  table: {
    key: 'documents'
    items: Awaited<ReturnType<PencilService['searchDocuments']>>['items']
    total: number
    page: number
    pageSize: number
  }
  documents: Awaited<ReturnType<PencilService['searchDocuments']>>
  detail: Awaited<ReturnType<PencilService['getDocument']>> | null
  settings: {
    pencilVersion: string
  }
}

type ProjectScopedViewHostContext = XpertResolvedViewHostContext & {
  projectId?: string | null
}

/** Bridges Xpert Workbench manifests/actions to the scoped Pencil service. */
@Injectable()
@ViewExtensionProvider(PENCIL_PROVIDER_KEY)
export class PencilViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: PencilService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  async getViewManifests(context: XpertResolvedViewHostContext, slot: string): Promise<XpertExtensionViewManifest[]> {
    if (context.hostType !== 'agent' || (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT)) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    // The forwarded completion list must match every middleware mutation that can change the open document.
    const toolNames = [
      ...PENCIL_BASE_MIDDLEWARE_TOOL_NAMES,
      ...(await this.service.getCoreToolDefinitions()).map((toolDef) => `${PENCIL_CORE_TOOL_PREFIX}${toolDef.name}`)
    ]
    const documentCreatingToolNames = [PENCIL_CREATE_DOCUMENT_TOOL_NAME, PENCIL_CREATE_SAMPLE_DOCUMENT_TOOL_NAME]
    const refreshingToolNames = toolNames.filter((toolName) => !documentCreatingToolNames.includes(toolName))

    return [
      {
        key: PENCIL_WORKBENCH_VIEW_KEY,
        title: text('Pencil Workbench', 'Pencil 设计工作台'),
        description: text(
          'Create, import, inspect, edit, export, review, and version Agent-managed Pencil design documents.',
          '创建、导入、检查、编辑、导出、审核并版本化 Agent 管理的 Pencil 设计文档。'
        ),
        icon: {
          type: 'svg',
          value: PENCIL_ICON,
          color: '#2563eb',
          alt: 'Pencil'
        },
        hostType: 'agent',
        slot,
        order: 39,
        refreshable: true,
        activation: {
          requiredFeatures: [PENCIL_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Pencil', 'Pencil 设计'),
                  order: 39,
                  icon: {
                    type: 'svg',
                    value: PENCIL_ICON,
                    alt: 'Pencil'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: PENCIL_PROVIDER_KEY,
          plugin: PENCIL_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: PENCIL_REMOTE_RUNTIME,
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: PENCIL_REMOTE_ENTRY_KEY
          },
          dataSource: {
            mode: 'platform'
          }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSearch: true,
            supportsParameters: true,
            defaultPageSize: 20
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'pencil-document-created',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: documentCreatingToolNames
              },
              action: {
                type: 'forward'
              }
            },
            {
              key: 'pencil-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: refreshingToolNames
              },
              action: {
                type: 'forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          {
            key: ASSISTANT_CONTEXT_SET_COMMAND,
            label: text('Set Assistant Context', '设置 Assistant 上下文')
          },
          {
            key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
            label: text('Send Assistant Message', '发送 Assistant 消息')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          { key: 'open_document', label: text('Open Design', '打开设计'), icon: 'ri-folder-open-line', actionType: 'invoke' },
          { key: 'create_document', label: text('New Design', '新建设计'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'rename_document', label: text('Rename Design', '重命名设计'), icon: 'ri-edit-line', actionType: 'invoke' },
          { key: 'create_sample_document', label: text('Sample Case', '生成案例'), icon: 'ri-dashboard-3-line', actionType: 'invoke' },
          { key: 'save_working_copy', label: text('Save Working Copy', '保存工作副本'), icon: 'ri-save-2-line', actionType: 'invoke' },
          { key: 'save_version', label: text('Save Version', '保存版本'), icon: 'ri-file-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'export_document', label: text('Export', '导出'), icon: 'ri-download-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'restore_version', label: text('Restore Version', '恢复版本'), icon: 'ri-history-line', actionType: 'invoke' },
          { key: 'delete_version', label: text('Delete Version', '删除版本'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          { key: 'mark_reviewed', label: text('Mark Reviewed', '标记已审核'), icon: 'ri-check-line', actionType: 'invoke' },
          { key: 'mark_draft', label: text('Move Back to Draft', '退回草稿'), icon: 'ri-edit-line', actionType: 'invoke' },
          { key: 'archive_document', label: text('Archive Design', '归档设计'), icon: 'ri-archive-line', actionType: 'invoke' },
          { key: 'delete_document', label: text('Delete Design Permanently', '永久删除设计'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          { key: 'report_failure', label: text('Report Failure', '记录失败'), icon: 'ri-error-warning-line', actionType: 'invoke' },
          {
            key: 'import_document_file',
            label: text('Import .fig/.pen', '导入 .fig/.pen'),
            icon: 'ri-upload-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== PENCIL_WORKBENCH_VIEW_KEY || component.entry !== PENCIL_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Pencil component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    // Assets are read from dist at runtime so local installs and packed installs use the same entry path.
    const componentDir = join(moduleDir, 'remote-components', PENCIL_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    return {
      html: renderPencilRemoteVueIframeHtml({
        title: 'Pencil Workbench',
        lang: htmlLangFromLocale(context.locale),
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== PENCIL_WORKBENCH_VIEW_KEY) {
      return {}
    }
    const scope = scopeFromContext(context)
    const requestedDocumentId = getStringParameter(query.parameters, 'documentId') ?? query.selectionId
    const documents = await this.service.searchDocuments(scope, {
      status: getStringParameter(query.parameters, 'status') as PencilDocumentStatus | undefined,
      kind: getStringParameter(query.parameters, 'kind') as PencilDocumentKind | undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
    // Keep list pagination light, then hydrate only the requested or first visible document in detail.
    const detailDocumentId = requestedDocumentId ?? documents.items[0]?.id
    const detail = detailDocumentId
      ? await this.service
          .getDocument(scope, {
            documentId: detailDocumentId,
            includeSnapshot: true,
            includeLogs: true,
            versionLimit: 30,
            logLimit: 20
          })
          .catch(() => null)
      : null
    const result: PencilWorkbenchViewData = {
      tableKey: 'documents',
      table: {
        key: 'documents',
        items: documents.items,
        total: documents.total,
        page: documents.page,
        pageSize: documents.pageSize
      },
      documents,
      detail,
      settings: {
        pencilVersion: '0.13.2'
      }
    }
    return result
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== PENCIL_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }
    // All iframe commands are dispatched through this declared action surface; no platform credentials enter the iframe.
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Pencil view refreshed', 'Pencil 视图已刷新')
      }
      if (actionKey === 'open_document') {
        const documentId = requireDocumentId(request)
        const [detail, collab] = await Promise.all([
          this.service.getDocument(scope, { documentId, includeSnapshot: false, includeLogs: true }),
          this.service.createCollaborationSession(scope, documentId)
        ])
        return { ...success('Pencil document opened', 'Pencil 文档已打开'), refresh: false, data: { ...detail, collab } }
      }
      if (actionKey === 'create_document') {
        const result = await this.service.createDocument(scope, {
          title: requireStringInput(request.input, 'title', 'Pencil title is required.'),
          description: getStringInput(request.input, 'description'),
          kind: getStringInput(request.input, 'kind') as PencilDocumentKind | undefined,
          tags: getStringArrayInput(request.input, 'tags'),
          source: 'workbench',
          graphSnapshot: getGraphSnapshotInput(request.input, 'graphSnapshot'),
          viewState: getRecordInput(request.input, 'viewState'),
          selectionSummary: getRecordInput(request.input, 'selectionSummary'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Pencil document created', 'Pencil 文档已创建'), data: result }
      }
      if (actionKey === 'rename_document') {
        const result = await this.service.renameDocument(scope, {
          documentId: requireDocumentId(request),
          title: requireStringInput(request.input, 'title', 'Pencil title is required.')
        })
        return { ...success('Pencil document renamed', 'Pencil 文档已重命名'), data: result }
      }
      if (actionKey === 'create_sample_document') {
        const result = await this.service.createSampleDocument(scope, {
          title: getStringInput(request.input, 'title'),
          description: getStringInput(request.input, 'description'),
          tags: getStringArrayInput(request.input, 'tags'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Pencil sample case created', 'Pencil 案例已生成'), data: result }
      }
      if (actionKey === 'save_working_copy') {
        const result = await this.service.saveWorkingCopy(scope, {
          documentId: requireDocumentId(request),
          graphSnapshot: requireGraphSnapshotInput(request.input, 'graphSnapshot'),
          viewState: getRecordInput(request.input, 'viewState'),
          selectionSummary: getRecordInput(request.input, 'selectionSummary'),
          baseRevision: getNumberInput(request.input, 'baseRevision'),
          baseGraphChecksum: getStringInput(request.input, 'baseGraphChecksum'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Pencil working copy saved', 'Pencil 工作副本已保存'), refresh: false, data: result }
      }
      if (actionKey === 'save_version') {
        const result = await this.service.saveVersion(scope, {
          documentId: requireDocumentId(request),
          graphSnapshot: getGraphSnapshotInput(request.input, 'graphSnapshot'),
          viewState: getRecordInput(request.input, 'viewState'),
          selectionSummary: getRecordInput(request.input, 'selectionSummary'),
          sourceType: 'workbench',
          changeSummary: getStringInput(request.input, 'changeSummary') ?? 'Workbench version'
        })
        return { ...success('Pencil version saved', 'Pencil 版本已保存'), data: result }
      }
      if (actionKey === 'export_document') {
        const result = await this.service.exportDocument(scope, {
          documentId: requireDocumentId(request),
          format: (getStringInput(request.input, 'format') ?? 'fig') as PencilExportFormat,
          target: getExportTargetInput(request.input, 'target'),
          fileName: getStringInput(request.input, 'fileName'),
          scale: getNumberInput(request.input, 'scale'),
          quality: getNumberInput(request.input, 'quality'),
          colorSpace: getStringInput(request.input, 'colorSpace'),
          writeToWorkspace: false
        })
        return { ...success('Pencil document exported', 'Pencil 文档已导出'), data: result }
      }
      if (actionKey === 'restore_version') {
        const result = await this.service.restoreVersion(
          scope,
          requireDocumentId(request),
          requireStringInput(request.input, 'versionId', 'Version id is required.'),
          getStringInput(request.input, 'changeSummary')
        )
        return { ...success('Pencil version restored', 'Pencil 版本已恢复'), data: result }
      }
      if (actionKey === 'delete_version') {
        const result = await this.service.deleteVersion(
          scope,
          requireDocumentId(request),
          requireStringInput(request.input, 'versionId', 'Version id is required.')
        )
        return { ...success('Pencil version deleted', 'Pencil 版本已删除'), data: result }
      }
      if (actionKey === 'archive_document') {
        const result = await this.service.updateDocumentStatus(scope, {
          documentId: requireDocumentId(request),
          status: 'archived',
          reason: getStringInput(request.input, 'reason')
        })
        return { ...success('Pencil archived', 'Pencil 已归档'), data: result }
      }
      if (actionKey === 'delete_document') {
        const result = await this.service.deleteDocument(scope, requireDocumentId(request))
        return { ...success('Pencil document permanently deleted', 'Pencil 文档已永久删除'), data: result }
      }
      if (actionKey === 'mark_reviewed' || actionKey === 'mark_draft') {
        const status = actionKey === 'mark_reviewed' ? 'reviewed' : 'draft'
        const result = await this.service.updateDocumentStatus(scope, {
          documentId: requireDocumentId(request),
          status,
          reason: getStringInput(request.input, 'reason')
        })
        return {
          ...success(
            status === 'reviewed' ? 'Pencil marked as reviewed' : 'Pencil moved back to draft',
            status === 'reviewed' ? 'Pencil 已标记为已审核' : 'Pencil 已退回草稿'
          ),
          data: result
        }
      }
      if (actionKey === 'report_failure') {
        const result = await this.service.reportFailure(scope, {
          documentId: getStringInput(request.input, 'documentId') ?? getStringParameter(request.parameters, 'documentId'),
          versionId: getStringInput(request.input, 'versionId'),
          operation: requireStringInput(request.input, 'operation', 'Operation is required.'),
          errorMessage: requireStringInput(request.input, 'errorMessage', 'Error message is required.'),
          recoverable: getBooleanInput(request.input, 'recoverable'),
          evidence: getJsonInput(request.input, 'evidence')
        })
        return { ...success('Pencil failure recorded', 'Pencil 失败已记录'), data: result }
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Pencil action failed')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (viewKey !== PENCIL_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }
    if (actionKey !== 'import_document_file') {
      return failure('Unsupported file action', '不支持的文件操作')
    }
    try {
      const scope = scopeFromContext(context)
      const result = await this.service.importBuffer(scope, {
        title: getStringInput(request.input, 'title') ?? removeKnownExtension(file.originalname) ?? 'Imported Pencil Design',
        description: getStringInput(request.input, 'description'),
        kind: getStringInput(request.input, 'kind') as PencilDocumentKind | undefined,
        tags: getStringArrayInput(request.input, 'tags'),
        fileName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
        source: 'workbench_import'
      })
      return { ...success('Pencil file imported', 'Pencil 文件已导入'), data: result }
    } catch (error) {
      const message = getActionErrorMessage(error, 'Failed to import Pencil file')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

/** Converts trusted host identity into the ownership scope used by service queries. */
function scopeFromContext(context: XpertResolvedViewHostContext): PencilScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: getProjectId(context),
    userId: context.userId,
    xpertId: context.hostType === 'agent' ? context.hostId : null,
    assistantId: context.hostType === 'agent' ? context.hostId : null
  }
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    refresh: true
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}

function requireDocumentId(request: XpertViewActionRequest) {
  return (
    getStringInput(request.input, 'documentId') ??
    getStringParameter(request.parameters, 'documentId') ??
    requireString(request.targetId, 'Pencil document id is required.')
  )
}

function requireStringInput(input: XpertViewActionRequest['input'], key: string, message: string) {
  return requireString(getStringInput(input, key), message)
}

function requireString(value: string | undefined, message: string) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

function getStringInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getBooleanInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function getNumberInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getStringArrayInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function getRecordInput(input: XpertViewActionRequest['input'], key: string): PencilJsonObject {
  const value = input?.[key]
  return isJsonObject(value as object | PencilJsonValue | null | undefined) ? (value as PencilJsonObject) : {}
}

function getGraphSnapshotInput(input: XpertViewActionRequest['input'], key: string): PencilGraphSnapshot | undefined {
  const value = input?.[key]
  return isJsonObject(value as object | PencilJsonValue | null | undefined) ? (value as PencilGraphSnapshot) : undefined
}

function requireGraphSnapshotInput(input: XpertViewActionRequest['input'], key: string): PencilGraphSnapshot {
  const snapshot = getGraphSnapshotInput(input, key)
  if (!snapshot) {
    throw new Error('Pencil graphSnapshot is required.')
  }
  return snapshot
}

function getExportTargetInput(input: XpertViewActionRequest['input'], key: string) {
  const value = getRecordInput(input, key)
  if (!Object.keys(value).length) {
    return undefined
  }
  if (value.scope === 'page' && typeof value.pageId === 'string') {
    return { scope: 'page' as const, pageId: value.pageId }
  }
  if (value.scope === 'node' && typeof value.nodeId === 'string') {
    return { scope: 'node' as const, nodeId: value.nodeId }
  }
  if (value.scope === 'selection' && Array.isArray(value.nodeIds)) {
    return { scope: 'selection' as const, nodeIds: value.nodeIds.filter((item): item is string => typeof item === 'string') }
  }
  return { scope: 'document' as const }
}

function getJsonInput(input: XpertViewActionRequest['input'], key: string): PencilJsonValue | undefined {
  const value = input?.[key]
  return isJsonValue(value) ? value : undefined
}

function getStringParameter(parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'], key: string) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getProjectId(context: XpertResolvedViewHostContext) {
  const projectId = (context as ProjectScopedViewHostContext).projectId
  return typeof projectId === 'string' && projectId.trim() ? projectId.trim() : null
}

function htmlLangFromLocale(locale: string | undefined) {
  if (!locale) {
    return 'en'
  }
  return locale.startsWith('zh') ? 'zh-CN' : locale
}

function getActionErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || '')
  return message || fallback
}

function removeKnownExtension(fileName: string | null | undefined) {
  const normalized = fileName?.trim()
  if (!normalized) {
    return undefined
  }
  return normalized.replace(/\.(fig|pen)$/i, '')
}

function isJsonValue(value: unknown): value is PencilJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  if (isJsonObject(value as object | PencilJsonValue | null | undefined)) {
    return Object.values(value).every((item) => item === undefined || isJsonValue(item))
  }
  return false
}

function isJsonObject(value: object | PencilJsonValue | null | undefined): value is PencilJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
