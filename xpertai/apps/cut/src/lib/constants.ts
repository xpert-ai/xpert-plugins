export const CUT_PLUGIN_NAME = '@xpert-ai/plugin-cut'
export const CUT_PROVIDER_KEY = 'cut'
export const CUT_MIDDLEWARE_NAME = 'CutMiddleware'
export const CUT_TEMPLATE_PROVIDER_KEY = 'cutTemplates'
export const CUT_FEATURE = 'cut'
export const CUT_AGENT_CAPABILITY = 'cut-agent'
export const CUT_WORKBENCH_CAPABILITY = 'cut-workbench'
export const CUT_TEMPLATE_CAPABILITY = 'cut-assistant-template'
export const CUT_MCP_CAPABILITY = 'cut-mcp'
export const CUT_WORKBENCH_VIEW_KEY = 'cut_workbench'
export const CUT_REMOTE_ENTRY_KEY = 'cut-workbench'

export const CUT_CREATE_PROJECT_TOOL_NAME = 'cut_create_project'
export const CUT_GET_PROJECT_TOOL_NAME = 'cut_get_project'
export const CUT_IMPORT_MEDIA_TOOL_NAME = 'cut_import_media'
export const CUT_APPLY_EDIT_TOOL_NAME = 'cut_apply_edit'
export const CUT_APPLY_BATCH_TOOL_NAME = 'cut_apply_batch'
export const CUT_ADD_CLIP_TOOL_NAME = 'cut_add_clip'
export const CUT_DELETE_CLIPS_TOOL_NAME = 'cut_delete_clips'
export const CUT_DUPLICATE_CLIPS_TOOL_NAME = 'cut_duplicate_clips'
export const CUT_UPDATE_CLIP_TIMING_TOOL_NAME = 'cut_update_clip_timing'
export const CUT_UPDATE_TRANSFORM_TOOL_NAME = 'cut_update_transform'
export const CUT_UPDATE_PROJECT_SETTINGS_TOOL_NAME = 'cut_update_project_settings'
export const CUT_UPDATE_TEXT_TOOL_NAME = 'cut_update_text'
export const CUT_UPDATE_AUDIO_TOOL_NAME = 'cut_update_audio'
export const CUT_UPDATE_EFFECTS_TOOL_NAME = 'cut_update_effects'
export const CUT_UPDATE_MASK_TOOL_NAME = 'cut_update_mask'
export const CUT_UPDATE_TRANSITION_TOOL_NAME = 'cut_update_transition'
export const CUT_MANAGE_TRACK_TOOL_NAME = 'cut_manage_track'
export const CUT_RIPPLE_DELETE_RANGES_TOOL_NAME = 'cut_ripple_delete_ranges'
export const CUT_ADD_COVER_TOOL_NAME = 'cut_add_cover'
export const CUT_IMPORT_SUBTITLE_TOOL_NAME = 'cut_import_subtitle'
export const CUT_START_TRANSCRIPTION_TOOL_NAME = 'cut_start_transcription'
export const CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME = 'cut_cancel_analysis_job'
export const CUT_GET_ANALYSIS_JOB_TOOL_NAME = 'cut_get_analysis_job'
export const CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME = 'cut_search_media_segments'
export const CUT_GET_MEDIA_SEGMENT_TOOL_NAME = 'cut_get_media_segment'
export const CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME = 'cut_create_edit_proposal'
export const CUT_GET_EDIT_PROPOSAL_TOOL_NAME = 'cut_get_edit_proposal'
export const CUT_UPDATE_EDIT_PROPOSAL_TOOL_NAME = 'cut_update_edit_proposal'
export const CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME = 'cut_apply_edit_proposal'
export const CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME = 'cut_reject_edit_proposal'
export const CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME = 'cut_revert_edit_proposal'
export const CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME = 'cut_list_transcript_segments'
export const CUT_CREATE_CAPTION_DRAFT_TOOL_NAME = 'cut_create_caption_draft'
export const CUT_CREATE_TRANSLATED_CAPTION_DRAFT_TOOL_NAME = 'cut_create_translated_caption_draft'
export const CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME = 'cut_create_speech_cleanup_proposal'
export const CUT_GET_CAPTION_DRAFT_TOOL_NAME = 'cut_get_caption_draft'
export const CUT_UPDATE_CAPTION_DRAFT_TOOL_NAME = 'cut_update_caption_draft'
export const CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME = 'cut_commit_caption_draft'
export const CUT_COMMIT_CAPTION_DRAFTS_TOOL_NAME = 'cut_commit_caption_drafts'
export const CUT_EXPORT_SUBTITLE_TOOL_NAME = 'cut_export_subtitle'
export const CUT_SAVE_PROJECT_TOOL_NAME = 'cut_save_project'
export const CUT_FINALIZE_VERSION_TOOL_NAME = 'cut_finalize_version'
export const CUT_REPORT_FAILURE_TOOL_NAME = 'cut_report_failure'
export const CUT_START_HEADLESS_EXPORT_TOOL_NAME = 'cut_start_headless_export'

