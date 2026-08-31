import { z } from 'zod'

export const WECOM_CONNECTOR_PLUGIN_NAME = '@xpert-ai/plugin-wecom-connector'
export const WECOM_CONNECTOR_PROVIDER = 'wecom'
export const WECOM_AUTH_INTEGRATION_PROVIDER = 'wecom_auth'
export const WECOM_AUTH_INTEGRATION_URL = `/settings/integration/create?provider=${WECOM_AUTH_INTEGRATION_PROVIDER}`
export const WECOM_CONNECTOR_INSTALL_LEVEL = 'tenant' as const
export const WECOM_CONNECTOR_ARTIFACT_NAMESPACE = 'wecom_connector' as const
export const WECOM_CONNECTOR_RUNTIME_MIDDLEWARE_NAME = `ConnectorRuntime:${WECOM_CONNECTOR_PROVIDER}`

export const WECOM_CLI_QR_AUTH_METHOD = 'wecom-cli-qr'
export const WECOM_CLI_MANUAL_AUTH_METHOD = 'wecom-cli-manual'
export const WECOM_LEGACY_AUTH_METHOD = 'wecom-qr'

export const WECOM_CLI_VERSION = '1.2.0'
export const WECOM_CLI_SKILLS_REF = '78c514b2afee7c0d3d7be715628478421f37ee63'
export const WECOM_CLI_SKILLS_SHA256 = '591149d0f796e118213f2fb18f6f2cfb2bf63618c778c81baf033d62a05e64bc'
export const WECOM_CLI_BOOTSTRAP_SCHEMA_VERSION = 1
export const WECOM_CLI_SKILLS = [
  'wecomcli-shared',
  'wecomcli-contact',
  'wecomcli-calendar',
  'wecomcli-meeting',
  'wecomcli-todo',
  'wecomcli-email',
  'wecomcli-disk',
  'wecomcli-media',
  'wecomcli-message',
  'wecomcli-doc-manage',
  'wecomcli-doc',
  'wecomcli-sheet',
  'wecomcli-smartsheet',
  'wecomcli-smartpage'
] as const

export const WECOM_QR_GENERATE_URL = 'https://work.weixin.qq.com/ai/qc/generate'
export const WECOM_QR_QUERY_URL = 'https://work.weixin.qq.com/ai/qc/query_result'
export const WECOM_QR_PAGE_URL = 'https://work.weixin.qq.com/ai/qc/gen'
export const WECOM_CLI_AUTH_URL = 'https://qyapi.weixin.qq.com/cgi-bin/aibot/cli/get_cli_config'
export const WECOM_QR_SOURCE = 'wecom_cli_external'
export const WECOM_QR_POLL_INTERVAL_SECONDS = 3
export const WECOM_QR_AUTHORIZATION_TTL_MS = 5 * 60 * 1000

const OptionalUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().url().optional()
)

export const WeComConnectorPluginConfigSchema = z.object({
  proxy: OptionalUrlSchema,
  npmRegistryUrl: OptionalUrlSchema
})

export type WeComConnectorPluginConfig = z.infer<typeof WeComConnectorPluginConfigSchema>

export const WeComConnectorPluginConfigFormSchema = {
  type: 'object',
  properties: {
    proxy: {
      type: 'string',
      title: { en_US: 'Network proxy', zh_Hans: '网络代理' },
      description: {
        en_US: 'Optional HTTP(S) proxy used to install WeCom CLI, download Skills, and run CLI requests.',
        zh_Hans: '可选。用于安装企业微信 CLI、下载 Skills 和执行 CLI 请求的 HTTP(S) 代理。'
      }
    },
    npmRegistryUrl: {
      type: 'string',
      title: { en_US: 'npm registry', zh_Hans: 'npm 镜像地址' },
      description: {
        en_US: 'Optional npm registry used to install the pinned official @wecom/cli package.',
        zh_Hans: '可选。用于安装固定版本官方 @wecom/cli 包的 npm 镜像地址。'
      }
    }
  }
} as const

export type WeComBotCredential = {
  botId: string
  botSecret: string
}

