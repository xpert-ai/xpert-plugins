export const WECHAT_PLUGIN_NAME = '@xpert-ai/plugin-community-wechat'
export const WECHAT_ARTIFACT_NAMESPACE = 'wechat' as const

export const wechatArtifactKey = (localKey: string, separator: '_' | '-' | '' = '_') =>
  localKey ? `${WECHAT_ARTIFACT_NAMESPACE}${separator}${localKey}` : WECHAT_ARTIFACT_NAMESPACE

export const wechatPluginArtifactKey = (localKey: string) => `plugin_${wechatArtifactKey(localKey)}`
export const wechatTable = (tableKey: string) => wechatPluginArtifactKey(tableKey)
export const wechatArtifactClassName = (localName: string) => `Wechat${localName}`

export const WECHAT_PLUGIN_RUNTIME_METADATA = {
  level: 'system',
  artifactNamespace: WECHAT_ARTIFACT_NAMESPACE
} as const

export const WECHAT_PROVIDER_KEY = WECHAT_ARTIFACT_NAMESPACE
export const WECHAT_CHANNEL_TYPE = WECHAT_ARTIFACT_NAMESPACE
export const WECHAT_TRIGGER_KEY = WECHAT_ARTIFACT_NAMESPACE
export const WECHAT_DEFAULT_TRIGGER_ACCOUNT_UUID = '*'
export const WECHAT_VIEW_PROVIDER_KEY = wechatArtifactKey('workbench_provider')
export const WECHAT_VIEW_KEY = wechatArtifactKey('workbench')
export const WECHAT_REMOTE_ENTRY_KEY = wechatArtifactKey('workbench', '-')
export const WECHAT_TEMPLATE_PROVIDER_KEY = wechatArtifactKey('Templates', '')
export const WECHAT_FEATURE = wechatArtifactKey('bridge')
export const WECHAT_RUNTIME_FEATURE = wechatArtifactKey('runtime', '-')
export const WECHAT_FILE_SEND_FEATURE = wechatArtifactKey('file-send', '-')
export const WECHAT_WORKBENCH_FEATURE = wechatArtifactKey('workbench', '-')
export const WECHAT_MIDDLEWARE_NAME = wechatArtifactClassName('RuntimeMiddleware')
export const WECHAT_GET_RUNTIME_STATUS_TOOL_NAME = wechatArtifactKey('get_runtime_status')
export const WECHAT_GET_CALLBACK_CONFIG_TOOL_NAME = wechatArtifactKey('get_callback_config')
export const WECHAT_LIST_ACCOUNTS_TOOL_NAME = wechatArtifactKey('list_accounts')
export const WECHAT_SEARCH_MESSAGE_LOGS_TOOL_NAME = wechatArtifactKey('search_message_logs')
export const WECHAT_SEARCH_CHAT_HISTORY_TOOL_NAME = wechatArtifactKey('search_chat_history')
export const WECHAT_ROTATE_WEBHOOK_CREDENTIAL_TOOL_NAME = wechatArtifactKey('rotate_webhook_credential')
export const WECHAT_REVOKE_WEBHOOK_CREDENTIAL_TOOL_NAME = wechatArtifactKey('revoke_webhook_credential')
export const WECHAT_SET_ACCOUNT_ENABLED_TOOL_NAME = wechatArtifactKey('set_account_enabled')
export const WECHAT_LIST_OUTBOUND_QUEUE_TOOL_NAME = wechatArtifactKey('list_outbound_queue')
export const WECHAT_SEND_MESSAGE_TOOL_NAME = wechatArtifactKey('send_message')
export const WECHAT_SEND_FILE_TOOL_NAME = wechatArtifactKey('send_file')
export const WECHAT_CANCEL_OUTBOUND_QUEUE_TOOL_NAME = wechatArtifactKey('cancel_outbound_queue_item')
export const WECHAT_RETRY_OUTBOUND_QUEUE_TOOL_NAME = wechatArtifactKey('retry_outbound_queue_item')
export const WECHAT_PAUSE_OUTBOUND_ACCOUNT_TOOL_NAME = wechatArtifactKey('pause_outbound_account')
export const WECHAT_RESUME_OUTBOUND_ACCOUNT_TOOL_NAME = wechatArtifactKey('resume_outbound_account')
export const WECHAT_OUTBOUND_QUEUE_PREFIX = wechatPluginArtifactKey('')
export const WECHAT_OUTBOUND_QUEUE_NAME = wechatPluginArtifactKey('outbound')
export const WECHAT_OUTBOUND_QUEUE_REDIS_NAMESPACE = `${WECHAT_OUTBOUND_QUEUE_PREFIX}:${WECHAT_OUTBOUND_QUEUE_NAME}`
export const WECHAT_OUTBOUND_SEND_TEXT_JOB = wechatPluginArtifactKey('send_text')
export const WECHAT_INBOUND_QUEUE_PREFIX = wechatPluginArtifactKey('')
export const WECHAT_INBOUND_QUEUE_NAME = wechatPluginArtifactKey('inbound')
export const WECHAT_INBOUND_QUEUE_REDIS_NAMESPACE = `${WECHAT_INBOUND_QUEUE_PREFIX}:${WECHAT_INBOUND_QUEUE_NAME}`
export const WECHAT_INBOUND_AGGREGATE_JOB = wechatPluginArtifactKey('inbound_aggregate')
export const WECHAT_INBOUND_FLUSH_JOB = wechatPluginArtifactKey('inbound_flush')
export const WECHAT_CONTROLLER_ROUTE = WECHAT_ARTIFACT_NAMESPACE
export const WECHAT_TUNNEL_NAMESPACE_PREFIX = `/api/${WECHAT_ARTIFACT_NAMESPACE}/tunnel/ws/`
export const WECHAT_TUNNEL_NAMESPACE = new RegExp(`^${WECHAT_TUNNEL_NAMESPACE_PREFIX}[^/]+$`)
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const WECHAT_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 7.5C4.57 7.5 3 8.87 3 10.56c0 1 .55 1.89 1.41 2.45l-.37 1.43 1.6-.78c.28.05.57.08.86.08 1.93 0 3.5-1.37 3.5-3.06S8.43 7.5 6.5 7.5Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/><path d="M13.4 5c4.2 0 7.6 2.82 7.6 6.3 0 1.94-1.06 3.68-2.72 4.83l.62 2.37-2.6-1.3c-.9.26-1.88.4-2.9.4-4.2 0-7.6-2.82-7.6-6.3S9.2 5 13.4 5Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/><path d="M11 10.4h.01M15.8 10.4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
