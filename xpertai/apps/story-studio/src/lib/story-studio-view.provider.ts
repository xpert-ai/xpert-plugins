import {
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
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
  type XpertViewFileActionFile
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
  STORY_STUDIO_FEATURE,
  STORY_STUDIO_ICON,
  STORY_STUDIO_MUTATION_TOOL_NAMES,
  STORY_STUDIO_PLUGIN_NAME,
  STORY_STUDIO_PROVIDER_KEY,
  STORY_STUDIO_REMOTE_ENTRY_KEY,
  STORY_STUDIO_WORKBENCH_VIEW_KEY
} from './constants.js'
import {
  createStoryProjectSchema,
  searchStoryProjectsSchema,
  updateStoryProjectSchema,
  updateStoryProjectStatusSchema
} from './story-agent-tool.schemas.js'
import {
  attachAssetImageSchema,
  attachShotReferenceImageSchema,
  saveStoryProductionSchema,
  uploadStoryVoiceReferenceSchema
} from './story-production.schemas.js'
import { prepareStoryCutHandoffSchema } from './story-cut-handoff.schemas.js'
import { StoryCutHandoffService } from './story-cut-handoff.service.js'
import { StoryProductionService } from './story-production.service.js'
import { STORY_DEMO_TITLE } from './story-demo-case.js'
import { StoryStudioService } from './story-studio.service.js'
import type {
  CreateStoryProjectInput,
  StoryScope,
  UpdateStoryProjectInput,
  UpdateStoryProjectStatusInput
} from './types.js'
import type {
  AttachAssetImageInput,
  AttachShotReferenceImageInput,
  SaveStoryProductionInput,
  UploadStoryVoiceReferenceInput
} from './production-types.js'
import type { PrepareStoryCutHandoffInput } from './story-cut-handoff.types.js'
import { StoryVideoGenerationService } from './story-video-generation.service.js'
import {
  generateStoryShotTakesSchema,
  getStoryVideoTaskSchema,
  listStoryVideoTasksSchema,
  manageStoryVideoTaskSchema,
  selectStoryShotVideoSchema,
  setStoryVideoGeneratorSchema
} from './story-video-generation.schemas.js'
import type {
  GenerateStoryShotTakesInput,
  GetStoryVideoTaskInput,
  ListStoryVideoTasksInput,
  ManageStoryVideoTaskInput,
  SelectStoryShotVideoInput,
  SetStoryVideoGeneratorInput
} from './story-video-generation.types.js'