export const CUT_MIDDLEWARE_TOOL_NAMES = [
  CUT_CREATE_PROJECT_TOOL_NAME,
  CUT_GET_PROJECT_TOOL_NAME,
  CUT_IMPORT_MEDIA_TOOL_NAME,
  CUT_APPLY_EDIT_TOOL_NAME,
  CUT_APPLY_BATCH_TOOL_NAME,
  CUT_ADD_CLIP_TOOL_NAME,
  CUT_DELETE_CLIPS_TOOL_NAME,
  CUT_DUPLICATE_CLIPS_TOOL_NAME,
  CUT_UPDATE_CLIP_TIMING_TOOL_NAME,
  CUT_UPDATE_TRANSFORM_TOOL_NAME,
  CUT_UPDATE_PROJECT_SETTINGS_TOOL_NAME,
  CUT_UPDATE_TEXT_TOOL_NAME,
  CUT_UPDATE_AUDIO_TOOL_NAME,
  CUT_UPDATE_EFFECTS_TOOL_NAME,
  CUT_UPDATE_MASK_TOOL_NAME,
  CUT_UPDATE_TRANSITION_TOOL_NAME,
  CUT_MANAGE_TRACK_TOOL_NAME,
  CUT_RIPPLE_DELETE_RANGES_TOOL_NAME,
  CUT_ADD_COVER_TOOL_NAME,
  CUT_IMPORT_SUBTITLE_TOOL_NAME,
  CUT_START_TRANSCRIPTION_TOOL_NAME,
  CUT_CANCEL_ANALYSIS_JOB_TOOL_NAME,
  CUT_START_HEADLESS_EXPORT_TOOL_NAME,
  CUT_GET_ANALYSIS_JOB_TOOL_NAME,
  CUT_SEARCH_MEDIA_SEGMENTS_TOOL_NAME,
  CUT_GET_MEDIA_SEGMENT_TOOL_NAME,
  CUT_CREATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_CREATE_SPEECH_CLEANUP_PROPOSAL_TOOL_NAME,
  CUT_GET_EDIT_PROPOSAL_TOOL_NAME,
  CUT_UPDATE_EDIT_PROPOSAL_TOOL_NAME,
  CUT_APPLY_EDIT_PROPOSAL_TOOL_NAME,
  CUT_REJECT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_REVERT_EDIT_PROPOSAL_TOOL_NAME,
  CUT_LIST_TRANSCRIPT_SEGMENTS_TOOL_NAME,
  CUT_CREATE_CAPTION_DRAFT_TOOL_NAME,
  CUT_CREATE_TRANSLATED_CAPTION_DRAFT_TOOL_NAME,
  CUT_GET_CAPTION_DRAFT_TOOL_NAME,
  CUT_UPDATE_CAPTION_DRAFT_TOOL_NAME,
  CUT_COMMIT_CAPTION_DRAFT_TOOL_NAME,
  CUT_COMMIT_CAPTION_DRAFTS_TOOL_NAME,
  CUT_EXPORT_SUBTITLE_TOOL_NAME,
  CUT_SAVE_PROJECT_TOOL_NAME,
  CUT_FINALIZE_VERSION_TOOL_NAME,
  CUT_REPORT_FAILURE_TOOL_NAME
] as const

export const CUT_ANALYSIS_QUEUE_NAME = 'cut.analysis'
export const CUT_TRANSCRIPTION_JOB_NAME = 'transcribe-media'
export const CUT_RENDER_JOB_NAME = 'render-mp4'
export const CUT_RENDER_SANDBOX_ACTION = 'cut.render-mp4'
export const CUT_RENDER_SANDBOX_ACTION_VERSION = '1.0.0'

export const CUT_AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const CUT_AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const CUT_ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
export const CUT_ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const CUT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none"><rect width="256" height="256" rx="48" fill="#0B1020"/><path d="M51 76h154M51 180h154" stroke="#7DD3FC" stroke-width="14" stroke-linecap="round"/><path d="M84 48v160M172 48v160" stroke="#F8FAFC" stroke-width="14" stroke-linecap="round"/><path d="m106 103 48 25-48 25v-50Z" fill="#FB7185"/></svg>`
