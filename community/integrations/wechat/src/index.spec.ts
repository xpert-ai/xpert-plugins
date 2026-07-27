import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  WECHAT_ARTIFACT_NAMESPACE,
  WECHAT_PLUGIN_RUNTIME_METADATA
} from './lib/constants.js'
import { WechatPluginConfigFormSchema } from './plugin-config.js'

describe('wechat plugin metadata', () => {
  it('keeps package and runtime artifact namespaces aligned', () => {
    const moduleDir = dirname(fileURLToPath(import.meta.url))
    const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
      xpert: { plugin: { artifactNamespace?: string } }
    }

    expect(WECHAT_ARTIFACT_NAMESPACE).toBe('wechat')
    expect(WECHAT_PLUGIN_RUNTIME_METADATA).toEqual({
      level: 'system',
      artifactNamespace: WECHAT_ARTIFACT_NAMESPACE
    })
    expect(packageJson.xpert.plugin.artifactNamespace).toBe(
      WECHAT_PLUGIN_RUNTIME_METADATA.artifactNamespace
    )
  })

  it('exposes translated config form labels', () => {
    const formSchema = WechatPluginConfigFormSchema as any

    expect(formSchema.properties.tunnelWsPath.title.zh_Hans).toBe('隧道 WebSocket 路径')
    expect(formSchema.properties.tunnelHeartbeatIntervalMs.title.en_US).toBe('Tunnel Heartbeat Interval (ms)')
    expect(formSchema.properties.tunnelClientTimeoutMs.title.zh_Hans).toBe('隧道客户端超时（毫秒）')
  })
})
