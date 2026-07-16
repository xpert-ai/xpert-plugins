import { Injectable } from '@nestjs/common'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, type TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  RequestContext,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  CUT_AGENT_CAPABILITY,
  CUT_ADD_CLIP_TOOL_NAME,
  CUT_APPLY_BATCH_TOOL_NAME,
  CUT_APPLY_EDIT_TOOL_NAME,
  CUT_CREATE_PROJECT_TOOL_NAME,
  CUT_CREATE_CAPTION_DRAFT_TOOL_NAME,
  CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME,
  CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
  CUT_DELETE_CLIPS_TOOL_NAME,
  CUT_DUPLICATE_CLIPS_TOOL_NAME,
  CUT_FEATURE,
  CUT_FINALIZE_VERSION_TOOL_NAME,
  CUT_EXPORT_SUBTITLE_TOOL_NAME,
  CUT_GET_ANALYSIS_JOB_TOOL_NAME,
  CUT_GET_CAPTION_DRAFT_TOOL_NAME,
  CUT_GET_MEDIA_SEGMENT_TOOL_NAME,
  CUT_GET_EDIT_PROPOSAL_TOOL_NAME,
  CUT_GET_PROJECT_TOOL_NAME,
  CUT_ICON,
  CUT_IMPORT_MEDIA_TOOL_NAME,
  CUT_IMPORT_SUBTITLE_TOOL_NAME,
  CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME,
  CUT_MANAGE_TRACK_TOOL_NAME,
  CUT_MIDDLEWARE_NAME,
  CUT_MIDDLEWARE_TOOL_NAMES,
  CUT_REPORT_FAILURE_TOOL_NAME,
  CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME,
  CUT_SAVE_PROJECT_TOOL_NAME,
  CUT_START_TRANSCRIPTION_TOOL_NAME,
  CUT_START_HEADLESS_EXPORT_TOOL_NAME,
  CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME,
  CUT_UPDATE_AUDIO_TOOL_NAME,
  CUT_UPDATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_UPDATE_CAPTION_DRAFT_TOOL_NAME,
  CUT_UPDATE_CLIP_TIMING_TOOL_NAME,
  CUT_UPDATE_EFFECTS_TOOL_NAME,
  CUT_UPDATE_MASK_TOOL_NAME,
  CUT_UPDATE_TEXT_TOOL_NAME,
  CUT_UPDATE_TRANSFORM_TOOL_NAME,
  CUT_UPDATE_PROJECT_SETTINGS_TOOL_NAME,
  CUT_UPDATE_TRANSITION_TOOL_NAME,
  CUT_WORKBENCH_CAPABILITY
} from './constants.js'
import { CutCaptionService } from './cut-caption.service.js'
import {
  cutAddClipOperationSchema,
  cutDeleteClipsOperationSchema,
  cutDuplicateClipsOperationSchema,
  cutEditOperationSchema,
  cutManageTrackOperationSchema,
  cutProjectDocumentSchema,
  cutUpdateAudioOperationSchema,
  cutUpdateClipTimingOperationSchema,
  cutUpdateEffectsOperationSchema,
  cutUpdateMaskOperationSchema,
  cutUpdateTextOperationSchema,
  cutUpdateTransformOperationSchema,
  cutUpdateProjectSettingsOperationSchema,
  cutUpdateTransitionOperationSchema
} from './cut-project.js'
import { CutService } from './cut.service.js'
import { CutMediaIntelligenceService } from './cut-media-intelligence.service.js'
import {
  cutProposalConstraintsSchema,
  cutProposalItemsInputSchema
} from './cut-proposal.js'
import { CutProposalService } from './cut-proposal.service.js'
import { CutRenderService } from './cut-render.service.js'
import type { SearchCutMediaSegmentsInput } from './cut-media-intelligence.service.js'
import type { ApplyCutEditBatchInput, ApplyCutEditInput, CutEditOperation, CutJsonValue, CutProjectDocument, CutScope, SaveCutProjectInput } from './types.js'

