import { cutOperationDefinition } from './cut-operation-definitions.js'
import { changeSummary, cutProjectUuid, currentProjectId, createProjectSchema, getProjectSchema, expectedRevision, listTracksSchema, listClipsSchema, getClipSchema, listMediaAssetsSchema, getMediaAssetSchema, listProjectResourcesSchema, importMediaSchema, editSchema, editBatchSchema, finalizeSchema, reportFailureSchema, importSubtitleSchema, startTranscriptionSchema, startHeadlessExportSchema, cancelAnalysisJobSchema, getAnalysisJobSchema, searchMediaSegmentsSchema, getMediaSegmentSchema, createEditProposalSchema, getEditProposalSchema, updateEditProposalSchema, applyEditProposalSchema, rejectEditProposalSchema, revertEditProposalSchema, listTranscriptSegmentsSchema, createCaptionDraftSchema, createTranslatedCaptionDraftSchema, createSpeechCleanupProposalSchema, getCaptionDraftSchema, updateCaptionDraftSchema, commitCaptionDraftSchema, commitCaptionDraftsSchema, exportSubtitleSchema, ATOMIC_EDIT_TOOL_SPECS } from './cut-tool-schemas.js'
import { CUT_DISCOVER_TOOLS, CUT_EXECUTE_TOOL, CUT_TOOL_PROFILES, CUT_DETAIL_READS, cutDiscoverySchema, cutExecutionSchema, cutProfileTools, cutProfileInstructions } from './cut-tool-profiles.js'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, type TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  RequestContext,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  CUT_AGENT_CAPABILITY,
  CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME,
  CUT_APPLY_BATCH_TOOL_NAME,
  CUT_APPLY_EDIT_TOOL_NAME,
  CUT_CREATE_PROJECT_TOOL_NAME,
  CUT_CREATE_CAPTION_DRAFT_TOOL_NAME,
  CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME,
  CUT_CREATE_TRANSLATED_CAPTION_DRAFT_TOOL_NAME,
  CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME,
  CUT_COMMIT_CAPTION_DRAFTS_TOOL_NAME,
  CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
  CUT_FEATURE,
  CUT_FINALIZE_VERSION_TOOL_NAME,
  CUT_EXPORT_SUBTITLE_TOOL_NAME,
  CUT_GET_ANALYSIS_JOB_TOOL_NAME,
  CUT_GET_CAPTION_DRAFT_TOOL_NAME,
  CUT_GET_CLIP_TOOL_NAME,
  CUT_GET_MEDIA_ASSET_TOOL_NAME,
  CUT_GET_MEDIA_SEGMENT_TOOL_NAME,
  CUT_GET_EDIT_PROPOSAL_TOOL_NAME,
  CUT_GET_PROJECT_TOOL_NAME,
  CUT_ICON,
  CUT_IMPORT_MEDIA_TOOL_NAME,
  CUT_IMPORT_SUBTITLE_TOOL_NAME,
  CUT_LIST_CLIPS_TOOL_NAME,
  CUT_LIST_MEDIA_ASSETS_TOOL_NAME,
  CUT_LIST_PROJECT_RESOURCES_TOOL_NAME,
  CUT_LIST_TRACKS_TOOL_NAME,
  CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME,
  CUT_MIDDLEWARE_NAME,
  CUT_MIDDLEWARE_TOOL_NAMES,
  CUT_REPORT_FAILURE_TOOL_NAME,
  CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME,
  CUT_START_TRANSCRIPTION_TOOL_NAME,
  CUT_START_HEADLESS_EXPORT_TOOL_NAME,
  CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME,
  CUT_UPDATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_UPDATE_CAPTION_DRAFT_TOOL_NAME,
  CUT_WORKBENCH_CAPABILITY
} from './constants.js'
import { CutCaptionService } from './cut-caption.service.js'
import { CutService } from './cut.service.js'
import { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import { CutProposalService } from './cut-proposal.service.js'
import { CutRenderService } from './cut-render.service.js'
import { CutStoryHandoffService } from './cut-story-handoff.service.js'
import {
  cutAcceptStoryHandoffSchema,
  type AcceptStoryCutHandoffInput
} from './cut-story-handoff.js'
import type { SearchCutMediaSegmentsInput } from './cut-media-intelligence.service.js'
import type { ApplyCutEditBatchInput, ApplyCutEditInput, CutEditOperation, CutJsonValue, CutScope } from './types.js'

const MUTATIONS = new Set<string>(CUT_MIDDLEWARE_TOOL_NAMES)
MUTATIONS.delete(CUT_GET_PROJECT_TOOL_NAME)
MUTATIONS.delete(CUT_LIST_TRACKS_TOOL_NAME)
MUTATIONS.delete(CUT_LIST_CLIPS_TOOL_NAME)
MUTATIONS.delete(CUT_GET_CLIP_TOOL_NAME)
MUTATIONS.delete(CUT_LIST_MEDIA_ASSETS_TOOL_NAME)
MUTATIONS.delete(CUT_GET_MEDIA_ASSET_TOOL_NAME)
MUTATIONS.delete(CUT_LIST_PROJECT_RESOURCES_TOOL_NAME)
MUTATIONS.delete(CUT_GET_EDIT_PROPOSAL_TOOL_NAME)
MUTATIONS.delete(CUT_REPORT_FAILURE_TOOL_NAME)

const CURRENT_PROJECT_TOOLS = new Set<string>(CUT_MIDDLEWARE_TOOL_NAMES)
CURRENT_PROJECT_TOOLS.delete(CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME)
CURRENT_PROJECT_TOOLS.delete(CUT_CREATE_PROJECT_TOOL_NAME)
CURRENT_PROJECT_TOOLS.delete(CUT_REPORT_FAILURE_TOOL_NAME)

const MISSING_PROJECT_CONTEXT_MESSAGE =
  'No Cut projectId was provided and no active Cut Workbench project is available. Ask the user to select a Cut project or create one first.'

export type CutToolExecutionContext = Pick<
  IAgentMiddlewareContext,
  | 'tenantId'
  | 'organizationId'
  | 'userId'
  | 'workspaceId'
  | 'projectId'
  | 'conversationId'
  | 'xpertId'
  | 'xpertFeatures'
> & {
  runtime: Pick<IAgentMiddlewareContext['runtime'], 'capabilities'>
}

export const CUT_MIDDLEWARE_META: TAgentMiddlewareMeta = {
    name: CUT_MIDDLEWARE_NAME,
    label: { en_US: 'Cut', zh_Hans: 'Cut 视频剪辑' },
    description: {
      en_US: 'Create and edit versioned non-linear video timelines with scoped workspace media.',
      zh_Hans: '创建并编辑带版本和工作区媒体的非线性视频时间线。'
    },
    icon: { type: 'svg', value: CUT_ICON, color: '#0ea5e9' },
    features: [CUT_FEATURE, CUT_AGENT_CAPABILITY, CUT_WORKBENCH_CAPABILITY],
    configSchema: { type: 'object', properties: {}, required: [] }
  }

@Injectable()
export class CutMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta = CUT_MIDDLEWARE_META

  constructor(
    private readonly service: CutService,
    private readonly captions: CutCaptionService,
    private readonly intelligence: CutMediaIntelligenceService,
    private readonly proposals: CutProposalService,
    private readonly renders: CutRenderService,
    private readonly storyHandoffs?: CutStoryHandoffService
  ) {}

  // Internal operation registry is also consumed by the existing per-operation MCP publication.
  createOperationTools(context: IAgentMiddlewareContext | CutToolExecutionContext): NonNullable<AgentMiddleware['tools']> {
    const scope = scopeFromContext(context)
    return [
        tool(async (input: AcceptStoryCutHandoffInput) => {
          const files = context.runtime.capabilities?.require(
            WorkspaceFilesRuntimeCapability
          )
          if (!files) {
            throw new Error(
              'Workspace Files capability is required for cut_accept_story_handoff.'
            )
          }
          if (!this.storyHandoffs) {
            throw new Error(
              'Cut Story handoff service is unavailable.'
            )
          }
          return compact(
            await this.storyHandoffs.accept(
              scope,
              input,
              (workspacePath) => files.readRuntimeBuffer(workspacePath)
            )
          )
        }, { ...cutOperationDefinition(CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME), schema: cutAcceptStoryHandoffSchema }),
        tool(async (input) => {
          const result = await this.service.createProject(scope, input)
          return compact({
            success: true,
            projectId: result.item.id ?? null,
            revision: result.item.revision,
            status: result.item.status,
            changeSummary: input.changeSummary
          })
        }, { ...cutOperationDefinition(CUT_CREATE_PROJECT_TOOL_NAME), schema: createProjectSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.service.getProjectSummary(scope, input.projectId))
        }, { ...cutOperationDefinition(CUT_GET_PROJECT_TOOL_NAME), schema: getProjectSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.service.listTracks(scope, input))
        }, { ...cutOperationDefinition(CUT_LIST_TRACKS_TOOL_NAME), schema: listTracksSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.service.listClips(scope, input))
        }, { ...cutOperationDefinition(CUT_LIST_CLIPS_TOOL_NAME), schema: listClipsSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.service.getClip(scope, input))
        }, { ...cutOperationDefinition(CUT_GET_CLIP_TOOL_NAME), schema: getClipSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.service.listMediaAssets(scope, input))
        }, { ...cutOperationDefinition(CUT_LIST_MEDIA_ASSETS_TOOL_NAME), schema: listMediaAssetsSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.service.getMediaAsset(scope, input))
        }, { ...cutOperationDefinition(CUT_GET_MEDIA_ASSET_TOOL_NAME), schema: getMediaAssetSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.service.listProjectResources(scope, input))
        }, { ...cutOperationDefinition(CUT_LIST_PROJECT_RESOURCES_TOOL_NAME), schema: listProjectResourcesSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const files = context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability)
          if (!files) throw new Error('Workspace Files capability is required for cut_import_media.')
          const file = await files.readRuntimeBuffer(input.file)
          const result = await this.service.registerRuntimeMedia(scope, input.projectId, file, input.duration, input.baseRevision, input.changeSummary)
          return compact({
            success: result.success,
            projectId: result.project.id ?? input.projectId,
            revision: result.project.revision,
            mediaAssetId: result.media.id ?? null,
            changedClipIds: result.changedClipIds,
            changedTrackIds: result.changedTrackIds,
            changeSummary: input.changeSummary
          })
        }, { ...cutOperationDefinition(CUT_IMPORT_MEDIA_TOOL_NAME), schema: importMediaSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const result = await this.service.applyEdit(scope, input as ApplyCutEditInput)
          return compact({
            success: result.success,
            projectId: result.project.id ?? input.projectId,
            revision: result.project.revision,
            operation: input.operation.kind,
            changedClipIds: result.changedClipIds,
            changedTrackIds: result.changedTrackIds,
            changeSummary: input.changeSummary
          })
        }, { ...cutOperationDefinition(CUT_APPLY_EDIT_TOOL_NAME), schema: editSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const result = await this.service.applyEditBatch(scope, input as ApplyCutEditBatchInput)
          return compact({
            success: result.success,
            applied: result.applied,
            projectId: result.project.id ?? input.projectId,
            revision: result.project.revision,
            operationCount: input.operations.length,
            changedClipIds: result.changedClipIds,
            changedTrackIds: result.changedTrackIds,
            changeSummary: input.changeSummary
          })
        }, { ...cutOperationDefinition(CUT_APPLY_BATCH_TOOL_NAME), schema: editBatchSchema }),
        ...ATOMIC_EDIT_TOOL_SPECS.map((spec) => createAtomicEditTool(this.service, scope, spec)),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const files = context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability)
          if (!files) throw new Error('Workspace Files capability is required for cut_import_subtitle.')
          const file = await files.readRuntimeBuffer(input.file)
          return compact(await this.captions.importSubtitle(scope, input, { buffer: file.buffer, name: file.name }))
        }, { ...cutOperationDefinition(CUT_IMPORT_SUBTITLE_TOOL_NAME), schema: importSubtitleSchema }),
        tool(async (rawInput) => {
          const parsed = requireCutProjectInput(rawInput)
          const input = { ...parsed, mode: parsed.mode ?? 'sandbox_whisper' as const }
          if (input.mode === 'platform') {
            const feature = context.xpertFeatures?.speechToText
            if (!feature?.enabled || !feature.copilotModel) {
              throw new Error('Enable and configure Speech-to-Text on the current Xpert before starting platform transcription, or use mode sandbox_whisper.')
            }
            if (!context.xpertId) throw new Error('Cut platform transcription requires the current Xpert id.')
            return compact(await this.captions.startTranscription(scope, input, context.xpertId, feature.copilotModel))
          }
          return compact(await this.captions.startTranscription(scope, input))
        }, { ...cutOperationDefinition(CUT_START_TRANSCRIPTION_TOOL_NAME), schema: startTranscriptionSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const job = await this.captions.getAnalysisJob(scope, input.projectId, input.jobId)
          return compact(job.type === 'render'
            ? await this.renders.cancel(scope, input.projectId, input.jobId, input.changeSummary)
            : await this.captions.cancelAnalysisJob(scope, input.projectId, input.jobId, input.changeSummary))
        }, { ...cutOperationDefinition(CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME), schema: cancelAnalysisJobSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.renders.start(scope, input))
        }, { ...cutOperationDefinition(CUT_START_HEADLESS_EXPORT_TOOL_NAME), schema: startHeadlessExportSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.getAnalysisJob(scope, input.projectId, input.jobId))
        }, { ...cutOperationDefinition(CUT_GET_ANALYSIS_JOB_TOOL_NAME), schema: getAnalysisJobSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(sanitizeCutToolEvidence(await this.intelligence.search(scope, input as SearchCutMediaSegmentsInput)))
        }, { ...cutOperationDefinition(CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME), schema: searchMediaSegmentsSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(sanitizeCutToolEvidence(await this.intelligence.getSegment(scope, input.projectId, input.segmentId)))
        }, { ...cutOperationDefinition(CUT_GET_MEDIA_SEGMENT_TOOL_NAME), schema: getMediaSegmentSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(sanitizeCutToolEvidence(await this.proposals.create(scope, input)))
        }, { ...cutOperationDefinition(CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME), schema: createEditProposalSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(sanitizeCutToolEvidence(await this.proposals.createSpeechCleanup(scope, input)))
        }, { ...cutOperationDefinition(CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME), schema: createSpeechCleanupProposalSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(sanitizeCutToolEvidence(await this.proposals.get(scope, input.projectId, input.proposalId, false)))
        }, { ...cutOperationDefinition(CUT_GET_EDIT_PROPOSAL_TOOL_NAME), schema: getEditProposalSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const result = await this.proposals.update(scope, input)
          return compact(sanitizeCutToolEvidence({ success: true, proposal: result.item, preview: {
            changedClipIds: result.preview.changedClipIds,
            changedTrackIds: result.preview.changedTrackIds,
            estimatedDurationSeconds: result.preview.estimatedDurationSeconds,
            enabledItemCount: result.preview.enabledItemCount
          } }))
        }, { ...cutOperationDefinition(CUT_UPDATE_EDIT_PROPOSAL_TOOL_NAME), schema: updateEditProposalSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.proposals.apply(scope, input))
        }, { ...cutOperationDefinition(CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME), schema: applyEditProposalSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.proposals.reject(scope, input))
        }, { ...cutOperationDefinition(CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME), schema: rejectEditProposalSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.proposals.revert(scope, input))
        }, { ...cutOperationDefinition(CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME), schema: revertEditProposalSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.listTranscriptSegments(
            scope, input.projectId, input.transcriptId, input.page, input.pageSize
          ))
        }, { ...cutOperationDefinition(CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME), schema: listTranscriptSegmentsSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.createCaptionDraft(scope, input))
        }, { ...cutOperationDefinition(CUT_CREATE_CAPTION_DRAFT_TOOL_NAME), schema: createCaptionDraftSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.createTranslatedCaptionDraft(scope, input))
        }, { ...cutOperationDefinition(CUT_CREATE_TRANSLATED_CAPTION_DRAFT_TOOL_NAME), schema: createTranslatedCaptionDraftSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.getCaptionDraft(
            scope, input.projectId, input.draftId, input.page, input.pageSize
          ))
        }, { ...cutOperationDefinition(CUT_GET_CAPTION_DRAFT_TOOL_NAME), schema: getCaptionDraftSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.updateCaptionDraft(scope, input))
        }, { ...cutOperationDefinition(CUT_UPDATE_CAPTION_DRAFT_TOOL_NAME), schema: updateCaptionDraftSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.commitCaptionDraft(scope, input))
        }, { ...cutOperationDefinition(CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME), schema: commitCaptionDraftSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.commitCaptionDrafts(scope, input))
        }, { ...cutOperationDefinition(CUT_COMMIT_CAPTION_DRAFTS_TOOL_NAME), schema: commitCaptionDraftsSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const files = context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability)
          if (!files) throw new Error('Workspace Files capability is required for cut_export_subtitle.')
          const exported = await this.captions.exportCaptionDraft(scope, input.projectId, input.draftId, input.format)
          const name = safeSubtitleName(input.fileName ?? `captions-${input.draftId}.${input.format}`, input.format)
          const written = await files.writeRuntimeBuffer({
            buffer: Buffer.from(exported.content, 'utf8'),
            originalName: name,
            fileName: name,
            folder: `files/cut/${input.projectId}/subtitles`,
            mimeType: subtitleMimeType(input.format),
            metadata: { plugin: 'cut', cutProjectId: input.projectId, draftId: input.draftId, format: input.format }
          })
          await this.captions.recordSubtitleExport(scope, input.projectId, input.draftId, input.format, exported.captionCount, input.changeSummary)
          return compact({
            success: true,
            projectId: input.projectId,
            draftId: input.draftId,
            format: input.format,
            captionCount: exported.captionCount,
            file: written.reference,
            changeSummary: input.changeSummary
          })
        }, { ...cutOperationDefinition(CUT_EXPORT_SUBTITLE_TOOL_NAME), schema: exportSubtitleSchema }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const result = await this.service.finalizeVersion(scope, input.projectId, input.baseRevision, input.changeSummary)
          return compact({
            success: result.success,
            projectId: result.project.id ?? input.projectId,
            revision: result.project.revision,
            versionId: result.version.id ?? null,
            versionNumber: result.version.versionNumber,
            changeSummary: input.changeSummary
          })
        }, { ...cutOperationDefinition(CUT_FINALIZE_VERSION_TOOL_NAME), schema: finalizeSchema }),
        tool(async (input) => compact(await this.service.reportFailure(scope, input)), { ...cutOperationDefinition(CUT_REPORT_FAILURE_TOOL_NAME), schema: reportFailureSchema }),
    ]
  }

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext | CutToolExecutionContext
  ): AgentMiddleware {
    const operations = this.createOperationTools(context)
    const registry = new Map(operations.map((operation) => [operation.name, operation]))
    const base = new Set(cutProfileTools('base'))
    return {
      name: CUT_MIDDLEWARE_NAME,
      tools: [
        ...operations.filter((operation) => base.has(operation.name)),
        tool(async ({ profiles }) => compact(profiles.length ? {
          profiles: profiles.map((profile) => ({ profile, operations: cutProfileTools(profile).map((name) => {
            const operation = registry.get(name)
            if (!operation) throw new Error(`Unknown Cut operation: ${name}`)
            return { name, description: operation.description, inputSchema: toJsonSchema(operation.schema) }
          }) }))
        } : { profiles: [...CUT_TOOL_PROFILES.map(({ id, tools }) => ({ id, operations: tools })),
          { id: 'detail-reads', operations: CUT_DETAIL_READS }] }), {
          name: CUT_DISCOVER_TOOLS,
          description: 'List Cut profiles, or return operation descriptions and parameter schemas for requested profiles. Read-only discovery; does not grant approval.',
          schema: cutDiscoverySchema
        }),
        tool(async (input, config) => {
          if (!cutProfileTools(input.profile).includes(input.operation)) {
            throw new Error(`Cut operation ${input.operation} does not belong to profile ${input.profile}`)
          }
          const operation = registry.get(input.operation)
          if (!operation) throw new Error(`Unknown Cut operation: ${input.operation}`)
          // Invoke the original structured tool: its schema, scoped service and revision checks still apply.
          if (!(operation.schema instanceof z.ZodType)) throw new Error('Cut operation requires a Zod schema')
          const args = await operation.schema.parseAsync(input.arguments)
          return operation.invoke(args, config)
        }, {
          name: CUT_EXECUTE_TOOL,
          description: 'Execute a discovered Cut operation using its exact arguments. Writes require the same user approval and revision preconditions as the original operation. Discovery is not approval.',
          schema: cutExecutionSchema
        })
      ],
      wrapModelCall: (request, handler) => {
        const currentProject = resolveCurrentWorkbenchProject(request.runtime)
        const instructions = [cutProfileInstructions(),
          currentProject ? buildCurrentProjectSystemPrompt(currentProject) : ''].filter(Boolean).join('\n\n')
        return handler({
          ...request,
          systemMessage: appendSystemMessage(request.systemMessage, instructions)
        })
      },
      wrapToolCall: async (request, handler) => {
        const envelope = request.toolCall.name === CUT_EXECUTE_TOOL
          ? cutExecutionSchema.parse(request.toolCall.args) : null
        const prepared = prepareCutToolRequest(envelope ? {
          ...request, toolCall: { ...request.toolCall, name: envelope.operation, args: envelope.arguments }
        } : request)
        if (prepared instanceof ToolMessage) return prepared

        const dispatch = () => handler(envelope ? {
          ...request, toolCall: { ...request.toolCall, args: { ...envelope, arguments: prepared.toolCall.args } }
        } : prepared)
        const summary = readChangeSummary(prepared.toolCall.args)
        if (!summary || !MUTATIONS.has(prepared.toolCall.name)) return dispatch()
        const createdAt = new Date()
        await safeDispatchToolEvent(prepared, summary, 'running', createdAt)
        try {
          const result = await dispatch()
          await safeDispatchToolEvent(prepared, summary, 'success', createdAt, undefined, result)
          return result
        } catch (error) {
          await safeDispatchToolEvent(prepared, summary, 'fail', createdAt, errorMessage(error))
          throw error
        }
      }
    }
  }
}

