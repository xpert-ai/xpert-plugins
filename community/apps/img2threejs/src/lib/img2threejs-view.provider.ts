import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  type I18nObject,
  IconDefinition,
  JsonSchemaObjectType,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewFileAccessRequest,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import {
  ViewExtensionProvider,
  renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider,
  type XpertViewFileActionFile,
  type XpertViewFileResource
} from '@xpert-ai/plugin-sdk'
import {
  IMG2THREEJS_FEATURE,
  IMG2THREEJS_ICON,
  IMG2THREEJS_PLUGIN_NAME,
  IMG2THREEJS_PROVIDER_KEY,
  IMG2THREEJS_REMOTE_ENTRY_KEY,
  IMG2THREEJS_VIEW_KEY,
  TOOL_NAMES
} from './constants.js'
import type { HumanReviewStatus, NextDecision, Scope } from './domain/types.js'
import { Img2ThreeJsStudioService, type StudioImageView } from './img2threejs-studio.service.js'
import { Img2ThreeJsService } from './img2threejs.service.js'
import { Img2ThreeJsWorkbenchService } from './img2threejs-workbench.service.js'
import { stripConcurrencyControlFields } from './img2threejs.service-support.js'
import { toPortableReference } from './platform/capability-adapters.js'

const requireFromHere = createRequire(import.meta.url)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = {
  type: 'svg',
  value: IMG2THREEJS_ICON,
  alt: 'Image to Three.js'
} satisfies IconDefinition

const reviewInputSchema = {
  type: 'object',
  properties: {
    projectId: { type: 'string', title: text('Project', '项目') },
    runId: { type: 'string', title: text('Run', '运行') },
    humanReviewStatus: {
      type: 'string',
      title: text('Review status', '审核状态'),
      enum: ['approved', 'changes_requested', 'rejected']
    },
    decision: {
      type: 'string',
      title: text('Next decision', '下一决策'),
      enum: ['continue', 'refine-spec', 'refine-code', 'request-input', 'stop']
    },
    notes: { type: 'string', title: text('Notes', '备注'), maxLength: 2000 }
  },
  required: ['projectId', 'runId', 'humanReviewStatus', 'decision']
} satisfies JsonSchemaObjectType

const runInputSchema = {
  type: 'object',
  properties: {
    projectId: { type: 'string', title: text('Project', '项目') },
    runId: { type: 'string', title: text('Run', '运行') }
  },
  required: ['projectId', 'runId']
} satisfies JsonSchemaObjectType

const createProjectInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: text('Project name', '项目名称'), minLength: 1, maxLength: 160 },
    route: {
      type: 'string',
      title: text('Model route', '模型路线'),
      enum: ['object', 'character']
    },
    modelingMode: {
      type: 'string',
      title: text('Modeling mode', '建模模式'),
      enum: ['semantic-3d', 'relief']
    }
  },
  required: ['name', 'route', 'modelingMode']
} satisfies JsonSchemaObjectType

const projectInputSchema = {
  type: 'object',
  properties: {
    projectId: { type: 'string', title: text('Project', '项目') }
  },
  required: ['projectId']
} satisfies JsonSchemaObjectType

