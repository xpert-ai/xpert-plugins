import { LarkMentionIdentity, LarkSemanticMessage, TLarkEvent, TLarkEventMention } from './types.js'

type TLarkEventEnvelope = {
  header?: TLarkEvent['header']
  event?: TLarkEvent
}

const AT_TAG_PATTERN = /<at\b[^>]*?user_id="([^"]+)"[^>]*>(.*?)<\/at>/gi

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function unwrapLarkEventPayload(event: unknown): TLarkEvent | null {
  if (!event || typeof event !== 'object') {
    return null
  }
  const record = event as TLarkEventEnvelope & TLarkEvent
  if (record.event && typeof record.event === 'object') {
    return record.event as TLarkEvent
  }
  return record as TLarkEvent
}

export function parseLarkMentionIdentity(rawMention: unknown): LarkMentionIdentity | null {
  if (!rawMention || typeof rawMention !== 'object') {
    return null
  }

  const mention = rawMention as TLarkEventMention
  const key = normalizeString(mention.key)
  const legacyId = typeof mention.id === 'object' && mention.id ? mention.id.open_id : null
  const id = normalizeString(typeof mention.id === 'string' ? mention.id : legacyId)
  const idTypeRaw = normalizeString(mention.id_type)
  const idType = idTypeRaw === 'open_id' || idTypeRaw === 'user_id' || idTypeRaw === 'union_id'
    ? idTypeRaw
    : id
      ? 'open_id'
      : 'unknown'
  const name = normalizeString(mention.name)

  if (!key && !id && !name) {
    return null
  }

  return {
    key: key ?? '',
    id,
    idType,
    name,
    rawToken: name ? `@${name}` : key ?? ''
  }
}

function replaceMentionTokens(rawText: string, mentions: LarkMentionIdentity[]) {
  let workingText = rawText
  const updatedMentions = mentions.map((mention) => ({ ...mention }))
  const seen = new Set<number>()

  workingText = workingText.replace(AT_TAG_PATTERN, (_match, userId: string, innerText: string) => {
    const normalizedUserId = normalizeString(userId)
    const normalizedInnerText = normalizeString(innerText)
    const mentionIndex = updatedMentions.findIndex((item, index) => {
      if (seen.has(index)) {
        return false
      }
      if (normalizedUserId && item.id === normalizedUserId) {
        return true
      }
      return Boolean(normalizedInnerText && item.name === normalizedInnerText)
    })

    if (mentionIndex >= 0) {
      seen.add(mentionIndex)
      const mention = updatedMentions[mentionIndex]
      const displayName = mention.name || normalizedInnerText || normalizedUserId || 'unknown'
      mention.rawToken = _match
      return `@${displayName}`
    }

    const displayName = normalizedInnerText || normalizedUserId || 'unknown'
    return `@${displayName}`
  })

  for (const mention of updatedMentions) {
    if (!mention.key) {
      continue
    }
    const displayName = mention.name || mention.id || mention.key
    const keyPattern = new RegExp(escapeRegExp(mention.key), 'g')
    if (keyPattern.test(workingText)) {
      workingText = workingText.replace(keyPattern, `@${displayName}`)
    }
  }

  return {
    displayText: workingText,
    mentions: updatedMentions
  }
}

export function normalizeLarkTextWithMentions(
  rawText: string,
  mentions: LarkMentionIdentity[],
  params?: { botOpenId?: string | null; stripLeadingBotMention?: boolean }
): LarkSemanticMessage {
  const normalizedRawText = rawText || ''
  const parsedMentions = Array.isArray(mentions) ? mentions.filter(Boolean) : []
  const botOpenId = normalizeString(params?.botOpenId)
  const mentionsWithBot = parsedMentions.map((mention) => ({
    ...mention,
    isBot: Boolean(botOpenId && mention.idType === 'open_id' && mention.id === botOpenId)
  }))
  const { displayText, mentions: normalizedMentions } = replaceMentionTokens(normalizedRawText, mentionsWithBot)

  let agentText = displayText
  if (params?.stripLeadingBotMention) {
    const leadingBotMention = normalizedMentions.find((mention) => mention.isBot && mention.name)
    if (leadingBotMention?.name) {
      const leadingPattern = new RegExp(`^\\s*@${escapeRegExp(leadingBotMention.name)}[\\s\\u3000]*`)
      agentText = agentText.replace(leadingPattern, '')
    }
  }

  return {
    rawText: normalizedRawText,
    displayText,
    agentText: agentText.trim() || displayText.trim() || normalizedRawText.trim(),
    mentions: normalizedMentions
  }
}

export function extractLarkSemanticMessage(
  event: unknown,
  params?: { botOpenId?: string | null; stripLeadingBotMention?: boolean }
): LarkSemanticMessage | null {
  const payload = unwrapLarkEventPayload(event)
  const message = payload?.message
  if (!message) {
    return null
  }

  let rawText = ''
  try {
    const parsed = JSON.parse(message.content)
    rawText = normalizeString(parsed?.text) ?? ''
  } catch {
    rawText = normalizeString(message.content) ?? ''
  }

  const mentions = Array.isArray(message.mentions)
    ? message.mentions
        .map((mention) => parseLarkMentionIdentity(mention))
        .filter((mention): mention is LarkMentionIdentity => Boolean(mention))
    : []

  return normalizeLarkTextWithMentions(rawText, mentions, params)
}