const changeSummary = z.string().trim().min(1).max(240)
const cutProjectUuid = z.string().uuid()
const currentProjectId = cutProjectUuid.optional().describe(
  'Cut project UUID. Omit it to use cut.currentProject.id or env.cutProjectId from the active Workbench context.'
)
const workspaceFileLocatorSchema = z.union([z.string().min(1), z.object({}).passthrough()])
const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brief: z.string().max(4000).optional(),
  width: z.number().int().min(16).max(7680).optional(),
  height: z.number().int().min(16).max(4320).optional(),
  fps: z.number().int().min(1).max(120).optional(),
  durationSeconds: z.number().min(0.1).max(3600).optional(),
  changeSummary
})
const getProjectSchema = z.object({ projectId: currentProjectId })
const importMediaSchema = z.object({
  projectId: currentProjectId,
  file: workspaceFileLocatorSchema,
  duration: z.number().positive().max(3600).optional(),
  baseRevision: z.number().int().positive(),
  changeSummary
})
const editSchema = z.object({
  projectId: currentProjectId,
  operation: cutEditOperationSchema,
  baseRevision: z.number().int().positive(),
  changeSummary
})
const editBatchSchema = z.object({
  projectId: currentProjectId,
  operations: z.array(cutEditOperationSchema).min(1).max(100),
  baseRevision: z.number().int().positive(),
  mode: z.enum(['validate', 'apply']).default('apply'),
  changeSummary
})
const saveProjectSchema = z.object({
  projectId: currentProjectId,
  document: cutProjectDocumentSchema,
  baseRevision: z.number().int().positive(),
  changeSummary
})
const finalizeSchema = z.object({ projectId: currentProjectId, baseRevision: z.number().int().positive(), changeSummary })
const reportFailureSchema = z.object({
  projectId: currentProjectId,
  operation: z.string().min(1).max(120),
  errorMessage: z.string().min(1).max(4000),
  recoverable: z.boolean().optional()
})
const subtitleFormatSchema = z.enum(['srt', 'vtt', 'ass'])
const importSubtitleSchema = z.object({
  projectId: currentProjectId,
  file: workspaceFileLocatorSchema,
  format: subtitleFormatSchema.optional(),
  language: z.string().trim().min(1).max(35).default('und'),
  baseRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  changeSummary
})
const startTranscriptionSchema = z.object({
  projectId: currentProjectId,
  mediaAssetId: z.string().uuid(),
  language: z.string().trim().min(1).max(35).default('und'),
  baseRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  changeSummary
}).strict()
const startHeadlessExportSchema = z.object({
  projectId: currentProjectId,
  baseRevision: z.number().int().positive(),
  variants: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    width: z.number().int().min(16).max(3840).optional(),
    height: z.number().int().min(16).max(2160).optional(),
    variables: z.record(z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/), z.string().max(5_000)).optional(),
    mediaAssetMap: z.record(z.string().uuid(), z.string().uuid()).optional()
  }).strict()).min(1).max(5).optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  changeSummary
}).strict()
const cancelAnalysisJobSchema = z.object({
  projectId: currentProjectId,
  jobId: z.string().uuid(),
  changeSummary
}).strict()
const getAnalysisJobSchema = z.object({ projectId: currentProjectId, jobId: z.string().uuid() })
const mediaEvidenceTypeSchema = z.enum(['transcript', 'silence', 'audio_activity', 'shot', 'keyframe', 'visual_description', 'ocr'])
const searchMediaSegmentsSchema = z.object({
  projectId: currentProjectId,
  query: z.string().trim().min(1).max(200).optional(),
  mediaAssetId: z.string().uuid().optional(),
  evidenceTypes: z.array(mediaEvidenceTypeSchema).min(1).max(7).optional(),
  start: z.number().min(0).max(86_400).optional(),
  end: z.number().positive().max(86_400).optional(),
  minScore: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(50).optional()
}).strict().refine((value) => value.start == null || value.end == null || value.end > value.start, {
  message: 'end must be greater than start', path: ['end']
})
const getMediaSegmentSchema = z.object({
  projectId: currentProjectId,
  segmentId: z.string().regex(/^(transcript|analysis):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
}).strict()
const createEditProposalSchema = z.object({
  projectId: currentProjectId,
  sourceRevision: z.number().int().positive(),
  goal: z.string().trim().min(1).max(4_000),
  constraints: cutProposalConstraintsSchema.optional(),
  items: cutProposalItemsInputSchema,
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  changeSummary
}).strict()
const getEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid()
}).strict()
const updateEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid(),
  baseProposalRevision: z.number().int().positive(),
  itemUpdates: z.array(z.object({ itemId: z.string().uuid(), enabled: z.boolean() }).strict()).min(1).max(50),
  reviewNote: z.string().trim().min(1).max(4_000).optional(),
  changeSummary
}).strict()
const applyEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid(),
  baseRevision: z.number().int().positive(),
  baseProposalRevision: z.number().int().positive(),
  changeSummary
}).strict()
const rejectEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid(),
  baseProposalRevision: z.number().int().positive(),
  reviewNote: z.string().trim().min(1).max(4_000).optional(),
  changeSummary
}).strict()
const revertEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid(),
  baseRevision: z.number().int().positive(),
  changeSummary
}).strict()
const listTranscriptSegmentsSchema = z.object({
  projectId: currentProjectId, transcriptId: z.string().uuid(),
  page: z.number().int().positive().optional(), pageSize: z.number().int().min(1).max(200).optional()
})
const captionRulesSchema = z.object({
  maxCharsPerLine: z.number().int().min(8).max(120).optional(),
  maxLines: z.number().int().min(1).max(4).optional(),
  minDuration: z.number().min(0.1).max(10).optional(),
  maxDuration: z.number().min(0.2).max(30).optional(),
  targetTrackName: z.string().trim().min(1).max(120).optional()
})
const createCaptionDraftSchema = z.object({
  projectId: currentProjectId, transcriptId: z.string().uuid(), baseRevision: z.number().int().positive(),
  targetTrackId: z.string().min(1).optional(), rules: captionRulesSchema.optional(), changeSummary
})
const getCaptionDraftSchema = z.object({
  projectId: currentProjectId, draftId: z.string().uuid(),
  page: z.number().int().positive().optional(), pageSize: z.number().int().min(1).max(200).optional()
})
const captionDraftEditOperationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'), captionId: z.string().min(1), start: z.number().min(0).optional(),
    end: z.number().positive().optional(), text: z.string().max(10_000).optional(), speaker: z.string().max(120).nullable().optional()
  }),
  z.object({
    action: z.literal('split'), captionId: z.string().min(1), at: z.number().positive(),
    leftText: z.string().trim().min(1).max(10_000), rightText: z.string().trim().min(1).max(10_000)
  }),
  z.object({
    action: z.literal('merge'), captionIds: z.array(z.string().min(1)).min(2).max(20), text: z.string().trim().min(1).max(10_000).optional()
  }),
  z.object({ action: z.literal('delete'), captionIds: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({
    action: z.literal('offset'), seconds: z.number().min(-3600).max(3600),
    captionIds: z.array(z.string().min(1)).min(1).max(500).optional()
  })
])
const updateCaptionDraftSchema = z.object({
  projectId: currentProjectId, draftId: z.string().uuid(), baseRevision: z.number().int().positive(),
  baseDraftRevision: z.number().int().positive(), operation: captionDraftEditOperationSchema, changeSummary
})
const commitCaptionDraftSchema = z.object({
  projectId: currentProjectId, draftId: z.string().uuid(), baseRevision: z.number().int().positive(),
  baseDraftRevision: z.number().int().positive(), targetTrackId: z.string().min(1).optional(), changeSummary
})
const exportSubtitleSchema = z.object({
  projectId: currentProjectId, draftId: z.string().uuid(), format: subtitleFormatSchema,
  fileName: z.string().trim().min(1).max(240).optional(), changeSummary
})