function createAtomicEditTool(
  service: CutService,
  scope: CutScope,
  spec: typeof ATOMIC_EDIT_TOOL_SPECS[number]
) {
  const schema = z.object({
    projectId: currentProjectId,
    operation: spec.operationSchema,
    baseRevision: z.number().int().positive(),
    changeSummary
  })
  return tool(async (rawInput) => {
    const input = requireCutProjectInput(rawInput)
    const operation = input.operation as CutEditOperation
    const result = await service.applyEdit(scope, {
      projectId: input.projectId,
      operation,
      baseRevision: input.baseRevision,
      changeSummary: input.changeSummary
    })
    return compact({
      success: result.success,
      projectId: result.project.id ?? input.projectId,
      revision: result.project.revision,
      operation: operation.kind,
      changedClipIds: result.changedClipIds,
      changedTrackIds: result.changedTrackIds,
      changeSummary: input.changeSummary
    })
  }, {
    ...cutOperationDefinition(spec.name),
    schema
  })
}

type CutToolCallRequest = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
type RuntimeContextRecord = Record<string, unknown>
type CurrentCutWorkbenchProject = {
  projectId: string
  revision?: number
  selectedClipId?: string
  dirty?: boolean
}

function prepareCutToolRequest(request: CutToolCallRequest): CutToolCallRequest | ToolMessage {
  if (!CURRENT_PROJECT_TOOLS.has(request.toolCall.name)) return request

  const args = isRecord(request.toolCall.args) ? request.toolCall.args : {}
  const explicitProjectId = getString(args['projectId'])
  if (explicitProjectId && cutProjectUuid.safeParse(explicitProjectId).success) return request

  const currentProject = resolveCurrentWorkbenchProject(request.runtime)
  if (currentProject) {
    return {
      ...request,
      toolCall: {
        ...request.toolCall,
        args: {
          ...args,
          projectId: currentProject.projectId
        }
      }
    }
  }

  return new ToolMessage({
    content: MISSING_PROJECT_CONTEXT_MESSAGE,
    tool_call_id: request.toolCall.id ?? 'unknown',
    name: request.toolCall.name,
    status: 'error'
  })
}

