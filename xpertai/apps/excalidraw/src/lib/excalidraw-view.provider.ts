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
  ASSISTANT_CONTEXT_SET_COMMAND,
  EXCALIDRAW_FEATURE,
  EXCALIDRAW_ICON,
  EXCALIDRAW_MIDDLEWARE_TOOL_NAMES,
  EXCALIDRAW_PLUGIN_NAME,
  EXCALIDRAW_PROVIDER_KEY,
  EXCALIDRAW_REMOTE_ENTRY_KEY,
  EXCALIDRAW_WORKBENCH_VIEW_KEY
} from './constants.js'
import { ExcalidrawService } from './excalidraw.service.js'
import type { ExcalidrawDrawingKind, ExcalidrawDrawingStatus, ExcalidrawScope } from './types.js'

const moduleFilename = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilename)
const requireFromHere = createRequire(moduleFilename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(EXCALIDRAW_PROVIDER_KEY)
export class ExcalidrawViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ExcalidrawService) {}

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
        key: EXCALIDRAW_WORKBENCH_VIEW_KEY,
        title: text('Excalidraw Workbench', 'Excalidraw 绘图工作台'),
        description: text(
          'Create, review, edit, version, import, export, and convert Agent-generated diagrams.',
          '创建、审核、编辑、版本化、导入导出并转换 Agent 生成的图形。'
        ),
        icon: {
          type: 'svg',
          value: EXCALIDRAW_ICON,
          color: '#2563eb',
          alt: 'Excalidraw'
        },
        hostType: 'agent',
        slot,
        order: 40,
        refreshable: true,
        activation: {
          requiredFeatures: [EXCALIDRAW_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Excalidraw', 'Excalidraw 绘图'),
                  order: 40,
                  icon: {
                    type: 'svg',
                    value: EXCALIDRAW_ICON,
                    alt: 'Excalidraw'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: EXCALIDRAW_PROVIDER_KEY,
          plugin: EXCALIDRAW_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: EXCALIDRAW_REMOTE_ENTRY_KEY
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
              key: 'excalidraw-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...EXCALIDRAW_MIDDLEWARE_TOOL_NAMES]
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
          }
        ],
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          { key: 'create_drawing', label: text('New Drawing', '新建图形'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'save_current_scene', label: text('Save', '保存'), icon: 'ri-save-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'save_scene_version', label: text('New Version', '新建版本'), icon: 'ri-file-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'restore_version', label: text('Restore Version', '恢复版本'), icon: 'ri-history-line', actionType: 'invoke' },
          { key: 'mark_reviewed', label: text('Mark Reviewed', '标记已审核'), icon: 'ri-check-line', actionType: 'invoke' },
          { key: 'mark_draft', label: text('Move Back to Draft', '退回草稿'), icon: 'ri-edit-line', actionType: 'invoke' },
          { key: 'archive_drawing', label: text('Archive Drawing', '归档图形'), icon: 'ri-archive-line', actionType: 'invoke' },
          { key: 'delete_drawing', label: text('Delete Drawing', '删除图形'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          { key: 'delete_version', label: text('Delete Version', '删除版本'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          {
            key: 'import_scene_file',
            label: text('Import Excalidraw File', '导入 Excalidraw 文件'),
            icon: 'ri-upload-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'import_restored_scene',
            label: text('Import Restored Excalidraw Scene', '导入已归一化 Excalidraw 场景'),
            icon: 'ri-upload-cloud-line',
            actionType: 'invoke'
          },
          {
            key: 'save_converted_mermaid_scene',
            label: text('Save Converted Mermaid Scene', '保存 Mermaid 转换结果'),
            icon: 'ri-git-branch-line',
            actionType: 'invoke'
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
    if (viewKey !== EXCALIDRAW_WORKBENCH_VIEW_KEY || component.entry !== EXCALIDRAW_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Excalidraw component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const componentDir = join(moduleDir, 'remote-components', EXCALIDRAW_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Excalidraw Workbench',
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
    if (viewKey !== EXCALIDRAW_WORKBENCH_VIEW_KEY) {
      return {}
    }
    return this.service.getWorkbenchData(scopeFromContext(context), {
      drawingId: getStringParameter(query.parameters, 'drawingId') ?? query.selectionId,
      status: getStringParameter(query.parameters, 'status') as ExcalidrawDrawingStatus | undefined,
      kind: getStringParameter(query.parameters, 'kind') as ExcalidrawDrawingKind | undefined,
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
    if (viewKey !== EXCALIDRAW_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Excalidraw view refreshed', 'Excalidraw 视图已刷新')
      }

      if (actionKey === 'create_drawing') {
        const result = await this.service.createDrawing(scope, {
          title: requireStringInput(request.input, 'title', 'Drawing title is required.'),
          description: getStringInput(request.input, 'description'),
          kind: getStringInput(request.input, 'kind') as ExcalidrawDrawingKind | undefined,
          tags: getStringArrayInput(request.input, 'tags'),
          source: 'workbench'
        })
        return {
          ...success('Drawing created', '图形已创建'),
          data: result
        }
      }

      if (actionKey === 'save_current_scene' || actionKey === 'save_converted_mermaid_scene') {
        const drawingId = requireDrawingId(request)
        const result = await this.service.saveCurrentScene(scope, {
          drawingId,
          elements: getArrayInput(request.input, 'elements'),
          appState: getRecordInput(request.input, 'appState'),
          files: getRecordInput(request.input, 'files'),
          mermaidSource: getStringInput(request.input, 'mermaidSource'),
          sourceType: actionKey === 'save_converted_mermaid_scene' ? 'workbench_mermaid' : 'workbench',
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Drawing saved', '图形已保存'),
          data: result
        }
      }

      if (actionKey === 'save_scene_version') {
        const drawingId = requireDrawingId(request)
        const result = await this.service.saveSceneVersion(scope, {
          drawingId,
          elements: getArrayInput(request.input, 'elements'),
          appState: getRecordInput(request.input, 'appState'),
          files: getRecordInput(request.input, 'files'),
          mermaidSource: getStringInput(request.input, 'mermaidSource'),
          sourceType: 'workbench',
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return {
          ...success('Drawing version saved', '图形版本已保存'),
          data: result
        }
      }

      if (actionKey === 'import_restored_scene') {
        const drawingId = getStringInput(request.input, 'drawingId') ?? getStringParameter(request.parameters, 'drawingId')
        const scene = {
          elements: getArrayInput(request.input, 'elements'),
          appState: getRecordInput(request.input, 'appState'),
          files: getRecordInput(request.input, 'files')
        }
        const changeSummary = getStringInput(request.input, 'changeSummary') ?? 'Imported Excalidraw file'
        const result = drawingId
          ? await this.service.saveCurrentScene(scope, {
              drawingId,
              ...scene,
              sourceType: 'import',
              changeSummary
            })
          : await this.service.createDrawing(scope, {
              title: getStringInput(request.input, 'title') ?? 'Imported Excalidraw Drawing',
              description: getStringInput(request.input, 'description'),
              kind: 'diagram',
              source: 'import',
              ...scene,
              changeSummary
            })

        return {
          ...success('Excalidraw file imported', 'Excalidraw 文件已导入'),
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
          ...success('Drawing version restored', '图形版本已恢复'),
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
          ...success('Drawing archived', '图形已归档'),
          data: result
        }
      }

      if (actionKey === 'delete_drawing') {
        const result = await this.service.deleteDrawing(scope, requireDrawingId(request))
        return {
          ...success('Drawing deleted', '图形已删除'),
          data: result
        }
      }

      if (actionKey === 'delete_version') {
        const result = await this.service.deleteVersion(
          scope,
          requireDrawingId(request),
          requireStringInput(request.input, 'versionId', 'Version id is required.')
        )
        return {
          ...success('Drawing version deleted', '图形版本已删除'),
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
            status === 'reviewed' ? 'Drawing marked as reviewed' : 'Drawing moved back to draft',
            status === 'reviewed' ? '图形已标记为已审核' : '图形已退回草稿'
          ),
          data: result
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Excalidraw action failed')
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
    if (viewKey !== EXCALIDRAW_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }
    if (actionKey !== 'import_scene_file') {
      return failure('Unsupported file action', '不支持的文件操作')
    }

    try {
      const scene = parseExcalidrawJsonFile(file)
      const drawingId = getStringInput(request.input, 'drawingId') ?? getStringParameter(request.parameters, 'drawingId')
      const scope = scopeFromContext(context)
      const result = drawingId
        ? await this.service.saveCurrentScene(scope, {
            drawingId,
            elements: scene.elements,
            appState: scene.appState,
            files: scene.files,
            sourceType: 'import',
            changeSummary: `Imported ${file.originalname ?? 'Excalidraw file'}`
          })
        : await this.service.createDrawing(scope, {
            title: getStringInput(request.input, 'title') ?? removeExcalidrawExtension(file.originalname) ?? 'Imported Excalidraw Drawing',
            description: getStringInput(request.input, 'description'),
            kind: 'diagram',
            source: 'import',
            elements: scene.elements,
            appState: scene.appState,
            files: scene.files,
            changeSummary: `Imported ${file.originalname ?? 'Excalidraw file'}`
          })

      return {
        ...success('Excalidraw file imported', 'Excalidraw 文件已导入'),
        data: result
      }
    } catch (error) {
      const message = getActionErrorMessage(error, 'Failed to import Excalidraw file')
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

function scopeFromContext(context: XpertResolvedViewHostContext): ExcalidrawScope {
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

function getArrayInput(input: XpertViewActionRequest['input'], key: string) {
  const value = input?.[key]
  return Array.isArray(value) ? value : []
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

function parseExcalidrawJsonFile(file: XpertViewFileActionFile) {
  const raw = file.buffer.toString('utf8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const elements = Array.isArray(parsed.elements) ? parsed.elements : []
  const appState = parsed.appState && typeof parsed.appState === 'object' && !Array.isArray(parsed.appState) ? parsed.appState : {}
  const files = parsed.files && typeof parsed.files === 'object' && !Array.isArray(parsed.files) ? parsed.files : {}
  return {
    elements,
    appState: appState as Record<string, unknown>,
    files: files as Record<string, unknown>
  }
}

function removeExcalidrawExtension(name: string | undefined) {
  const normalized = name?.trim()
  if (!normalized) {
    return undefined
  }
  return normalized.replace(/\.excalidraw(?:\.json)?$/i, '').replace(/\.json$/i, '') || normalized
}

function htmlLangFromLocale(locale: unknown) {
  return isChineseLocale(locale) ? 'zh-Hans' : 'en'
}

function isChineseLocale(locale: unknown) {
  return String(locale || '').toLowerCase().startsWith('zh')
}
