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
  MOTION_FEATURE,
  MOTION_ICON,
  MOTION_MIDDLEWARE_TOOL_NAMES,
  MOTION_PLUGIN_NAME,
  MOTION_PROVIDER_KEY,
  MOTION_REMOTE_ENTRY_KEY,
  MOTION_WORKBENCH_VIEW_KEY
} from './constants.js'
import { MotionService } from './motion.service.js'
import type {
  MotionExportKind,
  MotionJsonObject,
  MotionProjectStatus,
  MotionRenderQuality,
  MotionScope,
  MotionSurface,
  MotionVideoComposition
} from './types.js'

const moduleFilename = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilename)
const requireFromHere = createRequire(moduleFilename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

type MotionWorkbenchViewData = XpertViewDataResult & {
  tableKey: 'projects' | 'recipes' | 'styles'
  table: {
    key: 'projects' | 'recipes' | 'styles'
    items: object[]
    total: number
    page: number
    pageSize: number
  }
  projects: Awaited<ReturnType<MotionService['searchProjects']>>
  recipes: Awaited<ReturnType<MotionService['searchRecipes']>>
  styles: Awaited<ReturnType<MotionService['listStyles']>>
  detail: Awaited<ReturnType<MotionService['getProject']>> | null
  libraryStats: ReturnType<MotionService['getLibraryStats']>
  renderCapability: Awaited<ReturnType<MotionService['getProductionRenderCapability']>>
}

type ProjectScopedViewHostContext = XpertResolvedViewHostContext & {
  projectId?: string | null
}

@Injectable()
@ViewExtensionProvider(MOTION_PROVIDER_KEY)
export class MotionViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: MotionService) {}

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
        key: MOTION_WORKBENCH_VIEW_KEY,
        title: text('Motion Workbench', 'Motion 动效工作台'),
        description: text(
          'Create animated HTML and native HyperFrames videos with SDK + Player editing and queued Producer rendering.',
          '创建动效网页和原生 HyperFrames 视频，使用 SDK + Player 编辑并通过 Producer 队列生产渲染。'
        ),
        icon: {
          type: 'svg',
          value: MOTION_ICON,
          color: '#2563eb',
          alt: 'Motion'
        },
        hostType: 'agent',
        slot,
        order: 42,
        refreshable: true,
        activation: {
          requiredFeatures: [MOTION_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Motion', 'Motion 动效'),
                  order: 42,
                  icon: {
                    type: 'svg',
                    value: MOTION_ICON,
                    alt: 'Motion'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: MOTION_PROVIDER_KEY,
          plugin: MOTION_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: MOTION_REMOTE_ENTRY_KEY
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
              key: 'motion-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...MOTION_MIDDLEWARE_TOOL_NAMES]
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
          { key: 'create_project', label: text('New Motion Project', '新建动效项目'), icon: 'ri-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'save_web_artifact', label: text('Save HTML', '保存 HTML'), icon: 'ri-html5-line', actionType: 'invoke' },
          { key: 'save_video_composition', label: text('Save Video', '保存视频合成'), icon: 'ri-movie-line', actionType: 'invoke' },
          { key: 'save_hyperframes_composition', label: text('Save HyperFrames', '保存 HyperFrames 合成'), icon: 'ri-code-box-line', actionType: 'invoke' },
          { key: 'render_production', label: text('Production Render', '生产渲染'), icon: 'ri-film-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'finalize_version', label: text('New Version', '新建版本'), icon: 'ri-file-add-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'restore_version', label: text('Restore Version', '恢复版本'), icon: 'ri-history-line', actionType: 'invoke' },
          { key: 'export_artifact', label: text('Export', '导出'), icon: 'ri-download-line', placement: 'toolbar', actionType: 'invoke' },
          { key: 'save_style', label: text('Save Motion Style', '保存动效样式'), icon: 'ri-save-3-line', actionType: 'invoke' },
          { key: 'delete_style', label: text('Delete Motion Style', '删除动效样式'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          { key: 'mark_reviewed', label: text('Mark Reviewed', '标记已审核'), icon: 'ri-check-line', actionType: 'invoke' },
          { key: 'mark_draft', label: text('Move Back to Draft', '退回草稿'), icon: 'ri-edit-line', actionType: 'invoke' },
          { key: 'archive_project', label: text('Archive Motion Project', '归档动效项目'), icon: 'ri-archive-line', actionType: 'invoke' },
          { key: 'delete_project', label: text('Delete Motion Project', '删除动效项目'), icon: 'ri-delete-bin-line', actionType: 'invoke' },
          {
            key: 'import_html_file',
            label: text('Import HTML', '导入 HTML'),
            icon: 'ri-upload-cloud-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'import_video_json_file',
            label: text('Import Video JSON', '导入视频 JSON'),
            icon: 'ri-file-code-line',
            placement: 'toolbar',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'save_export_file',
            label: text('Save Generated Export', '保存生成导出'),
            icon: 'ri-save-2-line',
            actionType: 'invoke',
            transport: 'file'
          },
          {
            key: 'upload_media_file',
            label: text('Upload Motion Media', '上传 Motion 媒体'),
            icon: 'ri-image-add-line',
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
    if (viewKey !== MOTION_WORKBENCH_VIEW_KEY || component.entry !== MOTION_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Motion component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const componentDir = join(moduleDir, 'remote-components', MOTION_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const appCssPath = join(componentDir, 'app.css')
    const appCss = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Motion Workbench',
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
    if (viewKey !== MOTION_WORKBENCH_VIEW_KEY) {
      return {}
    }
    const scope = scopeFromContext(context)
    const tableKey = normalizeTableKey(getStringParameter(query.parameters, 'table'))
    const requestedProjectId = getStringParameter(query.parameters, 'projectId') ?? query.selectionId
    const projects = await this.service.searchProjects(scope, {
      status: getStringParameter(query.parameters, 'status') as MotionProjectStatus | undefined,
      surface: getStringParameter(query.parameters, 'surface') as MotionSurface | undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
    const recipes = this.service.searchRecipes({
      query: tableKey === 'recipes' ? query.search : undefined,
      category: getStringParameter(query.parameters, 'category'),
      surface: getStringParameter(query.parameters, 'surface'),
      target: getStringParameter(query.parameters, 'target'),
      runtime: getStringParameter(query.parameters, 'runtime'),
      exportKind: getStringParameter(query.parameters, 'exportKind'),
      page: query.page,
      pageSize: query.pageSize
    })
    const detailProjectId = requestedProjectId ?? projects.items[0]?.id
    const detail = detailProjectId
      ? await this.service
          .getProject(scope, {
            projectId: String(detailProjectId),
            includeLogs: true,
            versionLimit: 30,
            logLimit: 20
          })
          .catch(() => null)
      : null
    const styles = await this.service.listStyles(scope, detail?.item?.id ?? null)
    const table = selectTable(tableKey, projects, recipes, styles)
    const result: MotionWorkbenchViewData = {
      tableKey,
      table,
      projects,
      recipes,
      styles,
      detail,
      libraryStats: this.service.getLibraryStats(),
      renderCapability: await this.service.getProductionRenderCapability()
    }
    return result
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== MOTION_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Motion view refreshed', 'Motion 视图已刷新')
      }
      if (actionKey === 'create_project') {
        const result = await this.service.createProject(scope, {
          title: requireStringInput(request.input, 'title', 'Motion title is required.'),
          brief: getStringInput(request.input, 'brief'),
          surface: (getStringInput(request.input, 'surface') as MotionSurface | undefined) ?? 'web',
          designSystemId: getStringInput(request.input, 'designSystemId'),
          motionProfile: getStringInput(request.input, 'motionProfile'),
          selectedRecipeIds: getStringArrayInput(request.input, 'selectedRecipeIds'),
          html: getStringInput(request.input, 'html'),
          videoComposition: getObjectInput(request.input, 'videoComposition') as MotionVideoComposition | undefined,
          hyperframesHtml: getStringInput(request.input, 'hyperframesHtml'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Motion project created', '动效项目已创建'), data: result }
      }
      if (actionKey === 'save_web_artifact') {
        const result = await this.service.saveWebArtifact(scope, {
          projectId: requireDocumentId(request),
          html: requireStringInput(request.input, 'html', 'HTML is required.'),
          selectedRecipeIds: getStringArrayInput(request.input, 'selectedRecipeIds'),
          componentSelection: getObjectInput(request.input, 'componentSelection'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Motion HTML saved', '动效 HTML 已保存'), refresh: false, data: result }
      }
      if (actionKey === 'save_video_composition') {
        const result = await this.service.saveVideoComposition(scope, {
          projectId: requireDocumentId(request),
          composition: requireObjectInput(request.input, 'composition', 'Video composition is required.') as MotionVideoComposition,
          selectedRecipeIds: getStringArrayInput(request.input, 'selectedRecipeIds'),
          layerSelection: getObjectInput(request.input, 'layerSelection'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Motion video saved', '动效视频已保存'), refresh: false, data: result }
      }
      if (actionKey === 'save_hyperframes_composition') {
        const result = await this.service.saveHyperframesComposition(scope, {
          projectId: requireDocumentId(request),
          html: requireStringInput(request.input, 'html', 'HyperFrames HTML is required.'),
          selectedRecipeIds: getStringArrayInput(request.input, 'selectedRecipeIds'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('HyperFrames composition saved', 'HyperFrames 合成已保存'), refresh: false, data: result }
      }
      if (actionKey === 'render_production') {
        const result = await this.service.requestProductionRender(scope, {
          projectId: requireDocumentId(request),
          kind: (getStringInput(request.input, 'kind') as 'mp4' | 'gif' | undefined) ?? 'mp4',
          quality: getStringInput(request.input, 'quality') as MotionRenderQuality | undefined,
          fps: getNumberInput(request.input, 'fps') as 24 | 30 | 60 | undefined,
          fileName: getStringInput(request.input, 'fileName'),
          expectedChecksum: getStringInput(request.input, 'expectedChecksum'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Production render queued', '生产渲染已排队'), data: result }
      }
      if (actionKey === 'finalize_version') {
        const result = await this.service.finalizeVersion(scope, {
          projectId: requireDocumentId(request),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Motion version saved', '动效版本已保存'), data: result }
      }
      if (actionKey === 'restore_version') {
        const result = await this.service.restoreVersion(
          scope,
          requireDocumentId(request),
          requireStringInput(request.input, 'versionId', 'Version id is required.'),
          getStringInput(request.input, 'changeSummary')
        )
        return { ...success('Motion version restored', '动效版本已恢复'), data: result }
      }
      if (actionKey === 'export_artifact') {
        const result = await this.service.exportArtifact(scope, {
          projectId: requireDocumentId(request),
          kind: (getStringInput(request.input, 'kind') as MotionExportKind | undefined) ?? 'html',
          versionId: getStringInput(request.input, 'versionId'),
          fileName: getStringInput(request.input, 'fileName'),
          content: getStringInput(request.input, 'content'),
          mimeType: getStringInput(request.input, 'mimeType'),
          changeSummary: getStringInput(request.input, 'changeSummary')
        })
        return { ...success('Motion artifact exported', '动效产物已导出'), data: result }
      }
      if (actionKey === 'save_style') {
        const result = await this.service.saveStyle(scope, {
          projectId: getStringInput(request.input, 'projectId') ?? getStringParameter(request.parameters, 'projectId'),
          name: requireStringInput(request.input, 'name', 'Style name is required.'),
          surface: getStringInput(request.input, 'surface') as MotionSurface | undefined,
          style: requireObjectInput(request.input, 'style', 'Style object is required.'),
          description: getStringInput(request.input, 'description')
        })
        return { ...success('Motion style saved', '动效样式已保存'), data: result }
      }
      if (actionKey === 'delete_style') {
        const result = await this.service.deleteStyle(scope, requireStringInput(request.input, 'styleId', 'Style id is required.'))
        return { ...success('Motion style deleted', '动效样式已删除'), data: result }
      }
      if (actionKey === 'mark_reviewed' || actionKey === 'mark_draft' || actionKey === 'archive_project') {
        const status: MotionProjectStatus = actionKey === 'mark_reviewed' ? 'reviewed' : actionKey === 'archive_project' ? 'archived' : 'draft'
        const result = await this.service.updateProjectStatus(scope, {
          projectId: requireDocumentId(request),
          status,
          reason: getStringInput(request.input, 'reason')
        })
        return { ...success('Motion status updated', '动效状态已更新'), data: result }
      }
      if (actionKey === 'delete_project') {
        const result = await this.service.deleteProject(scope, requireDocumentId(request))
        return { ...success('Motion project deleted', '动效项目已删除'), data: result }
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Motion action failed')
      return { success: false, message: text(message, message) }
    }
  }

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (viewKey !== MOTION_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'import_html_file') {
        const html = file.buffer.toString('utf8')
        const result = await this.service.createProject(scope, {
          title: getStringInput(request.input, 'title') ?? removeKnownExtension(file.originalname) ?? 'Imported Motion HTML',
          brief: getStringInput(request.input, 'brief') ?? `Imported ${file.originalname ?? 'HTML file'}`,
          surface: 'web',
          html,
          changeSummary: `Imported ${file.originalname ?? 'HTML file'}`
        })
        return { ...success('Motion HTML imported', '动效 HTML 已导入'), data: result }
      }
      if (actionKey === 'import_video_json_file') {
        const composition = JSON.parse(file.buffer.toString('utf8')) as MotionVideoComposition
        const result = await this.service.createProject(scope, {
          title: getStringInput(request.input, 'title') ?? removeKnownExtension(file.originalname) ?? 'Imported Motion Video',
          brief: getStringInput(request.input, 'brief') ?? `Imported ${file.originalname ?? 'video composition'}`,
          surface: 'video',
          videoComposition: composition,
          changeSummary: `Imported ${file.originalname ?? 'video composition'}`
        })
        return { ...success('Motion video JSON imported', '动效视频 JSON 已导入'), data: result }
      }
      if (actionKey === 'save_export_file') {
        const result = await this.service.saveGeneratedExportFile(
          scope,
          requireDocumentId(request),
          (getStringInput(request.input, 'kind') as MotionExportKind | undefined) ?? inferKindFromFile(file.originalname, file.mimetype),
          {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          },
          getStringInput(request.input, 'changeSummary')
        )
        return { ...success('Motion export file saved', '动效导出文件已保存'), data: result }
      }
      if (actionKey === 'upload_media_file') {
        const result = await this.service.saveMediaFile(scope, {
          projectId: requireDocumentId(request),
          buffer: file.buffer,
          originalName: file.originalname ?? 'motion-media',
          mimeType: file.mimetype,
          size: file.size,
          purpose: getStringInput(request.input, 'purpose') ?? 'layer'
        })
        return { ...success('Motion media uploaded', 'Motion 媒体已上传'), data: result }
      }
      return failure('Unsupported file action', '不支持的文件操作')
    } catch (error) {
      const message = getActionErrorMessage(error, 'Motion file action failed')
      return { success: false, message: text(message, message) }
    }
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): MotionScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: getProjectId(context),
    userId: context.userId,
    assistantId: context.hostType === 'agent' ? context.hostId : null
  }
}

function getProjectId(context: XpertResolvedViewHostContext) {
  return (context as ProjectScopedViewHostContext).projectId ?? null
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: true, message: text(en_US, zh_Hans) }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans) }
}

function requireDocumentId(request: XpertViewActionRequest) {
  const value = getStringInput(request.input, 'projectId') ?? getStringParameter(request.parameters, 'projectId') ?? request.targetId
  if (!value) {
    throw new Error('Motion project id is required.')
  }
  return value
}

function requireStringInput(input: XpertViewActionRequest['input'], key: string, message: string) {
  const value = getStringInput(input, key)
  if (!value) {
    throw new Error(message)
  }
  return value
}

function getStringInput(input: XpertViewActionRequest['input'], key: string) {
  const object = inputObject(input)
  const value = object[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getNumberInput(input: XpertViewActionRequest['input'], key: string) {
  const value = inputObject(input)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getStringArrayInput(input: XpertViewActionRequest['input'], key: string) {
  const object = inputObject(input)
  const value = object[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : undefined
}

function getObjectInput(input: XpertViewActionRequest['input'], key: string): MotionJsonObject | undefined {
  const object = inputObject(input)
  const value = object[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as MotionJsonObject) : undefined
}

function requireObjectInput(input: XpertViewActionRequest['input'], key: string, message: string): MotionJsonObject {
  const value = getObjectInput(input, key)
  if (!value) {
    throw new Error(message)
  }
  return value
}

function inputObject(input: XpertViewActionRequest['input']): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
}

function getStringParameter(parameters: XpertViewActionRequest['parameters'] | XpertViewQuery['parameters'], key: string) {
  const value = parameters?.[key]
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'string' && first.trim() ? first.trim() : undefined
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeTableKey(value: string | undefined): 'projects' | 'recipes' | 'styles' {
  return value === 'recipes' || value === 'styles' ? value : 'projects'
}

function selectTable(
  tableKey: 'projects' | 'recipes' | 'styles',
  projects: Awaited<ReturnType<MotionService['searchProjects']>>,
  recipes: Awaited<ReturnType<MotionService['searchRecipes']>>,
  styles: Awaited<ReturnType<MotionService['listStyles']>>
) {
  if (tableKey === 'recipes') {
    return { key: 'recipes' as const, items: recipes.items, total: recipes.total, page: recipes.page, pageSize: recipes.pageSize }
  }
  if (tableKey === 'styles') {
    return { key: 'styles' as const, items: styles, total: styles.length, page: 1, pageSize: styles.length || 20 }
  }
  return { key: 'projects' as const, items: projects.items, total: projects.total, page: projects.page, pageSize: projects.pageSize }
}

function removeKnownExtension(fileName: string | undefined) {
  if (!fileName) {
    return undefined
  }
  return fileName.replace(/\.(html?|json)$/i, '').trim() || undefined
}

function inferKindFromFile(fileName: string | undefined, mimeType: string | undefined): MotionExportKind {
  const lower = `${fileName ?? ''} ${mimeType ?? ''}`.toLowerCase()
  if (lower.includes('mp4')) return 'mp4'
  if (lower.includes('gif')) return 'gif'
  if (lower.includes('css')) return 'css'
  if (lower.includes('html')) return 'html'
  if (lower.includes('lottie')) return 'lottie'
  return 'json'
}

function htmlLangFromLocale(locale: string | null | undefined) {
  if (!locale) {
    return 'en'
  }
  if (locale.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }
  return locale.replace('_', '-')
}

function getActionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
