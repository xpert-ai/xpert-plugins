import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory,
  type TAgentMiddlewareMeta
} from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  RequestContext,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue,
  type WorkspaceFilesApi,
  type WorkspaceRuntimeFileBuffer
} from '@xpert-ai/plugin-sdk'
import {
  STORY_CREATE_PROJECT_TOOL_NAME,
  STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME,
  STORY_GET_PRODUCTION_TOOL_NAME,
  STORY_GET_CUT_HANDOFF_TOOL_NAME,
  STORY_GET_PROJECT_SUMMARY_TOOL_NAME,
  STORY_REPORT_FAILURE_TOOL_NAME,
  STORY_RECORD_CUT_HANDOFF_TOOL_NAME,
  STORY_SEARCH_PROJECTS_TOOL_NAME,
  STORY_SAVE_PRODUCTION_TOOL_NAME,
  STORY_PREPARE_CUT_HANDOFF_TOOL_NAME,
  STORY_STUDIO_AGENT_CAPABILITY,
  STORY_STUDIO_FEATURE,
  STORY_STUDIO_ICON,
  STORY_STUDIO_MIDDLEWARE_NAME,
  STORY_STUDIO_MUTATION_TOOL_NAMES,
  STORY_STUDIO_WORKBENCH_CAPABILITY,
  STORY_UPDATE_PROJECT_STATUS_TOOL_NAME,
  STORY_UPDATE_PROJECT_TOOL_NAME
} from './constants.js'
import { stringifyStoryAgentResult } from './story-agent-response.js'
import { defineStoryAgentTool } from './story-agent-tool.factory.js'
import {
  createStoryProjectSchema,
  getStoryProjectSummarySchema,
  reportStoryFailureSchema,
  searchStoryProjectsSchema,
  updateStoryProjectSchema,
  updateStoryProjectStatusSchema
} from './story-agent-tool.schemas.js'
import { StoryStudioService } from './story-studio.service.js'
import { StoryProductionService } from './story-production.service.js'
import { StoryGeneratedMediaService } from './story-generated-media.service.js'
import { StoryCutHandoffService } from './story-cut-handoff.service.js'
import {
  getStoryCutHandoffSchema,
  prepareStoryCutHandoffSchema,
  recordStoryCutHandoffDeliverySchema
} from './story-cut-handoff.schemas.js'
import type {
  GetStoryCutHandoffInput,
  PrepareStoryCutHandoffInput,
  RecordStoryCutHandoffDeliveryInput
} from './story-cut-handoff.types.js'
import {
  attachGeneratedVideoSchema,
  getStoryProductionSchema,
  saveStoryProductionSchema
} from './story-production.schemas.js'
import type {
  AttachGeneratedVideoInput,
  GetStoryProductionInput,
  SaveStoryProductionInput
} from './production-types.js'
import type {
  CreateStoryProjectInput,
  GetStoryProjectSummaryInput,
  ReportStoryFailureInput,
  SearchStoryProjectsInput,
  StoryScope,
  UpdateStoryProjectInput,
  UpdateStoryProjectStatusInput
} from './types.js'

const MUTATION_TOOL_NAMES = new Set<string>(
  STORY_STUDIO_MUTATION_TOOL_NAMES
)