const ATOMIC_EDIT_TOOL_SPECS = [
  { name: CUT_ADD_CLIP_TOOL_NAME, operationSchema: cutAddClipOperationSchema, description: 'Add one validated media, text, or color clip to a compatible Cut track.' },
  { name: CUT_DELETE_CLIPS_TOOL_NAME, operationSchema: cutDeleteClipsOperationSchema, description: 'Delete 1-100 explicitly identified Cut clips in one revision-safe operation.' },
  { name: CUT_DUPLICATE_CLIPS_TOOL_NAME, operationSchema: cutDuplicateClipsOperationSchema, description: 'Duplicate 1-100 Cut clips with an optional time offset and compatible destination track.' },
  { name: CUT_UPDATE_CLIP_TIMING_TOOL_NAME, operationSchema: cutUpdateClipTimingOperationSchema, description: 'Update start, duration, trim bounds, or playback rate for one Cut clip.' },
  { name: CUT_UPDATE_TRANSFORM_TOOL_NAME, operationSchema: cutUpdateTransformOperationSchema, description: 'Patch position, size, rotation, opacity, or media fit for one visual Cut clip.' },
  { name: CUT_UPDATE_PROJECT_SETTINGS_TOOL_NAME, operationSchema: cutUpdateProjectSettingsOperationSchema, description: 'Patch project width, height, frame rate, or background with an explicit preserve, contain, cover, or stretch reframe policy. Preserve never changes clip transforms or rotations.' },
  { name: CUT_UPDATE_TEXT_TOOL_NAME, operationSchema: cutUpdateTextOperationSchema, description: 'Patch text content, typography, alignment, or color for one text clip.' },
  { name: CUT_UPDATE_AUDIO_TOOL_NAME, operationSchema: cutUpdateAudioOperationSchema, description: 'Patch volume and fades for one audio-capable Cut clip.' },
  { name: CUT_UPDATE_EFFECTS_TOOL_NAME, operationSchema: cutUpdateEffectsOperationSchema, description: 'Patch or clear visual effects and set blend mode for one visual Cut clip.' },
  { name: CUT_UPDATE_MASK_TOOL_NAME, operationSchema: cutUpdateMaskOperationSchema, description: 'Set or clear a validated visual mask for one Cut clip.' },
  { name: CUT_UPDATE_TRANSITION_TOOL_NAME, operationSchema: cutUpdateTransitionOperationSchema, description: 'Set or clear an incoming or outgoing transition for one visual Cut clip.' },
  { name: CUT_MANAGE_TRACK_TOOL_NAME, operationSchema: cutManageTrackOperationSchema, description: 'Add, update, move, or explicitly delete one Cut track.' }
] as const