function requireCutProjectInput<T extends { projectId?: string }>(input: T): T & { projectId: string } {
  if (!input.projectId) throw new Error(MISSING_PROJECT_CONTEXT_MESSAGE)
  return Object.assign({}, input, { projectId: input.projectId })
}

function resolveCurrentWorkbenchProject(runtime: unknown): CurrentCutWorkbenchProject | null {
  const runtimeContext = resolveRuntimeContext(runtime)
  const cutContext = getRecord(runtimeContext, 'cut')
  const currentProject = getRecord(cutContext, 'currentProject')
  const env = getRecord(runtimeContext, 'env')
  const projectId = getUuid(currentProject?.['id'])
    ?? getUuid(currentProject?.['projectId'])
    ?? getUuid(env?.['cutProjectId'])

  if (!projectId) return null

  return {
    projectId,
    revision: getNumber(currentProject?.['revision']) ?? getNumberFromString(getString(env?.['cutRevision'])),
    selectedClipId: getString(currentProject?.['selectedClipId']) ?? getString(env?.['cutSelectedClipId']),
    dirty: getBoolean(currentProject?.['dirty']) ?? getBooleanFromString(getString(env?.['cutDirty']))
  }
}

function appendSystemMessage(systemMessage: unknown, addition: string) {
  const content =
    typeof systemMessage === 'string'
      ? systemMessage
      : systemMessage instanceof SystemMessage && typeof systemMessage.content === 'string'
        ? systemMessage.content
        : isRecord(systemMessage) && typeof systemMessage['content'] === 'string'
          ? systemMessage['content']
          : ''

  return new SystemMessage([content, addition].filter(Boolean).join('\n\n'))
}