const uploadReferenceInputSchema = {
  type: 'object',
  properties: {
    projectId: { type: 'string', title: text('Project', '项目') },
    label: { type: 'string', title: text('Reference label', '参考图名称'), minLength: 1, maxLength: 160 },
    view: {
      type: 'string',
      title: text('Declared view', '声明视角'),
      enum: ['front', 'back', 'left', 'right', 'top', 'bottom', 'three-quarter', 'detail', 'unknown']
    }
  },
  required: ['projectId', 'label', 'view']
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(IMG2THREEJS_PROVIDER_KEY)
export class Img2ThreeJsViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: Img2ThreeJsService,
    private readonly workbench: Img2ThreeJsWorkbenchService,
    private readonly studio: Img2ThreeJsStudioService
  ) {}

  supports(context: XpertResolvedViewHostContext): boolean {
    return context.hostType === 'agent' || context.hostType === 'project'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!['agent.workbench.main', 'agent.workbench.fixed', 'project.tabs'].includes(slot)) return []
    const fixed = slot === 'agent.workbench.fixed'
    return [{
      key: IMG2THREEJS_VIEW_KEY,
      title: text('Image to Three.js Studio', '图片转 3D Studio'),
      description: text(
        'Create projects, upload reference images, generate procedural Three.js models, and review pass evidence.',
        '新建项目、上传参考原图、生成程序化 Three.js 模型并审核阶段证据。'
      ),
      icon: VIEW_ICON,
      hostType: context.hostType,
      slot,
      order: 40,
      refreshable: true,
      activation: { requiredFeatures: [IMG2THREEJS_FEATURE] },
      ...(fixed ? {
        workbench: {
          fixed: true,
          menu: { enabled: true, label: text('3D Model', '3D 模型'), order: 40, icon: VIEW_ICON }
        }
      } : {}),
      source: { provider: IMG2THREEJS_PROVIDER_KEY, plugin: IMG2THREEJS_PLUGIN_NAME },
      parameters: [{
        key: 'projectId',
        label: text('Model project', '模型项目'),
        type: 'string'
      }],
      view: {
        type: 'remote_component',
        runtime: 'react',
        protocolVersion: 1,
        component: { isolation: 'iframe', entry: IMG2THREEJS_REMOTE_ENTRY_KEY },
        dataSource: { mode: 'platform' }
      },
      dataSource: {
        mode: 'platform',
        querySchema: {
          supportsPagination: true,
          supportsSearch: true,
          supportsParameters: true,
          defaultPageSize: 20
        },
        cache: { enabled: false }
      },
      fileAccess: { purposes: ['preview'] },
      clientCommands: [{
        key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        label: text('Send generation request to Agent', '向 Agent 发送生成请求'),
        description: text(
          'Start semantic image analysis and the ordered modeling tool workflow in the current conversation.',
          '在当前对话中启动语义图片分析和有序建模工具流程。'
        )
      }],
      hostEvents: {
        subscriptions: [{
          key: `${IMG2THREEJS_VIEW_KEY}.tool-completed`,
          event: 'assistant.tool.completed',
          filter: { sources: ['chatkit'], toolNames: Object.values(TOOL_NAMES) },
          action: { type: 'forward', debounceMs: 600 }
        }]
      },
      actions: [
        {
          key: 'refresh',
          label: text('Refresh', '刷新'),
          icon: 'ri-refresh-line',
          placement: 'toolbar',
          actionType: 'refresh'
        },
        {
          key: 'submit_review',
          label: text('Submit review', '提交审核'),
          icon: 'ri-checkbox-circle-line',
          placement: 'toolbar',
          actionType: 'invoke',
          inputSchema: reviewInputSchema
        },
        {
          key: 'create_project',
          label: text('New project', '新建项目'),
          icon: 'ri-add-line',
          actionType: 'invoke',
          inputSchema: createProjectInputSchema
        },
        {
          key: 'upload_reference',
          label: text('Upload reference image', '上传参考原图'),
          icon: 'ri-upload-cloud-2-line',
          actionType: 'invoke',
          transport: 'file',
          inputSchema: uploadReferenceInputSchema
        },
        {
          key: 'start_generation',
          label: text('Start 3D generation', '开始生成 3D'),
          icon: 'ri-magic-line',
          actionType: 'invoke',
          inputSchema: projectInputSchema
        },
        {
          key: 'advance_generation',
          label: text('Continue generation', '继续生成'),
          icon: 'ri-play-circle-line',
          actionType: 'invoke',
          inputSchema: projectInputSchema
        },
        {
          key: 'export_artifact',
          label: text('Publish model package', '发布模型包'),
          icon: 'ri-export-line',
          actionType: 'invoke',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string', title: text('Project', '项目') }
            },
            required: ['projectId']
          }
        },
        {
          key: 'retry_run',
          label: text('Retry run', '重试运行'),
          icon: 'ri-restart-line',
          placement: 'toolbar',
          actionType: 'invoke',
          inputSchema: runInputSchema
        },
        {
          key: 'cancel_run',
          label: text('Cancel run', '取消运行'),
          icon: 'ri-stop-circle-line',
          placement: 'toolbar',
          actionType: 'invoke',
          inputSchema: runInputSchema,
          confirm: {
            title: text('Cancel this pipeline run?', '取消此流水线运行？'),
            message: text(
              'Queued work will be cancelled and the run will become terminal. Generated versions remain recoverable.',
              '排队中的工作将被取消，运行将进入终态。已生成版本仍可恢复。'
            )
          }
        }
      ]
    }]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== IMG2THREEJS_VIEW_KEY || component.entry !== IMG2THREEJS_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Image to Three.js component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const componentRoot = join(dirname(fileURLToPath(import.meta.url)), 'remote-components', 'review-workbench')
    const [appScript, appStyle, reactUmd, reactDomUmd] = await Promise.all([
      readFile(join(componentRoot, 'app.js'), 'utf8'),
      readFile(join(componentRoot, 'app.css'), 'utf8'),
      readPackageFile('react', 'umd/react.production.min.js'),
      readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    ])
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Image to Three.js Review',
        lang: 'en-US',
        reactUmd,
        reactDomUmd,
        appScript,
        appCss: appStyle
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== IMG2THREEJS_VIEW_KEY) return {}
    const data = await this.workbench.getData(scopeFromView(context), {
      projectId: getStringParameter(query.parameters, 'projectId'),
      page: query.page,
      pageSize: query.pageSize,
      search: query.search
    })
    const publicData = stripConcurrencyControlFields(data)
    return {
      items: publicData.table.items,
      total: publicData.table.total,
      meta: publicData
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== IMG2THREEJS_VIEW_KEY) return failure('Unsupported view.', '不支持的视图。')
    try {
      const scope = scopeFromView(context)
      if (actionKey === 'refresh') return success('Studio data refreshed.', 'Studio 数据已刷新。')
      if (actionKey === 'create_project') {
        const result = await this.studio.createProject(scope, {
          name: requireBoundedString(request.input, 'name', 160),
          route: requireModelRoute(request.input),
          modelingMode: requireModelingMode(request.input)
        })
        return {
          success: true,
          message: text('Project created. Upload reference images next.', '项目已创建。下一步上传参考原图。'),
          refresh: true,
          data: stripConcurrencyControlFields(result)
        }
      }
      if (actionKey === 'start_generation' || actionKey === 'advance_generation') {
        const projectId = requireString(request.input, 'projectId')
        const status = await this.service.getStatus(scope, projectId)
        const input = { projectId, baseRevision: status.revision }
        const result = actionKey === 'start_generation'
          ? await this.studio.startGeneration(scope, input)
          : await this.studio.advanceGeneration(scope, input)
        if (result.nextAction === 'ask_agent_to_analyze_evidence') {
          return {
            success: true,
            message: text(
              'Semantic generation request is ready for the current Agent conversation.',
              '语义生成请求已准备发送到当前 Agent 对话。'
            ),
            refresh: true,
            data: stripConcurrencyControlFields({
              ...result,
              clientCommand: {
                commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
                payload: {
                  text: result.suggestedPrompt,
                  state: {
                    img2threejs: {
                      intent: 'regenerate_from_references',
                      projectId: result.projectId,
                      evidenceIds: result.evidenceIds
                    }
                  }
                }
              }
            })
          }
        }
        return {
          success: true,
          message: text('Generation stage queued.', '生成阶段已进入队列。'),
          refresh: true,
          data: stripConcurrencyControlFields(result)
        }
      }
      if (actionKey === 'export_artifact') {
        const result = await this.service.exportArtifact(scope, requireString(request.input, 'projectId'))
        return {
          success: result.status !== 'unavailable',
          message: result.status === 'unavailable'
            ? text('Generate the model before publishing.', '请先生成模型再发布。')
            : text('Model package is ready in Artifacts.', '模型包已在 Artifacts 中就绪。'),
          refresh: true,
          data: stripConcurrencyControlFields(result)
        }
      }
      const projectId = requireString(request.input, 'projectId')
      const runId = requireString(request.input, 'runId')
      const status = await this.service.getStatus(scope, projectId)
      if (status.runId !== runId || status.runRevision == null) throw new Error('RUN_NOT_CURRENT')
      const baseRevision = status.runRevision
      if (actionKey === 'submit_review') {
        const result = await this.service.submitReview(scope, {
          projectId,
          runId,
          baseRevision,
          humanReviewStatus: requireReviewStatus(request.input),
          decision: requireDecision(request.input),
          notes: optionalString(request.input, 'notes')
        })
        return {
          success: true,
          message: text('Review decision saved.', '审核决策已保存。'),
          refresh: true,
          data: stripConcurrencyControlFields(result)
        }
      }
      if (actionKey === 'retry_run') {
        const result = await this.service.retryRun(scope, { projectId, runId, baseRevision })
        return {
          success: true,
          message: text('Pipeline stage queued for retry.', '流水线阶段已排队重试。'),
          refresh: true,
          data: stripConcurrencyControlFields(result)
        }
      }
      if (actionKey === 'cancel_run') {
        const result = await this.service.cancelRun(scope, { projectId, runId, baseRevision })
        return {
          success: true,
          message: text('Pipeline run cancelled.', '流水线运行已取消。'),
          refresh: true,
          data: stripConcurrencyControlFields(result)
        }
      }
      return failure('Unsupported action.', '不支持的操作。')
    } catch (error) {
      const code = error instanceof Error ? error.message.split(':')[0] : 'ACTION_FAILED'
      return failure(code, code)
    }
  }

  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    if (viewKey !== IMG2THREEJS_VIEW_KEY || actionKey !== 'upload_reference') {
      return failure('Unsupported file action.', '不支持的文件操作。')
    }
    try {
      const label = requireBoundedString(request.input, 'label', 160)
      const projectId = requireString(request.input, 'projectId')
      const status = await this.service.getStatus(scopeFromView(context), projectId)
      const result = await this.studio.uploadReference(scopeFromView(context), {
        projectId,
        baseRevision: status.revision,
        label,
        view: requireImageView(request.input),
        fileName: file.originalname?.trim() || label,
        mimeType: file.mimetype?.trim() || '',
        buffer: file.buffer
      })
      return {
        success: result.admitted > 0,
        message: result.admitted > 0
          ? text('Reference image admitted.', '参考原图已通过准入。')
          : text('Reference image was rejected by admission checks.', '参考原图未通过准入检查。'),
        refresh: true,
        data: stripConcurrencyControlFields(result)
      }
    } catch (error) {
      const code = error instanceof Error ? error.message.split(':')[0] : 'FILE_ACTION_FAILED'
      return failure(code, code)
    }
  }

  async resolveViewFile(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    request: XpertViewFileAccessRequest
  ): Promise<XpertViewFileResource> {
    if (viewKey !== IMG2THREEJS_VIEW_KEY || request.purpose !== 'preview' || !request.targetId) {
      throw new Error('REFERENCE_PREVIEW_NOT_AVAILABLE')
    }
    const asset = await this.workbench.resolveReferenceAsset(
      scopeFromView(context),
      request.targetId,
      request.fileKey
    )
    return {
      reference: toPortableReference(asset),
      fileName: asset.name,
      mimeType: asset.mimeType,
      size: asset.size
    }
  }
}

