export const ZSXQ_PLUGIN_LEVEL = 'organization' as const
export const ZSXQ_ARTIFACT_NAMESPACE = 'zsxq_connector' as const

export const ZSXQ_CONNECTOR_PROVIDER = 'zsxq'
export const ZSXQ_AUTH_METHOD_ID = 'device-oauth-cli'
export const ZSXQ_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${ZSXQ_CONNECTOR_PROVIDER}`
export const ZSXQ_PLUGIN_CONFIG_TOKEN = Symbol.for('@xpert-ai/plugin-zsxq-connector/config')

export const ZSXQ_CLI_VERSION = '0.5.1'
export const ZSXQ_AUTHORIZATION_HOST = 'garden.zsxq.com'
export const ZSXQ_OAUTH_BASE_URL = 'https://mcp.zsxq.com/oauth'
export const ZSXQ_CLI_COMMAND_TIMEOUT_MS = 60_000
export const ZSXQ_CLI_AUTH_START_TIMEOUT_MS = 15_000
export const ZSXQ_CLI_OUTPUT_MAX_BYTES = 2 * 1024 * 1024
export const ZSXQ_CONFIRMATION_TTL_MS = 10 * 60 * 1000
export const ZSXQ_MAX_CONFIRMATIONS = 500
export const ZSXQ_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const ZSXQ_MAX_ATTACHMENTS = 9
