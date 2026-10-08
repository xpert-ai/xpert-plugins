export const QQ_MAIL_CONNECTOR_PROVIDER = 'qq-mail'
export const QQ_MAIL_AUTH_METHOD = 'oauth2-pkce'
export const QQ_MAIL_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${QQ_MAIL_CONNECTOR_PROVIDER}`
export const QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER = 'qq-mail-imap-smtp'
export const QQ_MAIL_PROTOCOL_AUTH_METHOD = 'imap-smtp-authorization-code'

export const QQ_MAIL_RESOURCE = 'https://api.mail.qq.com'
export const QQ_MAIL_MCP_URL = `${QQ_MAIL_RESOURCE}/mcp`
export const QQ_MAIL_RESOURCE_METADATA_URL = `${QQ_MAIL_RESOURCE}/.well-known/oauth-protected-resource`
export const QQ_MAIL_ISSUER = 'https://wx.mail.qq.com'
export const QQ_MAIL_AUTHORIZATION_METADATA_URL = `${QQ_MAIL_ISSUER}/.well-known/oauth-authorization-server`
export const QQ_MAIL_AUTHORIZATION_URL = `${QQ_MAIL_ISSUER}/oauth/authorize`
export const QQ_MAIL_TOKEN_URL = `${QQ_MAIL_ISSUER}/oauth/token`
export const QQ_MAIL_REGISTRATION_URL = `${QQ_MAIL_ISSUER}/oauth/register`

export const QQ_MAIL_BASE_SCOPES = ['alias:read', 'mail:read', 'mail:send'] as const

export const QQ_MAIL_PROTOCOL_DEFAULT_SEARCH_LIMIT = 20
export const QQ_MAIL_PROTOCOL_MAX_SEARCH_LIMIT = 50
export const QQ_MAIL_PROTOCOL_MAX_SEARCH_MATCHES = 5_000
export const QQ_MAIL_PROTOCOL_MAX_FOLDER_COUNT = 200
export const QQ_MAIL_PROTOCOL_MAX_BODY_BYTES = 512 * 1024
export const QQ_MAIL_PROTOCOL_MAX_BODY_CHARS = 100_000
export const QQ_MAIL_PROTOCOL_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const QQ_MAIL_PROTOCOL_MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const QQ_MAIL_PROTOCOL_CONNECTION_TIMEOUT_MS = 10_000
export const QQ_MAIL_PROTOCOL_SOCKET_TIMEOUT_MS = 30_000
export const QQ_MAIL_PROTOCOL_CLIENT_INFO = {
  name: 'XpertAI QQ Mail Connector',
  version: '0.1.0',
  vendor: 'XpertAI'
} as const

export const QQ_MAIL_SESSION_IDLE_TTL_MS = 5 * 60 * 1000
export const QQ_MAIL_CONFIRMATION_TTL_MS = 5 * 60 * 1000
export const QQ_MAIL_MAX_SESSIONS = 100
export const QQ_MAIL_MAX_CONFIRMATIONS = 500
export const QQ_MAIL_MCP_REQUEST_TIMEOUT_MS = 60_000
export const QQ_MAIL_MAX_DOWNLOAD_ATTACHMENT_BYTES = 25 * 1024 * 1024

export const QQ_MAIL_PLUGIN_LEVEL = 'organization' as const
