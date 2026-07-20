import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  WECHAT_ARTIFACT_NAMESPACE,
  WECHAT_CONTROLLER_ROUTE,
  WECHAT_INBOUND_AGGREGATE_JOB,
  WECHAT_INBOUND_FLUSH_JOB,
  WECHAT_INBOUND_QUEUE_NAME,
  WECHAT_MIDDLEWARE_NAME,
  WECHAT_OUTBOUND_QUEUE_NAME,
  WECHAT_OUTBOUND_SEND_TEXT_JOB,
  WECHAT_PLUGIN_RUNTIME_METADATA,
  WECHAT_PROVIDER_KEY,
  WECHAT_REMOTE_ENTRY_KEY,
  WECHAT_TEMPLATE_PROVIDER_KEY,
  WECHAT_TUNNEL_NAMESPACE_PREFIX,
  WECHAT_VIEW_KEY,
  WECHAT_VIEW_PROVIDER_KEY,
  wechatTable
} from './lib/constants.js'
import {
  WechatAccountEntity,
  WechatMessageFileEntity,
  WechatMessageLogEntity,
  WechatTriggerBindingEntity
} from './lib/entities/index.js'
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

  it('derives persisted and process-global identifiers from the namespace without renaming them', () => {
    expect([
      WechatAccountEntity.tableName,
      WechatMessageFileEntity.tableName,
      WechatMessageLogEntity.tableName,
      WechatTriggerBindingEntity.tableName
    ]).toEqual([
      'plugin_wechat_account',
      'plugin_wechat_message_file',
      'plugin_wechat_message_log',
      'plugin_wechat_trigger_binding'
    ])
    expect(wechatTable('account')).toBe('plugin_wechat_account')
    expect({
      provider: WECHAT_PROVIDER_KEY,
      viewProvider: WECHAT_VIEW_PROVIDER_KEY,
      view: WECHAT_VIEW_KEY,
      remoteEntry: WECHAT_REMOTE_ENTRY_KEY,
      templateProvider: WECHAT_TEMPLATE_PROVIDER_KEY,
      middleware: WECHAT_MIDDLEWARE_NAME,
      outboundQueue: WECHAT_OUTBOUND_QUEUE_NAME,
      outboundJob: WECHAT_OUTBOUND_SEND_TEXT_JOB,
      inboundQueue: WECHAT_INBOUND_QUEUE_NAME,
      inboundAggregateJob: WECHAT_INBOUND_AGGREGATE_JOB,
      inboundFlushJob: WECHAT_INBOUND_FLUSH_JOB,
      controllerRoute: WECHAT_CONTROLLER_ROUTE,
      tunnelNamespacePrefix: WECHAT_TUNNEL_NAMESPACE_PREFIX
    }).toEqual({
      provider: 'wechat',
      viewProvider: 'wechat_workbench_provider',
      view: 'wechat_workbench',
      remoteEntry: 'wechat-workbench',
      templateProvider: 'wechatTemplates',
      middleware: 'WechatRuntimeMiddleware',
      outboundQueue: 'plugin_wechat_outbound',
      outboundJob: 'plugin_wechat_send_text',
      inboundQueue: 'plugin_wechat_inbound',
      inboundAggregateJob: 'plugin_wechat_inbound_aggregate',
      inboundFlushJob: 'plugin_wechat_inbound_flush',
      controllerRoute: 'wechat',
      tunnelNamespacePrefix: '/api/wechat/tunnel/ws/'
    })
  })

  it('exposes translated config form labels', () => {
    const formSchema = WechatPluginConfigFormSchema as any

    expect(formSchema.properties.tunnelWsPath.title.zh_Hans).toBe('隧道 WebSocket 路径')
    expect(formSchema.properties.tunnelHeartbeatIntervalMs.title.en_US).toBe('Tunnel Heartbeat Interval (ms)')
    expect(formSchema.properties.tunnelClientTimeoutMs.title.zh_Hans).toBe('隧道客户端超时（毫秒）')
  })
})
