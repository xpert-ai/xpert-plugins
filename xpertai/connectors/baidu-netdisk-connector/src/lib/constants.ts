export const BAIDU_NETDISK_PLUGIN_LEVEL = 'tenant' as const
export const BAIDU_NETDISK_ARTIFACT_NAMESPACE = 'baidu_netdisk_connector' as const
export const BAIDU_NETDISK_CONNECTOR_PROVIDER = 'baidu-netdisk'
export const BAIDU_NETDISK_SYSTEM_INTEGRATION_PROVIDER = 'baidu-netdisk-oauth'
export const BAIDU_NETDISK_AUTH_METHOD_OAUTH = 'baidu-oauth'
export const BAIDU_NETDISK_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${BAIDU_NETDISK_CONNECTOR_PROVIDER}`
export const BAIDU_NETDISK_PLUGIN_CONFIG_TOKEN = 'BAIDU_NETDISK_PLUGIN_CONFIG'
export const BAIDU_NETDISK_PLUGIN_CONTEXT = 'BAIDU_NETDISK_PLUGIN_CONTEXT'

export const BAIDU_NETDISK_AUTHORIZE_URL = 'https://openapi.baidu.com/oauth/2.0/authorize'
export const BAIDU_NETDISK_TOKEN_URL = 'https://openapi.baidu.com/oauth/2.0/token'
export const BAIDU_NETDISK_API_ORIGIN = 'https://pan.baidu.com'
export const BAIDU_NETDISK_UPLOAD_ORIGIN = 'https://d.pcs.baidu.com'
export const BAIDU_NETDISK_SEMANTIC_SEARCH_PATH = '/xpan/unisearch'

export const BAIDU_NETDISK_DEFAULT_SCOPES = ['basic', 'netdisk'] as const
export const BAIDU_NETDISK_DEFAULT_TIMEOUT_MS = 30_000
export const BAIDU_NETDISK_DEFAULT_RESPONSE_MAX_BYTES = 2 * 1024 * 1024
export const BAIDU_NETDISK_MAX_PAGE_SIZE = 100
export const BAIDU_NETDISK_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024