@Injectable()
@AgentMiddlewareStrategy(STORY_STUDIO_MIDDLEWARE_NAME)
export class StoryStudioMiddleware
  implements IAgentMiddlewareStrategy<Record<string, never>>
{
  readonly meta: TAgentMiddlewareMeta = {
    name: STORY_STUDIO_MIDDLEWARE_NAME,
    label: {
      en_US: 'Story Studio',
      zh_Hans: 'Story Studio 故事工作室'
    },
    description: {
      en_US:
        'Create and manage scoped, revision-safe story-production projects with explicit review stages.',
      zh_Hans:
        '创建和管理带作用域、版本保护及明确审核阶段的故事制作项目。'
    },
    icon: {
      type: 'svg',
      value: STORY_STUDIO_ICON,
      color: '#7c3aed'
    },
    features: [
      STORY_STUDIO_FEATURE,
      STORY_STUDIO_AGENT_CAPABILITY,
      STORY_STUDIO_WORKBENCH_CAPABILITY
    ],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(
    private readonly service: StoryStudioService,
    private readonly production: StoryProductionService,
    private readonly generatedMedia: StoryGeneratedMediaService,
    private readonly cutHandoffs: StoryCutHandoffService
  ) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: STORY_STUDIO_MIDDLEWARE_NAME,
      tools: [
        defineStoryAgentTool(
          async (input: CreateStoryProjectInput) =>
            stringifyStoryAgentResult(
              (await this.service.createProject(scope, input)).receipt
            ),
          {
            name: STORY_CREATE_PROJECT_TOOL_NAME,
            description:
              'Create one scoped Story Studio project after the user approves its title and production format. Search first when a duplicate may exist. This creates project metadata only and does not prove that source material, scripts, storyboards, media, or exports exist.',
            schema: createStoryProjectSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: SearchStoryProjectsInput) =>
            stringifyStoryAgentResult(
              await this.service.searchProjects(scope, input)
            ),
          {
            name: STORY_SEARCH_PROJECTS_TOOL_NAME,
            description:
              'Search scoped Story Studio projects with server-side filtering and pagination. Returns compact project summaries only.',
            schema: searchStoryProjectsSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryProjectSummaryInput) =>
            stringifyStoryAgentResult(
              await this.service.getProjectSummary(scope, input)
            ),
          {
            name: STORY_GET_PROJECT_SUMMARY_TOOL_NAME,
            description:
              'Get one exact Story Studio project summary and current revision. Call this immediately before planning a project mutation.',
            schema: getStoryProjectSummarySchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpdateStoryProjectInput) =>
            stringifyStoryAgentResult(
              (await this.service.updateProject(scope, input)).receipt
            ),
          {
            name: STORY_UPDATE_PROJECT_TOOL_NAME,
            description:
              'Update bounded Story Studio project metadata using the exact baseRevision from story_get_project_summary. Reuse operationId only when retrying the identical mutation.',
            schema: updateStoryProjectSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: UpdateStoryProjectStatusInput) =>
            stringifyStoryAgentResult(
              (await this.service.updateProjectStatus(scope, input)).receipt
            ),
          {
            name: STORY_UPDATE_PROJECT_STATUS_TOOL_NAME,
            description:
              'Move a Story Studio project through an allowed lifecycle transition using its current baseRevision. Enter review, completed, failed, or archived only after explicit human approval.',
            schema: updateStoryProjectStatusSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: ReportStoryFailureInput) =>
            stringifyStoryAgentResult(
              (await this.service.reportFailure(scope, input)).receipt
            ),
          {
            name: STORY_REPORT_FAILURE_TOOL_NAME,
            description:
              'Record a stable Story Studio project failure code, recoverability, and bounded error message. This moves the project to failed and requires its current baseRevision.',
            schema: reportStoryFailureSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: SaveStoryProductionInput) =>
            stringifyStoryAgentResult(
              await this.production.saveProduction(scope, input)
            ),
          {
            name: STORY_SAVE_PRODUCTION_TOOL_NAME,
            description:
              'Save a complete, reviewable production document containing source synopsis, adaptation goal, visual style, characters, ordered scenes, shots, and optional media candidates. Use the exact current project revision. This mutation does not imply human approval.',
            schema: saveStoryProductionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryProductionInput) =>
            stringifyStoryAgentResult(
              await this.production.getProduction(scope, input)
            ),
          {
            name: STORY_GET_PRODUCTION_TOOL_NAME,
            description:
              'Read the complete saved Story Studio production document, shot counts, candidate counts, and total duration for one scoped project.',
            schema: getStoryProductionSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: AttachGeneratedVideoInput) => {
            const files = context.runtime.capabilities?.require(
              WorkspaceFilesRuntimeCapability
            )
            if (!files) {
              throw new Error(
                'Workspace Files capability is required for story_attach_generated_video.'
              )
            }
            const file = await files.readRuntimeBuffer(
              input.file as Parameters<
                typeof files.readRuntimeBuffer
              >[0]
            )
            const durableFile = await persistGeneratedVideo(
              files,
              input,
              file
            )
            return stringifyStoryAgentResult(
              await this.generatedMedia.attachGeneratedVideo(
                scope,
                input,
                durableFile
              )
            )
          },
          {
            name: STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME,
            description:
              'Attach one completed Seedance MP4 from the current Agent Workspace to an exact production shot. Read the latest Story Studio project revision first. Pass the workspacePath returned by seedance_video_query, its task id/model/status receipt, and select=true to make this video the shot render source. Never pass base64 or a provider URL.',
            schema: attachGeneratedVideoSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: PrepareStoryCutHandoffInput) =>
            stringifyStoryAgentResult(
              await this.cutHandoffs.prepare(scope, input)
            ),
          {
            name: STORY_PREPARE_CUT_HANDOFF_TOOL_NAME,
            description:
              'Freeze the exact selected Story Studio shot videos into a versioned StoryCutHandoff v1 contract. Every shot must have exactly one selected scoped Workspace MP4. The first contract targets Cut project creation; later Story revisions target a reviewable Cut proposal and never overwrite the timeline.',
            schema: prepareStoryCutHandoffSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: GetStoryCutHandoffInput) =>
            stringifyStoryAgentResult(
              await this.cutHandoffs.get(scope, input)
            ),
          {
            name: STORY_GET_CUT_HANDOFF_TOOL_NAME,
            description:
              'Read one exact or the latest StoryCutHandoff v1 contract for delivery to Cut. This explicit handoff read returns at most 24 ordered shots with bounded timing and scoped Workspace paths; use it only with cut_accept_story_handoff.',
            schema: getStoryCutHandoffSchema,
            verboseParsingErrors: true
          }
        ),
        defineStoryAgentTool(
          async (input: RecordStoryCutHandoffDeliveryInput) =>
            stringifyStoryAgentResult(
              await this.cutHandoffs.recordDelivery(scope, input)
            ),
          {
            name: STORY_RECORD_CUT_HANDOFF_TOOL_NAME,
            description:
              'Record the authoritative result returned by cut_accept_story_handoff. Initial delivery must record delivered with the created Cut project; later delivery must record proposal_ready with the reviewable proposal id. Record a stable failure instead of claiming delivery when Cut fails.',
            schema: recordStoryCutHandoffDeliverySchema,
            verboseParsingErrors: true
          }
        )
      ],
      wrapToolCall: async (request, handler) => {
        const toolName = request.toolCall.name
        const changeSummary = readChangeSummary(request.toolCall.args)
        if (!changeSummary || !MUTATION_TOOL_NAMES.has(toolName)) {
          return handler(request)
        }

        const createdAt = new Date()
        await dispatchStoryToolEvent(
          request,
          changeSummary,
          'running',
          createdAt
        )
        try {
          const result = await handler(request)
          await dispatchStoryToolEvent(
            request,
            changeSummary,
            'success',
            createdAt,
            { output: summarizeToolOutput(result) }
          )
          return result
        } catch (error) {
          await dispatchStoryToolEvent(
            request,
            changeSummary,
            'fail',
            createdAt,
            {
              error:
                error instanceof Error ? error.message : String(error)
            }
          )
          throw error
        }
      }
    }
  }
}

