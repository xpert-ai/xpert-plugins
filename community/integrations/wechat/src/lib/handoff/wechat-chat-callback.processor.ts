import { Injectable, Logger } from '@nestjs/common'
import {
  HandoffMessage,
  HandoffProcessorStrategy,
  IHandoffProcessor,
  ProcessContext,
  ProcessResult
} from '@xpert-ai/plugin-sdk'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { WechatChannelStrategy } from '../wechat-channel.strategy.js'
import { WechatConversationService } from '../conversation.service.js'
import {
  WECHAT_CHAT_CALLBACK_MESSAGE_TYPE,
  WechatChatCallbackContext,
  WechatChatCallbackPayload
} from './wechat-chat.types.js'
import { WechatChatRunState, WechatChatRunStateService } from './wechat-chat-run-state.service.js'

type MessageTextContent = {
  type?: unknown
  text?: unknown
  id?: unknown
}

const TOOL_BOUNDARY_EVENTS = new Set<string>([
  ChatMessageEventTypeEnum.ON_TOOL_START,
  ChatMessageEventTypeEnum.ON_TOOL_END,
  ChatMessageEventTypeEnum.ON_TOOL_ERROR,
  ChatMessageEventTypeEnum.ON_TOOL_MESSAGE
])

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

function isReasoningContent(content: unknown): boolean {
  return !!content && typeof content === 'object' && (content as MessageTextContent).type === 'reasoning'
}

function isBoundaryContent(content: unknown): boolean {
  if (!content || typeof content !== 'object') {
    return false
  }
  const type = (content as MessageTextContent).type
  return type !== 'text' && type !== 'reasoning'
}

function appendStreamText(
  accumulator: string,
  incoming: string,
  previousStreamId?: string,
  streamId?: string
): string {
  return appendPlainText(accumulator, incoming, !streamId || !previousStreamId || previousStreamId === streamId)
}

function removeTrailingText(value: string, suffix: string): string {
  if (!value || !suffix) {
    return value || ''
  }
  return value.endsWith(suffix) ? value.slice(0, value.length - suffix.length) : value
}

@Injectable()
@HandoffProcessorStrategy(WECHAT_CHAT_CALLBACK_MESSAGE_TYPE, {
  types: [WECHAT_CHAT_CALLBACK_MESSAGE_TYPE],
  policy: {
    lane: 'main'
  }
})
export class WechatChatCallbackProcessor implements IHandoffProcessor<WechatChatCallbackPayload> {
  private readonly logger = new Logger(WechatChatCallbackProcessor.name)
  private readonly sourceLocks = new Map<string, Promise<unknown>>()

  constructor(
    private readonly wechatChannel: WechatChannelStrategy,
    private readonly conversationService: WechatConversationService,
    private readonly runStateService: WechatChatRunStateService
  ) {}

  async process(
    message: HandoffMessage<WechatChatCallbackPayload>,
    _ctx: ProcessContext
  ): Promise<ProcessResult> {
    const payload = message.payload
    if (!payload?.sourceMessageId) {
      return {
        status: 'dead',
        reason: 'Missing sourceMessageId in WeChat callback payload'
      }
    }
    if (!payload?.sequence || payload.sequence <= 0) {
      return {
        status: 'dead',
        reason: 'Missing sequence in WeChat callback payload'
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

  private ensureDefaults(state: WechatChatRunState): WechatChatRunState {
    if (!state.pendingEvents) {
      state.pendingEvents = {}
    }
    if (!state.nextSequence || state.nextSequence <= 0) {
      state.nextSequence = 1
    }
    if (typeof state.responseMessageContent !== 'string') {
      state.responseMessageContent = ''
    }
    if (typeof state.pendingFinalTextContent !== 'string') {
      state.pendingFinalTextContent = ''
    }
    if (typeof state.currentTextSegmentContent !== 'string') {
      state.currentTextSegmentContent = ''
    }
    if (typeof state.sentIntermediateTextContent !== 'string') {
      state.sentIntermediateTextContent = ''
    }
    if (!state.nextIntermediateSegmentIndex || state.nextIntermediateSegmentIndex <= 0) {
      state.nextIntermediateSegmentIndex = 1
    }
    if (!state.runCreatedAt || state.runCreatedAt <= 0) {
      state.runCreatedAt = Date.now()
    }
    return state
  }

  private createRunState(
    sourceMessageId: string,
    context: WechatChatCallbackContext
  ): WechatChatRunState {
    return {
      sourceMessageId,
      nextSequence: 1,
      responseMessageContent: '',
      pendingFinalTextContent: '',
      currentTextSegmentContent: '',
      sentIntermediateTextContent: '',
      nextIntermediateSegmentIndex: 1,
      hasIntermediateTextSent: false,
      finalMessageContent: undefined,
      terminalError: undefined,
      runCreatedAt: Date.now(),
      context,
      pendingEvents: {}
    }
  }

  private async processPendingEvents(state: WechatChatRunState): Promise<boolean> {
    while (true) {
      if (!state.pendingEvents[String(state.nextSequence)]) {
        const nextAvailableSequence = this.resolveNextAvailableSequence(state)
        if (!nextAvailableSequence) {
          return false
        }
        this.logger.debug(
          `[wechat-callback] missing callback sequence source=${state.sourceMessageId} expected=${state.nextSequence} next=${nextAvailableSequence}; continuing with available event`
        )
        state.nextSequence = nextAvailableSequence
      }

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
            `Unprocessed WeChat callback kind "${(payload as { kind?: unknown }).kind}" in source "${
              state.sourceMessageId
            }"`
          )
        }
      }

      state.nextSequence += 1
    }
  }

