import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

export const WechatPluginConfigSchema = z.object({
  tunnelWsPath: z.string().default('/api/wechat/tunnel/ws'),
  tunnelHeartbeatIntervalMs: z.number().int().positive().default(30000),
  tunnelClientTimeoutMs: z.number().int().positive().default(90000)
})

export type WechatPluginConfig = z.infer<typeof WechatPluginConfigSchema>

export const WechatPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    tunnelWsPath: {
      type: 'string',
      title: {
        en_US: 'Tunnel WebSocket Path',
        zh_Hans: '隧道 WebSocket 路径'
      },
      description: {
        en_US: 'Socket.IO namespace path used by the wx2.0 reverse tunnel sidecar.',
        zh_Hans: 'wx2.0 反向隧道 sidecar 连接使用的 Socket.IO namespace 路径。'
      },
      default: '/api/wechat/tunnel/ws'
    },
    tunnelHeartbeatIntervalMs: {
      type: 'number',
      title: {
        en_US: 'Tunnel Heartbeat Interval (ms)',
        zh_Hans: '隧道心跳间隔（毫秒）'
      },
      description: {
        en_US: 'How often the server checks reverse tunnel liveness.',
        zh_Hans: '服务端检查反向隧道连接存活状态的间隔。'
      },
      default: 30000
    },
    tunnelClientTimeoutMs: {
      type: 'number',
      title: {
        en_US: 'Tunnel Client Timeout (ms)',
        zh_Hans: '隧道客户端超时（毫秒）'
      },
      description: {
        en_US: 'How long a silent reverse tunnel client is kept before being marked offline.',
        zh_Hans: '反向隧道客户端静默多久后会被标记为离线。'
      },
      default: 90000
    }
  },
  required: []
}
