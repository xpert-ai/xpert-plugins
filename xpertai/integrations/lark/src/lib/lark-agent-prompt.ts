import type { LarkGroupWindow } from './types.js'

const GROUP_CONTEXT_LABEL = '[群聊上下文]'
const GROUP_WINDOW_LABEL = '[群聊短窗上下文]'
const CURRENT_SPEAKER_PREFIX = '当前发言人：'
const USER_MESSAGE_PREFIX = '用户消息：'
const GROUP_WINDOW_INSTRUCTION =
  '请将以下短时间内连续 @ 机器人的消息视为同一轮对话，综合理解后统一回复。'
const SAFE_SPEAKER_FALLBACK = '当前发言成员'
const SAFE_PARTICIPANT_FALLBACK = '群成员'

function normalizeText(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeSpeakerName(senderName: string | undefined | null, fallback = SAFE_SPEAKER_FALLBACK): string {
  const normalized = normalizeText(senderName)
  if (!normalized) {
    return fallback
  }

  if (normalized.startsWith('ou_')) {
    return fallback
  }

  return normalized
}

function formatDisplayTime(createTime?: string): string | null {
  if (!createTime) {
    return null
  }

  const numeric = Number(createTime)
  const timestamp = Number.isFinite(numeric)
    ? (createTime.length >= 13 ? numeric : numeric * 1000)
    : Date.parse(createTime)
  if (!Number.isFinite(timestamp)) {
    return null
  }

  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
    date.getSeconds()
  ).padStart(2, '0')}`
}

export function buildLarkSpeakerContextInput(
  input: string | undefined,
  senderName: string | null,
  chatType?: string | null
): string | undefined {
  if (chatType !== 'group') {
    return input
  }

  const normalizedInput = normalizeText(input)
  if (!normalizedInput) {
    return input
  }

  const displaySpeakerName = normalizeSpeakerName(senderName, SAFE_SPEAKER_FALLBACK)

  return [GROUP_CONTEXT_LABEL, `${CURRENT_SPEAKER_PREFIX}${displaySpeakerName}`, `${USER_MESSAGE_PREFIX}${normalizedInput}`].join(
    '\n'
  )
}

export function buildLarkGroupWindowPrompt(groupWindow: LarkGroupWindow): string {
  if (groupWindow.items.length === 1) {
    const first = groupWindow.items[0]
    return (
      buildLarkSpeakerContextInput(first?.text, first?.senderName ?? null, 'group') ??
      first?.text ??
      ''
    )
  }

  const lines = groupWindow.items.map((item, index) => {
    const senderName = normalizeSpeakerName(item.senderName, `${SAFE_PARTICIPANT_FALLBACK}${index + 1}`)
    const displayTime = formatDisplayTime(item.createTime)
    const suffix = displayTime ? ` [${displayTime}]` : ''
    return `- ${senderName}${suffix}: ${item.text}`
  })

  return [GROUP_WINDOW_LABEL, GROUP_WINDOW_INSTRUCTION, '', ...lines].join('\n')
}