function scopeFromView(context: XpertResolvedViewHostContext): Scope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? null,
    userId: context.userId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.hostType === 'project' ? context.hostId : null,
    xpertId: context.hostType === 'agent' ? context.hostId : null
  }
}

function getStringParameter(
  parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined,
  key: string
): string | undefined {
  const value = parameters?.[key]
  const scalar = Array.isArray(value) ? value[0] : value
  return typeof scalar === 'string' && scalar.trim() ? scalar.trim() : undefined
}

function requireString(input: Record<string, unknown> | null | undefined, key: string): string {
  const value = input?.[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`INVALID_${key.toUpperCase()}`)
  return value.trim()
}

function requireBoundedString(
  input: Record<string, unknown> | null | undefined,
  key: string,
  maximum: number
): string {
  const value = requireString(input, key)
  if (value.length > maximum) throw new Error(`INVALID_${key.toUpperCase()}`)
  return value
}

function requireModelRoute(input: Record<string, unknown> | null | undefined): 'object' | 'character' {
  const value = input?.route
  if (value === 'object' || value === 'character') return value
  throw new Error('INVALID_ROUTE')
}

function requireModelingMode(
  input: Record<string, unknown> | null | undefined
): 'semantic-3d' | 'relief' {
  const value = input?.modelingMode
  if (value === 'semantic-3d' || value === 'relief') return value
  throw new Error('INVALID_MODELING_MODE')
}

