export const DOCX_EDITOR_PLUGIN_NAME = '@xpert-ai/plugin-docx-editor'
export const DOCX_EDITOR_FEATURE = 'docx-editor'
export const DOCX_EDITOR_WORKBENCH_CAPABILITY = 'docx-editor-workbench'
export const DOCX_EDITOR_AGENT_REVIEW_CAPABILITY = 'docx-editor-agent-review'
export const DOCX_EDITOR_TEMPLATE_CAPABILITY = 'docx-editor-assistant-template'
export const DOCX_EDITOR_MIDDLEWARE_NAME = 'DocxEditorMiddleware'
export const DOCX_EDITOR_PROVIDER_KEY = 'docx-editor-view-provider'
export const DOCX_EDITOR_TEMPLATE_PROVIDER_KEY = 'docx-editor-template-provider'
export const DOCX_EDITOR_VIEW_KEY = 'docx_editor'
export const DOCX_EDITOR_REMOTE_ENTRY_KEY = 'docx-editor-workbench'
export const DOCX_EDITOR_ASSISTANT_TEMPLATE_KEY = 'docx-editor-assistant'
export const DOCX_EDITOR_AGENT_KEY = 'Agent_DocxEditor'
export const DOCX_EDITOR_MAX_INLINE_DOCX_BYTES = 10 * 1024 * 1024

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

export const DOCX_EDITOR_READ_ONLY_TOOL_NAMES = [
  'docx_read_document',
  'docx_read_selection',
  'docx_read_page',
  'docx_read_pages',
  'docx_find_text',
  'docx_read_comments',
  'docx_read_changes'
] as const

export const DOCX_EDITOR_HOST_EVENT_TOOL_NAMES = [...DOCX_EDITOR_MUTATION_TOOL_NAMES, 'docx_scroll'] as const

export const DOCX_EDITOR_LIVE_ONLY_TOOL_NAMES = [
  'docx_read_selection',
  'docx_read_page',
  'docx_read_pages',
  'docx_scroll'
] as const

export const DOCX_EDITOR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="DOCX Editor">
  <rect x="14" y="6" width="34" height="52" rx="6" fill="#2563eb"/>
  <path d="M40 6v14h8" fill="#93c5fd"/>
  <rect x="20" y="25" width="22" height="3" rx="1.5" fill="#fff"/>
  <rect x="20" y="33" width="18" height="3" rx="1.5" fill="#dbeafe"/>
  <rect x="20" y="41" width="22" height="3" rx="1.5" fill="#bfdbfe"/>
  <path d="M48 20 40 6v10a4 4 0 0 0 4 4h4z" fill="#60a5fa"/>
</svg>`
