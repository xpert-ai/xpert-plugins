export const WPS_KNOWLEDGE_PLUGIN_LEVEL = 'organization' as const

export const WPS_KNOWLEDGE_CONNECTOR_PROVIDER = 'wps-knowledge'
export const WPS_KNOWLEDGE_AUTH_METHOD_ID = 'skillhub-login'
export const WPS_KNOWLEDGE_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${WPS_KNOWLEDGE_CONNECTOR_PROVIDER}`

export const WPS_ACCOUNT_LOGIN_URL = 'https://account.wps.cn/login'
export const WPS_SKILLHUB_CALLBACK_URL = 'https://zhishi.wps.cn/kwiki/api/v1/skills_hub/callback'
export const WPS_SKILLHUB_CODE_URL = 'https://zhishi.wps.cn/kwiki/api/v1/skills_hub/access_token/code/generate'
export const WPS_SKILLHUB_EXCHANGE_URL = 'https://zhishi.wps.cn/kwiki/api/v1/skills_hub/access_token/exchange'
export const WPS_SKILLHUB_API_BASE_URL = 'https://zhishi.wps.cn/kwiki/api/v1/skills_hub/skill/'
export const WPS_KWIKI_SKILL_VERSION = '2.0.2'

export const WPS_AUTHORIZATION_TTL_MS = 5 * 60 * 1000
export const WPS_AUTH_REQUEST_TIMEOUT_MS = 10_000
export const WPS_DEFAULT_REQUEST_TIMEOUT_MS = 15_000
export const WPS_DEFAULT_SSE_TIMEOUT_MS = 90_000
export const WPS_DEFAULT_SSE_IDLE_TIMEOUT_MS = 20_000
export const WPS_DEFAULT_RESPONSE_MAX_BYTES = 1024 * 1024
export const WPS_DEFAULT_SSE_MAX_BYTES = 2 * 1024 * 1024
export const WPS_MAX_ANSWER_CHARS = 20_000
export const WPS_MAX_CITATIONS = 20
export const WPS_MAX_SNIPPET_CHARS = 2_000
