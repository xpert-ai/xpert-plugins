import { z } from 'zod/v3'
import {
  cutAddCoverOperationSchema,
  cutAddClipOperationSchema,
  cutDeleteClipsOperationSchema,
  cutDuplicateClipsOperationSchema,
  cutEditOperationSchema,
  cutManageTrackOperationSchema,
  cutRippleDeleteRangesOperationSchema,
  cutUpdateAudioOperationSchema,
  cutUpdateClipTimingOperationSchema,
  cutUpdateEffectsOperationSchema,
  cutUpdateMaskOperationSchema,
  cutUpdateTextOperationSchema,
  cutUpdateTransformOperationSchema,
  cutUpdateProjectSettingsOperationSchema,
  cutUpdateTransitionOperationSchema
} from './cut-project.js'
import {
  cutProposalConstraintsSchema,
  cutProposalItemsInputSchema
} from './cut-proposal.js'
import { CUT_ADD_CLIP_TOOL_NAME, CUT_ADD_COVER_TOOL_NAME, CUT_DELETE_CLIPS_TOOL_NAME, CUT_DUPLICATE_CLIPS_TOOL_NAME, CUT_MANAGE_TRACK_TOOL_NAME, CUT_RIPPLE_DELETE_RANGES_TOOL_NAME, CUT_UPDATE_AUDIO_TOOL_NAME, CUT_UPDATE_CLIP_TIMING_TOOL_NAME, CUT_UPDATE_EFFECTS_TOOL_NAME, CUT_UPDATE_MASK_TOOL_NAME, CUT_UPDATE_PROJECT_SETTINGS_TOOL_NAME, CUT_UPDATE_TEXT_TOOL_NAME, CUT_UPDATE_TRANSFORM_TOOL_NAME, CUT_UPDATE_TRANSITION_TOOL_NAME } from './constants.js'