function buildCurrentProjectSystemPrompt(project: CurrentCutWorkbenchProject) {
  return [
    'Current Cut Workbench project context:',
    `- projectId: ${project.projectId}`,
    project.revision !== undefined ? `- revision: ${project.revision}` : null,
    project.selectedClipId ? `- selectedClipId: ${project.selectedClipId}` : null,
    project.dirty !== undefined ? `- dirty: ${project.dirty ? 'true' : 'false'}` : null,
    'Cut tools may omit projectId when operating on this current Workbench project.',
    'Do not invent or pass a placeholder projectId; omit it to let Cut middleware use the current context.'
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function resolveRuntimeContext(runtime: unknown): RuntimeContextRecord | null {
  if (!isRecord(runtime)) return null
  return getRecord(runtime, 'context') ?? getRecord(getRecord(runtime, 'configurable'), 'context')
}

function getRecord(record: unknown, key: string): RuntimeContextRecord | null {
  if (!isRecord(record)) return null
  const value = record[key]
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is RuntimeContextRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getUuid(value: unknown): string | undefined {
  const candidate = getString(value)
  return candidate && cutProjectUuid.safeParse(candidate).success ? candidate : undefined
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getNumberFromString(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function getBooleanFromString(value: string | undefined): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined
}

function scopeFromContext(context: IAgentMiddlewareContext | CutToolExecutionContext): CutScope {
  return {
    fileScope: context.runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)?.scope,
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() ?? null : context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId ?? null,
    assistantId: context.xpertId ?? null,
    conversationId: context.conversationId ?? null
  }
}

function compact(value: object) {
  return JSON.stringify(value)
}

function sanitizeCutToolEvidence<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sanitizeCutToolEvidence) as T
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [
    key,
    key === 'thumbnail' ? null : sanitizeCutToolEvidence(item)
  ])) as T
}