const MUTATIONS = new Set<string>(CUT_MIDDLEWARE_TOOL_NAMES)
MUTATIONS.delete(CUT_GET_PROJECT_TOOL_NAME)
MUTATIONS.delete(CUT_GET_EDIT_PROPOSAL_TOOL_NAME)
MUTATIONS.delete(CUT_REPORT_FAILURE_TOOL_NAME)

const CURRENT_PROJECT_TOOLS = new Set<string>(CUT_MIDDLEWARE_TOOL_NAMES)
CURRENT_PROJECT_TOOLS.delete(CUT_CREATE_PROJECT_TOOL_NAME)
CURRENT_PROJECT_TOOLS.delete(CUT_REPORT_FAILURE_TOOL_NAME)

const MISSING_PROJECT_CONTEXT_MESSAGE =
  'No Cut projectId was provided and no active Cut Workbench project is available. Ask the user to select a Cut project or create one first.'

@Injectable()
@AgentMiddlewareStrategy(CUT_MIDDLEWARE_NAME)
export class CutMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
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

  constructor(
    private readonly service: CutService,
    private readonly captions: CutCaptionService,
    private readonly intelligence: CutMediaIntelligenceService,
    private readonly proposals: CutProposalService,
    private readonly renders: CutRenderService
  ) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: CUT_MIDDLEWARE_NAME,
      tools: [
        tool(async (input) => {
          const result = await this.service.createProject(scope, input)
          return compact({
            success: true,
            projectId: result.item.id ?? null,
            revision: result.item.revision,
            status: result.item.status,
            changeSummary: input.changeSummary
          })
        }, {
          name: CUT_CREATE_PROJECT_TOOL_NAME,
          description: 'Create a scoped Cut project with a versioned 1080p timeline IR. Always provide a concise changeSummary.',
          schema: createProjectSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.service.getProject(scope, input.projectId))
        }, {
          name: CUT_GET_PROJECT_TOOL_NAME,
          description: 'Read the current Cut project document, revision, media references, versions, exports, and recent operation log before editing. Omit projectId to use the active Cut Workbench project context.',
          schema: getProjectSchema,
          verboseParsingErrors: true
        }),
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
        }, {
          name: CUT_IMPORT_MEDIA_TOOL_NAME,
          description: 'Import an image, audio, or video at a required baseRevision from the current Agent workspace using a runtime path or portable Workspace Files reference. Never pass base64.',
          schema: importMediaSchema,
          verboseParsingErrors: true
        }),
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
        }, {
          name: CUT_APPLY_EDIT_TOOL_NAME,
          description: 'Apply one validated atomic Cut operation. Prefer a narrow named tool; use this generic entry for programmatic operation payloads.',
          schema: editSchema,
          verboseParsingErrors: true
        }),
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
        }, {
          name: CUT_APPLY_BATCH_TOOL_NAME,
          description: 'Validate or atomically apply 1-100 ordered Cut edit operations at one required baseRevision. The project is unchanged if validation fails.',
          schema: editBatchSchema,
          verboseParsingErrors: true
        }),
        ...ATOMIC_EDIT_TOOL_SPECS.map((spec) => createAtomicEditTool(this.service, scope, spec)),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const files = context.runtime.capabilities?.require(WorkspaceFilesRuntimeCapability)
          if (!files) throw new Error('Workspace Files capability is required for cut_import_subtitle.')
          const file = await files.readRuntimeBuffer(input.file)
          return compact(await this.captions.importSubtitle(scope, input, { buffer: file.buffer, name: file.name }))
        }, {
          name: CUT_IMPORT_SUBTITLE_TOOL_NAME,
          description: 'Import an SRT, WebVTT, or ASS Workspace File into a scoped transcript and reviewable caption draft without changing the timeline.',
          schema: importSubtitleSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const feature = context.xpertFeatures?.speechToText
          if (!feature?.enabled || !feature.copilotModel) {
            throw new Error('Enable and configure Speech-to-Text on the current Xpert before starting Cut transcription.')
          }
          if (!context.xpertId) throw new Error('Cut server transcription requires the current Xpert id.')
          return compact(await this.captions.startTranscription(scope, input, context.xpertId, feature.copilotModel))
        }, {
          name: CUT_START_TRANSCRIPTION_TOOL_NAME,
          description: 'Queue durable server-side transcription for one imported audio/video media asset using the current Xpert Speech-to-Text model. Returns immediately with a jobId and does not change the timeline.',
          schema: startTranscriptionSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const job = await this.captions.getAnalysisJob(scope, input.projectId, input.jobId)
          return compact(job.type === 'render'
            ? await this.renders.cancel(scope, input.projectId, input.jobId, input.changeSummary)
            : await this.captions.cancelAnalysisJob(scope, input.projectId, input.jobId, input.changeSummary))
        }, {
          name: CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
          description: 'Cancel a queued Cut analysis job or request cooperative cancellation for an active transcription job.',
          schema: cancelAnalysisJobSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.renders.start(scope, input))
        }, {
          name: CUT_START_HEADLESS_EXPORT_TOOL_NAME,
          description: 'Queue 1-5 immutable-revision MP4 variants through the bounded Cut Sandbox Action. Supports per-variant dimensions, {{template}} text variables, and explicit source-to-replacement mediaAssetId maps; returns durable render job ids immediately.',
          schema: startHeadlessExportSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.getAnalysisJob(scope, input.projectId, input.jobId))
        }, {
          name: CUT_GET_ANALYSIS_JOB_TOOL_NAME,
          description: 'Read one scoped Cut analysis job by jobId. Omit projectId to use the active Cut Workbench project context.',
          schema: getAnalysisJobSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.intelligence.search(scope, input as SearchCutMediaSegmentsInput))
        }, {
          name: CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME,
          description: 'Search scoped transcript, silence, audio-activity, shot, keyframe, OCR, or visual-description evidence. Every result includes a media asset, exact time range, evidence type, relevance, and thumbnail locator.',
          schema: searchMediaSegmentsSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.intelligence.getSegment(scope, input.projectId, input.segmentId))
        }, {
          name: CUT_GET_MEDIA_SEGMENT_TOOL_NAME,
          description: 'Read one exact scoped media evidence segment returned by cut_search_media_segments using its transcript:<uuid> or analysis:<uuid> id.',
          schema: getMediaSegmentSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.proposals.create(scope, input))
        }, {
          name: CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
          description: 'Create an idempotent, source-revision-bound rough-cut proposal. Every item must cite exact Cut media evidence and is validated without changing the timeline.',
          schema: createEditProposalSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.proposals.get(scope, input.projectId, input.proposalId, false))
        }, {
          name: CUT_GET_EDIT_PROPOSAL_TOOL_NAME,
          description: 'Read one scoped Cut edit proposal, its deterministic operations, evidence, risk, review state, and compact diff coordinates.',
          schema: getEditProposalSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const result = await this.proposals.update(scope, input)
          return compact({ success: true, proposal: result.item, preview: {
            changedClipIds: result.preview.changedClipIds,
            changedTrackIds: result.preview.changedTrackIds,
            estimatedDurationSeconds: result.preview.estimatedDurationSeconds,
            enabledItemCount: result.preview.enabledItemCount
          } })
        }, {
          name: CUT_UPDATE_EDIT_PROPOSAL_TOOL_NAME,
          description: 'Revision-safely enable or disable 1-50 proposal items during review without changing the project timeline.',
          schema: updateEditProposalSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.proposals.apply(scope, input))
        }, {
          name: CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME,
          description: 'Atomically apply enabled items from an approved Cut proposal only at its exact source project and proposal revisions. Repeated completed calls are idempotent.',
          schema: applyEditProposalSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.proposals.reject(scope, input))
        }, {
          name: CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
          description: 'Reject a draft Cut proposal at its exact proposal revision without changing the timeline.',
          schema: rejectEditProposalSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.proposals.revert(scope, input))
        }, {
          name: CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
          description: 'Revert one applied Cut proposal only when the project is still at its exact applied revision. Repeated completed calls are idempotent and later edits are never overwritten.',
          schema: revertEditProposalSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.listTranscriptSegments(
            scope, input.projectId, input.transcriptId, input.page, input.pageSize
          ))
        }, {
          name: CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME,
          description: 'Page through timestamped segments for one scoped Cut transcript; returns at most 200 segments.',
          schema: listTranscriptSegmentsSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.createCaptionDraft(scope, input))
        }, {
          name: CUT_CREATE_CAPTION_DRAFT_TOOL_NAME,
          description: 'Create a revision-bound reviewable caption draft from an existing Cut transcript without changing the timeline.',
          schema: createCaptionDraftSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.getCaptionDraft(
            scope, input.projectId, input.draftId, input.page, input.pageSize
          ))
        }, {
          name: CUT_GET_CAPTION_DRAFT_TOOL_NAME,
          description: 'Read one caption draft summary and at most 200 reviewable cues for the requested page.',
          schema: getCaptionDraftSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.updateCaptionDraft(scope, input))
        }, {
          name: CUT_UPDATE_CAPTION_DRAFT_TOOL_NAME,
          description: 'Revision-safely update, split, merge, delete, or offset bounded cues in a reviewable caption draft without changing the timeline.',
          schema: updateCaptionDraftSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          return compact(await this.captions.commitCaptionDraft(scope, input))
        }, {
          name: CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME,
          description: 'Commit an approved caption draft to a visual text track at its exact required baseRevision; repeated committed calls are idempotent.',
          schema: commitCaptionDraftSchema,
          verboseParsingErrors: true
        }),
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
        }, {
          name: CUT_EXPORT_SUBTITLE_TOOL_NAME,
          description: 'Export one reviewed caption draft as SRT, WebVTT, or ASS into the current Agent Workspace Files scope.',
          schema: exportSubtitleSchema,
          verboseParsingErrors: true
        }),
        tool(async (rawInput) => {
          const input = requireCutProjectInput(rawInput)
          const result = await this.service.saveProject(scope, { ...input, document: input.document as CutProjectDocument } as SaveCutProjectInput)
          return compact({
            success: result.success,
            projectId: result.project.id ?? input.projectId,
            revision: result.project.revision,
            changedClipIds: result.changedClipIds,
            changedTrackIds: result.changedTrackIds,
            changeSummary: input.changeSummary
          })
        }, {
          name: CUT_SAVE_PROJECT_TOOL_NAME,
          description: 'Replace the complete validated Cut project document at a required baseRevision. Prefer atomic edit tools for narrow timeline mutations.',
          schema: saveProjectSchema,
          verboseParsingErrors: true
        }),
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
        }, {
          name: CUT_FINALIZE_VERSION_TOOL_NAME,
          description: 'Finalize the current Cut working timeline at a required baseRevision as an immutable reviewable version.',
          schema: finalizeSchema,
          verboseParsingErrors: true
        }),
        tool(async (input) => compact(await this.service.reportFailure(scope, input)), {
          name: CUT_REPORT_FAILURE_TOOL_NAME,
          description: 'Record a Cut import, validation, timeline edit, media load, save, or export failure with recoverability.',
          schema: reportFailureSchema,
          verboseParsingErrors: true
        })
      ],
      wrapModelCall: (request, handler) => {
        const currentProject = resolveCurrentWorkbenchProject(request.runtime)
        if (!currentProject) return handler(request)

        return handler({
          ...request,
          systemMessage: appendSystemMessage(request.systemMessage, buildCurrentProjectSystemPrompt(currentProject))
        })
      },
      wrapToolCall: async (request, handler) => {
        const prepared = prepareCutToolRequest(request)
        if (prepared instanceof ToolMessage) return prepared

        const summary = readChangeSummary(prepared.toolCall.args)
        if (!summary || !MUTATIONS.has(prepared.toolCall.name)) return handler(prepared)
        const createdAt = new Date()
        await safeDispatchToolEvent(prepared, summary, 'running', createdAt)
        try {
          const result = await handler(prepared)
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
    name: spec.name,
    description: `${spec.description} projectId may be omitted for the active Cut Workbench project; baseRevision and a concise changeSummary are required.`,
    schema,
    verboseParsingErrors: true
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

function scopeFromContext(context: IAgentMiddlewareContext): CutScope {
  return {
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
