import { changeSummary, cutProjectUuid, currentProjectId, createProjectSchema, getProjectSchema, expectedRevision, listTracksSchema, listClipsSchema, getClipSchema, listMediaAssetsSchema, getMediaAssetSchema, listProjectResourcesSchema, importMediaSchema, editSchema, editBatchSchema, finalizeSchema, reportFailureSchema, importSubtitleSchema, startTranscriptionSchema, startHeadlessExportSchema, cancelAnalysisJobSchema, getAnalysisJobSchema, searchMediaSegmentsSchema, getMediaSegmentSchema, createEditProposalSchema, getEditProposalSchema, updateEditProposalSchema, applyEditProposalSchema, rejectEditProposalSchema, revertEditProposalSchema, listTranscriptSegmentsSchema, createCaptionDraftSchema, createTranslatedCaptionDraftSchema, createSpeechCleanupProposalSchema, getCaptionDraftSchema, updateCaptionDraftSchema, commitCaptionDraftSchema, commitCaptionDraftsSchema, exportSubtitleSchema, ATOMIC_EDIT_TOOL_SPECS } from './cut-tool-schemas.js'
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
import { z } from 'zod/v3'
import { cutAcceptStoryHandoffSchema } from './cut-story-handoff.js'

// One metadata source for internal execution, decorator exposure and schema discovery.
const definitions = [
  { name: CUT_ACCEPT_STORY_HANDOFF_TOOL_NAME, description: 'Accept one strict StoryCutHandoff v1 contract. The first handoff creates a Cut project and Story-managed timeline clips; later Story revisions import media and create an evidence-backed review proposal without changing the timeline. Return the receipt to story_record_cut_handoff_delivery.', schema: cutAcceptStoryHandoffSchema },
  { name: CUT_CREATE_PROJECT_TOOL_NAME, description: 'Create a scoped Cut project with a versioned 1080p timeline IR. Always provide a concise changeSummary.', schema: createProjectSchema },
  { name: CUT_GET_PROJECT_TOOL_NAME, description: 'Read a compact Cut project overview, current revision, timeline/resource counts, and available follow-up reads. It intentionally omits the full document and file references. Omit projectId to use the active Workbench project.', schema: getProjectSchema },
  { name: CUT_LIST_TRACKS_TOOL_NAME, description: 'List compact track summaries for a Cut project. Pass expectedRevision from cut_get_project to reject stale reads.', schema: listTracksSchema },
  { name: CUT_LIST_CLIPS_TOOL_NAME, description: 'Page through compact Cut clips, optionally filtered by tracks, media assets, clip types, or an overlapping time range. Source references and preview URLs are never returned.', schema: listClipsSchema },
  { name: CUT_GET_CLIP_TOOL_NAME, description: 'Read one Cut clip and its immediate same-track neighbors after discovering the clip id with cut_list_clips. Workspace file references and preview URLs are omitted.', schema: getClipSchema },
  { name: CUT_LIST_MEDIA_ASSETS_TOOL_NAME, description: 'Page through safe media asset metadata and timeline usage counts. Filter by kind, filename, or unused assets; file references are never returned.', schema: listMediaAssetsSchema },
  { name: CUT_GET_MEDIA_ASSET_TOOL_NAME, description: 'Read one media asset metadata record, timeline usage count, evidence types, and related analysis job ids without exposing its Workspace file reference.', schema: getMediaAssetSchema },
  { name: CUT_LIST_PROJECT_RESOURCES_TOOL_NAME, description: 'Page through one project resource collection: analysis jobs, versions, exports, caption drafts, edit proposals, or operation logs. Large documents, snapshots, reports, URLs, and file references are omitted.', schema: listProjectResourcesSchema },
  { name: CUT_IMPORT_MEDIA_TOOL_NAME, description: 'Import an image, audio, or video at a required baseRevision from the current Agent workspace using a runtime path or portable Workspace Files reference. Never pass base64.', schema: importMediaSchema },
  { name: CUT_APPLY_EDIT_TOOL_NAME, description: 'Apply one validated atomic Cut operation. Prefer a narrow named tool; use this generic entry for programmatic operation payloads.', schema: editSchema },
  { name: CUT_APPLY_BATCH_TOOL_NAME, description: 'Validate or atomically apply 1-100 ordered Cut edit operations at one required baseRevision. The project is unchanged if validation fails.', schema: editBatchSchema },
  { name: CUT_IMPORT_SUBTITLE_TOOL_NAME, description: 'Import an SRT, WebVTT, or ASS Workspace File into a scoped transcript and reviewable caption draft without changing the timeline.', schema: importSubtitleSchema },
  { name: CUT_START_TRANSCRIPTION_TOOL_NAME, description: 'Queue durable background transcription for one imported audio/video asset. Defaults to sandbox_whisper using the bundled small model in Sandbox Runtime; no platform model configuration is required. Use platform only when explicitly requested and configured. Explicit modes are respected and platform errors never trigger a fallback. Browser-local Whisper remains an interactive Workbench action. Returns a jobId and does not change the timeline.', schema: startTranscriptionSchema },
  { name: CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME, description: 'Cancel a queued Cut analysis job or request cooperative cancellation for an active transcription job.', schema: cancelAnalysisJobSchema },
  { name: CUT_START_HEADLESS_EXPORT_TOOL_NAME, description: 'Queue 1-5 immutable-revision MP4/H.264 or WebM/VP9 variants through the bounded Cut Sandbox Action. Supports low through very-high quality, optional audio, per-variant dimensions, {{template}} text variables, and explicit source-to-replacement mediaAssetId maps; returns durable render job ids immediately.', schema: startHeadlessExportSchema },
  { name: CUT_GET_ANALYSIS_JOB_TOOL_NAME, description: 'Read one scoped Cut analysis job by jobId. Omit projectId to use the active Cut Workbench project context.', schema: getAnalysisJobSchema },
  { name: CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME, description: 'Search scoped transcript, silence, audio-activity, shot, keyframe, OCR, or visual-description evidence. Every result includes a media asset, exact time range, evidence type, relevance, and thumbnail locator.', schema: searchMediaSegmentsSchema },
  { name: CUT_GET_MEDIA_SEGMENT_TOOL_NAME, description: 'Read one exact scoped media evidence segment returned by cut_search_media_segments using its transcript:<uuid> or analysis:<uuid> id.', schema: getMediaSegmentSchema },
  { name: CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME, description: 'Create an idempotent, source-revision-bound rough-cut proposal. Every item must cite exact Cut media evidence and is validated without changing the timeline.', schema: createEditProposalSchema },
  { name: CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME, description: 'Create a reviewable smart speech-cleanup proposal from exact transcript/media evidence. It can detect pauses, filler words, repeated phrases, and word-level stutters, include explicitly selected transcript segments, map source timestamps onto timeline clips, and propose A/V-safe ripple deletes. Nothing is applied until the user reviews and approves the proposal.', schema: createSpeechCleanupProposalSchema },
  { name: CUT_GET_EDIT_PROPOSAL_TOOL_NAME, description: 'Read one scoped Cut edit proposal, its deterministic operations, evidence, risk, review state, and compact diff coordinates.', schema: getEditProposalSchema },
  { name: CUT_UPDATE_EDIT_PROPOSAL_TOOL_NAME, description: 'Revision-safely enable or disable 1-50 proposal items during review without changing the project timeline.', schema: updateEditProposalSchema },
  { name: CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME, description: 'Atomically apply enabled items from an approved Cut proposal only at its exact source project and proposal revisions. Repeated completed calls are idempotent.', schema: applyEditProposalSchema },
  { name: CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME, description: 'Reject a draft Cut proposal at its exact proposal revision without changing the timeline.', schema: rejectEditProposalSchema },
  { name: CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME, description: 'Revert one applied Cut proposal only when the project is still at its exact applied revision. Repeated completed calls are idempotent and later edits are never overwritten.', schema: revertEditProposalSchema },
  { name: CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME, description: 'Page through timestamped segments for one scoped Cut transcript; returns at most 200 segments.', schema: listTranscriptSegmentsSchema },
  { name: CUT_CREATE_CAPTION_DRAFT_TOOL_NAME, description: 'Create a revision-bound reviewable caption draft from an existing Cut transcript without changing the timeline. Pass the exact applied ripple-delete ranges and cover offset to keep cues synchronized after speech cleanup and intro insertion.', schema: createCaptionDraftSchema },
  { name: CUT_CREATE_TRANSLATED_CAPTION_DRAFT_TOOL_NAME, description: 'Create a target-language caption draft from an existing reviewed draft. The Agent supplies one translated text per source caption id; timings remain exact and the source draft is preserved.', schema: createTranslatedCaptionDraftSchema },
  { name: CUT_GET_CAPTION_DRAFT_TOOL_NAME, description: 'Read one caption draft summary and at most 200 reviewable cues for the requested page.', schema: getCaptionDraftSchema },
  { name: CUT_UPDATE_CAPTION_DRAFT_TOOL_NAME, description: 'Update, split, merge, delete, or offset bounded cues in a reviewable caption draft without changing the timeline. baseDraftRevision protects concurrent draft edits; sourceRevision is provenance and does not block editing after unrelated project changes.', schema: updateCaptionDraftSchema },
  { name: CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME, description: 'Commit an approved caption draft to a visual text track at the current required baseRevision. A draft may originate from an older project revision; repeated committed calls are idempotent.', schema: commitCaptionDraftSchema },
  { name: CUT_COMMIT_CAPTION_DRAFTS_TOOL_NAME, description: 'Atomically commit 1-4 approved caption drafts as separate language tracks in one project edit, keeping multilingual cues synchronized even when their provenance revisions differ.', schema: commitCaptionDraftsSchema },
  { name: CUT_EXPORT_SUBTITLE_TOOL_NAME, description: 'Export one reviewed caption draft as SRT, WebVTT, or ASS into the current Agent Workspace Files scope.', schema: exportSubtitleSchema },
  { name: CUT_FINALIZE_VERSION_TOOL_NAME, description: 'Finalize the current Cut working timeline at a required baseRevision as an immutable reviewable version.', schema: finalizeSchema },
  { name: CUT_REPORT_FAILURE_TOOL_NAME, description: 'Record a Cut import, validation, timeline edit, media load, save, or export failure with recoverability.', schema: reportFailureSchema },
  ...ATOMIC_EDIT_TOOL_SPECS.map((spec) => ({
    name: spec.name,
    description: `${spec.description} projectId may be omitted for the active Cut Workbench project; baseRevision and a concise changeSummary are required.`,
    schema: z.object({ projectId: currentProjectId, operation: spec.operationSchema, baseRevision: z.number().int().positive(), changeSummary }).strict()
  }))
]

export function cutOperationDefinition(name: string) {
  const definition = definitions.find((item) => item.name === name)
  if (!definition) throw new Error(`Unknown Cut operation: ${name}`)
  return { ...definition, schema: definition.schema instanceof z.ZodObject ? definition.schema.strict() : definition.schema, verboseParsingErrors: true }
}
