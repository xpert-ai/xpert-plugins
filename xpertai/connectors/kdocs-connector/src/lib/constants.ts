export const KDOCS_PLUGIN_LEVEL = 'organization' as const

export const KDOCS_CONNECTOR_PROVIDER = 'kdocs'
export const KDOCS_AUTH_METHOD_ID = 'skillhub-login'
export const KDOCS_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${KDOCS_CONNECTOR_PROVIDER}`

export const KDOCS_ACCOUNT_LOGIN_URL = 'https://account.wps.cn/login'
export const KDOCS_SKILLHUB_CALLBACK_URL = 'https://api.wps.cn/office/v5/ai/skill_hub/users/callback'
export const KDOCS_SKILLHUB_EXCHANGE_URL = 'https://api.wps.cn/office/v5/ai/skill_hub/wps_auth/exchange'
export const KDOCS_SKILLHUB_MCP_URL = 'https://mcp-center.wps.cn/skill_hub/mcp'

export const KDOCS_AUTHORIZATION_TTL_MS = 5 * 60 * 1000
export const KDOCS_AUTH_REQUEST_TIMEOUT_MS = 10_000
export const KDOCS_AUTH_RESPONSE_MAX_BYTES = 64 * 1024
export const KDOCS_MCP_REQUEST_TIMEOUT_MS = 60_000
export const KDOCS_MCP_SESSION_IDLE_TTL_MS = 5 * 60 * 1000
export const KDOCS_MCP_MAX_SESSIONS = 100
export const KDOCS_MAX_DOCUMENT_CONTENT_CHARS = 100_000
export const KDOCS_MAX_FILE_BYTES = 20 * 1024 * 1024
export const KDOCS_SKILL_VERSION = '1.4.12'

export const KDOCS_MCP_TOOL_NAMES = [
  'search_files',
  'list_files',
  'get_file_info',
  'read_file_content',
  'get_file_link',
  'create_file',
  'rename_file',
  'move_file',
  'copy_file',
  'upload_file',
  'download_file',
  'otl.block_query',
  'otl.insert_content',
  'sheet.get_sheets_info',
  'sheet.get_range_data',
  'sheet.update_range_data',
  'sheet.add_row'
] as const

export type KdocsMcpToolName = (typeof KDOCS_MCP_TOOL_NAMES)[number]
