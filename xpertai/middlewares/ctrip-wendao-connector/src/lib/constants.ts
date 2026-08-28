export const CTRIP_WENDAO_CONNECTOR_PROVIDER = 'ctrip-wendao'
export const CTRIP_WENDAO_PLUGIN_LEVEL = 'organization' as const
export const CTRIP_WENDAO_AUTH_METHOD_ID = 'api-token'
export const CTRIP_WENDAO_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${CTRIP_WENDAO_CONNECTOR_PROVIDER}`

export const CTRIP_WENDAO_API_URL = 'https://externalcallback.ctrip.com/skills/api/crew/qclaw/searchInfo'
export const CTRIP_WENDAO_HELP_URL = 'https://www.ctrip.com/wendao/openclaw'
export const CTRIP_WENDAO_REQUEST_TIMEOUT_MS = 30_000
export const CTRIP_WENDAO_MAX_QUERY_LENGTH = 4_000
export const CTRIP_WENDAO_MAX_RESPONSE_BYTES = 256 * 1024
export const CTRIP_WENDAO_MAX_RESULT_CHARS = 64_000
export const CTRIP_WENDAO_CONNECT_TEST_QUERY = '测试连接'
