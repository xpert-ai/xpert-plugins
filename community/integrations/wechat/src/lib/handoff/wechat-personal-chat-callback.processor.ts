import { Injectable, Logger } from '@nestjs/common'
import {
  HandoffMessage,
  HandoffProcessorStrategy,
  IHandoffProcessor,
  ProcessContext,
  ProcessResult
} from '@xpert-ai/plugin-sdk'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { WechatPersonalChannelStrategy } from '../wechat-personal-channel.strategy.js'
import { WechatPersonalConversationService } from '../conversation.service.js'
import {
  WECHAT_PERSONAL_CHAT_CALLBACK_MESSAGE_TYPE,
  WechatPersonalChatCallbackContext,
  WechatPersonalChatCallbackPayload
} from './wechat-personal-chat.types.js'
import { WechatPersonalChatRunState, WechatPersonalChatRunStateService } from './wechat-personal-chat-run-state.service.js'

type MessageTextContent = {
  type?: unknown
  text?: unknown
  id?: unknown
}

function getTextStreamId(content: unknown): string | undefined {
  if (!content || typeof content !== 'object') {
    return undefined
  }
  const id = (content as MessageTextContent).id
  return typeof id === 'string' && id ? id : undefined
}

function appendPlainText(accumulator: string, incoming: string, joinWithoutSeparator: boolean): string {
  if (!accumulator) {
    return incoming
  }
  if (!incoming || /^\s/.test(incoming) || joinWithoutSeparator) {
    return `${accumulator}${incoming}`
  }
  if (!/[\s\n]$/.test(accumulator)) {
    return `${accumulator}\n${incoming}`
  }
  return `${accumulator}${incoming}`
}

function filterTextItem(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (content && typeof content === 'object' && (content as MessageTextContent).type === 'text') {
    const text = (content as MessageTextContent).text
    return typeof text === 'string' ? text : ''
  }
  return ''
}

function filterText(content: unknown): string | null {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    let result = ''
    let previousStreamId: string | undefined
    for (const item of content) {
      const nextText = filterTextItem(item)
      if (!nextText) {
        continue
      }
      const streamId = getTextStreamId(item)
      result = appendPlainText(result, nextText, !!previousStreamId && previousStreamId === streamId)
      previousStreamId = streamId
    }
    return result || null
  }

  return filterTextItem(content) || null
}

@Injectable()
@HandoffProcessorStrategy(WECHAT_PERSONAL_CHAT_CALLBACK_MESSAGE_TYPE, {
  types: [WECHAT_PERSONAL_CHAT_CALLBACK_MESSAGE_TYPE],
  policy: {
    lane: 'main'
  }
})
export class WechatPersonalChatCallbackProcessor implements IHandoffProcessor<WechatPersonalChatCallbackPayload> {
  private readonly logger = new Logger(WechatPersonalChatCallbackProcessor.name)
  private readonly sourceLocks = new Map<string, Promise<unknown>>()

  constructor(
    private readonly wechatChannel: WechatPersonalChannelStrategy,
    private readonly conversationService: WechatPersonalConversationService,
    private readonly runStateService: WechatPersonalChatRunStateService
  ) {}

  async process(
    message: HandoffMessage<WechatPersonalChatCallbackPayload>,
    _ctx: ProcessContext
  ): Promise<ProcessResult> {
    const payload = message.payload
    if (!payload?.sourceMessageId) {
      return {
        status: 'dead',
        reason: 'Missing sourceMessageId in WeChat personal callback payload'
      }
    }
    if (!payload?.sequence || payload.sequence <= 0) {
      return {
        status: 'dead',
        reason: 'Missing sequence in WeChat personal callback payload'
      }
    }

    return this.runWithSourceLock(payload.sourceMessageId, async () => {
      let state = await this.runStateService.get(payload.sourceMessageId)
      if (!state) {
        if (!payload.context) {
          return {
            status: 'dead',
            reason: `Run state not found for source message "${payload.sourceMessageId}"`
          }
        }
        state = this.createRunState(payload.sourceMessageId, payload.context)
      }
      state = this.ensureDefaults(state)
      state.firstCallbackAt ||= Date.now()

      if (payload.sequence < state.nextSequence) {
        return { status: 'ok' }
      }

      if (!state.pendingEvents[String(payload.sequence)]) {
        state.pendingEvents[String(payload.sequence)] = payload
      }

      const completed = await this.processPendingEvents(state)
      if (completed) {
        await this.runStateService.clear(state.sourceMessageId)
      } else {
        await this.runStateService.save(state)
      }

      return { status: 'ok' }
    })
  }

  private async runWithSourceLock(sourceMessageId: string, task: () => Promise<ProcessResult>): Promise<ProcessResult> {
    const previous = this.sourceLocks.get(sourceMessageId) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(task)
    this.sourceLocks.set(sourceMessageId, current)

    try {
      return await current
    } finally {
      if (this.sourceLocks.get(sourceMessageId) === current) {
        this.sourceLocks.delete(sourceMessageId)
      }
    }
  }

  private ensureDefaults(state: WechatPersonalChatRunState): WechatPersonalChatRunState {
    if (!state.pendingEvents) {
      state.pendingEvents = {}
    }
    if (!state.nextSequence || state.nextSequence <= 0) {
      state.nextSequence = 1
    }
    if (typeof state.responseMessageContent !== 'string') {
      state.responseMessageContent = ''
    }
    if (!state.runCreatedAt || state.runCreatedAt <= 0) {
      state.runCreatedAt = Date.now()
    }
    return state
  }