export type WeComAuthIntegrationOptions = WeComBotCredential

export const WECOM_CONNECTOR_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <path d="M702.592 770.432c28.202667 28.288 62.378667 45.269333 100.224 55.893333l12.757333 3.328c26.538667 4.821333 40.490667 29.013333 41.685334 53.76 0 29.013333-21.162667 53.76-50.176 58.026667-27.733333 3.626667-56.789333-13.909333-62.848-41.728-8.448-42.837333-26.624-80.341333-58.026667-111.786667-3.584-3.626667-1.152-11.477333-2.389333-17.493333l14.122666-1.066667c2.133333 0 3.754667 0.256 4.650667 1.066667z m268.885333-111.786667c30.208 3.626667 52.522667 27.776 52.522667 58.026667 0 29.013333-17.493333 52.522667-46.506667 58.026667a195.84 195.84 0 0 0-94.208 44.629333l-9.685333 9.130667c-6.101333 6.016-15.104 11.434667-21.205333 2.432-2.432-4.864-1.194667-16.341333 2.432-19.968a195.413333 195.413333 0 0 0 53.76-105.813334 57.557333 57.557333 0 0 1 62.890666-46.506666z m-226.048-54.4c-1.194667 6.016 1.28 15.061333-2.432 18.730667-30.165333 30.208-46.506667 66.474667-54.954666 108.202667-6.058667 30.165333-33.877333 47.701333-62.848 42.837333-29.013333-4.821333-50.773333-30.208-50.773334-58.581333 0-25.386667 18.773333-48.938667 44.074667-53.76a200.021333 200.021333 0 0 0 108.202667-54.997334c3.626667-3.669333 12.714667-2.432 18.773333-2.432z m53.76-113.621333c26.624 0 51.370667 17.493333 56.874667 45.312a199.68 199.68 0 0 0 54.954667 108.16c3.669333 3.669333 1.237333 13.952 2.432 19.968-7.253333 0-16.298667 2.432-19.925334-1.194667-30.293333-31.445333-67.754667-47.786667-109.44-56.746666a56.32 56.32 0 0 1-42.837333-61.738667c4.181333-30.165333 27.776-52.522667 57.984-53.76z" fill="#333333"/>
  <path d="M519.253333 821.376q-28.586667 4.821333-57.514666 5.845333-72.064 3.456-142.506667-13.44-2.005333-0.042667-3.968 0.426667l-99.925333 49.066667q-40.277333 20.821333-72.533334-4.522667-27.392-20.650667-24.021333-63.786667l0.128-1.408 0.213333-1.365333q5.546667-34.688 9.898667-76.8Q46.506667 631.893333 20.352 547.2-38.698667 346.368 115.2 194.304q133.205333-130.432 331.221333-125.909333 197.461333 4.522667 325.034667 139.904 46.464 49.322667 70.698667 106.794666 12.458667 29.525333 18.944 60.928a34.133333 34.133333 0 0 1-66.858667 13.824q-5.12-24.874667-14.933333-48.213333-19.541333-46.165333-57.557334-86.528-107.946667-114.602667-276.906666-118.442667-169.216-3.882667-281.642667 106.24-124.928 123.349333-77.653333 284.117334 21.546667 69.845333 94.250666 142.677333l0.512 0.512 0.512 0.554667q15.36 16.768 16.853334 39.466666l0.170666 2.816-0.298666 2.816q-4.650667 46.762667-10.794667 85.418667l102.826667-50.56 2.048-0.682667q18.261333-6.272 37.418666-3.84l1.962667 0.213334 1.92 0.469333q62.08 15.189333 126.293333 12.117333 24.490667-0.853333 48.64-4.949333a34.133333 34.133333 0 0 1 11.306667 67.328z m-335.36-17.066667l0.554667-0.725333 0.426667 1.408-0.469334-0.341333-0.469333-0.341334z" fill="#333333"/>
</svg>
`.trim()

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function requireString(value: unknown, message: string): string {
  const result = readString(value)
  if (!result) throw new Error(message)
  return result
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
