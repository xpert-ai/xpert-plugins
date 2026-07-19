export type LarkTrustedRuntimeContext = {
  integrationId?: string
  scopeKey?: string
  xpertId?: string
  tenantId?: string
  organizationId?: string
  chatId?: string
  chatType?: string
  senderOpenId?: string
  senderName?: string
  sourceMessageLogIds: string[]
}

/**
 * Reads only trigger-owned runtime namespaces. Generic state fields named
 * integrationId/chatId are deliberately ignored so model/workflow state cannot
 * redirect Lark tools to another integration or chat.
 */
export function resolveLarkTrustedRuntimeContext(config: unknown): LarkTrustedRuntimeContext {
  const root = asRecord(config)
  const configurable = asRecord(root?.configurable)
  const runtimePrincipal = asRecord(configurable?.runtimePrincipal)
  const configurableContext = asRecord(configurable?.context)
  const metadataContext = asRecord(asRecord(root?.metadata)?.context)
  const records = [runtimePrincipal, configurableContext, metadataContext]

  return {
    integrationId: readString(records, ['sourceIntegrationId']),
    scopeKey: readString([configurableContext, metadataContext], ['scopeKey']),
    xpertId: readString([configurableContext, metadataContext], ['xpertId']),
    tenantId: readString(records, ['tenantId']),
    organizationId: readString(records, ['organizationId']),
    chatId: readString([configurableContext, metadataContext], ['chatId', 'openChatId', 'open_chat_id']),
    chatType: readString([configurableContext, metadataContext], ['chatType', 'chat_type']),
    senderOpenId: readString(
      [configurableContext, metadataContext],
      ['senderOpenId', 'channelUserId', 'sender_open_id']
    ),
    senderName: readString([configurableContext, metadataContext], ['senderName']),
    sourceMessageLogIds: readStringList(
      [configurableContext, metadataContext],
      ['sourceMessageLogIds', 'currentInboundLogIds']
    )
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readString(records: Array<Record<string, unknown> | undefined>, keys: string[]): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = normalizeString(record?.[key])
      if (value) {
        return value
      }
    }
  }
  return undefined
}

function readStringList(records: Array<Record<string, unknown> | undefined>, keys: string[]): string[] {
  const values: string[] = []
  for (const record of records) {
    for (const key of keys) {
      const candidate = record?.[key]
      if (Array.isArray(candidate)) {
        values.push(...candidate.map(normalizeString).filter((value): value is string => Boolean(value)))
      }
    }
  }
  return Array.from(new Set(values))
}
