import { WechatPluginConfigFormSchema } from './plugin-config.js'

describe('wechat plugin metadata', () => {
  it('exposes translated config form labels', () => {
    const formSchema = WechatPluginConfigFormSchema as any

    expect(formSchema.properties.tunnelWsPath.title.zh_Hans).toBe('隧道 WebSocket 路径')
    expect(formSchema.properties.tunnelHeartbeatIntervalMs.title.en_US).toBe('Tunnel Heartbeat Interval (ms)')
    expect(formSchema.properties.tunnelClientTimeoutMs.title.zh_Hans).toBe('隧道客户端超时（毫秒）')
  })
})
