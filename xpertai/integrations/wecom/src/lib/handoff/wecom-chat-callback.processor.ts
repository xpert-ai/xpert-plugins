import { Injectable, Logger } from '@nestjs/common'
import {
  HandoffMessage,
  HandoffProcessorStrategy,
  IHandoffProcessor,
  ProcessContext,
  ProcessResult
} from '@xpert-ai/plugin-sdk'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/chatkit-types'
import { filterMessageText, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { ChatWeComMessage } from '../message.js'
import { WeComConversationService } from '../conversation.service.js'
import {
  formatWeComConversationFailedText,
  getWeComCompletedFallbackText,
  getWeComInterruptedFallbackText
} from '../wecom-conversation-text.js'
import { WeComChannelStrategy } from '../wecom-channel.strategy.js'
import {
  WeComChatCallbackContext,
  WeComChatStreamCallbackPayload,
  WECOM_CHAT_STREAM_CALLBACK_MESSAGE_TYPE
} from './wecom-chat.types.js'
import { WeComChatRunState, WeComChatRunStateService } from './wecom-chat-run-state.service.js'

const STREAM_RETRY_DELAY_MS = 200
const STREAM_UPDATE_WINDOW_MS = 2000

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
  private readonly streamRetryTimers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly wecomChannel: WeComChannelStrategy,
    private readonly conversationService: WeComConversationService,
    private readonly runStateService: WeComChatRunStateService
  ) {}

  async process(message: HandoffMessage<WeComChatStreamCallbackPayload>, _ctx: ProcessContext): Promise<ProcessResult> {
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
      state.firstCallbackAt ||= Date.now()

      this.logger.debug(
        `[wecom-callback] recv sourceMessageId=${payload.sourceMessageId} sequence=${payload.sequence} kind=${payload.kind} nextSequence=${
          state.nextSequence
        } pendingCount=${Object.keys(state.pendingEvents).length} sinceDispatchMs=${this.elapsedSinceRun(state)}`
      )

      if (payload.sequence < state.nextSequence) {
        this.logger.debug(
          `[wecom-callback] drop duplicate sourceMessageId=${payload.sourceMessageId} sequence=${payload.sequence} nextSequence=${
            state.nextSequence
          }`
        )
        return { status: 'ok' }
      }

      if (!state.pendingEvents[String(payload.sequence)]) {
        state.pendingEvents[String(payload.sequence)] = payload
      }

      const completed = await this.processPendingEvents(state)
      if (completed) {
        this.clearVisibleStreamRetry(state.sourceMessageId)
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
    if (!state.runCreatedAt || state.runCreatedAt <= 0) {
      state.runCreatedAt = Date.now()
    }
    if (typeof state.desiredVisiblePushContent !== 'string') {
      state.desiredVisiblePushContent = ''
    }
    if (typeof state.lastVisiblePushContent !== 'string') {
      state.lastVisiblePushContent = ''
    }
    return state
  }

  private createRunState(sourceMessageId: string, context: WeComChatCallbackContext): WeComChatRunState {
    return {
      sourceMessageId,
      nextSequence: 1,
      responseMessageContent: '',
      terminalError: undefined,
      runCreatedAt: Date.now(),
      desiredVisiblePushContent: '',
      lastVisiblePushContent: '',
      context,
      pendingEvents: {}
    }
  }

  private async processPendingEvents(state: WeComChatRunState): Promise<boolean> {
    this.logger.debug(
      `[wecom-callback] drain sourceMessageId=${state.sourceMessageId} nextSequence=${state.nextSequence} pendingCount=${
        Object.keys(state.pendingEvents).length
      }`
    )

    while (state.pendingEvents[String(state.nextSequence)]) {
      const payload = state.pendingEvents[String(state.nextSequence)]
      delete state.pendingEvents[String(state.nextSequence)]

      this.logger.debug(
        `[wecom-callback] apply sourceMessageId=${state.sourceMessageId} sequence=${payload.sequence} kind=${payload.kind} pendingAfterDequeue=${
          Object.keys(state.pendingEvents).length
        } sinceDispatchMs=${this.elapsedSinceRun(state)}`
      )

      switch (payload.kind) {
        case 'stream': {
          await this.applyStreamEvent(state, payload.sequence, payload.event)
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
            `Unprocessed WeCom callback kind "${(payload as { kind?: unknown }).kind}" in source message "${
              state.sourceMessageId
            }"`
          )
        }
      }

      state.nextSequence += 1
    }

    return false
  }

  private async applyStreamEvent(state: WeComChatRunState, sequence: number, event: unknown): Promise<void> {
    const eventPayload = (event as { data?: any } | undefined)?.data
    if (!eventPayload) {
      return
    }

    if (eventPayload.type === ChatMessageTypeEnum.MESSAGE) {
      const filteredText = filterMessageText(eventPayload.data) ?? ''
      const textDelta = this.normalizeStreamTextDelta(filteredText)
      if (textDelta) {
        state.firstVisibleTextAt ||= Date.now()
        state.responseMessageContent += textDelta
        state.desiredVisiblePushContent = this.normalizeLiveStreamText(state.responseMessageContent)
        this.logger.debug(
          `[wecom-callback] visible delta sourceMessageId=${state.sourceMessageId} sequence=${sequence} deltaLen=${textDelta.length} totalLen=${
            state.responseMessageContent.length
          } sinceDispatchMs=${this.elapsedSinceRun(state)}`
        )
        await this.flushLatestVisibleStreamUpdate(state, sequence, 'stream')
      } else {
        this.logger.debug(
          `[wecom-callback] filtered empty delta sourceMessageId=${state.sourceMessageId} sequence=${sequence} dataShape=${this.describeEventData(
            eventPayload.data
          )} totalLen=${state.responseMessageContent.length} sinceDispatchMs=${this.elapsedSinceRun(state)}`
        )
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
        this.logger.debug(
          `[wecom-callback] conversation start sourceMessageId=${state.sourceMessageId} sequence=${sequence} conversationId=${conversationId}`
        )
      }
      return
    }

    if (eventPayload.event === ChatMessageEventTypeEnum.ON_CONVERSATION_END) {
      const terminalStatus = this.extractTerminalStatus(eventPayload.data)
      if (!terminalStatus) {
        return
      }

      state.context.message = {
        ...(state.context.message ?? {}),
        status: terminalStatus
      }

      if (terminalStatus === XpertAgentExecutionStatusEnum.ERROR) {
        state.terminalError = this.extractTerminalError(eventPayload.data)
      } else {
        state.terminalError = undefined
      }
    }
  }

  private async completeRun(state: WeComChatRunState): Promise<void> {
    this.clearVisibleStreamRetry(state.sourceMessageId)
    const currentStatus = state.context.message?.status
    if (currentStatus === XpertAgentExecutionStatusEnum.ERROR) {
      await this.failRun(state, state.terminalError || 'Internal Error')
      return
    }
    if (currentStatus === XpertAgentExecutionStatusEnum.INTERRUPTED) {
      await this.completeInterruptedRun(state)
      return
    }

    const message = this.createWeComMessage(state.context)
    const streamText = this.normalizeFinalStreamText(state.responseMessageContent)
    const finalText = streamText || getWeComCompletedFallbackText(message.language)

    this.logger.debug(
      `[wecom-callback] complete sourceMessageId=${state.sourceMessageId} totalLen=${streamText.length} firstVisibleTextDelayMs=${
        state.firstVisibleTextAt ? state.firstVisibleTextAt - state.runCreatedAt : -1
      } firstVisiblePushDelayMs=${state.firstVisiblePushAt ? state.firstVisiblePushAt - state.runCreatedAt : -1} elapsedMs=${
        this.elapsedSinceRun(state)
      }`
    )

    if (state.context.responseStrategy === 'reply_stream' && message.streamId) {
      try {
        await message.replyStream(finalText, true)
      } catch {
        const fallbackMessage = this.createFallbackWeComMessage(state.context)
        await fallbackMessage.reply(finalText)
      }
    } else {
      await message.reply(finalText)
    }
    await message.done()
  }

  private async completeInterruptedRun(state: WeComChatRunState): Promise<void> {
    const message = this.createWeComMessage(state.context)
    const streamText = this.normalizeFinalStreamText(state.responseMessageContent)
    const finalText = streamText || getWeComInterruptedFallbackText(message.language)

    if (state.context.responseStrategy === 'reply_stream' && message.streamId) {
      try {
        await message.replyStream(finalText, true)
      } catch {
        const fallbackMessage = this.createFallbackWeComMessage(state.context)
        await fallbackMessage.reply(finalText)
      }
    } else {
      await message.reply(finalText)
    }

    message.status = XpertAgentExecutionStatusEnum.INTERRUPTED
  }

  private async failRun(state: WeComChatRunState, error: unknown): Promise<void> {
    this.clearVisibleStreamRetry(state.sourceMessageId)
    const message = this.createWeComMessage(state.context)
    const restartCardMessage = this.createFallbackWeComMessage(state.context)
    const errorMessage = this.formatErrorReply(error, message.language)

    this.logger.debug(
      `[wecom-callback] fail sourceMessageId=${state.sourceMessageId} totalLen=${state.responseMessageContent.length} elapsedMs=${
        this.elapsedSinceRun(state)
      }`
    )

    if (state.context.responseStrategy === 'reply_stream' && message.streamId) {
      try {
        await message.replyStream(errorMessage, true)
        await this.replyRestartConversationCard(restartCardMessage)
        message.status = 'error'
        return
      } catch {
        const fallbackMessage = this.createFallbackWeComMessage(state.context)
        await fallbackMessage.reply(errorMessage)
        await this.replyRestartConversationCard(restartCardMessage)
        return
      }
    }

    await message.fail(error)
  }

  private createWeComMessage(context: WeComChatCallbackContext): ChatWeComMessage {
    return new ChatWeComMessage(
      {
        integrationId: context.integrationId,
        chatId: context.chatId,
        chatType: context.chatType || context.chat_type,
        senderId: context.senderId,
        responseUrl: context.responseUrl,
        reqId: context.reqId || context.req_id,
        wecomChannel: this.wecomChannel
      },
      {
        id: context?.message?.id,
        messageId: context?.message?.messageId,
        streamId: context?.streamId || context?.message?.streamId,
        status: (context?.message?.status as ChatWeComMessage['status']) || 'thinking',
        language: context?.message?.language || context.preferLanguage
      }
    )
  }

  private createFallbackWeComMessage(context: WeComChatCallbackContext): ChatWeComMessage {
    return new ChatWeComMessage(
      {
        integrationId: context.integrationId,
        chatId: context.chatId,
        chatType: context.chatType || context.chat_type,
        senderId: context.senderId,
        wecomChannel: this.wecomChannel
      },
      {
        language: context?.message?.language || context.preferLanguage
      }
    )
  }

  private normalizeStreamTextDelta(value: unknown): string {
    if (typeof value !== 'string') {
      return ''
    }
    return value.replace(/\r/g, '')
  }

  private normalizeFinalStreamText(value: unknown): string {
    return this.normalizeStreamTextDelta(value).trim()
  }

  private async flushLatestVisibleStreamUpdate(
    state: WeComChatRunState,
    sequence: number,
    trigger: 'stream' | 'retry'
  ): Promise<void> {
    const latestVisibleText = this.normalizeLiveStreamText(
      state.desiredVisiblePushContent || state.responseMessageContent
    )
    state.desiredVisiblePushContent = latestVisibleText
    if (!latestVisibleText) {
      this.clearVisibleStreamRetry(state.sourceMessageId)
      return
    }
    if (state.context.responseStrategy !== 'reply_stream') {
      this.clearVisibleStreamRetry(state.sourceMessageId)
      return
    }

    const message = this.createWeComMessage(state.context)
    if (!message.streamId) {
      this.clearVisibleStreamRetry(state.sourceMessageId)
      return
    }
    if (state.lastVisiblePushContent === latestVisibleText) {
      this.clearVisibleStreamRetry(state.sourceMessageId)
      return
    }

    const throttleDelayMs = this.getVisibleStreamThrottleDelayMs(state)
    if (throttleDelayMs > 0) {
      this.logger.debug(
        `[wecom-callback] latest-only update throttled sourceMessageId=${state.sourceMessageId} sequence=${sequence} trigger=${trigger} desiredLen=${
          latestVisibleText.length
        } waitMs=${throttleDelayMs} sinceDispatchMs=${this.elapsedSinceRun(state)}`
      )
      this.scheduleVisibleStreamRetry(state.sourceMessageId, throttleDelayMs)
      return
    }

    try {
      const result = await message.replyStreamNonBlocking(latestVisibleText, false)
      if (result === 'skipped') {
        this.logger.debug(
          `[wecom-callback] latest-only update skipped sourceMessageId=${state.sourceMessageId} sequence=${sequence} trigger=${trigger} desiredLen=${
            latestVisibleText.length
          } deliveredLen=${state.lastVisiblePushContent?.length || 0} sinceDispatchMs=${this.elapsedSinceRun(state)}`
        )
        this.scheduleVisibleStreamRetry(state.sourceMessageId)
        return
      }

      const pushedAt = Date.now()
      state.firstVisiblePushAt ||= pushedAt
      state.lastVisiblePushAt = pushedAt
      state.lastVisiblePushContent = latestVisibleText
      this.clearVisibleStreamRetry(state.sourceMessageId)
      this.logger.debug(
        `[wecom-callback] latest-only update sent sourceMessageId=${state.sourceMessageId} sequence=${sequence} trigger=${trigger} desiredLen=${
          latestVisibleText.length
        } sinceDispatchMs=${this.elapsedSinceRun(state, pushedAt)}`
      )
    } catch (error) {
      this.scheduleVisibleStreamRetry(state.sourceMessageId)
      this.logger.warn(
        `[wecom-callback] latest-only update failed integration=${state.context.integrationId} chatId=${state.context.chatId} sequence=${sequence} trigger=${trigger} desiredLen=${
          latestVisibleText.length
        }: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private normalizeLiveStreamText(value: unknown): string {
    const text = this.normalizeStreamTextDelta(value)
    return text.trim() ? text : ''
  }

  private getVisibleStreamThrottleDelayMs(state: WeComChatRunState): number {
    if (typeof state.lastVisiblePushAt !== 'number') {
      return 0
    }

    const elapsedMs = Math.max(Date.now() - state.lastVisiblePushAt, 0)
    return Math.max(STREAM_UPDATE_WINDOW_MS - elapsedMs, 0)
  }

  private scheduleVisibleStreamRetry(sourceMessageId: string, delayMs: number = STREAM_RETRY_DELAY_MS): void {
    if (this.streamRetryTimers.has(sourceMessageId)) {
      return
    }

    const timer = setTimeout(() => {
      this.streamRetryTimers.delete(sourceMessageId)
      void this.retryVisibleStreamUpdate(sourceMessageId)
    }, Math.max(delayMs, 0))
    this.streamRetryTimers.set(sourceMessageId, timer)
  }

  private clearVisibleStreamRetry(sourceMessageId: string): void {
    const timer = this.streamRetryTimers.get(sourceMessageId)
    if (!timer) {
      return
    }

    clearTimeout(timer)
    this.streamRetryTimers.delete(sourceMessageId)
  }

  private async retryVisibleStreamUpdate(sourceMessageId: string): Promise<void> {
    await this.runWithSourceLock(sourceMessageId, async () => {
      const state = await this.runStateService.get(sourceMessageId)
      if (!state) {
        return { status: 'ok' }
      }

      const hydratedState = this.ensureRunStateDefaults(state)
      const latestVisibleText = this.normalizeLiveStreamText(
        hydratedState.desiredVisiblePushContent || hydratedState.responseMessageContent
      )
      hydratedState.desiredVisiblePushContent = latestVisibleText
      if (!latestVisibleText || hydratedState.lastVisiblePushContent === latestVisibleText) {
        return { status: 'ok' }
      }

      this.logger.debug(
        `[wecom-callback] retry latest-only update sourceMessageId=${sourceMessageId} desiredLen=${
          latestVisibleText.length
        } deliveredLen=${hydratedState.lastVisiblePushContent?.length || 0
        } sinceDispatchMs=${this.elapsedSinceRun(hydratedState)}`
      )
      await this.flushLatestVisibleStreamUpdate(hydratedState, hydratedState.nextSequence - 1, 'retry')
      await this.runStateService.save(hydratedState)
      return { status: 'ok' }
    })
  }

  private formatErrorReply(error: unknown, language?: string): string {
    const message = error instanceof Error ? error.message : String(error)
    return formatWeComConversationFailedText(language, message)
  }

  private async replyRestartConversationCard(message: ChatWeComMessage): Promise<void> {
    try {
      await message.replyRestartConversationCard({
        preferActiveMessageForLongConnection: true
      })
    } catch (error) {
      this.logger.warn(
        `[wecom-callback] failed to send restart conversation card integration=${message.integrationId} chatId=${
          message.chatId
        }: ${error instanceof Error ? error.message : String(error)}`
      )
    }
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

  private elapsedSinceRun(state: WeComChatRunState, now: number = Date.now()): number {
    return Math.max(now - state.runCreatedAt, 0)
  }

  private describeEventData(value: unknown): string {
    if (typeof value === 'string') {
      return `string(len=${value.length})`
    }
    if (Array.isArray(value)) {
      return `array(len=${value.length})`
    }
    if (!value || typeof value !== 'object') {
      return typeof value
    }

    const record = value as Record<string, unknown>
    const type = typeof record.type === 'string' ? record.type : 'object'
    return `object(type=${type})`
  }

  private extractTerminalStatus(
    value: unknown
  ): XpertAgentExecutionStatusEnum.ERROR | XpertAgentExecutionStatusEnum.INTERRUPTED | undefined {
    if (!value || typeof value !== 'object') {
      return undefined
    }

    const status = (value as Record<string, unknown>).status
    if (status === XpertAgentExecutionStatusEnum.ERROR || status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
      return status
    }

    return undefined
  }

  private extractTerminalError(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
      return undefined
    }

    const error = (value as Record<string, unknown>).error
    if (typeof error !== 'string') {
      return undefined
    }

    const text = error.trim()
    return text || undefined
  }
}
