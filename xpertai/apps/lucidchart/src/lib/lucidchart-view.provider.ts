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
  LUCIDCHART_FEATURE,
  LUCIDCHART_ICON,
  LUCIDCHART_MIDDLEWARE_TOOL_NAMES,
  LUCIDCHART_PLUGIN_NAME,
  LUCIDCHART_PROVIDER_KEY,
  LUCIDCHART_REMOTE_ENTRY_KEY,
  LUCIDCHART_WORKBENCH_VIEW_KEY
} from './constants.js'
import { LucidchartService } from './lucidchart.service.js'
import type { LucidchartDocumentKind, LucidchartDocumentStatus, LucidchartProduct, LucidchartScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(LUCIDCHART_PROVIDER_KEY)
export class LucidchartViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: LucidchartService) {}

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
        key: LUCIDCHART_WORKBENCH_VIEW_KEY,
        title: text('Lucidchart Workbench', 'Lucidchart 工作台'),
        description: text(
          'Review, version, import, export, and register Agent-generated Lucidchart Standard Import drafts.',
          '审核、版本化、导入导出并登记 Agent 生成的 Lucidchart Standard Import 草稿。'
        ),
        icon: {
          type: 'svg',
          value: LUCIDCHART_ICON,
          color: '#2563eb',
          alt: 'Lucidchart'
        },
        hostType: 'agent',
        slot,
        order: 41,
        refreshable: true,
        activation: {
          requiredFeatures: [LUCIDCHART_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Lucidchart', 'Lucidchart'),
                  order: 41,
                  icon: {
                    type: 'svg',
                    value: LUCIDCHART_ICON,
                    alt: 'Lucidchart'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: LUCIDCHART_PROVIDER_KEY,
          plugin: LUCIDCHART_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: LUCIDCHART_REMOTE_ENTRY_KEY
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
              key: 'lucidchart-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...LUCIDCHART_MIDDLEWARE_TOOL_NAMES]
              },
              action: {
                type: 'refresh-and-forward',
                debounceMs: 800
              }
            }
          ]
        },
        clientCommands: [
          {
            key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          { key: 'create_document', label: text('New Document', '新建文档'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'save_standard_import_version', label: text('Save Standard Import', '保存 Standard Import'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'save_mermaid_draft', label: text('Save Mermaid Draft', '保存 Mermaid 草稿'), icon: 'ri-git-branch-line', actionType: 'invoke' },
          { key: 'register_external_document', label: text('Register Lucid Document', '登记 Lucid 文档'), icon: 'ri-link', actionType: 'invoke' },
          { key: 'restore_version', label: text('Restore Version', '恢复版本'), icon: 'ri-history-line', actionType: 'invoke' },
          { key: 'mark_reviewed', label: text('Mark Reviewed', '标记已审核'), icon: 'ri-check-line', actionType: 'invoke' },
          { key: 'mark_draft', label: text('Move Back to Draft', '退回草稿'), icon: 'ri-edit-line', actionType: 'invoke' },
          { key: 'archive_document', label: text('Archive Document', '归档文档'), icon: 'ri-archive-line', actionType: 'invoke' },
          {
            key: 'import_standard_import_file',
            label: text('Import document.json', '导入 document.json'),
            icon: 'ri-upload-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'prepare_agent_draw_message',
            label: text('Ask Assistant to Draw', '让 Assistant 绘图'),
            icon: 'ri-send-plane-line',
            placement: 'toolbar',
            actionType: 'invoke'
          }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== LUCIDCHART_WORKBENCH_VIEW_KEY || component.entry !== LUCIDCHART_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Lucidchart component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const componentDir = join(__dirname, 'remote-components', LUCIDCHART_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Lucidchart Workbench',
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
    if (viewKey !== LUCIDCHART_WORKBENCH_VIEW_KEY) {
      return {}
    }
    return this.service.getWorkbenchData(scopeFromContext(context), {
      documentId: getStringParameter(query.parameters, 'documentId') ?? query.selectionId,
      status: getStringParameter(query.parameters, 'status') as LucidchartDocumentStatus | undefined,
      kind: getStringParameter(query.parameters, 'kind') as LucidchartDocumentKind | undefined,
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
    if (viewKey !== LUCIDCHART_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Lucidchart view refreshed', 'Lucidchart 视图已刷新')
      }

      if (actionKey === 'create_document') {
        const result = await this.service.createDocument(scope, {
          title: requireStringInput(request.input, 'title', 'Lucidchart document title is required.'),
          description: getStringInput(request.input, 'description'),
          kind: getStringInput(request.input, 'kind') as LucidchartDocumentKind | undefined,
          tags: getStringArrayInput(request.input, 'tags'),
          source: 'workbench'
        })
        return {
          ...success('Lucidchart document created', 'Lucidchart 文档已创建'),
          data: result
        }
      }

      if (actionKey === 'save_standard_import_version') {
        const documentId = requireDocumentId(request)
        const result = await this.service.saveStandardImportVersion(scope, {
          documentId,
          standardImport: getRecordInput(request.input, 'standardImport'),
          mermaidSource: getStringInput(request.input, 'mermaidSource'),
          lucidDocumentId: getStringInput(request.input, 'lucidDocumentId'),
          lucidDocumentUrl: getStringInput(request.input, 'lucidDocumentUrl'),
          embedUrl: getStringInput(request.input, 'embedUrl'),
          embedId: getStringInput(request.input, 'embedId'),
          previewUrl: getStringInput(request.input, 'previewUrl'),
          product: getStringInput(request.input, 'product') as LucidchartProduct | undefined,
          importFileName: getStringInput(request.input, 'importFileName'),
          sourceType: 'workbench',
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Lucidchart Standard Import version saved', 'Lucidchart Standard Import 版本已保存'),
          data: result
        }
      }

      if (actionKey === 'save_mermaid_draft') {
        const result = await this.service.saveMermaidDraft(scope, {
          documentId: getStringInput(request.input, 'documentId') ?? getStringParameter(request.parameters, 'documentId') ?? request.targetId,
          title: getStringInput(request.input, 'title'),
          description: getStringInput(request.input, 'description'),
          kind: getStringInput(request.input, 'kind') as LucidchartDocumentKind | undefined,
          mermaidSource: requireStringInput(request.input, 'mermaidSource', 'Mermaid source is required.'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Mermaid draft saved', 'Mermaid 草稿已保存'),
          data: result
        }
      }

      if (actionKey === 'register_external_document') {
        const result = await this.service.registerExternalDocument(scope, {
          documentId: getStringInput(request.input, 'documentId') ?? getStringParameter(request.parameters, 'documentId') ?? request.targetId,
          title: getStringInput(request.input, 'title'),
          description: getStringInput(request.input, 'description'),
          kind: getStringInput(request.input, 'kind') as LucidchartDocumentKind | undefined,
          lucidDocumentId: getStringInput(request.input, 'lucidDocumentId'),
          lucidDocumentUrl: getStringInput(request.input, 'lucidDocumentUrl'),
          embedUrl: getStringInput(request.input, 'embedUrl'),
          embedId: getStringInput(request.input, 'embedId'),
          previewUrl: getStringInput(request.input, 'previewUrl'),
          product: getStringInput(request.input, 'product') as LucidchartProduct | undefined,
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Lucid document registered', 'Lucid 文档已登记'),
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
          ...success('Lucidchart version restored', 'Lucidchart 版本已恢复'),
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
          ...success('Lucidchart document archived', 'Lucidchart 文档已归档'),
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
            status === 'reviewed' ? 'Lucidchart document marked as reviewed' : 'Lucidchart document moved back to draft',
            status === 'reviewed' ? 'Lucidchart 文档已标记为已审核' : 'Lucidchart 文档已退回草稿'
          ),
          data: result
        }
      }

      if (actionKey === 'prepare_agent_draw_message') {
        const prompt = requireStringInput(request.input, 'prompt', 'Drawing request is required.')
        return {
          ...success('Assistant draw request prepared', 'Assistant 绘图请求已准备'),
          data: {
            commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
            payload: {
              text: buildAgentDrawPrompt(prompt, getStringInput(request.input, 'documentId'))
            }
          },
          refresh: false
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Lucidchart action failed')
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
    if (viewKey !== LUCIDCHART_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }
    if (actionKey !== 'import_standard_import_file') {
      return failure('Unsupported file action', '不支持的文件操作')
    }

    try {
      const imported = parseStandardImportFile(file)
      const documentId = getStringInput(request.input, 'documentId') ?? getStringParameter(request.parameters, 'documentId')
      const scope = scopeFromContext(context)
      const result = documentId
        ? await this.service.saveStandardImportVersion(scope, {
            documentId,
            standardImport: imported.standardImport,
            mermaidSource: imported.mermaidSource,
            sourceType: 'import',
            importFileName: file.originalname ?? 'document.json',
            changeSummary: `Imported ${file.originalname ?? 'document.json'}`
          })
        : await this.service.createDocument(scope, {
            title: getStringInput(request.input, 'title') ?? removeLucidchartExtension(file.originalname) ?? 'Imported Lucidchart Document',
            description: getStringInput(request.input, 'description'),
            kind: 'diagram',
            source: 'import',
            standardImport: imported.standardImport,
            mermaidSource: imported.mermaidSource,
            importFileName: file.originalname ?? 'document.json',
            changeSummary: `Imported ${file.originalname ?? 'document.json'}`
          })

      return {
        ...success('Lucidchart Standard Import file imported', 'Lucidchart Standard Import 文件已导入'),
        data: result
      }
    } catch (error) {
      const message = getActionErrorMessage(error, 'Failed to import Lucidchart Standard Import file')
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

function scopeFromContext(context: XpertResolvedViewHostContext): LucidchartScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: null,
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
    requireString(request.targetId, 'Lucidchart document id is required.')
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

function getStringArrayInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function getRecordInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function getStringParameter(parameters: XpertViewActionRequest['parameters'] | XpertViewQuery['parameters'], key: string) {
  const value = parameters?.[key]
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return undefined
}

function getActionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function parseStandardImportFile(file: XpertViewFileActionFile) {
  const raw = file.buffer.toString('utf8')
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('PK')) {
    throw new Error('Please import Lucid Standard Import document.json, not a zipped .lucid file.')
  }
  const parsed = JSON.parse(trimmed) as Record<string, unknown>
  const standardImport =
    parsed.standardImport && typeof parsed.standardImport === 'object' && !Array.isArray(parsed.standardImport)
      ? (parsed.standardImport as Record<string, unknown>)
      : parsed
  return {
    standardImport,
    mermaidSource: typeof parsed.mermaidSource === 'string' ? parsed.mermaidSource : undefined
  }
}

function removeLucidchartExtension(name: string | undefined) {
  const normalized = name?.trim()
  if (!normalized) {
    return undefined
  }
  return normalized.replace(/\.(lucid|lucidchart|json)(?:\.json)?$/i, '').replace(/document$/i, 'Lucidchart Document') || normalized
}

function buildAgentDrawPrompt(prompt: string, documentId?: string) {
  const context = documentId ? `请更新当前 Lucidchart 文档 documentId=${documentId}。` : '请创建一份新的 Lucidchart 文档草稿。'
  return `${context}

用户绘图需求：
${prompt}

请优先判断路径：
1. 能直接表达为 Lucid Standard Import document.json 时，调用 lucidchart_save_standard_import_version 或 lucidchart_create_document。
2. 还需要推敲流程/结构时，先调用 lucidchart_save_mermaid_draft 保存 Mermaid 草稿。
3. 如果用户已有真实 Lucid 文档 URL 或 Embed URL，调用 lucidchart_register_external_document 登记。
更新已有文档前先调用 lucidchart_get_document。不要声称已创建真实 Lucid 文件，除非你登记了真实 Lucid 文档链接。`
}
