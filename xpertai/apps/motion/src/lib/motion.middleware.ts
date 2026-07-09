import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  MOTION_AGENT_CAPABILITY,
  MOTION_CREATE_PROJECT_TOOL_NAME,
  MOTION_EXPORT_ARTIFACT_TOOL_NAME,
  MOTION_FEATURE,
  MOTION_FINALIZE_VERSION_TOOL_NAME,
  MOTION_GET_PROJECT_TOOL_NAME,
  MOTION_GET_RECIPE_TOOL_NAME,
  MOTION_ICON,
  MOTION_LIBRARY_CAPABILITY,
  MOTION_MIDDLEWARE_NAME,
  MOTION_REPORT_FAILURE_TOOL_NAME,
  MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME,
  MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
  MOTION_SEARCH_RECIPES_TOOL_NAME,
  MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME,
  MOTION_WORKBENCH_CAPABILITY
} from './constants.js'
import {
  compactGetProjectResult,
  compactRecipeDetailResult,
  compactSearchRecipesResult,
  stringifyAgentToolResult,
  summarizeMutationResult
} from './motion-agent-response.js'
import { MotionService } from './motion.service.js'
import type { MotionJsonValue, MotionScope } from './types.js'

const surfaceSchema = z.enum(['web', 'video'])
const statusSchema = z.enum(['draft', 'reviewed', 'archived', 'failed'])
const exportKindSchema = z.enum(['html', 'css', 'react', 'lottie', 'json', 'mp4', 'gif'])
const versionSourceSchema = z.enum(['agent_web', 'agent_video', 'workbench', 'import', 'restore'])
const jsonValueSchema: z.ZodType<MotionJsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
)
const jsonObjectSchema = z.record(jsonValueSchema)
const videoCompositionSchema = z.object({}).catchall(jsonValueSchema)

const searchRecipesSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  surface: z.string().optional(),
  target: z.string().optional(),
  runtime: z.string().optional(),
  exportKind: z.string().optional(),
  status: z.string().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional()
})

const getRecipeSchema = z.object({
  recipeId: z.string().min(1)
})

const createProjectSchema = z.object({
  title: z.string().min(1),
  brief: z.string().optional(),
  surface: surfaceSchema,
  designSystemId: z.string().optional(),
  motionProfile: z.string().optional(),
  selectedRecipeIds: z.array(z.string()).optional(),
  html: z.string().optional(),
  videoComposition: videoCompositionSchema.optional(),
  changeSummary: z.string().optional()
})

const getProjectSchema = z.object({
  projectId: z.string().min(1),
  versionLimit: z.number().int().min(1).max(100).optional(),
  includeLogs: z.boolean().optional(),
  logLimit: z.number().int().min(1).max(100).optional()
})

const saveWebArtifactSchema = z.object({
  projectId: z.string().min(1),
  html: z.string().min(1),
  selectedRecipeIds: z.array(z.string()).optional(),
  componentSelection: jsonObjectSchema.optional(),
  changeSummary: z.string().optional()
})

const saveVideoCompositionSchema = z.object({
  projectId: z.string().min(1),
  composition: videoCompositionSchema,
  selectedRecipeIds: z.array(z.string()).optional(),
  layerSelection: jsonObjectSchema.optional(),
  changeSummary: z.string().optional()
})

const finalizeVersionSchema = z.object({
  projectId: z.string().min(1),
  sourceType: versionSourceSchema.optional(),
  changeSummary: z.string().optional()
})

const exportArtifactSchema = z.object({
  projectId: z.string().min(1),
  kind: exportKindSchema,
  versionId: z.string().optional(),
  fileName: z.string().optional(),
  content: z.string().optional(),
  mimeType: z.string().optional(),
  changeSummary: z.string().optional()
})

const updateStatusSchema = z.object({
  projectId: z.string().min(1),
  status: statusSchema,
  reason: z.string().optional()
})

const reportFailureSchema = z.object({
  projectId: z.string().optional(),
  versionId: z.string().optional(),
  operation: z.string().min(1),
  errorMessage: z.string().min(1),
  recoverable: z.boolean().optional(),
  evidence: jsonValueSchema.optional()
})

const MUTATION_TOOL_NAMES = new Set([
  MOTION_CREATE_PROJECT_TOOL_NAME,
  MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
  MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME,
  MOTION_FINALIZE_VERSION_TOOL_NAME,
  MOTION_EXPORT_ARTIFACT_TOOL_NAME,
  MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME
])

