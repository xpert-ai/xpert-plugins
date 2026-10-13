export const PENCIL_PLUGIN_NAME = '@xpert-ai/plugin-pencil'
export const PENCIL_ARTIFACT_NAMESPACE = 'pencil'
export const PENCIL_PROVIDER_KEY = 'pencil'
export const PENCIL_MIDDLEWARE_NAME = 'PencilMiddleware'
export const PENCIL_TEMPLATE_PROVIDER_KEY = 'pencilTemplates'
export const PENCIL_FEATURE = 'pencil'
export const PENCIL_AGENT_CAPABILITY = 'agent-pencil'
export const PENCIL_WORKBENCH_CAPABILITY = 'pencil-workbench'
export const PENCIL_TEMPLATE_CAPABILITY = 'pencil-assistant-template'
export const PENCIL_ARTIFACT_SHARING_CAPABILITY = 'pencil-artifact-sharing'
export const PENCIL_WORKBENCH_VIEW_KEY = 'pencil_workbench'
export const PENCIL_REMOTE_ENTRY_KEY = 'pencil-workbench'
export const PENCIL_VERSION = '0.13.2'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const PENCIL_CREATE_DOCUMENT_TOOL_NAME = 'pencil_create_document'
export const PENCIL_CREATE_SAMPLE_DOCUMENT_TOOL_NAME = 'pencil_create_sample_document'
export const PENCIL_SEARCH_DOCUMENTS_TOOL_NAME = 'pencil_search_documents'
export const PENCIL_GET_DOCUMENT_TOOL_NAME = 'pencil_get_document'
export const PENCIL_GET_NODE_TOOL_NAME = 'pencil_get_node'
export const PENCIL_SAVE_VERSION_TOOL_NAME = 'pencil_save_version'
export const PENCIL_IMPORT_FILE_TOOL_NAME = 'pencil_import_file'
export const PENCIL_EXPORT_FILE_TOOL_NAME = 'pencil_export_file'
export const PENCIL_PUBLISH_ARTIFACT_LINK_TOOL_NAME = 'pencil_publish_artifact_link'
export const PENCIL_REVOKE_ARTIFACT_LINK_TOOL_NAME = 'pencil_revoke_artifact_link'
export const PENCIL_UPDATE_STATUS_TOOL_NAME = 'pencil_update_status'
export const PENCIL_REPORT_FAILURE_TOOL_NAME = 'pencil_report_failure'
export const PENCIL_RENDER_PATCH_TOOL_NAME = 'pencil_render_patch'

export const PENCIL_BASE_MIDDLEWARE_TOOL_NAMES = [
  PENCIL_CREATE_DOCUMENT_TOOL_NAME,
  PENCIL_CREATE_SAMPLE_DOCUMENT_TOOL_NAME,
  PENCIL_SEARCH_DOCUMENTS_TOOL_NAME,
  PENCIL_GET_DOCUMENT_TOOL_NAME,
  PENCIL_GET_NODE_TOOL_NAME,
  PENCIL_SAVE_VERSION_TOOL_NAME,
  PENCIL_IMPORT_FILE_TOOL_NAME,
  PENCIL_EXPORT_FILE_TOOL_NAME,
  PENCIL_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
  PENCIL_REVOKE_ARTIFACT_LINK_TOOL_NAME,
  PENCIL_UPDATE_STATUS_TOOL_NAME,
  PENCIL_REPORT_FAILURE_TOOL_NAME,
  PENCIL_RENDER_PATCH_TOOL_NAME
] as const

export const PENCIL_EXCLUDED_CORE_TOOL_NAMES = ['eval', 'stock_photo'] as const

export const PENCIL_SELECTED_CORE_TOOL_NAMES = [
  'get_selection',
  'get_node',
  'find_nodes',
  'get_jsx',
  'describe',
  'calc',
  'get_page_tree',
  'get_current_page',
  'list_pages',
  'select_nodes',
  'query_nodes',
  'get_components',
  'switch_page',
  'page_bounds',
  'list_fonts',
  'diff_jsx',
  'create_shape',
  'set_layout',
  'set_layout_child',
  'set_fill',
  'set_stroke',
  'set_radius',
  'set_text',
  'set_text_properties',
  'set_minmax',
  'create_component',
  'create_instance',
  'create_page',
  'set_effects',
  'set_opacity',
  'set_font',
  'set_visible',
  'set_constraints',
  'set_rotation',
  'set_font_range',
  'set_text_resize',
  'set_blend',
  'set_locked',
  'set_stroke_align',
  'clone_node',
  'node_move',
  'rename_node',
  'group_nodes',
  'ungroup_node',
  'flatten_nodes',
  'node_to_component',
  'node_bounds',
  'node_ancestors',
  'node_children',
  'node_tree',
  'node_bindings',
  'node_replace_with',
  'arrange',
  'list_variables',
  'list_collections',
  'get_variable',
  'find_variables',
  'create_variable',
  'set_variable',
  'delete_variable',
  'bind_variable',
  'get_collection',
  'create_collection',
  'delete_collection',
  'boolean_union',
  'boolean_subtract',
  'boolean_intersect',
  'boolean_exclude',
  'path_get',
  'path_set',
  'path_scale',
  'path_flip',
  'path_move',
  'viewport_get',
  'viewport_set',
  'export_svg',
  'export_image',
  'analyze_colors',
  'analyze_typography',
  'analyze_spacing',
  'analyze_clusters',
  'diff_create',
  'diff_show',
  'design_to_tokens',
  'design_to_component_map'
] as const

export const PENCIL_CORE_TOOL_PREFIX = 'pencil_'

export const PENCIL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none" stroke="#0F172A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Pencil"><path d="m8 19 15-15 5 5-15 15-8 3Z"/><path d="m20 7 5 5M8 19l5 5"/><path d="M4 12V4h8" stroke="#D55D3C"/><path d="m5 27 3-8 5 5Z" fill="#D55D3C" stroke="none"/></svg>`

/** First marketplace screenshot; declared in the bundle manifest for host asset resolution. */
export const APP_COVER = './assets/branding/cover-v1.webp'