  private async applyStreamEvent(state: WechatChatRunState, event: unknown): Promise<void> {
    const eventPayload = (event as { data?: any } | undefined)?.data
    if (!eventPayload) {
      return
    }

    if (eventPayload.type === ChatMessageTypeEnum.MESSAGE) {
      if (this.isIntermediateTextStrategy(state)) {
        await this.applyIntermediateMessageContent(state, eventPayload.data)
      } else {
        const text = filterText(eventPayload.data) ?? ''
        if (text) {
          state.responseMessageContent += text
        }
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

    if (this.isIntermediateTextStrategy(state) && TOOL_BOUNDARY_EVENTS.has(String(eventPayload.event))) {
      await this.flushIntermediateTextSegment(state, String(eventPayload.event))
    }

    if (eventPayload.event === ChatMessageEventTypeEnum.ON_MESSAGE_END) {
      const finalText = this.extractFinalMessageText(eventPayload)
      if (finalText) {
        state.finalMessageContent = finalText
      }
    }
  }

  private async applyIntermediateMessageContent(state: WechatChatRunState, content: unknown): Promise<void> {
    if (Array.isArray(content)) {
      for (const item of content) {
        await this.applyIntermediateMessageContent(state, item)
      }
      return
    }

    if (isReasoningContent(content)) {
      return
    }

    const text = filterTextItem(content)
    if (text) {
      await this.appendIntermediateText(state, text, getTextStreamId(content))
      return
    }

    if (isBoundaryContent(content)) {
      await this.flushIntermediateTextSegment(state, 'component')
    }
  }

  private async appendIntermediateText(
    state: WechatChatRunState,
    text: string,
    streamId?: string
  ): Promise<void> {
    if (
      streamId &&
      state.currentTextSegmentStreamId &&
      state.currentTextSegmentStreamId !== streamId &&
      this.normalizeFinalText(state.currentTextSegmentContent || '')
    ) {
      await this.flushIntermediateTextSegment(state, 'stream_switch')
    }

    state.responseMessageContent = appendStreamText(
      state.responseMessageContent,
      text,
      state.responseTextStreamId,
      streamId
    )
    if (streamId) {
      state.responseTextStreamId = streamId
    }

    state.pendingFinalTextContent = appendStreamText(
      state.pendingFinalTextContent || '',
      text,
      state.pendingFinalTextStreamId,
      streamId
    )
    if (streamId) {
      state.pendingFinalTextStreamId = streamId
    }

    state.currentTextSegmentContent = appendStreamText(
      state.currentTextSegmentContent || '',
      text,
      state.currentTextSegmentStreamId,
      streamId
    )
    if (streamId) {
      state.currentTextSegmentStreamId = streamId
    }
  }

  private async flushIntermediateTextSegment(state: WechatChatRunState, reason: string): Promise<void> {
    const context = state.context
    const rawText = state.currentTextSegmentContent || ''
    const content = this.normalizeFinalText(rawText)
    state.currentTextSegmentContent = ''
    state.currentTextSegmentStreamId = undefined

    if (!content) {
      return
    }

    const segmentIndex = state.nextIntermediateSegmentIndex || 1
    state.nextIntermediateSegmentIndex = segmentIndex + 1
    const idempotencyKey = `${state.sourceMessageId}:intermediate:${segmentIndex}`

    try {
      const result = await this.wechatChannel.sendTextByIntegrationId(context.integrationId, {
        uuid: context.uuid,
        contactId: context.contactId,
        content,
        context,
        source: 'agent_callback',
        idempotencyKey
      })
      await this.logIntermediateTextSendResult(context, content, result, idempotencyKey)

      if (!result.success) {
        this.logger.warn(
          `[wechat-callback] failed to send intermediate text source=${state.sourceMessageId} integration=${context.integrationId} contact=${context.contactId} reason=${reason} error=${result.error || 'unknown'}`
        )
        return
      }

      state.hasIntermediateTextSent = true
      state.sentIntermediateTextContent = `${state.sentIntermediateTextContent || ''}${rawText}`
      state.pendingFinalTextContent = removeTrailingText(state.pendingFinalTextContent || '', rawText)
      if (!state.pendingFinalTextContent) {
        state.pendingFinalTextStreamId = undefined
      }
    } catch (error) {
      this.logger.warn(
        `[wechat-callback] failed to send intermediate text source=${state.sourceMessageId} integration=${context.integrationId} contact=${context.contactId} reason=${reason} error=${this.describeError(error)}`
      )
    }
  }

  private async completeRun(state: WechatChatRunState): Promise<void> {
    const context = state.context
    await this.markInboundConversationAttached(context)
    const finalText = this.resolveFinalReplyText(state)

    if (!finalText) {
      this.logger.debug(
        `[wechat-callback] skip empty final text integration=${context.integrationId} contact=${context.contactId}`
      )
      return
    }

    const result = await this.wechatChannel.sendReplyByIntegrationId(context.integrationId, {
      uuid: context.uuid,
      contactId: context.contactId,
      content: finalText,
      context,
      source: 'agent_callback'
    })
    const loggableItems = !result.queued ? result.items : result.success ? [] : result.items.filter((item) => !item.queued)
    if (loggableItems.length) {
      for (const item of loggableItems) {
        await this.conversationService.logOutbound({
          context,
          content: item.content || finalText,
          status: item.success ? 'sent' : 'failed',
          messageId: item.messageId,
          error: item.error,
          payloadSummary: item.payloadSummary
        })
      }
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to send WeChat reply')
    }
  }

  private resolveFinalReplyText(state: WechatChatRunState): string {
    if (!this.isIntermediateTextStrategy(state) || !state.hasIntermediateTextSent) {
      return this.normalizeFinalText(state.finalMessageContent || state.responseMessageContent)
    }

    const remainingFinalText = this.resolveRemainingFinalMessageText(state)
    if (remainingFinalText) {
      return remainingFinalText
    }

    return this.normalizeFinalText(state.pendingFinalTextContent || '')
  }

  private resolveRemainingFinalMessageText(state: WechatChatRunState): string {
    const finalText = this.normalizeFinalText(state.finalMessageContent || '')
    const sentText = this.normalizeFinalText(state.sentIntermediateTextContent || '')
    if (!finalText || !sentText || !finalText.startsWith(sentText)) {
      return ''
    }
    return this.normalizeFinalText(finalText.slice(sentText.length))
  }

  private async logIntermediateTextSendResult(
    context: WechatChatCallbackContext,
    content: string,
    result: {
      success: boolean
      queued?: boolean
      messageId?: string
      error?: string
    },
    idempotencyKey: string
  ): Promise<void> {
    if (result.queued && result.success) {
      return
    }
    await this.conversationService.logOutbound({
      context,
      content,
      status: result.success ? 'sent' : 'failed',
      messageId: result.messageId,
      error: result.error,
      payloadSummary: JSON.stringify({
        type: 'text',
        source: 'agent_callback',
        phase: 'intermediate',
        idempotencyKey
      })
    })
  }

  private async failRun(state: WechatChatRunState, error: unknown): Promise<void> {
    const context = state.context
    await this.markInboundConversationAttached(context)
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Agent execution failed'
    this.logger.warn(
      `[wechat-callback] agent run failed source=${state.sourceMessageId} integration=${context.integrationId} contact=${context.contactId} error=${message}`
    )
    await this.conversationService.markInboundCallbackFailed(context, message)
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
      content: fallback,
      context,
      source: 'agent_callback'
    })
  }

  private async markInboundConversationAttached(context: WechatChatCallbackContext): Promise<void> {
    try {
      await this.conversationService.markInboundConversationAttached(context)
    } catch (error) {
      const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)
      this.logger.warn(
        `[wechat-callback] failed to attach inbound conversation integration=${context.integrationId} contact=${context.contactId} error=${message}`
      )
    }
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

  private resolveNextAvailableSequence(state: WechatChatRunState): number | undefined {
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

  private isIntermediateTextStrategy(state: WechatChatRunState): boolean {
    return state.context.responseStrategy === 'intermediate_text'
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)
  }

  private resolveFallbackText(language: unknown, message: string): string {
    if (language === 'en') {
      return `Sorry, I failed to generate a reply this time. ${message}`
    }
    return `抱歉，这次回复生成失败了。${message}`
  }
}