export const changeSummary = z.string().trim().min(1).max(240)
export const cutProjectUuid = z.string().uuid()
export const currentProjectId = cutProjectUuid.optional().describe(
  'Cut project UUID. Omit it to use cut.currentProject.id or env.cutProjectId from the active Workbench context.'
)
export const workspaceFileLocatorSchema = z.union([z.string().min(1), z.object({}).passthrough()])
export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brief: z.string().max(4000).optional(),
  width: z.number().int().min(16).max(7680).optional(),
  height: z.number().int().min(16).max(4320).optional(),
  fps: z.number().int().min(1).max(120).optional(),
  durationSeconds: z.number().min(0.1).max(3600).optional(),
  changeSummary
})
export const getProjectSchema = z.object({ projectId: currentProjectId }).strict()
export const expectedRevision = z.number().int().positive().optional().describe(
  'Revision returned by cut_get_project. If the project changed, the read is rejected so the Agent can refresh its plan.'
)
export const listTracksSchema = z.object({
  projectId: currentProjectId,
  expectedRevision,
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().min(1).max(100).optional()
}).strict()
export const listClipsSchema = z.object({
  projectId: currentProjectId,
  expectedRevision,
  trackIds: z.array(z.string().min(1).max(160)).min(1).max(50).optional(),
  mediaAssetIds: z.array(z.string().uuid()).min(1).max(50).optional(),
  types: z.array(z.enum(['video', 'image', 'audio', 'text', 'color'])).min(1).max(5).optional(),
  start: z.number().min(0).max(86_400).optional(),
  end: z.number().positive().max(86_400).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().min(1).max(100).optional()
}).strict().refine((value) => value.start == null || value.end == null || value.end > value.start, {
  message: 'end must be greater than start', path: ['end']
})
export const getClipSchema = z.object({
  projectId: currentProjectId,
  clipId: z.string().min(1).max(160),
  expectedRevision
}).strict()
export const listMediaAssetsSchema = z.object({
  projectId: currentProjectId,
  expectedRevision,
  kinds: z.array(z.enum(['video', 'audio', 'image'])).min(1).max(3).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  unusedOnly: z.boolean().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().min(1).max(100).optional()
}).strict()
export const getMediaAssetSchema = z.object({
  projectId: currentProjectId,
  mediaAssetId: z.string().uuid(),
  expectedRevision
}).strict()
export const listProjectResourcesSchema = z.object({
  projectId: currentProjectId,
  resource: z.enum(['analysis_jobs', 'versions', 'exports', 'caption_drafts', 'edit_proposals', 'logs']),
  expectedRevision,
  status: z.string().trim().min(1).max(80).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().min(1).max(100).optional()
}).strict()
export const importMediaSchema = z.object({
  projectId: currentProjectId,
  file: workspaceFileLocatorSchema,
  duration: z.number().positive().max(3600).optional(),
  baseRevision: z.number().int().positive(),
  changeSummary
})
export const editSchema = z.object({
  projectId: currentProjectId,
  operation: cutEditOperationSchema,
  baseRevision: z.number().int().positive(),
  changeSummary
})
export const editBatchSchema = z.object({
  projectId: currentProjectId,
  operations: z.array(cutEditOperationSchema).min(1).max(100),
  baseRevision: z.number().int().positive(),
  mode: z.enum(['validate', 'apply']).default('apply'),
  changeSummary
})
export const finalizeSchema = z.object({ projectId: currentProjectId, baseRevision: z.number().int().positive(), changeSummary })
export const reportFailureSchema = z.object({
  projectId: currentProjectId,
  operation: z.string().min(1).max(120),
  errorMessage: z.string().min(1).max(4000),
  recoverable: z.boolean().optional()
})
export const subtitleFormatSchema = z.enum(['srt', 'vtt', 'ass'])
export const importSubtitleSchema = z.object({
  projectId: currentProjectId,
  file: workspaceFileLocatorSchema,
  format: subtitleFormatSchema.optional(),
  language: z.string().trim().min(1).max(35).default('und'),
  baseRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  changeSummary
})
export const startTranscriptionSchema = z.object({
  projectId: currentProjectId,
  mediaAssetId: z.string().uuid(),
  mode: z.enum(['platform', 'sandbox_whisper']).default('sandbox_whisper').describe(
    'Defaults to sandbox_whisper, using the bundled small Whisper model in Sandbox Runtime without provider credentials. Use platform only when explicitly requested and configured; platform errors never trigger silent fallback.'
  ),
  language: z.string().trim().min(1).max(35).default('und').describe(
    'Source language. For sandbox_whisper use und/auto for detection, zh (or zh-CN/zh-Hans/zh-Hant) for Chinese, or en for English.'
  ),
  baseRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  changeSummary
}).strict()
export const startHeadlessExportSchema = z.object({
  projectId: currentProjectId,
  baseRevision: z.number().int().positive(),
  exportSettings: z.object({
    format: z.enum(['mp4', 'webm']).default('mp4'),
    quality: z.enum(['low', 'medium', 'high', 'very_high']).default('high'),
    includeAudio: z.boolean().default(true)
  }).strict().default({ format: 'mp4', quality: 'high', includeAudio: true }),
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
export const cancelAnalysisJobSchema = z.object({
  projectId: currentProjectId,
  jobId: z.string().uuid(),
  changeSummary
}).strict()
export const getAnalysisJobSchema = z.object({ projectId: currentProjectId, jobId: z.string().uuid() })
export const mediaEvidenceTypeSchema = z.enum(['transcript', 'silence', 'audio_activity', 'shot', 'keyframe', 'visual_description', 'ocr'])
export const searchMediaSegmentsSchema = z.object({
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
export const getMediaSegmentSchema = z.object({
  projectId: currentProjectId,
  segmentId: z.string().regex(/^(transcript|analysis):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
}).strict()
export const createEditProposalSchema = z.object({
  projectId: currentProjectId,
  sourceRevision: z.number().int().positive(),
  goal: z.string().trim().min(1).max(4_000),
  constraints: cutProposalConstraintsSchema.optional(),
  items: cutProposalItemsInputSchema,
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  changeSummary
}).strict()
export const getEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid()
}).strict()
export const updateEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid(),
  baseProposalRevision: z.number().int().positive(),
  itemUpdates: z.array(z.object({ itemId: z.string().uuid(), enabled: z.boolean() }).strict()).min(1).max(50),
  reviewNote: z.string().trim().min(1).max(4_000).optional(),
  changeSummary
}).strict()
export const applyEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid(),
  baseRevision: z.number().int().positive(),
  baseProposalRevision: z.number().int().positive(),
  changeSummary
}).strict()
export const rejectEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid(),
  baseProposalRevision: z.number().int().positive(),
  reviewNote: z.string().trim().min(1).max(4_000).optional(),
  changeSummary
}).strict()
export const revertEditProposalSchema = z.object({
  projectId: currentProjectId,
  proposalId: z.string().uuid(),
  baseRevision: z.number().int().positive(),
  changeSummary
}).strict()
export const listTranscriptSegmentsSchema = z.object({
  projectId: currentProjectId, transcriptId: z.string().uuid(),
  page: z.number().int().positive().optional(), pageSize: z.number().int().min(1).max(200).optional()
})
export const captionRulesSchema = z.object({
  maxCharsPerLine: z.number().int().min(8).max(120).optional(),
  maxLines: z.number().int().min(1).max(4).optional(),
  minDuration: z.number().min(0.1).max(10).optional(),
  maxDuration: z.number().min(0.2).max(30).optional(),
  targetTrackName: z.string().trim().min(1).max(120).optional()
})
export const captionTimelineCutSchema = z.object({
  start: z.number().min(0),
  end: z.number().positive()
}).strict().refine((range) => range.end > range.start, { message: 'end must be greater than start', path: ['end'] })
export const createCaptionDraftSchema = z.object({
  projectId: currentProjectId, transcriptId: z.string().uuid(), baseRevision: z.number().int().positive(),
  targetTrackId: z.string().min(1).optional(), rules: captionRulesSchema.optional(),
  timelineCuts: z.array(captionTimelineCutSchema).max(200).optional(),
  timelineOffsetSeconds: z.number().min(0).max(60).optional(),
  changeSummary
}).strict()
export const createTranslatedCaptionDraftSchema = z.object({
  projectId: currentProjectId,
  sourceDraftId: z.string().uuid(),
  targetLanguage: z.string().trim().min(2).max(35),
  baseRevision: z.number().int().positive(),
  translations: z.array(z.object({
    captionId: z.string().min(1).max(160),
    text: z.string().trim().min(1).max(10_000)
  }).strict()).min(1).max(500),
  targetTrackName: z.string().trim().min(1).max(120).optional(),
  changeSummary
}).strict()
export const createSpeechCleanupProposalSchema = z.object({
  projectId: currentProjectId,
  transcriptId: z.string().uuid(),
  sourceRevision: z.number().int().positive(),
  mode: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
  minimumSilenceSeconds: z.number().min(0.3).max(5).optional(),
  keepPaddingSeconds: z.number().min(0.02).max(0.5).optional(),
  removeFillers: z.boolean().optional(),
  removeSilence: z.boolean().optional(),
  removeRepeatedPhrases: z.boolean().optional(),
  removeStutters: z.boolean().optional(),
  fillerWords: z.array(z.string().trim().min(1).max(40)).max(80).optional(),
  manualSegmentIds: z.array(z.string().uuid()).max(50).optional(),
  maxRemovalRatio: z.number().min(0.05).max(0.6).optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  changeSummary
}).strict()
export const getCaptionDraftSchema = z.object({
  projectId: currentProjectId, draftId: z.string().uuid(),
  page: z.number().int().positive().optional(), pageSize: z.number().int().min(1).max(200).optional()
})
export const captionDraftEditOperationSchema = z.discriminatedUnion('action', [
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
export const updateCaptionDraftSchema = z.object({
  projectId: currentProjectId, draftId: z.string().uuid(), baseRevision: z.number().int().positive(),
  baseDraftRevision: z.number().int().positive(), operation: captionDraftEditOperationSchema, changeSummary
})
export const commitCaptionDraftSchema = z.object({
  projectId: currentProjectId, draftId: z.string().uuid(), baseRevision: z.number().int().positive(),
  baseDraftRevision: z.number().int().positive(), targetTrackId: z.string().min(1).optional(), changeSummary
})
export const commitCaptionDraftsSchema = z.object({
  projectId: currentProjectId,
  baseRevision: z.number().int().positive(),
  drafts: z.array(z.object({
    draftId: z.string().uuid(),
    baseDraftRevision: z.number().int().positive(),
    targetTrackId: z.string().min(1).optional()
  }).strict()).min(1).max(4),
  changeSummary
}).strict()
export const exportSubtitleSchema = z.object({
  projectId: currentProjectId, draftId: z.string().uuid(), format: subtitleFormatSchema,
  fileName: z.string().trim().min(1).max(240).optional(), changeSummary
})

export const ATOMIC_EDIT_TOOL_SPECS = [
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
  { name: CUT_MANAGE_TRACK_TOOL_NAME, operationSchema: cutManageTrackOperationSchema, description: 'Add, update, move, or explicitly delete one Cut track.' },
  { name: CUT_RIPPLE_DELETE_RANGES_TOOL_NAME, operationSchema: cutRippleDeleteRangesOperationSchema, description: 'Ripple-delete validated time ranges across every track while preserving media source trims and A/V sync.' },
  { name: CUT_ADD_COVER_TOOL_NAME, operationSchema: cutAddCoverOperationSchema, description: 'Insert a timed full-canvas title cover and shift the existing program later without overwriting it.' }
] as const