function readChangeSummary(args: CutJsonValue | object | null | undefined) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined
  const value = (args as { changeSummary?: CutJsonValue }).changeSummary
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function safeDispatchToolEvent(
  request: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0],
  summary: string,
  status: 'running' | 'success' | 'fail',
  createdAt: Date,
  error?: string,
  result?: unknown
) {
  try {
    const call = request.toolCall
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
      id: typeof call.id === 'string' && call.id ? call.id : call.name,
      tool_call_id: call.id,
      category: 'Tool',
      type: ChatMessageStepCategory.Program,
      toolset: CUT_MIDDLEWARE_NAME,
      tool: call.name,
      title: summary,
      message: summary,
      status,
      created_date: createdAt,
      createdAt,
      ...(status === 'running' ? { end_date: null } : { end_date: new Date() }),
      ...(error ? { error } : {}),
      data: {
        toolName: call.name,
        toolCallId: call.id ?? null,
        input: summarizeInput(call.args),
        ...summarizeResult(result),
        error
      },
      input: summarizeInput(call.args)
    })
  } catch {
    // Event publication is observability only and must never change the business result.
  }
}

function summarizeResult(result: unknown) {
  const value = parseResultObject(result)
  if (!value) return {}
  const changedClipIds = Array.isArray(value.changedClipIds)
    ? value.changedClipIds.filter((item): item is string => typeof item === 'string').slice(0, 200)
    : undefined
  const changedTrackIds = Array.isArray(value.changedTrackIds)
    ? value.changedTrackIds.filter((item): item is string => typeof item === 'string').slice(0, 128)
    : undefined
  return {
    projectId: typeof value.projectId === 'string' ? value.projectId : undefined,
    revision: typeof value.revision === 'number' && Number.isInteger(value.revision) ? value.revision : undefined,
    changedClipIds,
    changedTrackIds,
    jobId: typeof value.jobId === 'string' ? value.jobId : undefined,
    proposalId: typeof value.proposalId === 'string' ? value.proposalId : undefined,
    transcriptId: typeof value.transcriptId === 'string' ? value.transcriptId : undefined,
    draftId: typeof value.draftId === 'string' ? value.draftId : undefined,
    trackId: typeof value.trackId === 'string' ? value.trackId : undefined
  }
}