@Injectable()
@AgentMiddlewareStrategy(MOTION_MIDDLEWARE_NAME)
export class MotionMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MOTION_MIDDLEWARE_NAME,
    label: {
      en_US: 'Motion',
      zh_Hans: 'Motion 动效'
    },
    description: {
      en_US: 'Create, refine, version, and export animated HTML and launch video compositions from an Agent.',
      zh_Hans: '让 Agent 创建、精修、版本化并导出动效网页和发布视频合成。'
    },
    icon: {
      type: 'svg',
      value: MOTION_ICON,
      color: '#2563eb'
    },
    features: [MOTION_FEATURE, MOTION_AGENT_CAPABILITY, MOTION_WORKBENCH_CAPABILITY, MOTION_LIBRARY_CAPABILITY],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: MotionService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: MOTION_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input) => stringifyAgentToolResult(compactSearchRecipesResult(this.service.searchRecipes(input))),
          {
            name: MOTION_SEARCH_RECIPES_TOOL_NAME,
            description:
              'Search the Motion recipe library by intent, surface, target, runtime, export kind, and query. Call this before choosing recipes for a project.',
            schema: searchRecipesSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(compactRecipeDetailResult(this.service.getRecipe(input.recipeId))),
          {
            name: MOTION_GET_RECIPE_TOOL_NAME,
            description: 'Fetch compact metadata for one Motion recipe by recipeId, including implementation file names and manifest/skill byte counts.',
            schema: getRecipeSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => {
            const result = await this.service.createProject(scope, input)
            return stringifyAgentToolResult(
              summarizeMutationResult({
                message: `Motion project "${result.item.title}" was created.`,
                project: result.item
              })
            )
          },
          {
            name: MOTION_CREATE_PROJECT_TOOL_NAME,
            description:
              'Create a reviewable Motion project. Call this before saving HTML or video composition artifacts unless env.motionProjectId already exists.',
            schema: createProjectSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(compactGetProjectResult(await this.service.getProject(scope, input))),
          {
            name: MOTION_GET_PROJECT_TOOL_NAME,
            description: 'Get compact Motion project metadata, working-copy summary, recent version/export pointers, and optional log count.',
            schema: getProjectSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeMutationResult(await this.service.saveWebArtifact(scope, input))),
          {
            name: MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
            description:
              'Save a complete self-contained HTML artifact for an existing Motion project. The backend injects the Motion runtime and reduced-motion fallback.',
            schema: saveWebArtifactSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeMutationResult(await this.service.saveVideoComposition(scope, input))),
          {
            name: MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME,
            description:
              'Save a launch-video JSON composition with scenes or layers, keyframe tracks, kinetic typography, transitions, and motion paths.',
            schema: saveVideoCompositionSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeMutationResult(await this.service.finalizeVersion(scope, input))),
          {
            name: MOTION_FINALIZE_VERSION_TOOL_NAME,
            description:
              'Finalize the current Motion working copy as a reviewable version. Call this after save_web_artifact or save_video_composition succeeds.',
            schema: finalizeVersionSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeMutationResult(await this.service.exportArtifact(scope, input))),
          {
            name: MOTION_EXPORT_ARTIFACT_TOOL_NAME,
            description:
              'Export a Motion project as html, css, react, lottie, or json and return compact export metadata. For mp4/gif, return instructions to use the Workbench browser exporter.',
            schema: exportArtifactSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeMutationResult(await this.service.updateProjectStatus(scope, input))),
          {
            name: MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME,
            description: 'Update a Motion project status to draft, reviewed, archived, or failed after user confirmation.',
            schema: updateStatusSchema,
            verboseParsingErrors: true
          }
        ),
        tool(
          async (input) => stringifyAgentToolResult(summarizeMutationResult(await this.service.reportFailure(scope, input))),
          {
            name: MOTION_REPORT_FAILURE_TOOL_NAME,
            description: 'Record a failed Motion generation, save, import, export, or edit attempt with evidence and recoverability.',
            schema: reportFailureSchema,
            verboseParsingErrors: true
          }
        )
      ],
      wrapToolCall: async (request, handler) => {
        const message = readChangeSummaryMessage(request.toolCall.args)
        if (!message || !MUTATION_TOOL_NAMES.has(request.toolCall.name)) {
          return handler(request)
        }
        const createdAt = new Date()
        await dispatchMotionToolStepEvent({ request, message, status: 'running', createdAt })
        try {
          const result = await handler(request)
          await dispatchMotionToolStepEvent({ request, message, status: 'success', createdAt })
          return result
        } catch (error) {
          await dispatchMotionToolStepEvent({
            request,
            message,
            status: 'fail',
            createdAt,
            error: getErrorMessage(error)
          })
          throw error
        }
      }
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): MotionScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    conversationId: context.conversationId ?? null,
    assistantId: context.xpertId ?? null
  }
}

function readChangeSummaryMessage(args: MotionJsonValue | object | null | undefined) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return undefined
  }
  const value = (args as { changeSummary?: unknown }).changeSummary
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

type MotionToolStepStatus = 'running' | 'success' | 'fail'

async function dispatchMotionToolStepEvent({
  request,
  message,
  status,
  createdAt,
  error
}: {
  request: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
  message: string
  status: MotionToolStepStatus
  createdAt: Date
  error?: string
}) {
  const toolCall = request.toolCall
  const toolCallId = getMotionToolCallDisplayId(toolCall)
  const input = summarizeToolInput(toolCall.args)
  await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
    id: toolCallId,
    tool_call_id: toolCall.id,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    toolset: MOTION_MIDDLEWARE_NAME,
    tool: toolCall.name,
    title: message,
    message,
    status,
    created_date: createdAt,
    createdAt,
    ...(status === 'running' ? { end_date: null } : { end_date: new Date() }),
    ...(error ? { error } : {}),
    data: {
      toolName: toolCall.name,
      toolCallId: toolCall.id ?? null,
      input,
      error
    },
    input
  })
}

function getMotionToolCallDisplayId(toolCall: { id?: string; name: string }) {
  if (typeof toolCall.id === 'string' && toolCall.id.trim()) {
    return toolCall.id.trim()
  }
  return toolCall.name
}

function summarizeToolInput(value: MotionJsonValue | object | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const input = value as { projectId?: unknown; title?: unknown; surface?: unknown; kind?: unknown }
  return {
    projectId: typeof input.projectId === 'string' ? input.projectId : undefined,
    title: typeof input.title === 'string' ? input.title.slice(0, 120) : undefined,
    surface: typeof input.surface === 'string' ? input.surface : undefined,
    kind: typeof input.kind === 'string' ? input.kind : undefined
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Motion tool failed')
}