const moduleFilename = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilename)
const requireFromHere = createRequire(moduleFilename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({
  en_US,
  zh_Hans
})

type StoryStudioWorkbenchData = XpertViewDataResult & {
  tableKey: 'projects'
  table: {
    key: 'projects'
    items: Awaited<
      ReturnType<StoryStudioService['searchProjects']>
    >['items']
    total: number
    page: number
    pageSize: number
  }
  projects: Awaited<
    ReturnType<StoryStudioService['searchProjects']>
  >
  detail: Awaited<
    ReturnType<StoryStudioService['getProjectSummary']>
  > | null
  production: Awaited<
    ReturnType<StoryProductionService['getProduction']>
  > | null
  handoff: Awaited<
    ReturnType<StoryCutHandoffService['getLatestSummary']>
  >
  videoGenerators: Awaited<
    ReturnType<StoryVideoGenerationService['listGenerators']>
  > | null
  videoTasks: Awaited<
    ReturnType<StoryVideoGenerationService['listTasks']>
  > | null
}

type StoryStudioViewFileAccessRequest = {
  fileKey: string
  targetId?: string
  purpose: 'preview' | 'download'
}

type StoryStudioViewManifest = XpertExtensionViewManifest & {
  fileAccess: { purposes: Array<'preview'> }
}

@Injectable()
@ViewExtensionProvider(STORY_STUDIO_PROVIDER_KEY)
export class StoryStudioViewProvider
  implements IXpertViewExtensionProvider
{
  constructor(
    private readonly service: StoryStudioService,
    private readonly productionService: StoryProductionService,
    private readonly cutHandoffs: StoryCutHandoffService,
    private readonly videoGeneration: StoryVideoGenerationService
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): XpertExtensionViewManifest[] {
    if (
      context.hostType !== 'agent' ||
      (slot !== AGENT_WORKBENCH_MAIN_SLOT &&
        slot !== AGENT_WORKBENCH_FIXED_SLOT)
    ) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT

    const manifest: StoryStudioViewManifest = {
      key: STORY_STUDIO_WORKBENCH_VIEW_KEY,
      title: text('Story Studio', 'Story Studio 故事工作室'),
      description: text(
        'Review scoped story projects and their production stages.',
        '审核有作用域的故事项目及其制作阶段。'
      ),
      icon: {
        type: 'svg',
        value: STORY_STUDIO_ICON,
        color: '#7c3aed',
        alt: 'Story Studio'
      },
      hostType: 'agent',
      slot,
      order: 36,
      refreshable: true,
      activation: {
        requiredFeatures: [STORY_STUDIO_FEATURE]
      },
      ...(fixed
        ? {
            workbench: {
              fixed: true,
              menu: {
                enabled: true,
                label: text('Story Studio', '故事工作室'),
                order: 36,
                icon: {
                  type: 'svg',
                  value: STORY_STUDIO_ICON,
                  alt: 'Story Studio'
                }
              }
            }
          }
        : {}),
      source: {
        provider: STORY_STUDIO_PROVIDER_KEY,
        plugin: STORY_STUDIO_PLUGIN_NAME
      },
      fileAccess: {
        purposes: ['preview']
      },
      view: {
        type: 'remote_component',
        runtime: 'react',
        protocolVersion: 1,
        component: {
          isolation: 'iframe',
          entry: STORY_STUDIO_REMOTE_ENTRY_KEY
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
        },
      },
      hostEvents: {
        subscriptions: [
          {
            key: 'story-studio-tool-completed',
            event: 'assistant.tool.completed',
            filter: {
              sources: ['chatkit'],
              toolNames: [...STORY_STUDIO_MUTATION_TOOL_NAMES]
            },
            action: {
              type: 'forward',
              debounceMs: 600
            }
          }
        ]
      },
      clientCommands: [
        {
          key: ASSISTANT_CONTEXT_SET_COMMAND,
          label: text(
            'Set Assistant Context',
            '设置 Assistant 上下文'
          )
        },
        {
          key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
          label: text(
            'Send Assistant Message',
            '发送 Assistant 消息'
          )
        }
      ],
      actions: [
        {
          key: 'refresh',
          label: text('Refresh', '刷新'),
          icon: 'ri-refresh-line',
          placement: 'toolbar',
          actionType: 'refresh'
        },
        {
          key: 'create_project',
          label: text('New project', '新建项目'),
          icon: 'ri-add-line',
          placement: 'toolbar',
          actionType: 'invoke'
        },
        {
          key: 'create_demo_project',
          label: text('Load visual demo', '载入视觉示例'),
          icon: 'ri-movie-line',
          placement: 'toolbar',
          actionType: 'invoke'
        },
        {
          key: 'update_project',
          label: text('Save project details', '保存项目详情'),
          icon: 'ri-save-line',
          actionType: 'invoke'
        },
        {
          key: 'save_production',
          label: text('Save production', '保存制作内容'),
          icon: 'ri-save-line',
          actionType: 'invoke'
        },
        {
          key: 'upload_asset_image',
          label: text('Upload asset reference', '上传资产参考图'),
          icon: 'ri-upload-cloud-2-line',
          actionType: 'invoke',
          transport: 'file'
        },
        {
          key: 'upload_shot_reference_image',
          label: text('Upload temporary shot reference', '上传镜头临时参考图'),
          icon: 'ri-upload-cloud-2-line',
          actionType: 'invoke',
          transport: 'file'
        },
        {
          key: 'upload_voice_reference_audio',
          label: text('Upload voice reference audio', '上传音色参考音频'),
          icon: 'ri-file-music-line',
          actionType: 'invoke',
          transport: 'file'
        },
        {
          key: 'update_project_status',
          label: text('Advance stage', '推进阶段'),
          icon: 'ri-arrow-right-line',
          actionType: 'invoke'
        },
        {
          key: 'prepare_cut_handoff',
          label: text('Prepare Cut handoff', '准备 Cut 交接'),
          icon: 'ri-send-plane-line',
          actionType: 'invoke'
        },
        {
          key: 'list_video_generators',
          label: text('Video generators', '视频生成器'),
          actionType: 'invoke'
        },
        {
          key: 'set_project_video_generator',
          label: text('Choose video generator', '选择视频生成器'),
          actionType: 'invoke'
        },
        {
          key: 'generate_shot_takes',
          label: text('Generate Takes', '生成候选镜头'),
          actionType: 'invoke'
        },
        {
          key: 'list_shot_video_tasks',
          label: text('Clip progress', '镜头进度'),
          actionType: 'invoke'
        },
        {
          key: 'refresh_video_task',
          label: text('Refresh clip progress', '刷新镜头进度'),
          actionType: 'invoke'
        },
        {
          key: 'cancel_video_task',
          label: text('Stop tracking', '停止跟踪'),
          actionType: 'invoke'
        },
        {
          key: 'retry_video_task',
          label: text('Generate again', '重新生成'),
          actionType: 'invoke'
        },
        {
          key: 'select_shot_video',
          label: text('Lock Take', '锁定候选镜头'),
          actionType: 'invoke'
        }
      ]
    }
    return [manifest]
  }

  async resolveViewFile(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    request: StoryStudioViewFileAccessRequest
  ) {
    if (
      viewKey !== STORY_STUDIO_WORKBENCH_VIEW_KEY ||
      request.purpose !== 'preview' ||
      !request.targetId
    ) {
      throw new Error('Story Studio file access request is invalid.')
    }
    return this.productionService.resolveMediaCandidateFile(
      scopeFromContext(context),
      request.targetId,
      request.fileKey
    )
  }

  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (
      viewKey !== STORY_STUDIO_WORKBENCH_VIEW_KEY ||
      component.entry !== STORY_STUDIO_REMOTE_ENTRY_KEY
    ) {
      return {
        html: '<!doctype html><html><body>Unsupported Story Studio component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const componentDir = join(
      moduleDir,
      'remote-components',
      STORY_STUDIO_REMOTE_ENTRY_KEY
    )
    const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')
    const cssPath = join(componentDir, 'app.css')
    const appCss = existsSync(cssPath)
      ? await readFile(cssPath, 'utf8')
      : ''
    const react = await readPackageFile(
      'react',
      'umd/react.production.min.js'
    )
    const reactDom = await readPackageFile(
      'react-dom',
      'umd/react-dom.production.min.js'
    )

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Story Studio',
        lang: htmlLang(context.locale),
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
    if (viewKey !== STORY_STUDIO_WORKBENCH_VIEW_KEY) {
      return {}
    }
    const scope = scopeFromContext(context)
    const searchInput = searchStoryProjectsSchema.parse({
      status: readParameter(query.parameters, 'status'),
      productionFormat: readParameter(
        query.parameters,
        'productionFormat'
      ),
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
    const projects = await this.service.searchProjects(scope, searchInput)
    const requestedId =
      readParameter(query.parameters, 'projectId') ??
      query.selectionId ??
      projects.items[0]?.id
    const detail = requestedId
      ? await readProjectDetail(this.service, scope, requestedId)
      : null
    const production = requestedId
      ? await readProductionDetail(this.productionService, scope, requestedId)
      : null
    const handoff = requestedId
      ? await this.cutHandoffs.getLatestSummary(scope, requestedId)
      : null
    const videoGenerators = requestedId
      ? await this.videoGeneration.listGenerators(scope, requestedId).catch(() => null)
      : null
    const videoTasks = requestedId
      ? await this.videoGeneration.listTasks(scope, {
          projectId: requestedId,
          page: 1,
          pageSize: 50
        }).catch(() => null)
      : null

    const result: StoryStudioWorkbenchData = {
      tableKey: 'projects',
      table: {
        key: 'projects',
        items: projects.items,
        total: projects.total,
        page: projects.page,
        pageSize: projects.pageSize
      },
      projects,
      detail,
      production,
      handoff,
      videoGenerators,
      videoTasks
    }
    return result
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== STORY_STUDIO_WORKBENCH_VIEW_KEY) {
      return failure('Unsupported view')
    }

    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Story Studio refreshed', 'Story Studio 已刷新')
      }
      if (actionKey === 'create_project') {
        const input = parseCreateProjectAction(request)
        const result = await this.service.createProject(scope, input)
        return {
          ...success('Story project created', '故事项目已创建'),
          data: result
        }
      }
      if (actionKey === 'create_demo_project') {
        const operationId = requireInputString(
          request,
          'operationId',
          'operationId is required.'
        )
        const created = await this.service.createProject(scope, {
          operationId: `${operationId}:project`,
          title: STORY_DEMO_TITLE,
          description:
            '使用原创都市情感悬疑故事和一致性视觉素材，演示剧本、角色资产、分镜、媒体候选与 Cut 装配闭环。',
          premise:
            '雨夜，纪录片摄影师林晚在废弃旧影棚与失联多年的搭档顾沉重逢，两人被迫面对一段未完成的影片与被刻意掩埋的事故。',
          productionFormat: 'vertical_short',
          aspectRatio: '9:16',
          targetDurationSeconds: 96,
          tags: ['story-studio-workflow', 'visual-demo', '都市情感悬疑'],
          changeSummary: 'Created the Story Studio visual workflow demo'
        })
        const planning = await this.service.updateProjectStatus(scope, {
          projectId: created.project.id,
          operationId: `${operationId}:planning`,
          baseRevision: created.project.revision,
          status: 'planning',
          reason: 'The demo source and production frame are ready.',
          changeSummary: 'Moved the visual workflow demo into planning'
        })
        const advanced = await this.service.updateProjectStatus(scope, {
          projectId: created.project.id,
          operationId: `${operationId}:ready`,
          baseRevision: planning.project.revision,
          status: 'production',
          reason: 'Sources, story plan, episode, assets, shots, and media are ready.',
          changeSummary: 'Prepared the visual workflow demo for media review'
        })
        const production = await this.productionService.createDemoProduction(scope, {
          projectId: created.project.id,
          operationId: `${operationId}:production`,
          baseRevision: advanced.project.revision,
          changeSummary: 'Loaded the complete Backlight Reunion production demo'
        })
        return {
          ...success('Visual demo project created', '视觉示例项目已创建'),
          data: {
            projectId: advanced.project.id,
            revision: production.revision,
            status: advanced.project.status
          }
        }
      }
      if (actionKey === 'update_project_status') {
        const input = parseStatusAction(request)
        const result = await this.service.updateProjectStatus(scope, input)
        return {
          ...success('Project stage updated', '项目阶段已更新'),
          data: result
        }
      }
      if (actionKey === 'update_project') {
        const input = parseUpdateProjectAction(request)
        const result = await this.service.updateProject(scope, input)
        return {
          ...success('Project details saved', '项目详情已保存'),
          data: result,
          refresh: true
        }
      }
      if (actionKey === 'save_production') {
        const input = parseSaveProductionAction(request)
        const result =
          await this.productionService.saveProductionFromWorkbench(
            scope,
            input
          )
        return {
          ...success('Production content saved', '制作内容已保存'),
          data: {
            projectId: result.projectId,
            revision: result.revision,
            documentRevision: result.production.documentRevision
          },
          refresh: true
        }
      }
      if (actionKey === 'prepare_cut_handoff') {
        const input = parsePrepareCutHandoffAction(request)
        const result = await this.cutHandoffs.prepare(scope, input)
        return {
          ...success('StoryCutHandoff prepared', 'StoryCutHandoff 已准备'),
          data: result
        }
      }
      if (actionKey === 'list_video_generators') {
        const projectId = requireInputString(request, 'projectId', 'projectId is required.')
        return {
          ...success('Video generators loaded', '视频生成器已载入'),
          data: await this.videoGeneration.listGenerators(scope, projectId)
        }
      }
      if (actionKey === 'set_project_video_generator') {
        const input = setStoryVideoGeneratorSchema.parse(request.input ?? {}) as SetStoryVideoGeneratorInput
        return {
          ...success('Video generator saved', '视频生成器已保存'),
          data: await this.videoGeneration.setProjectGenerator(scope, input)
        }
      }
      if (actionKey === 'generate_shot_takes') {
        const input = generateStoryShotTakesSchema.parse(request.input ?? {}) as GenerateStoryShotTakesInput
        return {
          ...success('Take generation started', '候选镜头已开始生成'),
          data: await this.videoGeneration.generateTakes(scope, input)
        }
      }
      if (actionKey === 'list_shot_video_tasks') {
        const input = listStoryVideoTasksSchema.parse(request.input ?? {}) as ListStoryVideoTasksInput
        return {
          ...success('Clip progress loaded', '镜头进度已载入'),
          data: await this.videoGeneration.listTasks(scope, input)
        }
      }
      if (actionKey === 'refresh_video_task') {
        const input = manageStoryVideoTaskSchema.parse(request.input ?? {}) as ManageStoryVideoTaskInput
        return {
          ...success('Clip progress refreshed', '镜头进度已刷新'),
          data: await this.videoGeneration.refreshTask(scope, input)
        }
      }
      if (actionKey === 'cancel_video_task') {
        const input = manageStoryVideoTaskSchema.parse(request.input ?? {}) as ManageStoryVideoTaskInput
        return {
          ...success('Tracking stopped', '已停止跟踪'),
          data: await this.videoGeneration.cancelTask(scope, input)
        }
      }
      if (actionKey === 'retry_video_task') {
        const input = manageStoryVideoTaskSchema.parse(request.input ?? {}) as ManageStoryVideoTaskInput
        return {
          ...success('Take generation restarted', '候选镜头已重新生成'),
          data: await this.videoGeneration.retryTask(scope, input)
        }
      }
      if (actionKey === 'select_shot_video') {
        const input = selectStoryShotVideoSchema.parse(request.input ?? {}) as SelectStoryShotVideoInput
        return {
          ...success('Take locked', '候选镜头已锁定'),
          data: await this.videoGeneration.selectShotVideo(scope, input)
        }
      }
      return failure('Unsupported action')
    } catch (error) {
      return actionFailure(error)
    }
  }

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (
      viewKey !== STORY_STUDIO_WORKBENCH_VIEW_KEY ||
      ![
        'upload_asset_image',
        'upload_shot_reference_image',
        'upload_voice_reference_audio'
      ].includes(actionKey)
    ) {
      return failure('Unsupported file action')
    }
    try {
      if (actionKey === 'upload_voice_reference_audio') {
        const input = uploadStoryVoiceReferenceSchema.parse(
          request.input ?? {}
        ) as UploadStoryVoiceReferenceInput
        const result = await this.productionService.uploadVoiceReferenceAudio(
          scopeFromContext(context),
          input,
          {
            buffer: file.buffer,
            originalName: file.originalname || input.label,
            mimeType: file.mimetype || 'application/octet-stream'
          }
        )
        return {
          ...success(
            'Voice reference audio uploaded',
            '音色参考音频已上传'
          ),
          data: result,
          refresh: false
        }
      }
      const commonInput = {
        ...(request.input ?? {}),
        providerReceipt: {
          provider: 'manual_upload',
          taskId:
            readInputString(request, 'operationId') ??
            `manual-${Date.now()}`,
          status: 'completed'
        },
        changeSummary:
          readInputString(request, 'changeSummary') ??
          (actionKey === 'upload_shot_reference_image'
            ? 'Uploaded a temporary shot reference image'
            : 'Uploaded an asset-bible reference image')
      }
      const input = actionKey === 'upload_shot_reference_image'
        ? attachShotReferenceImageSchema.parse(commonInput) as AttachShotReferenceImageInput
        : attachAssetImageSchema.parse(commonInput) as AttachAssetImageInput
      const uploadFile = {
        buffer: file.buffer,
        originalName: file.originalname || input.label,
        mimeType: file.mimetype || 'application/octet-stream'
      }
      const result = actionKey === 'upload_shot_reference_image'
        ? await this.productionService.uploadShotReferenceImage(
            scopeFromContext(context),
            input as AttachShotReferenceImageInput,
            uploadFile
          )
        : await this.productionService.uploadAssetImage(
            scopeFromContext(context),
            input as AttachAssetImageInput,
            uploadFile
          )
      return {
        ...success(
          actionKey === 'upload_shot_reference_image'
            ? 'Temporary shot reference uploaded'
            : 'Asset reference uploaded',
          actionKey === 'upload_shot_reference_image'
            ? '镜头临时参考图已上传'
            : '资产参考图已上传'
        ),
        data: {
          projectId: result.projectId,
          revision: result.revision,
          documentRevision: result.production.documentRevision
        },
        refresh: true
      }
    } catch (error) {
      return actionFailure(error)
    }
  }
}

