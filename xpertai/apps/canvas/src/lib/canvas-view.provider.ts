import { Injectable } from '@nestjs/common'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
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
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  XpertViewFileActionFile
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
  CANVAS_FEATURE,
  CANVAS_ICON,
  CANVAS_MIDDLEWARE_TOOL_NAMES,
  CANVAS_PLUGIN_NAME,
  CANVAS_PROVIDER_KEY,
  CANVAS_REMOTE_ENTRY_KEY,
  CANVAS_WORKBENCH_VIEW_KEY
} from './constants.js'
import { CanvasService } from './canvas.service.js'
import type {
  CanvasDocumentKind,
  CanvasDocumentStatus,
  CanvasJsonObject,
  CanvasJsonValue,
  CanvasRecord,
  CanvasScope,
  CanvasSnapshotData,
  CanvasSnapshotImageInput,
  InsertCanvasImageInput
} from './types.js'

const moduleFilename = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilename)
const requireFromHere = createRequire(moduleFilename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

type CanvasWorkbenchViewData = XpertViewDataResult & {
  tableKey: 'documents'
  table: {
    key: 'documents'
    items: Awaited<ReturnType<CanvasService['searchDocuments']>>['items']
    total: number
    page: number
    pageSize: number
  }
  documents: Awaited<ReturnType<CanvasService['searchDocuments']>>
  detail: Awaited<ReturnType<CanvasService['getDocument']>> | null
}

type ProjectScopedViewHostContext = XpertResolvedViewHostContext & {
  projectId?: string | null
}

@Injectable()
@ViewExtensionProvider(CANVAS_PROVIDER_KEY)
export class CanvasViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: CanvasService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (context.hostType !== 'agent' || (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT)) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: CANVAS_WORKBENCH_VIEW_KEY,
        title: text('Canvas Workbench', 'Canvas 画布工作台'),
        description: text(
          'Create, review, annotate, insert images, import, export, and version Agent-managed tldraw canvases.',
          '创建、审核、标注、插入图片、导入导出并版本化 Agent 管理的 tldraw 画布。'
        ),
        icon: {
          type: 'svg',
          value: CANVAS_ICON,
          color: '#0f766e',
          alt: 'Canvas'
        },
        hostType: 'agent',
        slot,
        order: 38,
        refreshable: true,
        activation: {
          requiredFeatures: [CANVAS_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Canvas', 'Canvas 画布'),
                  order: 38,
                  icon: {
                    type: 'svg',
                    value: CANVAS_ICON,
                    alt: 'Canvas'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: CANVAS_PROVIDER_KEY,
          plugin: CANVAS_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: CANVAS_REMOTE_ENTRY_KEY
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
              key: 'canvas-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...CANVAS_MIDDLEWARE_TOOL_NAMES]
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
          { key: 'create_document', label: text('New Canvas', '新建画布'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'autosave_snapshot', label: text('Autosave', '自动保存'), icon: 'ri-save-2-line', actionType: 'invoke' },
          { key: 'save_snapshot', label: text('Save', '保存'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'save_version', label: text('New Version', '新建版本'), icon: 'ri-file-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'prepare_assistant_prompt', label: text('Ask Assistant', '询问 Assistant'), icon: 'ri-chat-3-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'patch_records', label: text('Patch Records', '更新记录'), icon: 'ri-node-tree', actionType: 'invoke' },
          { key: 'insert_image', label: text('Insert Image', '插入图片'), icon: 'ri-image-add-line', actionType: 'invoke' },
          { key: 'restore_version', label: text('Restore Version', '恢复版本'), icon: 'ri-history-line', actionType: 'invoke' },
          { key: 'mark_reviewed', label: text('Mark Reviewed', '标记已审核'), icon: 'ri-check-line', actionType: 'invoke' },
          { key: 'mark_draft', label: text('Move Back to Draft', '退回草稿'), icon: 'ri-edit-line', actionType: 'invoke' },
          { key: 'archive_document', label: text('Archive Canvas', '归档画布'), icon: 'ri-archive-line', actionType: 'invoke' },
          { key: 'delete_document', label: text('Delete Canvas', '删除画布'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          {
            key: 'import_snapshot_file',
            label: text('Import tldraw Snapshot', '导入 tldraw 快照'),
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
    if (viewKey !== CANVAS_WORKBENCH_VIEW_KEY || component.entry !== CANVAS_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Canvas component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const componentDir = join(moduleDir, 'remote-components', CANVAS_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Canvas Workbench',
        lang: htmlLangFromLocale(context.locale),
        reactUmd: react,
        reactDomUmd: reactDom,
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
    if (viewKey !== CANVAS_WORKBENCH_VIEW_KEY) {
      return {}
    }
    const scope = scopeFromContext(context)
    const requestedDocumentId = getStringParameter(query.parameters, 'documentId') ?? query.selectionId
    const documents = await this.service.searchDocuments(scope, {
      status: getStringParameter(query.parameters, 'status') as CanvasDocumentStatus | undefined,
      kind: getStringParameter(query.parameters, 'kind') as CanvasDocumentKind | undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
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
    const result: CanvasWorkbenchViewData = {
      tableKey: 'documents',
      table: {
        key: 'documents',
        items: documents.items,
        total: documents.total,
        page: documents.page,
        pageSize: documents.pageSize
      },
      documents,
      detail
    }
    return result
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== CANVAS_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Canvas view refreshed', 'Canvas 视图已刷新')
      }

      if (actionKey === 'create_document') {
        const result = await this.service.createDocument(scope, {
          title: requireStringInput(request.input, 'title', 'Canvas title is required.'),
          description: getStringInput(request.input, 'description'),
          kind: getStringInput(request.input, 'kind') as CanvasDocumentKind | undefined,
          tags: getStringArrayInput(request.input, 'tags'),
          source: 'workbench',
          snapshot: getSnapshotInput(request.input, 'snapshot'),
          viewState: getRecordInput(request.input, 'viewState'),
          selectionSummary: getRecordInput(request.input, 'selectionSummary'),
          snapshotImage: getSnapshotImageInput(request.input, 'snapshotImage'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Canvas created', '画布已创建'),
          data: result
        }
      }

      if (actionKey === 'autosave_snapshot') {
        const result = await this.service.autosaveSnapshot(scope, {
          documentId: requireDocumentId(request),
          snapshot: getSnapshotInput(request.input, 'snapshot'),
          viewState: getRecordInput(request.input, 'viewState'),
          selectionSummary: getRecordInput(request.input, 'selectionSummary'),
          snapshotImage: getSnapshotImageInput(request.input, 'snapshotImage'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Canvas autosaved', '画布已自动保存'),
          refresh: false,
          data: result
        }
      }

      if (actionKey === 'save_snapshot' || actionKey === 'save_version') {
        const result = await this.service.saveSnapshot(scope, {
          documentId: requireDocumentId(request),
          snapshot: getSnapshotInput(request.input, 'snapshot'),
          viewState: getRecordInput(request.input, 'viewState'),
          selectionSummary: getRecordInput(request.input, 'selectionSummary'),
          snapshotImage: getSnapshotImageInput(request.input, 'snapshotImage'),
          sourceType: 'workbench',
          changeSummary: getStringInput(request.input, 'changeSummary') ?? (actionKey === 'save_version' ? 'Workbench version' : 'Workbench save')
        })
        return {
          ...success('Canvas saved', '画布已保存'),
          data: result
        }
      }

      if (actionKey === 'prepare_assistant_prompt') {
        const result = await this.service.prepareAssistantPrompt(scope, {
          documentId: requireDocumentId(request),
          instruction: getStringInput(request.input, 'instruction'),
          includeSceneSummary: getBooleanInput(request.input, 'includeSceneSummary')
        })
        return {
          ...success('Assistant prompt prepared', 'Assistant 提示词已准备'),
          refresh: false,
          data: result
        }
      }

      if (actionKey === 'patch_records') {
        const result = await this.service.patchRecords(scope, {
          documentId: requireDocumentId(request),
          putRecords: getCanvasRecordArrayInput(request.input, 'putRecords'),
          removeRecordIds: getStringArrayInput(request.input, 'removeRecordIds'),
          viewStatePatch: getRecordInput(request.input, 'viewStatePatch'),
          selectionSummary: getRecordInput(request.input, 'selectionSummary'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Canvas records patched', '画布记录已更新'),
          data: result
        }
      }

      if (actionKey === 'insert_image') {
        const result = await this.service.insertImage(scope, {
          documentId: getStringInput(request.input, 'documentId') ?? getStringParameter(request.parameters, 'documentId'),
          dataUrl: getStringInput(request.input, 'dataUrl'),
          base64: getStringInput(request.input, 'base64'),
          mimeType: getStringInput(request.input, 'mimeType'),
          fileName: getStringInput(request.input, 'fileName'),
          width: getNumberInput(request.input, 'width'),
          height: getNumberInput(request.input, 'height'),
          displayWidth: getNumberInput(request.input, 'displayWidth'),
          displayHeight: getNumberInput(request.input, 'displayHeight'),
          pageId: getStringInput(request.input, 'pageId'),
          anchorShapeId: getStringInput(request.input, 'anchorShapeId'),
          placement: getPlacementInput(request.input, 'placement'),
          margin: getNumberInput(request.input, 'margin'),
          matchAnchor: getBooleanInput(request.input, 'matchAnchor'),
          altText: getStringInput(request.input, 'altText'),
          shapeMeta: getRecordInput(request.input, 'shapeMeta'),
          assetMeta: getRecordInput(request.input, 'assetMeta'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Image inserted', '图片已插入'),
          data: result
        }
      }

      if (actionKey === 'restore_version') {
        const result = await this.service.restoreVersion(
          scope,
          requireDocumentId(request),
          requireStringInput(request.input, 'versionId', 'Version id is required.'),
          getStringInput(request.input, 'changeSummary')
        )
        return {
          ...success('Canvas version restored', '画布版本已恢复'),
          data: result
        }
      }

      if (actionKey === 'archive_document') {
        const result = await this.service.updateDocumentStatus(scope, {
          documentId: requireDocumentId(request),
          status: 'archived',
          reason: getStringInput(request.input, 'reason')
        })
        return {
          ...success('Canvas archived', '画布已归档'),
          data: result
        }
      }

      if (actionKey === 'delete_document') {
        const result = await this.service.deleteDocument(scope, requireDocumentId(request))
        return {
          ...success('Canvas deleted', '画布已删除'),
          data: result
        }
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
            status === 'reviewed' ? 'Canvas marked as reviewed' : 'Canvas moved back to draft',
            status === 'reviewed' ? '画布已标记为已审核' : '画布已退回草稿'
          ),
          data: result
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error instanceof Error ? error : String(error), 'Canvas action failed')
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
    if (viewKey !== CANVAS_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }
    if (actionKey !== 'import_snapshot_file') {
      return failure('Unsupported file action', '不支持的文件操作')
    }

    try {
      const parsed = JSON.parse(file.buffer.toString('utf8')) as CanvasJsonObject
      const snapshot = isJsonObject(parsed.snapshot) ? (parsed.snapshot as CanvasSnapshotData) : (parsed as CanvasSnapshotData)
      const scope = scopeFromContext(context)
      const documentId = getStringInput(request.input, 'documentId') ?? getStringParameter(request.parameters, 'documentId')
      const result = documentId
        ? await this.service.saveSnapshot(scope, {
            documentId,
            snapshot,
            sourceType: 'import',
            changeSummary: `Imported ${file.originalname ?? 'tldraw snapshot'}`
          })
        : await this.service.createDocument(scope, {
            title: getStringInput(request.input, 'title') ?? removeKnownExtension(file.originalname) ?? 'Imported Canvas',
            description: getStringInput(request.input, 'description'),
            kind: 'canvas',
            source: 'import',
            snapshot,
            changeSummary: `Imported ${file.originalname ?? 'tldraw snapshot'}`
          })

      return {
        ...success('Canvas snapshot imported', '画布快照已导入'),
        data: result
      }
    } catch (error) {
      const message = getActionErrorMessage(error instanceof Error ? error : String(error), 'Failed to import Canvas snapshot')
      return {
        success: false,
        message: text(message, message)
      }
    }
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): CanvasScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: getProjectId(context),
    userId: context.userId,
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
    requireString(request.targetId, 'Canvas document id is required.')
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

function getNumberInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getBooleanInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function getStringArrayInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function getArrayInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return Array.isArray(value) ? value : []
}

function getRecordInput(input: XpertViewActionRequest['input'], key: string): CanvasJsonObject {
  const value = input?.[key]
  return isJsonObject(value as object | CanvasJsonValue | null | undefined) ? (value as CanvasJsonObject) : {}
}

function getSnapshotInput(input: XpertViewActionRequest['input'], key: string): CanvasSnapshotData {
  return getRecordInput(input, key) as CanvasSnapshotData
}

function getCanvasRecordArrayInput(input: XpertViewActionRequest['input'], key: string): CanvasRecord[] | undefined {
  const records = getArrayInput(input, key).filter(isCanvasRecord)
  return records.length ? records : undefined
}

function getPlacementInput(input: XpertViewActionRequest['input'], key: string): InsertCanvasImageInput['placement'] | undefined {
  const value = getStringInput(input, key)
  return value === 'right' || value === 'left' || value === 'below' || value === 'center' ? value : undefined
}

function getNullableRecordInput(input: XpertViewActionRequest['input'], key: string): CanvasJsonObject | undefined {
  const value = input?.[key]
  return isJsonObject(value as object | CanvasJsonValue | null | undefined) ? (value as CanvasJsonObject) : undefined
}

function getSnapshotImageInput(input: XpertViewActionRequest['input'], key: string): CanvasSnapshotImageInput | undefined {
  return getNullableRecordInput(input, key) as CanvasSnapshotImageInput | undefined
}

function getStringParameter(parameters: XpertViewActionRequest['parameters'] | XpertViewQuery['parameters'], key: string) {
  const value = parameters?.[key]
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return undefined
}

function getActionErrorMessage(error: Error | string, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function removeKnownExtension(name: string | undefined) {
  const normalized = name?.trim()
  if (!normalized) {
    return undefined
  }
  return normalized.replace(/\.(tldr|tldraw|json)$/i, '') || normalized
}

function htmlLangFromLocale(locale: string | null | undefined) {
  return isChineseLocale(locale) ? 'zh-Hans' : 'en'
}

function isChineseLocale(locale: string | null | undefined) {
  return String(locale || '').toLowerCase().startsWith('zh')
}

function getProjectId(context: XpertResolvedViewHostContext) {
  const scoped = context as ProjectScopedViewHostContext
  return typeof scoped.projectId === 'string' && scoped.projectId.trim() ? scoped.projectId.trim() : null
}

function isJsonObject(value: CanvasJsonValue | object | null | undefined): value is CanvasJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isCanvasRecord(value: CanvasJsonValue | object | null | undefined): value is CanvasRecord {
  return isJsonObject(value) && typeof value.id === 'string'
}
