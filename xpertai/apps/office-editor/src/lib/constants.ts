import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

export const OFFICE_EDITOR_PLUGIN_NAME = '@xpert-ai/plugin-office-editor'
/**
 * Stable namespace for Office Editor owned artifacts.
 * Changing this after publish would require coordinated table and route migration.
 */
export const OFFICE_EDITOR_ARTIFACT_NAMESPACE = 'office_editor'
export const OFFICE_EDITOR_FEATURE = 'office-editor'
export const OFFICE_EDITOR_WORKBENCH_CAPABILITY = 'office-editor-workbench'
export const OFFICE_EDITOR_AGENT_REVIEW_CAPABILITY = 'office-editor-agent-review'
export const OFFICE_EDITOR_TEMPLATE_CAPABILITY = 'office-editor-assistant-template'
export const OFFICE_EDITOR_COLLABORATION_CAPABILITY = 'office-editor-collaboration'
export const OFFICE_EDITOR_MIDDLEWARE_NAME = 'OfficeEditorMiddleware'
export const OFFICE_EDITOR_PROVIDER_KEY = 'office-editor-view-provider'
export const OFFICE_EDITOR_TEMPLATE_PROVIDER_KEY = 'office-editor-template-provider'
export const OFFICE_EDITOR_VIEW_KEY = 'office_editor'
export const OFFICE_EDITOR_REMOTE_ENTRY_KEY = 'office-editor-workbench'
export const OFFICE_EDITOR_ASSISTANT_TEMPLATE_KEY = 'office-editor-assistant'
export const OFFICE_EDITOR_AGENT_KEY = 'Agent_OfficeEditor'
/**
 * Route-safe derivative of the artifact namespace for HTTP and WebSocket paths.
 * Keep this derived from the artifact namespace so non-table artifacts stay grouped.
 */
export const OFFICE_EDITOR_ROUTE_NAMESPACE = OFFICE_EDITOR_ARTIFACT_NAMESPACE.replace(/_/g, '-')
export const OFFICE_EDITOR_COLLAB_NAMESPACE_PREFIX = `/api/${OFFICE_EDITOR_ROUTE_NAMESPACE}/collab/ws/`
export const OFFICE_EDITOR_COLLAB_ROOM_PREFIX = `${OFFICE_EDITOR_ROUTE_NAMESPACE}:`
export const OFFICE_EDITOR_COLLAB_SESSION_TTL_MS = 15 * 60 * 1000
export const OFFICE_WORKSPACE_FILES_RUNTIME_CAPABILITY = 'platform.workspace.files'

/**
 * Build Office Editor table names with the shared plugin artifact namespace.
 * Existing keys intentionally resolve to the current physical table names.
 */
export function officeEditorTable(key: string) {
  return pluginArtifactTableName(OFFICE_EDITOR_ARTIFACT_NAMESPACE, key)
}

export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const PROJECT_DETAIL_SECTIONS_SLOT = 'detail.sections'

export const OFFICE_EDITOR_DOCUMENT_TYPES = ['spreadsheet', 'document', 'presentation'] as const
export const OFFICE_EDITOR_IMPORT_FORMATS = ['xlsx', 'docx', 'pptx'] as const

export const OFFICE_EDITOR_OPERATION_TYPES = [
  'sheet_set_range_values',
  'doc_append_text',
  'doc_replace_text',
  'slide_create_outline',
  'slide_update_text'
] as const

export const OFFICE_EDITOR_TOOL_NAMES = [
  'office_create_document',
  'office_list_documents',
  'office_read_document',
  'office_excel_read',
  'office_excel_edit',
  'office_excel_get_versions',
  'office_excel_restore_version',
  'office_excel_get_file',
  'office_queue_edit',
  'office_add_review_note',
  'office_report_failure'
] as const

export const OFFICE_EDITOR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Office Editor">
  <rect x="8" y="10" width="48" height="44" rx="8" fill="#0f766e"/>
  <rect x="16" y="18" width="14" height="12" rx="2" fill="#ccfbf1"/>
  <rect x="34" y="18" width="14" height="12" rx="2" fill="#99f6e4"/>
  <rect x="16" y="34" width="32" height="4" rx="2" fill="#f0fdfa"/>
  <rect x="16" y="43" width="24" height="4" rx="2" fill="#5eead4"/>
</svg>`
