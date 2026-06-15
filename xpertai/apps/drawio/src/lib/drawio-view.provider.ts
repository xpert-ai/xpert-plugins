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
  DRAWIO_FEATURE,
  DRAWIO_ICON,
  DRAWIO_MIDDLEWARE_TOOL_NAMES,
  DRAWIO_PLUGIN_NAME,
  DRAWIO_PROVIDER_KEY,
  DRAWIO_REMOTE_ENTRY_KEY,
  DRAWIO_WORKBENCH_VIEW_KEY
} from './constants.js'
import { DrawioService } from './drawio.service.js'
import type { DrawioDrawingKind, DrawioDrawingStatus, DrawioScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(DRAWIO_PROVIDER_KEY)
export class DrawioViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: DrawioService) {}

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
        key: DRAWIO_WORKBENCH_VIEW_KEY,
        title: text('draw.io Workbench', 'draw.io 绘图工作台'),
        description: text(
          'Create, review, edit, version, import, export, and convert Agent-generated diagrams.',
          '创建、审核、编辑、版本化、导入导出并转换 Agent 生成的图形。'
        ),
        icon: {
          type: 'svg',
          value: DRAWIO_ICON,
          color: '#f59e0b',
          alt: 'draw.io'
        },
        hostType: 'agent',
        slot,
        order: 40,
        refreshable: true,
        activation: {
          requiredFeatures: [DRAWIO_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('draw.io', 'draw.io 绘图'),
                  order: 40,
                  icon: {
                    type: 'svg',
                    value: DRAWIO_ICON,
                    alt: 'draw.io'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: DRAWIO_PROVIDER_KEY,
          plugin: DRAWIO_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: DRAWIO_REMOTE_ENTRY_KEY
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
              key: 'drawio-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...DRAWIO_MIDDLEWARE_TOOL_NAMES]
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
            key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          { key: 'create_drawing', label: text('New Drawing', '新建图形'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'save_scene_version', label: text('Save Version', '保存版本'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'restore_version', label: text('Restore Version', '恢复版本'), icon: 'ri-history-line', actionType: 'invoke' },
          { key: 'mark_reviewed', label: text('Mark Reviewed', '标记已审核'), icon: 'ri-check-line', actionType: 'invoke' },
          { key: 'mark_draft', label: text('Move Back to Draft', '退回草稿'), icon: 'ri-edit-line', actionType: 'invoke' },
          { key: 'archive_drawing', label: text('Archive Drawing', '归档图形'), icon: 'ri-archive-line', actionType: 'invoke' },
          {
            key: 'import_scene_file',
            label: text('Import draw.io File', '导入 draw.io 文件'),
            icon: 'ri-upload-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'save_converted_mermaid_scene',
            label: text('Save Converted Mermaid Scene', '保存 Mermaid 转换结果'),
            icon: 'ri-git-branch-line',
            actionType: 'invoke'
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
    if (viewKey !== DRAWIO_WORKBENCH_VIEW_KEY || component.entry !== DRAWIO_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported draw.io component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const componentDir = join(__dirname, 'remote-components', DRAWIO_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'draw.io Workbench',
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
    if (viewKey !== DRAWIO_WORKBENCH_VIEW_KEY) {
      return {}
    }
    return this.service.getWorkbenchData(scopeFromContext(context), {
      drawingId: getStringParameter(query.parameters, 'drawingId') ?? query.selectionId,
      status: getStringParameter(query.parameters, 'status') as DrawioDrawingStatus | undefined,
      kind: getStringParameter(query.parameters, 'kind') as DrawioDrawingKind | undefined,
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
    if (viewKey !== DRAWIO_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('draw.io view refreshed', 'draw.io 视图已刷新')
      }

      if (actionKey === 'create_drawing') {
        const result = await this.service.createDrawing(scope, {
          title: requireStringInput(request.input, 'title', 'Diagram title is required.'),
          description: getStringInput(request.input, 'description'),
          kind: getStringInput(request.input, 'kind') as DrawioDrawingKind | undefined,
          tags: getStringArrayInput(request.input, 'tags'),
          source: 'workbench'
        })
        return {
          ...success('Diagram created', '图形已创建'),
          data: result
        }
      }

      if (actionKey === 'save_scene_version' || actionKey === 'save_converted_mermaid_scene') {
        const drawingId = requireDrawingId(request)
        const result = await this.service.saveSceneVersion(scope, {
          drawingId,
          xml: getStringInput(request.input, 'xml'),
          mermaidSource: getStringInput(request.input, 'mermaidSource'),
          previewSvg: getStringInput(request.input, 'previewSvg'),
          previewPng: getStringInput(request.input, 'previewPng'),
          descriptor: getRecordInput(request.input, 'descriptor'),
          sourceType: actionKey === 'save_converted_mermaid_scene' ? 'workbench_mermaid' : 'workbench',
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Diagram version saved', '图形版本已保存'),
          data: result
        }
      }

      if (actionKey === 'restore_version') {
        const result = await this.service.restoreVersion(
          scope,
          requireDrawingId(request),
          requireStringInput(request.input, 'versionId', 'Version id is required.'),
          getStringInput(request.input, 'changeSummary')
        )
        return {
          ...success('Diagram version restored', '图形版本已恢复'),
          data: result
        }
      }

      if (actionKey === 'archive_drawing') {
        const result = await this.service.updateDrawingStatus(scope, {
          drawingId: requireDrawingId(request),
          status: 'archived',
          reason: getStringInput(request.input, 'reason')
        })
        return {
          ...success('Diagram archived', '图形已归档'),
          data: result
        }
      }

      if (actionKey === 'mark_reviewed' || actionKey === 'mark_draft') {
        const status = actionKey === 'mark_reviewed' ? 'reviewed' : 'draft'
        const result = await this.service.updateDrawingStatus(scope, {
          drawingId: requireDrawingId(request),
          status,
          reason: getStringInput(request.input, 'reason')
        })
        return {
          ...success(
            status === 'reviewed' ? 'Diagram marked as reviewed' : 'Diagram moved back to draft',
            status === 'reviewed' ? '图形已标记为已审核' : '图形已退回草稿'
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
              text: buildAgentDrawPrompt(prompt, getStringInput(request.input, 'drawingId'))
            }
          },
          refresh: false
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
        const message = getActionErrorMessage(error, 'draw.io action failed')
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
    if (viewKey !== DRAWIO_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }
    if (actionKey !== 'import_scene_file') {
      return failure('Unsupported file action', '不支持的文件操作')
    }

    try {
      const scene = parseDrawioFile(file)
      const drawingId = getStringInput(request.input, 'drawingId') ?? getStringParameter(request.parameters, 'drawingId')
      const scope = scopeFromContext(context)
      const result = drawingId
        ? await this.service.saveSceneVersion(scope, {
            drawingId,
            xml: scene.xml,
            mermaidSource: scene.mermaidSource,
            previewSvg: scene.previewSvg,
            previewPng: scene.previewPng,
            descriptor: scene.descriptor,
            sourceType: 'import',
            changeSummary: `Imported ${file.originalname ?? 'draw.io file'}`
          })
        : await this.service.createDrawing(scope, {
            title: getStringInput(request.input, 'title') ?? removeDrawioExtension(file.originalname) ?? 'Imported draw.io Diagram',
            description: getStringInput(request.input, 'description'),
            kind: 'diagram',
            source: 'import',
            xml: scene.xml,
            mermaidSource: scene.mermaidSource,
            previewSvg: scene.previewSvg,
            previewPng: scene.previewPng,
            descriptor: scene.descriptor,
            changeSummary: `Imported ${file.originalname ?? 'draw.io file'}`
          })

      return {
        ...success('draw.io file imported', 'draw.io 文件已导入'),
        data: result
      }
    } catch (error) {
      const message = getActionErrorMessage(error, 'Failed to import draw.io file')
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

function scopeFromContext(context: XpertResolvedViewHostContext): DrawioScope {
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

function requireDrawingId(request: XpertViewActionRequest) {
  return (
    getStringInput(request.input, 'drawingId') ??
    getStringParameter(request.parameters, 'drawingId') ??
    requireString(request.targetId, 'Drawing id is required.')
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

function parseDrawioFile(file: XpertViewFileActionFile) {
  const raw = file.buffer.toString('utf8')
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    return {
      xml: typeof parsed.xml === 'string' ? parsed.xml : null,
      mermaidSource: typeof parsed.mermaidSource === 'string' ? parsed.mermaidSource : null,
      previewSvg: typeof parsed.previewSvg === 'string' ? parsed.previewSvg : null,
      previewPng: typeof parsed.previewPng === 'string' ? parsed.previewPng : null,
      descriptor: parsed.descriptor && typeof parsed.descriptor === 'object' && !Array.isArray(parsed.descriptor)
        ? (parsed.descriptor as Record<string, unknown>)
        : {}
    }
  }
  return {
    xml: trimmed,
    mermaidSource: null,
    previewSvg: trimmed.startsWith('<svg') ? trimmed : null,
    previewPng: null,
    descriptor: {}
  }
}

function removeDrawioExtension(name: string | undefined) {
  const normalized = name?.trim()
  if (!normalized) {
    return undefined
  }
  return normalized.replace(/\.(drawio|diagram|xml)(?:\.json)?$/i, '').replace(/\.json$/i, '') || normalized
}

function buildAgentDrawPrompt(prompt: string, drawingId?: string) {
  const context = drawingId ? `请更新当前 draw.io 图形 drawingId=${drawingId}。` : '请创建一张新的 draw.io 图形。'
  return `${context}

用户绘图需求：
${prompt}

请优先判断是否适合 Mermaid 草稿；流程图、架构流、状态流可调用 drawio_save_mermaid_draft。需要精确布局或自由图形时，生成 diagrams.net/draw.io XML 并调用 drawio_create_diagram、drawio_save_scene_version 或 drawio_patch_scene。更新已有图形前先调用 drawio_get_diagram。`
}
