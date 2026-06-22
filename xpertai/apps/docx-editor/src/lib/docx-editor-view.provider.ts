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
  DOCX_EDITOR_FEATURE,
  DOCX_EDITOR_HOST_EVENT_TOOL_NAMES,
  DOCX_EDITOR_ICON,
  DOCX_EDITOR_PLUGIN_NAME,
  DOCX_EDITOR_PROVIDER_KEY,
  DOCX_EDITOR_REMOTE_ENTRY_KEY,
  DOCX_EDITOR_VIEW_KEY,
  DOCX_EDITOR_WORKBENCH_CAPABILITY,
  PROJECT_DETAIL_SECTIONS_SLOT
} from './constants.js'
import { DocxEditorService } from './docx-editor.service.js'
import type { DocxEditorScope, DocxEditorOperationStatus } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const DOCX_EDITOR_VIEW_ICON = {
  type: 'svg',
  value: DOCX_EDITOR_ICON,
  alt: 'DOCX Editor'
} satisfies IconDefinition
const DOCX_EDITOR_VIEW_ICON_COMPAT = DOCX_EDITOR_VIEW_ICON as unknown as XpertExtensionViewManifest['icon']

@Injectable()
@ViewExtensionProvider(DOCX_EDITOR_PROVIDER_KEY)
export class DocxEditorViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: DocxEditorService) {}

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
        key: DOCX_EDITOR_VIEW_KEY,
        title: text('DOCX Editor', 'DOCX 文档编辑器'),
        description: text(
          'Upload, edit, version, comment, and review .docx documents with Xpert Agent tools.',
          '上传、编辑、版本化、批注和审阅 .docx 文档，并通过 Xpert Agent 工具协作。'
        ),
        icon: DOCX_EDITOR_VIEW_ICON_COMPAT,
        hostType: context.hostType,
        slot,
        order: 40,
        refreshable: true,
        activation: {
          requiredFeatures: [DOCX_EDITOR_FEATURE]
        },
        ...(isAgentFixedWorkbench
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('DOCX Editor', 'DOCX 文档编辑器'),
                  order: 40,
                  icon: DOCX_EDITOR_VIEW_ICON_COMPAT
                }
              }
            }
          : {}),
        source: {
          provider: DOCX_EDITOR_PROVIDER_KEY,
          plugin: DOCX_EDITOR_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: DOCX_EDITOR_REMOTE_ENTRY_KEY
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
              key: 'docx-editor-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...DOCX_EDITOR_HOST_EVENT_TOOL_NAMES]
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
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          },
          {
            key: 'assistant.context.set',
            label: text('Set Assistant Context', '设置 Assistant 上下文')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          { key: 'create_document', label: text('New DOCX Document', '新建 DOCX 文档'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'upload_docx', label: text('Upload DOCX', '上传 DOCX'), icon: 'ri-upload-cloud-2-line', placement: 'toolbar', actionType: 'invoke', transport: 'file' },
          { key: 'save_document_version', label: text('Save Version', '保存版本'), icon: 'ri-save-line', actionType: 'invoke' },
          { key: 'sync_snapshot', label: text('Sync Snapshot', '同步快照'), icon: 'ri-refresh-line', actionType: 'invoke' },
          { key: 'complete_operation', label: text('Complete Operation', '完成操作'), actionType: 'invoke' },
          { key: 'delete_document', label: text('Delete Document', '删除文档'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          { key: 'restore_version', label: text('Restore Version', '恢复版本'), icon: 'ri-history-line', actionType: 'invoke' },
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
    if (viewKey !== DOCX_EDITOR_VIEW_KEY || component.entry !== DOCX_EDITOR_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported DOCX Editor component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const componentDir = join(__dirname, 'remote-components', DOCX_EDITOR_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'DOCX Editor',
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
    if (viewKey !== DOCX_EDITOR_VIEW_KEY) {
      return {}
    }
    return this.service.getWorkbenchData(scopeFromContext(context), {
      documentId: getStringParameter(query.parameters, 'documentId') ?? query.selectionId,
      versionId: getStringParameter(query.parameters, 'versionId'),
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
    if (viewKey !== DOCX_EDITOR_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)

      if (actionKey === 'refresh') {
        return success('DOCX Editor refreshed', 'DOCX 文档编辑器已刷新')
      }

      if (actionKey === 'create_document') {
        const result = await this.service.createDocument(scope, {
          title: requireStringInput(request.input, 'title', 'Document title is required.'),
          description: getStringInput(request.input, 'description'),
          assistantId: getActionXpertId(context, request.input),
          conversationId: getStringInput(request.input, 'conversationId')
        })
        return { ...success('DOCX document created', 'DOCX 文档已创建'), data: result }
      }

      if (actionKey === 'save_document_version') {
        const result = await this.service.saveDocumentVersion(scope, {
          documentId: requireDocumentId(request),
          docxBase64: requireStringInput(request.input, 'docxBase64', 'DOCX base64 payload is required.'),
          title: getStringInput(request.input, 'title'),
          description: getStringInput(request.input, 'description'),
          fileName: getStringInput(request.input, 'fileName'),
          mimeType: getStringInput(request.input, 'mimeType'),
          size: getNumberInput(request.input, 'size'),
          source: 'workbench',
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('DOCX version saved', 'DOCX 版本已保存'), data: result }
      }

      if (actionKey === 'sync_snapshot') {
        const result = await this.service.syncSnapshot(scope, {
          documentId: requireDocumentId(request),
          versionId: getStringInput(request.input, 'versionId'),
          contentText: getStringInput(request.input, 'contentText'),
          paragraphCount: getNumberInput(request.input, 'paragraphCount'),
          totalPages: getNumberInput(request.input, 'totalPages'),
          currentPage: getNumberInput(request.input, 'currentPage'),
          selection: getUnknownInput(request.input, 'selection'),
          comments: getUnknownInput(request.input, 'comments'),
          changes: getUnknownInput(request.input, 'changes'),
          pages: getUnknownInput(request.input, 'pages')
        })
        return { ...success('DOCX snapshot synced', 'DOCX 快照已同步'), data: result, refresh: false }
      }

      if (actionKey === 'complete_operation') {
        const result = await this.service.completeOperation(scope, {
          operationId: requireStringInput(request.input, 'operationId', 'Operation id is required.'),
          status: requireStringInput(request.input, 'status', 'Operation status is required.') as DocxEditorOperationStatus,
          result: getUnknownInput(request.input, 'result'),
          errorMessage: getStringInput(request.input, 'errorMessage')
        })
        return { ...success('DOCX operation completed', 'DOCX 操作已完成'), data: result }
      }

      if (actionKey === 'delete_document') {
        const result = await this.service.deleteDocument(scope, requireDocumentId(request))
        return { ...success('DOCX document deleted', 'DOCX 文档已删除'), data: result }
      }

      if (actionKey === 'restore_version') {
        const result = await this.service.restoreVersion(scope, {
          documentId: requireDocumentId(request),
          versionId: requireStringInput(request.input, 'versionId', 'Version id is required.'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('DOCX version restored', 'DOCX 版本已恢复'), data: result }
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
      const message = getActionErrorMessage(error, 'DOCX Editor action failed.')
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
    if (viewKey !== DOCX_EDITOR_VIEW_KEY || actionKey !== 'upload_docx') {
      return failure('Unsupported file action', '不支持的文件操作')
    }

    try {
      const fileName = getFileDisplayName(file, request.input)
      const result = await this.service.uploadDocx(scopeFromContext(context), {
        documentId: getStringInput(request.input, 'documentId') ?? getStringParameter(request.parameters, 'documentId') ?? request.targetId,
        title: getStringInput(request.input, 'title') ?? fileName.replace(/\.docx$/i, ''),
        description: getStringInput(request.input, 'description'),
        fileName,
        mimeType: file.mimetype ?? getStringInput(request.input, 'mimeType'),
        size: file.size,
        docxBase64: file.buffer.toString('base64')
      })
      return {
        ...success('DOCX file uploaded', 'DOCX 文件已上传'),
        data: result
      }
    } catch (error) {
      const message = getActionErrorMessage(error, 'DOCX file upload failed.')
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

function scopeFromContext(context: XpertResolvedViewHostContext): DocxEditorScope {
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
    requireString(request.targetId, 'DOCX document id is required.')
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

function getUnknownInput(input: XpertViewActionRequest['input'], key: string) {
  return input && key in input ? input[key] : undefined
}

function getStringParameter(parameters: XpertViewQuery['parameters'] | XpertViewActionRequest['parameters'], key: string) {
  const value = parameters?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getFileDisplayName(file: XpertViewFileActionFile, input: XpertViewActionRequest['input']) {
  return getStringInput(input, 'name') ?? file.originalname ?? 'uploaded.docx'
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