async function persistGeneratedVideo(
  files: WorkspaceFilesApi,
  input: AttachGeneratedVideoInput,
  source: WorkspaceRuntimeFileBuffer
): Promise<WorkspaceRuntimeFileBuffer> {
  const fileName = `${input.candidateId}.mp4`
  const written = await files.writeRuntimeBuffer({
    buffer: source.buffer,
    folder: `files/story-studio/${input.projectId}/generated`,
    fileName,
    originalName: fileName,
    mimeType: 'video/mp4',
    size: source.buffer.length,
    metadata: {
      source: 'story-studio',
      provider: input.providerReceipt.provider,
      providerTaskId: input.providerReceipt.taskId,
      sceneId: input.sceneId,
      shotId: input.shotId,
      candidateId: input.candidateId
    }
  })
  return {
    ...source,
    ...written,
    buffer: source.buffer,
    name: written.name,
    mimeType: written.mimeType ?? 'video/mp4',
    size: written.size ?? source.buffer.length,
    reference: written.reference
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): StoryScope {
  return {
    tenantId: context.tenantId,
    organizationId:
      context.organizationId === undefined
        ? RequestContext.getOrganizationId()
        : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    hostProjectId: context.projectId ?? null,
    userId: context.userId ?? null,
    assistantId: context.xpertId ?? null,
    conversationId: context.conversationId ?? null,
    actorType: 'agent'
  }
}

type StoryToolRequest = Parameters<
  NonNullable<AgentMiddleware['wrapToolCall']>
>[0]
type StoryToolArgs = StoryToolRequest['toolCall']['args']
type StoryToolStepStatus = 'running' | 'success' | 'fail'

function readChangeSummary(args: StoryToolArgs) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return null
  }
  const value = Reflect.get(args, 'changeSummary')
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function dispatchStoryToolEvent(
  request: StoryToolRequest,
  message: string,
  status: StoryToolStepStatus,
  createdAt: Date,
  details: {
    output?: Record<string, unknown>
    error?: string
  } = {}
) {
  const toolCall = request.toolCall
  const runtimeMetadata =
    request.runtime && typeof request.runtime === 'object'
      ? Reflect.get(request.runtime, 'metadata')
      : null
  const toolset =
    readMetadataString(runtimeMetadata, 'toolset') ??
    STORY_STUDIO_MIDDLEWARE_NAME
  const toolsetId = readMetadataString(runtimeMetadata, 'toolsetId')
  const payload = {
    id:
      typeof toolCall.id === 'string' && toolCall.id.trim()
        ? toolCall.id
        : `${toolCall.name}:${createdAt.getTime()}`,
    tool_call_id: toolCall.id,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    toolset,
    ...(toolsetId ? { toolset_id: toolsetId } : {}),
    tool: toolCall.name,
    title: message,
    message,
    status,
    created_date: createdAt,
    input: summarizeToolInput(toolCall.args),
    ...(details.output ? { output: details.output } : {}),
    ...(status === 'running' ? { end_date: null } : { end_date: new Date() }),
    ...(details.error ? { error: details.error } : {})
  }
  try {
    await dispatchCustomEvent(
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      payload
    )
  } catch {
    // Event delivery must never fail the authoritative project mutation.
  }
}