function parseUpdateProjectAction(
  request: XpertViewActionRequest
): UpdateStoryProjectInput {
  return updateStoryProjectSchema.parse({
    ...(request.input ?? {}),
    changeSummary:
      readInputString(request, 'changeSummary') ??
      'Updated Story Studio project details'
  }) as UpdateStoryProjectInput
}

function parseSaveProductionAction(
  request: XpertViewActionRequest
): SaveStoryProductionInput {
  return saveStoryProductionSchema.parse({
    ...(request.input ?? {}),
    changeSummary:
      readInputString(request, 'changeSummary') ??
      'Updated Story Studio production content'
  }) as SaveStoryProductionInput
}

async function readProductionDetail(
  service: StoryProductionService,
  scope: StoryScope,
  projectId: string
) {
  try {
    return await service.getProduction(scope, { projectId })
  } catch (error) {
    if (error instanceof NotFoundException) return null
    throw error
  }
}

async function readProjectDetail(
  service: StoryStudioService,
  scope: StoryScope,
  projectId: string
) {
  try {
    return await service.getProjectSummary(scope, { projectId })
  } catch (error) {
    if (error instanceof NotFoundException) {
      return null
    }
    throw error
  }
}

function parseCreateProjectAction(
  request: XpertViewActionRequest
): CreateStoryProjectInput {
  return createStoryProjectSchema.parse({
    operationId: requireInputString(
      request,
      'operationId',
      'operationId is required.'
    ),
    title: requireInputString(
      request,
      'title',
      'Project title is required.'
    ),
    description: readInputString(request, 'description'),
    premise: readInputString(request, 'premise'),
    productionFormat: readInputString(request, 'productionFormat'),
    aspectRatio: readInputString(request, 'aspectRatio'),
    targetDurationSeconds: readInputNumber(
      request,
      'targetDurationSeconds'
    ),
    tags: readInputStringArray(request, 'tags'),
    changeSummary:
      readInputString(request, 'changeSummary') ??
      'Created Story Studio project'
  }) as CreateStoryProjectInput
}

