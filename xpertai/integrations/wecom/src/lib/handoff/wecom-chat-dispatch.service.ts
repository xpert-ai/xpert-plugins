import { LanguagesEnum, TChatRequest } from '@metad/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { generateReqId } from '@wecom/aibot-node-sdk'
import {
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
  AgentChatDispatchPayload,
  HANDOFF_PERMISSION_SERVICE_TOKEN,
  HandoffMessage,
  HandoffPermissionService,
  type PluginContext,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { ChatWeComMessage } from '../message.js'
import { getWeComThinkingAckText } from '../wecom-conversation-text.js'
import { WECOM_PLUGIN_CONTEXT } from '../tokens.js'
import { DispatchWeComChatPayload } from './commands/dispatch-wecom-chat.command.js'
import { WeComChatCallbackContext, WECOM_CHAT_STREAM_CALLBACK_MESSAGE_TYPE } from './wecom-chat.types.js'
import { WeComChatRunStateService } from './wecom-chat-run-state.service.js'

export type TWeComChatDispatchInput = DispatchWeComChatPayload

@Injectable()
export class WeComChatDispatchService {
  private readonly logger = new Logger(WeComChatDispatchService.name)
  private _handoffPermissionService: HandoffPermissionService

  constructor(
    private readonly runStateService: WeComChatRunStateService,
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get handoffPermissionService(): HandoffPermissionService {
    if (!this._handoffPermissionService) {
      this._handoffPermissionService = this.pluginContext.resolve(HANDOFF_PERMISSION_SERVICE_TOKEN)
    }
    return this._handoffPermissionService
  }

  async enqueueDispatch(input: TWeComChatDispatchInput): Promise<ChatWeComMessage> {
    const message = await this.buildDispatchMessage(input)
    await this.handoffPermissionService.enqueue(message, {
      delayMs: 0
    })
    return input.wecomMessage
  }

  async buildDispatchMessage(input: TWeComChatDispatchInput): Promise<HandoffMessage<AgentChatDispatchPayload>> {
    const buildStartedAt = Date.now()
    const {
      xpertId,
      wecomMessage,
      input: textInput,
      conversationId,
      conversationUserKey,
      tenantId,
      organizationId,
      executorUserId,
      endUserId
    } = input
    const resolvedExecutorUserId =
      this.normalizeString(executorUserId) ||
      this.normalizeString(RequestContext.currentUserId()) ||
      `wecom:${wecomMessage.integrationId}:system`

    const runId = `wecom-chat-${randomUUID()}`
    const sessionKey = conversationId || conversationUserKey || `${wecomMessage.integrationId}:${wecomMessage.chatId}`
    const language = (wecomMessage.language || RequestContext.getLanguageCode() || 'zh-Hans') as LanguagesEnum

    const callbackContext: WeComChatCallbackContext = {
      tenantId,
      organizationId,
      userId: resolvedExecutorUserId,
      xpertId,
      from: 'wecom',
      channelType: 'wecom',
      wecomConversation: true,
      wecom_conversation: true,
      channelSource: 'wecom_webhook',
      channel_source: 'wecom_webhook',
      integrationId: wecomMessage.integrationId,
      chatId: wecomMessage.chatId,
      chatType: wecomMessage.chatType,
      chat_id: wecomMessage.chatId,
      chat_type: wecomMessage.chatType,
      senderId: wecomMessage.senderId,
      sender_id: wecomMessage.senderId,
      responseUrl: wecomMessage.responseUrl,
      response_url: wecomMessage.responseUrl,
      reqId: wecomMessage.reqId,
      req_id: wecomMessage.reqId,
      responseStrategy: 'final_text',
      streamId: undefined,
      preferLanguage: language,
      conversationUserKey: conversationUserKey || undefined,
      conversationId: conversationId || undefined,
      message: {
        id: wecomMessage.id || undefined,
        messageId: wecomMessage.messageId || undefined,
        streamId: wecomMessage.streamId,
        status: wecomMessage.status,
        language
      }
    }

    if (wecomMessage.reqId) {
      const streamId = generateReqId('stream')
      const thinkingAckStartedAt = Date.now()
      this.logger.debug(
        `[wecom-dispatch] thinking ack start integration=${wecomMessage.integrationId} chatId=${wecomMessage.chatId} reqId=${
          wecomMessage.reqId
        } streamId=${streamId}`
      )
      try {
        wecomMessage.streamId = streamId
        await wecomMessage.replyStream(getWeComThinkingAckText(language), false)
        callbackContext.responseStrategy = 'reply_stream'
        callbackContext.streamId = streamId
        callbackContext.message = {
          ...callbackContext.message,
          id: wecomMessage.id || undefined,
          messageId: wecomMessage.messageId || undefined,
          streamId,
          status: wecomMessage.status
        }
        this.logger.debug(
          `[wecom-dispatch] thinking ack sent integration=${wecomMessage.integrationId} chatId=${wecomMessage.chatId} reqId=${
            wecomMessage.reqId
          } streamId=${streamId} elapsedMs=${Date.now() - thinkingAckStartedAt}`
        )
      } catch (error) {
        wecomMessage.streamId = undefined
        this.logger.warn(
          `[wecom-dispatch] failed to send thinking ack integration=${wecomMessage.integrationId} chatId=${
            wecomMessage.chatId
          } reqId=${wecomMessage.reqId} streamId=${streamId} elapsedMs=${Date.now() - thinkingAckStartedAt}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }

    const runCreatedAt = Date.now()
    await this.runStateService.save({
      sourceMessageId: runId,
      nextSequence: 1,
      responseMessageContent: '',
      runCreatedAt,
      desiredVisiblePushContent: '',
      lastVisiblePushContent: '',
      context: callbackContext,
      pendingEvents: {}
    })

    this.logger.debug(
      `[wecom-dispatch] build dispatch message runId=${runId} xpertId=${xpertId} sessionKey=${sessionKey} integration=${
        wecomMessage.integrationId
      } responseStrategy=${callbackContext.responseStrategy} reqId=${wecomMessage.reqId || 'n/a'} streamId=${
        callbackContext.streamId || 'n/a'
      } elapsedMs=${runCreatedAt - buildStartedAt}`
    )
    const request = this.buildChatRequest({
      conversationId,
      input: textInput
    })

    return {
      id: runId,
      type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
      version: 1,
      tenantId,
      sessionKey,
      businessKey: sessionKey,
      attempt: 1,
      maxAttempts: 1,
      enqueuedAt: Date.now(),
      traceId: runId,
      payload: {
        request,
        options: {
          xpertId,
          from: 'wecom',
          fromEndUserId: endUserId || wecomMessage.senderId || resolvedExecutorUserId,
          tenantId,
          organizationId,
          user: {
            id: resolvedExecutorUserId,
            tenantId
          },
          language,
          channelType: 'wecom',
          wecomConversation: true,
          wecom_conversation: true,
          channelSource: 'wecom_webhook',
          channel_source: 'wecom_webhook',
          integrationId: wecomMessage.integrationId,
          chatId: wecomMessage.chatId,
          chatType: wecomMessage.chatType,
          chat_id: wecomMessage.chatId,
          chat_type: wecomMessage.chatType,
          senderId: wecomMessage.senderId,
          sender_id: wecomMessage.senderId,
          channelUserId: wecomMessage.senderId,
          ...(wecomMessage.responseUrl ? { response_url: wecomMessage.responseUrl } : {}),
          ...(wecomMessage.responseUrl ? { responseUrl: wecomMessage.responseUrl } : {}),
          ...(wecomMessage.reqId ? { req_id: wecomMessage.reqId } : {}),
          ...(wecomMessage.reqId ? { reqId: wecomMessage.reqId } : {})
        },
        callback: {
          messageType: WECOM_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
          headers: {
            ...(organizationId ? { organizationId } : {}),
            ...(resolvedExecutorUserId ? { userId: resolvedExecutorUserId } : {}),
            ...(language ? { language } : {}),
            ...(conversationId ? { conversationId } : {}),
            source: 'api',
            handoffQueue: 'integration',
            requestedLane: 'main',
            ...(wecomMessage.integrationId ? { integrationId: wecomMessage.integrationId } : {})
          },
          context: callbackContext
        }
      } as AgentChatDispatchPayload,
      headers: {
        ...(organizationId ? { organizationId } : {}),
        ...(resolvedExecutorUserId ? { userId: resolvedExecutorUserId } : {}),
        ...(language ? { language } : {}),
        ...(conversationId ? { conversationId } : {}),
        source: 'api',
        requestedLane: 'main',
        handoffQueue: 'realtime',
        ...(wecomMessage.integrationId ? { integrationId: wecomMessage.integrationId } : {})
      }
    }
  }

  private normalizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const text = value.trim()
    return text || undefined
  }

  private buildChatRequest(params: { conversationId?: string; input?: string }): TChatRequest {
    return {
      action: 'send',
      ...(params.conversationId ? { conversationId: params.conversationId } : {}),
      message: {
        input: {
          input: params.input ?? ''
        }
      }
    } as unknown as TChatRequest
  }
}
