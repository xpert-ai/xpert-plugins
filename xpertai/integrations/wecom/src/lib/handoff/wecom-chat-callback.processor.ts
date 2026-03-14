import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  HandoffMessage,
  HandoffProcessorStrategy,
  IHandoffProcessor,
  type PluginContext,
  ProcessContext,
  ProcessResult
} from '@xpert-ai/plugin-sdk'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { messageContentText } from '@metad/contracts'
import { ChatWeComMessage } from '../message.js'
import { WeComConversationService } from '../conversation.service.js'
import { WeComChannelStrategy } from '../wecom-channel.strategy.js'
import { WECOM_PLUGIN_CONTEXT } from '../tokens.js'
import { WeComChatCallbackContext, WeComChatStreamCallbackPayload, WECOM_CHAT_STREAM_CALLBACK_MESSAGE_TYPE } from './wecom-chat.types.js'
import { WeComChatRunState, WeComChatRunStateService } from './wecom-chat-run-state.service.js'

@Injectable()
@HandoffProcessorStrategy(WECOM_CHAT_STREAM_CALLBACK_MESSAGE_TYPE, {
  types: [WECOM_CHAT_STREAM_CALLBACK_MESSAGE_TYPE],
  policy: {
    lane: 'main'
  }
})
export class WeComChatStreamCallbackProcessor implements IHandoffProcessor<WeComChatStreamCallbackPayload> {
  private readonly logger = new Logger(WeComChatStreamCallbackProcessor.name)
  private readonly sourceLocks = new Map<string, Promise<unknown>>()

  constructor(
    private readonly wecomChannel: WeComChannelStrategy,
    private readonly conversationService: WeComConversationService,
    private readonly runStateService: WeComChatRunStateService,
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  async process(
    message: HandoffMessage<WeComChatStreamCallbackPayload>,
    _ctx: ProcessContext
  ): Promise<ProcessResult> {
    const payload = message.payload
    if (!payload?.sourceMessageId) {
      return {
        status: 'dead',
        reason: 'Missing sourceMessageId in WeCom callback payload'
      }
    }
    if (!payload?.sequence || payload.sequence <= 0) {
      return {
        status: 'dead',
        reason: 'Missing sequence in WeCom callback payload'
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
      state = this.ensureRunStateDefaults(state)

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

  private async runWithSourceLock(
    sourceMessageId: string,
    task: () => Promise<ProcessResult>
  ): Promise<ProcessResult> {
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

  private ensureRunStateDefaults(state: WeComChatRunState): WeComChatRunState {
    if (!state.pendingEvents) {
      state.pendingEvents = {}
    }
    if (!state.nextSequence || state.nextSequence <= 0) {
      state.nextSequence = 1
    }
    if (typeof state.responseMessageContent !== 'string') {
      state.responseMessageContent = ''
    }
    return state
  }

  private createRunState(
    sourceMessageId: string,
    context: WeComChatCallbackContext
  ): WeComChatRunState {
    return {
      sourceMessageId,
      nextSequence: 1,
      responseMessageContent: '',
      context,
      pendingEvents: {}
    }
  }

  private async processPendingEvents(state: WeComChatRunState): Promise<boolean> {
    while (state.pendingEvents[String(state.nextSequence)]) {
      const payload = state.pendingEvents[String(state.nextSequence)]
      delete state.pendingEvents[String(state.nextSequence)]

      switch (payload.kind) {
        case 'stream': {
          await this.applyStreamEvent(state, payload.event)
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
            `Unprocessed WeCom callback kind "${(payload as { kind?: unknown }).kind}" in source message "${state.sourceMessageId}"`
          )
        }
      }

      state.nextSequence += 1
    }

    return false
  }

  private async applyStreamEvent(state: WeComChatRunState, event: unknown): Promise<void> {
    const eventPayload = (event as { data?: any } | undefined)?.data
    if (!eventPayload) {
      return
    }

    if (eventPayload.type === ChatMessageTypeEnum.MESSAGE) {
      const textDelta = this.normalizeStreamText(messageContentText(eventPayload.data))
      if (textDelta) {
        state.responseMessageContent += textDelta
      }
      return
    }

    if (eventPayload.type !== ChatMessageTypeEnum.EVENT) {
      return
    }

    if (eventPayload.event === ChatMessageEventTypeEnum.ON_CONVERSATION_START) {
      const conversationId = this.extractConversationId(eventPayload.data)
      if (conversationId && state.context.conversationUserKey && state.context.xpertId) {
        await this.conversationService.setConversation(
          state.context.conversationUserKey,
          state.context.xpertId,
          conversationId
        )
        state.context.conversationId = conversationId
      }
    }
  }

  private async completeRun(state: WeComChatRunState): Promise<void> {
    const message = this.createWeComMessage(state.context)
    const streamText = this.normalizeStreamText(state.responseMessageContent)
    const finalText = streamText || `[企业微信回复]\n${state.context?.conversationId ? `会话ID: ${state.context.conversationId}` : '已处理完成。'}`

    await message.reply(finalText)
    await message.done()
  }

  private async failRun(state: WeComChatRunState, error: unknown): Promise<void> {
    const message = this.createWeComMessage(state.context)
    await message.fail(error)
  }

  private createWeComMessage(context: WeComChatCallbackContext): ChatWeComMessage {
    return new ChatWeComMessage(
      {
        integrationId: context.integrationId,
        chatId: context.chatId,
        senderId: context.senderId,
        responseUrl: context.responseUrl,
        wecomChannel: this.wecomChannel
      },
      {
        id: context?.message?.id,
        messageId: context?.message?.messageId,
        status: (context?.message?.status as ChatWeComMessage['status']) || 'thinking',
        language: context?.message?.language || context.preferLanguage
      }
    )
  }

  private normalizeStreamText(value: unknown): string {
    if (typeof value !== 'string') {
      return ''
    }
    return value.replace(/\r/g, '').trim()
  }

  private extractConversationId(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') {
      return undefined
    }
    const record = data as Record<string, unknown>
    const value = record.conversationId || record.id
    if (typeof value !== 'string') {
      return undefined
    }
    const text = value.trim()
    return text || undefined
  }
}