function parseResultObject(result: unknown): Record<string, unknown> | undefined {
  if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, unknown>
  if (typeof result !== 'string' || !result.trim().startsWith('{')) return undefined
  try {
    const value: unknown = JSON.parse(result)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function summarizeInput(args: CutJsonValue | object | null | undefined) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {}
  const input = args as { projectId?: CutJsonValue; title?: CutJsonValue; operation?: CutJsonValue }
  const kind = input.operation && typeof input.operation === 'object' && !Array.isArray(input.operation)
    ? (input.operation as { kind?: CutJsonValue }).kind
    : undefined
  return {
    projectId: typeof input.projectId === 'string' ? input.projectId : undefined,
    title: typeof input.title === 'string' ? input.title.slice(0, 120) : undefined,
    operation: typeof kind === 'string' ? kind : undefined
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Cut tool failed.'
}

function safeSubtitleName(value: string, format: 'srt' | 'vtt' | 'ass') {
  const normalized = value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || `captions.${format}`
  return normalized.toLowerCase().endsWith(`.${format}`) ? normalized : `${normalized}.${format}`
}

function subtitleMimeType(format: 'srt' | 'vtt' | 'ass') {
  return format === 'vtt' ? 'text/vtt' : format === 'ass' ? 'text/x-ssa' : 'application/x-subrip'
}