function parseStatusAction(
  request: XpertViewActionRequest
): UpdateStoryProjectStatusInput {
  return updateStoryProjectStatusSchema.parse({
    projectId: requireInputString(
      request,
      'projectId',
      'projectId is required.'
    ),
    operationId: requireInputString(
      request,
      'operationId',
      'operationId is required.'
    ),
    baseRevision: requireInputNumber(
      request,
      'baseRevision',
      'baseRevision is required.'
    ),
    status: requireInputString(request, 'status', 'status is required.'),
    reason: readInputString(request, 'reason'),
    changeSummary:
      readInputString(request, 'changeSummary') ??
      'Advanced Story Studio project stage'
  }) as UpdateStoryProjectStatusInput
}

function parsePrepareCutHandoffAction(
  request: XpertViewActionRequest
): PrepareStoryCutHandoffInput {
  return prepareStoryCutHandoffSchema.parse({
    projectId: requireInputString(
      request,
      'projectId',
      'projectId is required.'
    ),
    operationId: requireInputString(
      request,
      'operationId',
      'operationId is required.'
    ),
    expectedRevision: requireInputNumber(
      request,
      'expectedRevision',
      'expectedRevision is required.'
    ),
    fps: readInputNumber(request, 'fps'),
    changeSummary:
      readInputString(request, 'changeSummary') ??
      'Prepared StoryCutHandoff for Cut'
  }) as PrepareStoryCutHandoffInput
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(
    requireFromHere.resolve(`${packageName}/package.json`)
  )
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function scopeFromContext(context: XpertResolvedViewHostContext): StoryScope {
  if (!context.tenantId) {
    throw new Error('Tenant scope is required.')
  }
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    hostProjectId: readHostProjectId(context),
    userId: context.userId ?? null,
    assistantId: context.hostType === 'agent' ? context.hostId : null,
    actorType: context.userId ? 'user' : 'system'
  }
}

