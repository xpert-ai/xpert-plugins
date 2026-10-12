export const DOCX_EDITOR_PLUGIN_NAME = '@xpert-ai/plugin-docx-editor'
export const DOCX_EDITOR_ARTIFACT_NAMESPACE = 'docx_editor'
export const DOCX_EDITOR_FEATURE = 'docx-editor'
export const DOCX_EDITOR_WORKBENCH_CAPABILITY = 'docx-editor-workbench'
export const DOCX_EDITOR_AGENT_REVIEW_CAPABILITY = 'docx-editor-agent-review'
export const DOCX_EDITOR_TEMPLATE_CAPABILITY = 'docx-editor-assistant-template'
export const DOCX_EDITOR_ARTIFACT_SHARING_CAPABILITY = 'docx-editor-artifact-sharing'
export const DOCX_EDITOR_MIDDLEWARE_NAME = 'DocxEditorMiddleware'
export const DOCX_EDITOR_PROVIDER_KEY = 'docx-editor-view-provider'
export const DOCX_EDITOR_TEMPLATE_PROVIDER_KEY = 'docx-editor-template-provider'
export const DOCX_EDITOR_VIEW_KEY = 'docx_editor'
export const DOCX_EDITOR_REMOTE_ENTRY_KEY = 'docx-editor-workbench'
export const DOCX_EDITOR_ASSISTANT_TEMPLATE_KEY = 'docx-editor-assistant'
export const DOCX_EDITOR_AGENT_KEY = 'Agent_DocxEditor'
export const DOCX_EDITOR_MAX_INLINE_DOCX_BYTES = 10 * 1024 * 1024
export const DOCX_EDITOR_IMPORT_WORKSPACE_FILE_TOOL_NAME = 'docx_import_workspace_file'
export const DOCX_EDITOR_PUBLISH_ARTIFACT_LINK_TOOL_NAME = 'docx_publish_artifact_link'
export const DOCX_EDITOR_REVOKE_ARTIFACT_LINK_TOOL_NAME = 'docx_revoke_artifact_link'

export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const PROJECT_DETAIL_SECTIONS_SLOT = 'detail.sections'

export const DOCX_EDITOR_TOOL_NAMES = [
  'docx_read_document',
  'docx_read_selection',
  'docx_read_page',
  'docx_read_pages',
  'docx_find_text',
  'docx_read_comments',
  'docx_read_changes',
  'docx_add_comment',
  'docx_suggest_change',
  'docx_apply_formatting',
  'docx_set_paragraph_style',
  'docx_reply_comment',
  'docx_resolve_comment',
  'docx_resolve_all_comments',
  'docx_delete_comment',
  'docx_delete_all_comments',
  'docx_accept_change',
  'docx_reject_change',
  'docx_accept_all_changes',
  'docx_reject_all_changes',
  'docx_scroll'
] as const

export const DOCX_EDITOR_MUTATION_TOOL_NAMES = [
  'docx_add_comment',
  'docx_suggest_change',
  'docx_apply_formatting',
  'docx_set_paragraph_style',
  'docx_reply_comment',
  'docx_resolve_comment',
  'docx_resolve_all_comments',
  'docx_delete_comment',
  'docx_delete_all_comments',
  'docx_accept_change',
  'docx_reject_change',
  'docx_accept_all_changes',
  'docx_reject_all_changes'
] as const

export const DOCX_EDITOR_WORKBENCH_LIVE_TOOL_NAMES = [
  'docx_add_comment',
  'docx_suggest_change',
  'docx_apply_formatting',
  'docx_set_paragraph_style',
  'docx_reply_comment',
  'docx_resolve_comment',
  'docx_scroll'
] as const

export const DOCX_EDITOR_READ_ONLY_TOOL_NAMES = [
  'docx_read_document',
  'docx_read_selection',
  'docx_read_page',
  'docx_read_pages',
  'docx_find_text',
  'docx_read_comments',
  'docx_read_changes'
] as const

export const DOCX_EDITOR_HOST_EVENT_TOOL_NAMES = [
  DOCX_EDITOR_IMPORT_WORKSPACE_FILE_TOOL_NAME,
  ...DOCX_EDITOR_MUTATION_TOOL_NAMES,
  'docx_scroll'
] as const

export const DOCX_EDITOR_LIVE_ONLY_TOOL_NAMES = [
  'docx_read_selection',
  'docx_read_page',
  'docx_read_pages',
  'docx_scroll'
] as const

export const DOCX_EDITOR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="DOCX Editor"><path d="M24 13V9l-6-5H7v24h11M18 4v6h6M11 15h6M11 20h3"/><path d="m18 23 7-7 3 3-7 7-4 1Z" stroke="#D76646" fill="#FFF1E9"/></svg>`

/** First marketplace screenshot; declared in the bundle manifest for host asset resolution. */
export const APP_COVER = './assets/branding/cover-v1.webp'
