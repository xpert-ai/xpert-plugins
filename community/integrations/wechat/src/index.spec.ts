import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { WECHAT_ARTIFACT_NAMESPACE } from './lib/constants.js'
import { WechatPluginConfigFormSchema } from './plugin-config.js'

describe('wechat plugin metadata', () => {
  it('declares the artifact namespace used by plugin_wechat tables', () => {
    const moduleDir = dirname(fileURLToPath(import.meta.url))
    const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
      xpert: { plugin: { artifactNamespace?: string } }
    }

    expect(WECHAT_ARTIFACT_NAMESPACE).toBe('wechat')
    expect(packageJson.xpert.plugin.artifactNamespace).toBe(WECHAT_ARTIFACT_NAMESPACE)
  })

  it('exposes translated config form labels', () => {
    const formSchema = WechatPluginConfigFormSchema as any

    expect(formSchema.properties.tunnelWsPath.title.zh_Hans).toBe('隧道 WebSocket 路径')
    expect(formSchema.properties.tunnelHeartbeatIntervalMs.title.en_US).toBe('Tunnel Heartbeat Interval (ms)')
    expect(formSchema.properties.tunnelClientTimeoutMs.title.zh_Hans).toBe('隧道客户端超时（毫秒）')
  })
})
