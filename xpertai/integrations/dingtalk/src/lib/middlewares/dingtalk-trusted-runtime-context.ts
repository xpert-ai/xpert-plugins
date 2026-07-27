import type { DingTalkRecipient } from '../types.js'

export type DingTalkTrustedRuntimeContext = {
  integrationId?: string
  chatId?: string
  chatType?: string
  senderRecipient?: DingTalkRecipient
  robotCode?: string
  sessionWebhook?: string
}

/**
 * Read only trigger-owned runtime namespaces. Generic graph state is
 * deliberately ignored so a tool call cannot redirect a file to another
 * DingTalk integration or recipient.
 */
export function resolveDingTalkTrustedRuntimeContext(config: unknown): DingTalkTrustedRuntimeContext {
  const root = asRecord(config)
  const configurable = asRecord(root?.configurable)
  const runtimePrincipal = asRecord(configurable?.runtimePrincipal)
  const configurableContext = asRecord(configurable?.context)
  const metadataContext = asRecord(asRecord(root?.metadata)?.context)
  const records = [runtimePrincipal, configurableContext, metadataContext]

  return {
    integrationId: readString(records, ['sourceIntegrationId']),
    chatId: readString([configurableContext, metadataContext], ['chatId']),
    chatType: readString([configurableContext, metadataContext], ['chatType']),
    senderRecipient: readRecipient([configurableContext, metadataContext]),
    robotCode: readString([configurableContext, metadataContext], ['robotCode']),
    sessionWebhook: readString([configurableContext, metadataContext], ['sessionWebhook'])
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

function readRecipient(records: Array<Record<string, unknown> | undefined>): DingTalkRecipient | undefined {
  for (const record of records) {
    const recipient = asRecord(record?.senderRecipient)
    const type = normalizeString(recipient?.type)
    const id = normalizeString(recipient?.id)
    if ((type === 'user_id' || type === 'open_id') && id) {
      return { type, id }
    }
  }
  return undefined
}
