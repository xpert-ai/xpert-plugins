import { LarkMentionIdentity, LarkSemanticMessage, TLarkEvent, TLarkEventMention } from './types.js'

type TLarkEventEnvelope = {
  header?: TLarkEvent['header']
  event?: TLarkEvent
}

type UnknownRecord = Record<string, unknown>

const AT_TAG_PATTERN = /<at\b[^>]*?user_id="([^"]+)"[^>]*>(.*?)<\/at>/gi

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

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

export function getLarkMessageType(message: unknown): string | null {
  if (!isRecord(message)) {
    return null
  }

  return normalizeString(message.message_type) ?? normalizeString(message.msg_type)
}

export function getLarkMessageContent(message: unknown): string | null {
  if (!isRecord(message)) {
    return null
  }

  const directContent = normalizeString(message.content)
  if (directContent) {
    return directContent
  }

  return isRecord(message.body) ? normalizeString(message.body.content) : null
}

function collectPostInlineText(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPostInlineText(item))
  }

  if (!isRecord(value)) {
    return []
  }

  const tag = normalizeString(value.tag)
  if (tag === 'text' && typeof value.text === 'string') {
    return [value.text]
  }

  if (tag === 'at') {
    const name =
      normalizeString(value.user_name) ??
      normalizeString(value.name) ??
      normalizeString(value.text) ??
      normalizeString(value.user_id) ??
      normalizeString(value.open_id)
    return name ? [`@${name}`] : []
  }

  return []
}

function extractPostContentText(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null
  }

  const lines = content
    .map((line) => collectPostInlineText(line).join('').trim())
    .filter((line) => line.length > 0)

  return lines.length ? lines.join('\n') : null
}

function extractLarkPostText(parsed: unknown): string | null {
  if (!isRecord(parsed)) {
    return null
  }

  const directText = extractPostContentText(parsed.content)
  if (directText) {
    return directText
  }

  for (const value of Object.values(parsed)) {
    if (!isRecord(value)) {
      continue
    }
    const localizedText = extractPostContentText(value.content)
    if (localizedText) {
      return localizedText
    }
  }

  return null
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
  const messageContent = getLarkMessageContent(message)
  try {
    const parsed = JSON.parse(messageContent ?? '')
    const messageType = getLarkMessageType(message)
    rawText = (messageType === 'post' ? extractLarkPostText(parsed) : null) ?? normalizeString(parsed?.text) ?? ''
  } catch {
    rawText = messageContent ?? ''
  }

  const mentions = Array.isArray(message.mentions)
    ? message.mentions
        .map((mention) => parseLarkMentionIdentity(mention))
        .filter((mention): mention is LarkMentionIdentity => Boolean(mention))
    : []

  return normalizeLarkTextWithMentions(rawText, mentions, params)
}
