import type { PrivateDecisionFeedbackStatus } from '@xpert-ai/contracts'
import type { PrivateDecisionCard, PrivateDecisionReply } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { card, decisionButton, msg } from './lark-event-ingress.js'

export function decisionReply(isCard: boolean, snapshot: unknown): PrivateDecisionReply | null {
  if (isCard) {
    const event = card.parse(snapshot)
    const value = decisionButton.safeParse(event.action.value)
    if (!value.success || event.action.tag !== 'button') return null
    return {
      parentId: event.context.open_message_id,
      chatId: event.context.open_chat_id,
      openId: event.operator.open_id,
      unionId: event.operator.union_id ?? undefined,
      input: { type: 'button', interactionId: value.data.interactionId, choice: value.data.choice }
    }
  }
  const { message, sender } = msg.parse(snapshot)
  if (
    !message.parent_id ||
    message.chat_type !== 'p2p' ||
    message.message_type !== 'text' ||
    sender.sender_type !== 'user'
  )
    return null
  let content: unknown
  try {
    content = JSON.parse(message.content)
  } catch {
    return null
  }
  const parsed = z.object({ text: z.string().trim().min(1).max(100) }).safeParse(content)
  if (!parsed.success) return null
  return {
    parentId: message.parent_id,
    chatId: message.chat_id,
    openId: sender.sender_id.open_id,
    unionId: sender.sender_id.union_id ?? undefined,
    input: { type: 'quoted_text', text: parsed.data.text }
  }
}

export function privateDecisionContent(card: PrivateDecisionCard, attemptId: string) {
  const plain = (content: string) => ({ tag: 'plain_text', content })
  return {
    header: { title: plain(card.title) },
    elements: [
      ...card.fields.map((f) => ({ tag: 'div', text: plain(f.label.zh_Hans + ' · ' + f.value) })),
      ...(card.decision.choices.some((c) => c.replyCommand)
        ? [
            {
              tag: 'div',
              text: plain(
                '请选择，或直接引用本卡回复：' +
                  card.decision.choices.flatMap((c) => (c.replyCommand ? [c.replyCommand] : [])).join(' / ')
              )
            }
          ]
        : []),
      {
        tag: 'action',
        actions: card.decision.choices.map((c) => ({
          tag: 'button',
          text: plain(c.label.zh_Hans),
          value: { action: 'human_decision', interactionId: attemptId, choice: c.key }
        }))
      }
    ]
  }
}

export function privateDecisionFeedback(status: PrivateDecisionFeedbackStatus, label: string, clientBaseUrl?: string) {
  const recorded = '已记录 · ' + label
  const messages: Record<PrivateDecisionFeedbackStatus, string> = {
    recorded,
    already_recorded: recorded,
    stale: '事项已更新，请在工作台重新确认。',
    closed: '此请求已关闭。'
  }
  const elements: object[] = [{ tag: 'div', text: { tag: 'plain_text', content: messages[status] } }]
  // Link to the signed-in workspace. The card carries no grant, case identifier or login token.
  if (clientBaseUrl && URL.canParse(clientBaseUrl)) {
    const url = new URL(clientBaseUrl)
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      elements.push({
        tag: 'action',
        actions: [{ tag: 'button', text: { tag: 'plain_text', content: '打开工作台' }, url: new URL('/chat', url).href }]
      })
  }
  return { elements }
}