function summarizeToolInput(args: StoryToolArgs) {
  return pickCompactFields(args, [
    'projectId',
    'handoffId',
    'operationId',
    'baseRevision',
    'status',
    'productionFormat'
  ])
}

function summarizeToolOutput(value: unknown) {
  const candidates = collectToolOutputObjects(value)
  for (const candidate of candidates) {
    const summary = pickCompactFields(candidate, [
      'success',
      'duplicate',
      'operationId',
      'projectId',
      'handoffId',
      'cutProjectId',
      'cutProposalId',
      'previousRevision',
      'revision',
      'status'
    ])
    if (Object.keys(summary).length) {
      return summary
    }
  }
  return undefined
}

function collectToolOutputObjects(value: unknown) {
  const result: object[] = []
  const pending: unknown[] = [value]
  const seen = new Set<object>()
  while (pending.length && result.length < 16) {
    const current = pending.shift()
    if (typeof current === 'string') {
      const parsed = parseJsonObject(current)
      if (parsed) {
        pending.push(parsed)
      }
      continue
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      continue
    }
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    result.push(current)
    for (const key of [
      'content',
      'receipt',
      'data',
      'result',
      'project',
      'handoff'
    ]) {
      pending.push(Reflect.get(current, key))
    }
  }
  return result
}

function pickCompactFields(value: unknown, keys: readonly string[]) {
  const result: Record<string, unknown> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result
  }
  for (const key of keys) {
    const field = Reflect.get(value, key)
    if (
      typeof field === 'string' ||
      typeof field === 'number' ||
      typeof field === 'boolean'
    ) {
      result[key] = field
    }
  }
  return result
}

function parseJsonObject(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null
  } catch {
    return null
  }
}

function readMetadataString(value: object | null, key: string) {
  if (!value) {
    return null
  }
  const field = Reflect.get(value, key)
  return typeof field === 'string' && field.trim() ? field.trim() : null
}
