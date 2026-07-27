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
import {
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  XpertViewFileActionFile
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  OFFICE_EDITOR_FEATURE,
  OFFICE_EDITOR_ICON,
  OFFICE_EDITOR_MIDDLEWARE_NAME,
  OFFICE_EDITOR_PLUGIN_NAME,
  OFFICE_EDITOR_PROVIDER_KEY,
  OFFICE_EDITOR_REMOTE_ENTRY_KEY,
  OFFICE_EDITOR_TOOL_NAMES,
  OFFICE_EDITOR_VIEW_KEY,
  OFFICE_EDITOR_WORKBENCH_CAPABILITY,
  PROJECT_DETAIL_SECTIONS_SLOT
} from './constants.js'
import { OfficeEditorService } from './office-editor.service.js'
import type {
  OfficeDocumentType,
  OfficeImportFormat,
  OfficeOperationInput,
  OfficeOperationStatus,
  OfficeScope
} from './types.js'

const moduleFilename = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilename)
const requireFromHere = createRequire(moduleFilename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const OFFICE_EDITOR_VIEW_ICON = {
  type: 'svg',
  value: OFFICE_EDITOR_ICON,
  alt: 'Office Editor'
} satisfies IconDefinition
const OFFICE_EDITOR_VIEW_ICON_COMPAT = OFFICE_EDITOR_VIEW_ICON as unknown as XpertExtensionViewManifest['icon']

@Injectable()
@ViewExtensionProvider(OFFICE_EDITOR_PROVIDER_KEY)
export class OfficeEditorViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: OfficeEditorService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'project' || context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!isSupportedSlot(context, slot)) {
      return []
    }
    const isAgentFixedWorkbench = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT

    return [
      {
        key: OFFICE_EDITOR_VIEW_KEY,
        title: text('Office Editor', 'Office 协作编辑器'),
        description: text(
          'Build and edit Univer-native spreadsheets, documents, and presentations with Agents and humans.',
          '通过 Agent 与人工协作创建和编辑 Univer 原生电子表格、文档和演示稿。'
        ),
        icon: OFFICE_EDITOR_VIEW_ICON_COMPAT,
        hostType: context.hostType,
        slot,
        order: 42,
        refreshable: true,
        activation: {
          requiredFeatures: [OFFICE_EDITOR_FEATURE]
        },
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Office Editor', 'Office 协作编辑器'),
                  order: 42,
                  icon: OFFICE_EDITOR_VIEW_ICON_COMPAT
                }
              }
            }
          : {}),
        source: {
          provider: OFFICE_EDITOR_PROVIDER_KEY,
          plugin: OFFICE_EDITOR_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: OFFICE_EDITOR_REMOTE_ENTRY_KEY
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
              key: 'office-editor-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...OFFICE_EDITOR_TOOL_NAMES]
              },
              action: {
                type: 'refresh-and-forward',
                debounceMs: 1000
              }
            }
          ]
        },
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          { key: 'create_document', label: text('New Office Document', '新建 Office 文档'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'import_document', label: text('Import Office File', '导入 Office 文件'), icon: 'ri-upload-cloud-2-line', placement: 'toolbar', actionType: 'invoke', transport: 'file' },
          { key: 'get_excel_file', label: text('Download XLSX', '下载 XLSX'), icon: 'ri-download-line', actionType: 'invoke' },
          { key: 'open_document', label: text('Open Document', '打开文档'), actionType: 'invoke' },
          { key: 'save_snapshot', label: text('Save Snapshot', '保存快照'), icon: 'ri-save-line', actionType: 'invoke' },
          { key: 'sync_yjs_state', label: text('Sync Collaboration State', '同步协作状态'), actionType: 'invoke' },
          { key: 'queue_operation', label: text('Queue Operation', '排队操作'), actionType: 'invoke' },
          { key: 'complete_operation', label: text('Complete Operation', '完成操作'), actionType: 'invoke' },
          { key: 'delete_document', label: text('Delete Document', '删除文档'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          { key: 'prepare_assistant_prompt', label: text('Ask Assistant', '询问助手'), icon: 'ri-magic-line', actionType: 'invoke' }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== OFFICE_EDITOR_VIEW_KEY || component.entry !== OFFICE_EDITOR_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Office Editor component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const componentDir = join(moduleDir, 'remote-components', OFFICE_EDITOR_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Office Editor',
        lang: 'zh-Hans',
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
    if (viewKey !== OFFICE_EDITOR_VIEW_KEY) {
      return {}
    }
    return this.service.getWorkbenchData(scopeFromContext(context), {
      documentId: getStringParameter(query.parameters, 'documentId') ?? query.selectionId,
      documentType: getStringParameter(query.parameters, 'documentType') as OfficeDocumentType | undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== OFFICE_EDITOR_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('Office Editor refreshed', 'Office 协作编辑器已刷新')
      }

      if (actionKey === 'create_document') {
        const result = await this.service.createDocument(scope, {
          documentType: requireStringInput(request.input, 'documentType', 'Office documentType is required.') as OfficeDocumentType,
          title: requireStringInput(request.input, 'title', 'Office document title is required.'),
          description: getStringInput(request.input, 'description'),
          initialSnapshot: getUnknownInput(request.input, 'initialSnapshot'),
          assistantId: getActionXpertId(context, request.input),
          conversationId: getStringInput(request.input, 'conversationId')
        })
        return { ...success('Office document created', 'Office 文档已创建'), data: result }
      }

      if (actionKey === 'open_document') {
        const result = await this.service.openDocument(scope, requireDocumentId(request))
        return { ...success('Office document opened', 'Office 文档已打开'), data: result, refresh: false }
      }

      if (actionKey === 'get_excel_file') {
        const result = await this.service.getExcelFile(scope, requireDocumentId(request), true)
        return { ...success('Excel file prepared', 'Excel 文件已准备'), data: result, refresh: false }
      }

      if (actionKey === 'save_snapshot') {
        const result = await this.service.saveSnapshot(scope, {
          documentId: requireDocumentId(request),
          snapshot: requireUnknownInput(request.input, 'snapshot', 'Office snapshot is required.'),
          snapshotText: getStringInput(request.input, 'snapshotText'),
          source: 'workbench',
          yjsStateBase64: getStringInput(request.input, 'yjsStateBase64'),
          yjsStateVectorBase64: getStringInput(request.input, 'yjsStateVectorBase64'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Office snapshot saved', 'Office 快照已保存'), data: result }
      }

      if (actionKey === 'sync_yjs_state') {
        const result = await this.service.syncYjsState(scope, {
          documentId: requireDocumentId(request),
          updateBase64: getStringInput(request.input, 'updateBase64'),
          fullStateBase64: getStringInput(request.input, 'fullStateBase64'),
          stateVectorBase64: getStringInput(request.input, 'stateVectorBase64'),
          snapshot: getUnknownInput(request.input, 'snapshot'),
          snapshotText: getStringInput(request.input, 'snapshotText'),
          origin: getStringInput(request.input, 'origin'),
          clientId: getStringInput(request.input, 'clientId')
        })
        return { ...success('Office collaboration state synced', 'Office 协作状态已同步'), data: result, refresh: false }
      }

      if (actionKey === 'queue_operation') {
        const operation = requireUnknownInput(request.input, 'operation', 'Office operation is required.') as OfficeOperationInput
        const result = await this.service.queueOperation(scope, {
          documentId: requireDocumentId(request),
          operationType: operation.operationType,
          input: operation,
          reviewNote: getStringInput(request.input, 'reviewNote'),
          confidence: getNumberInput(request.input, 'confidence'),
          source: 'workbench'
        })
        return { ...success('Office operation queued', 'Office 操作已排队'), data: result }
      }

      if (actionKey === 'complete_operation') {
        const result = await this.service.completeOperation(scope, {
          operationId: requireStringInput(request.input, 'operationId', 'Operation id is required.'),
          status: requireStringInput(request.input, 'status', 'Operation status is required.') as OfficeOperationStatus,
          result: getUnknownInput(request.input, 'result'),
          errorMessage: getStringInput(request.input, 'errorMessage')
        })
        return { ...success('Office operation completed', 'Office 操作已完成'), data: result }
      }

      if (actionKey === 'delete_document') {
        const result = await this.service.deleteDocument(scope, requireDocumentId(request))
        return { ...success('Office document deleted', 'Office 文档已删除'), data: result }
      }

      if (actionKey === 'prepare_assistant_prompt') {
        const result = await this.service.prepareAssistantPrompt(scope, {
          documentId: requireDocumentId(request),
          instruction: getStringInput(request.input, 'instruction')
        })
        return {
          ...success('Assistant prompt prepared', 'Assistant 指令已准备'),
          data: result,
          refresh: false
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Office Editor action failed.')
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
    if (viewKey !== OFFICE_EDITOR_VIEW_KEY || actionKey !== 'import_document') {
      return failure('Unsupported file action', '不支持的文件操作')
    }

    try {
      const fileName = getFileDisplayName(file, request.input)
      const result = await this.service.importDocument(scopeFromContext(context), {
        importFormat: requireStringInput(request.input, 'importFormat', 'Office importFormat is required.') as OfficeImportFormat,
        documentType: requireStringInput(request.input, 'documentType', 'Office documentType is required.') as OfficeDocumentType,
        title: getStringInput(request.input, 'title') ?? stripKnownExtension(fileName),
        description: getStringInput(request.input, 'description'),
        fileName,
        mimeType: file.mimetype ?? getStringInput(request.input, 'mimeType'),
        size: file.size,
        fileBase64: file.buffer.toString('base64'),
        assistantId: getActionXpertId(context, request.input),
        conversationId: getStringInput(request.input, 'conversationId')
      })
      return {
        ...success('Office file imported', 'Office 文件已导入'),
        data: result
      }
    } catch (error) {
      const message = getActionErrorMessage(error, 'Office file import failed.')
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

function isSupportedSlot(context: XpertResolvedViewHostContext, slot: string) {
  if (context.hostType === 'project') {
    return slot === PROJECT_DETAIL_SECTIONS_SLOT
  }
  if (context.hostType === 'agent') {
    return slot === AGENT_WORKBENCH_FIXED_SLOT || slot === AGENT_WORKBENCH_MAIN_SLOT
  }
  return false
}

function scopeFromContext(context: XpertResolvedViewHostContext): OfficeScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null,
    userId: context.userId,
    assistantId: context.hostType === 'agent' ? context.hostId : null
  }
}

function getActionXpertId(context: XpertResolvedViewHostContext, input: XpertViewActionRequest['input']) {
  return getStringInput(input, 'xpertId') ?? (context.hostType === 'agent' ? context.hostId : undefined)
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
    requireString(request.targetId, 'Office document id is required.')
  )
}

function requireStringInput(input: XpertViewActionRequest['input'], key: string, message: string) {
  return requireString(getStringInput(input, key), message)
}

function requireUnknownInput(input: XpertViewActionRequest['input'], key: string, message: string) {
  const value = getUnknownInput(input, key)
  if (value === undefined) {
    throw new Error(message)
  }
  return value
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

function getUnknownInput(input: XpertViewActionRequest['input'], key: string) {
  return input && key in input ? input[key] : undefined
}

function getStringParameter(parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'], key: string) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getFileDisplayName(file: XpertViewFileActionFile, input: XpertViewActionRequest['input']) {
  return getStringInput(input, 'name') ?? file.originalname ?? 'uploaded.office'
}

function stripKnownExtension(fileName: string) {
  return fileName.replace(/\.(xlsx|docx|pptx)$/i, '').trim() || 'Imported Office document'
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