  private createRunState(
    sourceMessageId: string,
    context: WechatPersonalChatCallbackContext
  ): WechatPersonalChatRunState {
    return {
      sourceMessageId,
      nextSequence: 1,
      responseMessageContent: '',
      finalMessageContent: undefined,
      terminalError: undefined,
      runCreatedAt: Date.now(),
      context,
      pendingEvents: {}
    }
  }

  private async processPendingEvents(state: WechatPersonalChatRunState): Promise<boolean> {
    while (true) {
      if (!state.pendingEvents[String(state.nextSequence)]) {
        const nextAvailableSequence = this.resolveNextAvailableSequence(state)
        if (!nextAvailableSequence) {
          return false
        }
        this.logger.warn(
          `[wechat-personal-callback] missing callback sequence source=${state.sourceMessageId} expected=${state.nextSequence} next=${nextAvailableSequence}; continuing with available event`
        )
        state.nextSequence = nextAvailableSequence
      }

      const payload = state.pendingEvents[String(state.nextSequence)]
      delete state.pendingEvents[String(state.nextSequence)]

      switch (payload.kind) {
        case 'stream': {
          this.applyStreamEvent(state, payload.event)
          break
        }
        case 'complete': {
          await this.completeRun(state)
          return true
        }
        case 'error': {
          await this.failRun(state, payload.error)
          return true
        }
        default: {
          this.logger.warn(
            `Unprocessed WeChat personal callback kind "${(payload as { kind?: unknown }).kind}" in source "${
              state.sourceMessageId
            }"`
          )
        }
      }

      state.nextSequence += 1
    }
  }

  private applyStreamEvent(state: WechatPersonalChatRunState, event: unknown): void {
    const eventPayload = (event as { data?: any } | undefined)?.data
    if (!eventPayload) {
      return
    }

    if (eventPayload.type === ChatMessageTypeEnum.MESSAGE) {
      const text = filterText(eventPayload.data) ?? ''
      if (text) {
        state.responseMessageContent += text
      }
      return
    }

    if (eventPayload.type !== ChatMessageTypeEnum.EVENT) {
      return
    }

    const conversationId = this.resolveConversationId(eventPayload)
    if (conversationId) {
      state.context.conversationId = conversationId
    }

    if (eventPayload.event === ChatMessageEventTypeEnum.ON_MESSAGE_END) {
      const finalText = this.extractFinalMessageText(eventPayload)
      if (finalText) {
        state.finalMessageContent = finalText
      }
    }
  }

  private async completeRun(state: WechatPersonalChatRunState): Promise<void> {
    const context = state.context
    const finalText = this.normalizeFinalText(state.finalMessageContent || state.responseMessageContent)
    if (context.conversationUserKey && context.xpertId && context.conversationId) {
      await this.conversationService.setConversation(
        context.conversationUserKey,
        context.xpertId,
        context.conversationId,
        undefined,
        context
      )
    }

    if (!finalText) {
      this.logger.debug(
        `[wechat-personal-callback] skip empty final text integration=${context.integrationId} contact=${context.contactId}`
      )
      return
    }

    const result = await this.wechatChannel.sendTextByIntegrationId(context.integrationId, {
      uuid: context.uuid,
      contactId: context.contactId,
      content: finalText
    })
    await this.conversationService.logOutbound({
      context,
      content: finalText,
      status: result.success ? 'sent' : 'failed',
      messageId: result.messageId,
      error: result.error
    })

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeChat personal reply')
    }
  }

  private async failRun(state: WechatPersonalChatRunState, error: unknown): Promise<void> {
    const context = state.context
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Agent execution failed'
    await this.conversationService.logOutbound({
      context,
      content: '',
      status: 'failed',
      error: message
    })
    const fallback = this.resolveFallbackText(context.preferLanguage, message)
    await this.wechatChannel.sendTextByIntegrationId(context.integrationId, {
      uuid: context.uuid,
      contactId: context.contactId,
      content: fallback
    })
  }

  private resolveConversationId(eventPayload: any): string | undefined {
    const candidates = [
      eventPayload?.conversationId,
      eventPayload?.conversation_id,
      eventPayload?.data?.conversationId,
      eventPayload?.data?.conversation_id,
      eventPayload?.data?.id
    ]
    return candidates.find((value) => typeof value === 'string' && value.trim())?.trim()
  }

  private resolveNextAvailableSequence(state: WechatPersonalChatRunState): number | undefined {
    const sequences = Object.keys(state.pendingEvents)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > state.nextSequence)
      .sort((a, b) => a - b)
    return sequences[0]
  }

  private extractFinalMessageText(eventPayload: any): string | null {
    const candidates = [
      eventPayload?.data?.content,
      eventPayload?.data?.message?.content,
      eventPayload?.data?.output,
      eventPayload?.data?.text
    ]
    for (const candidate of candidates) {
      const text = filterText(candidate)
      if (text) {
        return text
      }
    }
    return null
  }

  private normalizeFinalText(value: string): string {
    return (value || '').replace(/\n{3,}/g, '\n\n').trim()
  }

  private resolveFallbackText(language: unknown, message: string): string {
    if (language === 'en') {
      return `Sorry, I failed to generate a reply this time. ${message}`
    }
    return `抱歉，这次回复生成失败了。${message}`
  }
}
