import { z } from 'zod/v3'
import type { XpertToolProviderOptions } from '@xpert-ai/plugin-sdk'
const stream = {
  streamLoadEnabled: z.boolean().default(true),
  streamLoadMinRows: z.number().int().min(1).default(500),
  streamLoadChunkSize: z.number().int().min(1).max(50000).default(50000)
}
export const connectionConfig = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('platform'), dataSourceId: z.string().min(1), ...stream }),
  z.object({
    mode: z.literal('manual'),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(9030),
    username: z.string().min(1),
    password: z.string().default(''),
    database: z.string().min(1),
    feHost: z.string().optional(),
    fePort: z.number().int().min(1).max(65535).default(8030),
    streamLoadHosts: z.array(z.string().min(1)).default([]),
    useSsl: z.boolean().default(false),
    sslCa: z.string().optional(),
    ...stream
  })
])
export type ConnectionConfig = z.infer<typeof connectionConfig>
const manual = [{ name: 'mode', value: 'manual' }]
export const configSchema: NonNullable<XpertToolProviderOptions['configSchema']> & {
  title: { en_US: string; zh_Hans: string }
} = {
  type: 'object',
  title: { en_US: 'Connection configuration', zh_Hans: '配置连接' },
  required: ['mode'],
  properties: {
    mode: {
      type: 'string',
      enum: ['platform', 'manual'],
      title: { en_US: 'Connection mode', zh_Hans: '连接方式' },
      'x-ui': { component: 'select', enumLabels: { platform: '平台 Doris 数据源', manual: '手填 Doris 连接' } }
    },
    dataSourceId: {
      type: 'string',
      title: { en_US: 'Doris data source', zh_Hans: 'Doris 数据源' },
      'x-ui': {
        component: 'remoteSelect',
        selectUrl: '/api/saic-doris/datasources',
        visibleWhen: [{ name: 'mode', value: 'platform' }]
      }
    },
    host: { type: 'string', title: { en_US: 'SQL host', zh_Hans: 'SQL 主机' }, 'x-ui': { visibleWhen: manual } },
    port: {
      type: 'number',
      default: 9030,
      title: { en_US: 'SQL port', zh_Hans: 'SQL 端口' },
      'x-ui': { visibleWhen: manual }
    },
    username: { type: 'string', title: { en_US: 'Username', zh_Hans: '账号' }, 'x-ui': { visibleWhen: manual } },
    password: {
      type: 'string',
      title: { en_US: 'Password', zh_Hans: '密码' },
      'x-ui': { component: 'secretInput', visibleWhen: manual }
    },
    database: { type: 'string', title: { en_US: 'Database', zh_Hans: '数据库' }, 'x-ui': { visibleWhen: manual } },
    feHost: {
      type: 'string',
      title: { en_US: 'FE HTTP host (optional)', zh_Hans: 'FE HTTP 主机（留空使用 SQL 主机）' },
      'x-ui': { visibleWhen: manual }
    },
    fePort: {
      type: 'number',
      default: 8030,
      title: { en_US: 'FE HTTP port', zh_Hans: 'FE HTTP 端口' },
      'x-ui': { visibleWhen: manual }
    },
    streamLoadHosts: {
      type: 'array',
      items: { type: 'string' },
      title: { en_US: 'Allowed Stream Load redirect hosts', zh_Hans: '允许的 Stream Load 重定向主机' },
      'x-ui': { visibleWhen: manual }
    },
    useSsl: {
      type: 'boolean',
      default: false,
      title: { en_US: 'TLS', zh_Hans: '启用 TLS' },
      'x-ui': { visibleWhen: manual }
    },
    sslCa: {
      type: 'string',
      title: { en_US: 'SQL TLS CA (PEM)', zh_Hans: 'SQL TLS CA（PEM）' },
      'x-ui': { component: 'textarea', visibleWhen: manual }
    },
    streamLoadEnabled: {
      type: 'boolean',
      default: true,
      title: { en_US: 'Enable Stream Load', zh_Hans: '启用 Stream Load' }
    },
    streamLoadMinRows: {
      type: 'number',
      default: 500,
      title: { en_US: 'Stream Load minimum rows', zh_Hans: 'Stream Load 最小行数' }
    },
    streamLoadChunkSize: {
      type: 'number',
      default: 50000,
      title: { en_US: 'Stream Load chunk size', zh_Hans: 'Stream Load 分块行数' }
    }
  }
}
export const CONFIG_KEYS = Object.keys(configSchema.properties)