function requireImageView(input: Record<string, unknown> | null | undefined): StudioImageView {
  const value = input?.view
  if (
    value === 'front' ||
    value === 'back' ||
    value === 'left' ||
    value === 'right' ||
    value === 'top' ||
    value === 'bottom' ||
    value === 'three-quarter' ||
    value === 'detail' ||
    value === 'unknown'
  ) return value
  throw new Error('INVALID_IMAGE_VIEW')
}

function optionalString(input: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requirePositiveInteger(input: Record<string, unknown> | null | undefined, key: string): number {
  const value = input?.[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`INVALID_${key.toUpperCase()}`)
  return value
}

function requireReviewStatus(input: Record<string, unknown> | null | undefined): HumanReviewStatus {
  const value = input?.humanReviewStatus
  if (value === 'approved' || value === 'changes_requested' || value === 'rejected') return value
  throw new Error('INVALID_REVIEW_STATUS')
}

function requireDecision(input: Record<string, unknown> | null | undefined): NextDecision {
  const value = input?.decision
  if (value === 'continue' || value === 'refine-spec' || value === 'refine-code' || value === 'request-input' || value === 'stop') return value
  throw new Error('INVALID_DECISION')
}

async function readPackageFile(packageName: string, relativePath: string): Promise<string> {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: true, message: text(en_US, zh_Hans), refresh: true }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans) }
}