function readHostProjectId(context: XpertResolvedViewHostContext) {
  const value = Reflect.get(context, 'projectId')
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readParameter(
  parameters: XpertViewQuery['parameters'],
  key: string
) {
  if (!parameters) {
    return undefined
  }
  const value = Reflect.get(parameters, key)
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}

function readInputString(request: XpertViewActionRequest, key: string) {
  const value = request.input ? Reflect.get(request.input, key) : undefined
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}

function requireInputString(
  request: XpertViewActionRequest,
  key: string,
  message: string
) {
  const value = readInputString(request, key)
  if (!value) {
    throw new Error(message)
  }
  return value
}

function readInputNumber(request: XpertViewActionRequest, key: string) {
  const value = request.input ? Reflect.get(request.input, key) : undefined
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function requireInputNumber(
  request: XpertViewActionRequest,
  key: string,
  message: string
) {
  const value = readInputNumber(request, key)
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

function readInputStringArray(
  request: XpertViewActionRequest,
  key: string
) {
  const value = request.input ? Reflect.get(request.input, key) : undefined
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter(
    (item): item is string => typeof item === 'string' && Boolean(item.trim())
  )
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans)
  }
}

function failure(message: string): XpertViewActionResult {
  return {
    success: false,
    message: text(message, message)
  }
}

function actionFailure(error: unknown): XpertViewActionResult {
  if (error instanceof HttpException) {
    const response = error.getResponse()
    if (typeof response === 'string') return failure(response)
    if (response && typeof response === 'object') {
      const body = response as Record<string, unknown>
      const message =
        typeof body.message === 'string'
          ? body.message
          : error.message || 'Story Studio action failed.'
      return {
        ...failure(message),
        data: {
          ...(typeof body.errorCode === 'string'
            ? { errorCode: body.errorCode }
            : {}),
          ...(typeof body.currentRevision === 'number'
            ? { currentRevision: body.currentRevision }
            : {})
        }
      }
    }
  }
  return failure(
    error instanceof Error
      ? error.message
      : 'Story Studio action failed.'
  )
}

function htmlLang(locale?: string | null) {
  const normalized = locale?.replace('_', '-').toLowerCase() ?? ''
  if (normalized === 'zh-tw' || normalized === 'zh-hant') {
    return 'zh-Hant'
  }
  return normalized.startsWith('zh') ? 'zh-Hans' : 'en-US'
}
