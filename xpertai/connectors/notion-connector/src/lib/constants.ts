export const NOTION_PLUGIN_LEVEL = 'organization' as const
export const NOTION_ARTIFACT_NAMESPACE = 'notion_connector' as const

export const NOTION_CONNECTOR_PROVIDER = 'notion'
export const NOTION_PUBLIC_OAUTH_AUTH_METHOD = 'notion-public-oauth'
export const NOTION_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${NOTION_CONNECTOR_PROVIDER}`
export const NOTION_SYSTEM_INTEGRATION_PROVIDER = 'notion'
export const NOTION_PLUGIN_CONTEXT = `${NOTION_ARTIFACT_NAMESPACE}.plugin_context`

export const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize'
export const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token'
export const NOTION_API_BASE_URL = 'https://api.notion.com'
export const NOTION_API_VERSION = '2026-03-11'
export const NOTION_API_TIMEOUT_MS = 60_000
export const NOTION_MAX_PAGE_SIZE = 100
export const NOTION_MAX_BLOCKS = 500
export const NOTION_MAX_BLOCK_DEPTH = 8
export const NOTION_MAX_CONTENT_CHARS = 50_000
export const NOTION_MAX_QUERY_LENGTH = 200
export const NOTION_RETRY_ATTEMPTS = 3
