export const CANVA_PLUGIN_LEVEL = 'organization' as const
export const CANVA_ARTIFACT_NAMESPACE = 'canva_connector' as const
export const CANVA_CONNECTOR_PROVIDER = 'canva'
/** Legacy OAuth method retained only for callbacks and credentials created before automatic integration lookup. */
export const CANVA_MCP_CN_PUBLIC_AUTH_METHOD = 'mcp-oauth-cn-public'
export const CANVA_MCP_CN_AUTH_METHOD = 'mcp-oauth-cn'
export const CANVA_CONNECT_GLOBAL_AUTH_METHOD = 'connect-oauth-global'
export const CANVA_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${CANVA_CONNECTOR_PROVIDER}`
export const CANVA_MCP_CN_RESOURCE = 'https://mcp.canva.cn'
export const CANVA_MCP_CN_ENDPOINT = 'https://mcp.canva.cn/mcp'
export const CANVA_MCP_CN_METADATA_URL = 'https://mcp.canva.cn/.well-known/oauth-authorization-server'
export const CANVA_MCP_CN_REGISTER_URL = 'https://mcp.canva.cn/register'
export const CANVA_MCP_CN_AUTHORIZE_URL = 'https://mcp.canva.cn/authorize'
export const CANVA_MCP_CN_TOKEN_URL = 'https://mcp.canva.cn/token'
export const CANVA_MCP_CN_REVOKE_URL = 'https://mcp.canva.cn/token'
export const CANVA_CONNECT_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize'
export const CANVA_CONNECT_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'
export const CANVA_CONNECT_REVOKE_URL = 'https://api.canva.com/rest/v1/oauth/revoke'
export const CANVA_CONNECT_REST_BASE_URL = 'https://api.canva.com/rest/v1'
export const CANVA_DEFAULT_SCOPES = [
  'design:meta:read',
  'design:content:read',
  'design:content:write',
  'asset:read'
] as const
export const CANVA_AUTHORIZATION_TTL_MS = 10 * 60 * 1000
export const CANVA_MCP_REQUEST_TIMEOUT_MS = 60_000
// Design generation is slower than ordinary metadata and editing operations.
export const CANVA_MCP_GENERATE_TIMEOUT_MS = 120_000
export const CANVA_MCP_SESSION_IDLE_TTL_MS = 10 * 60 * 1000
export const CANVA_MCP_MAX_SESSIONS = 100
export const CANVA_RESPONSE_MAX_ITEMS = 50
export const CANVA_RESPONSE_MAX_TEXT = 4_000
export const CANVA_RESPONSE_MAX_BYTES = 2 * 1024 * 1024
export const CANVA_EXPORT_MAX_BYTES = 100 * 1024 * 1024

export const CANVA_MCP_TOOL_NAMES = [
  'search-designs',
  'get-design',
  'get-design-pages',
  'get-design-content',
  'generate-design',
  'start-editing-transaction',
  'perform-editing-operations',
  'commit-editing-transaction',
  'cancel-editing-transaction',
  'get-export-formats',
  'export-design',
  'import-design-from-url',
  'get-job-status'
] as const
export type CanvaMcpToolName = (typeof CANVA_MCP_TOOL_NAMES)[number]
