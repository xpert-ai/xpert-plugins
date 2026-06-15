import { randomUUID } from 'crypto'
import { LanguagesEnum, TChatRequest } from '@xpert-ai/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
  AgentChatDispatchPayload,
  HANDOFF_PERMISSION_SERVICE_TOKEN,
  HandoffMessage,
  HandoffPermissionService,
  type PluginContext,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { WechatPersonalMessage } from '../message.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from '../tokens.js'
import {
  WECHAT_PERSONAL_CHAT_CALLBACK_MESSAGE_TYPE,
  WechatPersonalChatCallbackContext
} from './wechat-personal-chat.types.js'
import { WechatPersonalChatRunStateService } from './wechat-personal-chat-run-state.service.js'

export type WechatPersonalChatDispatchInput = {
  xpertId: string
  input?: string
  wechatMessage: WechatPersonalMessage
  conversationId?: string
  conversationUserKey?: string
  tenantId: string
  organizationId?: string
  executorUserId?: string
  endUserId?: string
}

@Injectable()
export class WechatPersonalChatDispatchService {
  private readonly logger = new Logger(WechatPersonalChatDispatchService.name)
  private _handoffPermissionService: HandoffPermissionService

  constructor(
    private readonly runStateService: WechatPersonalChatRunStateService,
    @Inject(WECHAT_PERSONAL_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get handoffPermissionService(): HandoffPermissionService {
    if (!this._handoffPermissionService) {
      this._handoffPermissionService = this.pluginContext.resolve(HANDOFF_PERMISSION_SERVICE_TOKEN)
    }
    return this._handoffPermissionService
  }

  async enqueueDispatch(input: WechatPersonalChatDispatchInput): Promise<WechatPersonalMessage> {
    const message = await this.buildDispatchMessage(input)
    await this.handoffPermissionService.enqueue(message, {
      delayMs: 0
    })
    return input.wechatMessage
  }

  async buildDispatchMessage(input: WechatPersonalChatDispatchInput): Promise<HandoffMessage<AgentChatDispatchPayload>> {
    const {
      xpertId,
      wechatMessage,
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
      `wechat-personal:${wechatMessage.integrationId}:system`
    const runId = `wechat-personal-chat-${randomUUID()}`
    const sessionKey =
      conversationId ||
      conversationUserKey ||
      `${wechatMessage.integrationId}:${wechatMessage.uuid}:${wechatMessage.contactId}:${wechatMessage.senderId || ''}`
    const language = (wechatMessage.language || RequestContext.getLanguageCode() || 'zh-Hans') as LanguagesEnum

    const callbackContext: WechatPersonalChatCallbackContext = {
      tenantId,
      organizationId,
      userId: resolvedExecutorUserId,
      xpertId,
      from: 'wechat_personal',
      channelType: 'wechat_personal',
      wechatPersonalConversation: true,
      wechat_personal_conversation: true,
      channelSource: 'wechat_personal_webhook',
      channel_source: 'wechat_personal_webhook',
      integrationId: wechatMessage.integrationId,
      uuid: wechatMessage.uuid,
      ownerWxid: wechatMessage.ownerWxid,
      contactId: wechatMessage.contactId,
      contact_id: wechatMessage.contactId,
      chatId: wechatMessage.contactId,
      chat_id: wechatMessage.contactId,
      chatType: wechatMessage.chatType,
      chat_type: wechatMessage.chatType,
      senderId: wechatMessage.senderId,
      sender_id: wechatMessage.senderId,
      responseStrategy: 'final_text',
      preferLanguage: language,
      conversationUserKey: conversationUserKey || undefined,
      conversationId: conversationId || undefined,
      message: {
        id: wechatMessage.id || undefined,
        messageId: wechatMessage.messageId || undefined,
        status: wechatMessage.status,
        language
      }
    }

    await this.runStateService.save({
      sourceMessageId: runId,
      nextSequence: 1,
      responseMessageContent: '',
      runCreatedAt: Date.now(),
      context: callbackContext,
      pendingEvents: {}
    })

    this.logger.debug(
      `[wechat-personal-dispatch] build dispatch runId=${runId} xpertId=${xpertId} sessionKey=${sessionKey} integration=${wechatMessage.integrationId}`
    )

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
        request: this.buildChatRequest({
          conversationId,
          input: textInput
        }),
        options: {
          xpertId,
          from: 'wechat_personal',
          fromEndUserId: endUserId || wechatMessage.senderId || resolvedExecutorUserId,
          tenantId,
          organizationId,
          user: {
            id: resolvedExecutorUserId,
            tenantId
          },
          language,
          channelType: 'wechat_personal',
          wechatPersonalConversation: true,
          wechat_personal_conversation: true,
          channelSource: 'wechat_personal_webhook',
          channel_source: 'wechat_personal_webhook',
          integrationId: wechatMessage.integrationId,
          uuid: wechatMessage.uuid,
          ownerWxid: wechatMessage.ownerWxid,
          contactId: wechatMessage.contactId,
          contact_id: wechatMessage.contactId,
          chatId: wechatMessage.contactId,
          chat_id: wechatMessage.contactId,
          chatType: wechatMessage.chatType,
          chat_type: wechatMessage.chatType,
          senderId: wechatMessage.senderId,
          sender_id: wechatMessage.senderId,
          channelUserId: wechatMessage.senderId
        },
        callback: {
          messageType: WECHAT_PERSONAL_CHAT_CALLBACK_MESSAGE_TYPE,
          headers: {
            ...(organizationId ? { organizationId } : {}),
            ...(resolvedExecutorUserId ? { userId: resolvedExecutorUserId } : {}),
            ...(language ? { language } : {}),
            ...(conversationId ? { conversationId } : {}),
            source: 'api',
            handoffQueue: 'integration',
            requestedLane: 'main',
            ...(wechatMessage.integrationId ? { integrationId: wechatMessage.integrationId } : {})
          },
          context: callbackContext
        }
      } as unknown as AgentChatDispatchPayload,
      headers: {
        ...(organizationId ? { organizationId } : {}),
        ...(resolvedExecutorUserId ? { userId: resolvedExecutorUserId } : {}),
        ...(language ? { language } : {}),
        ...(conversationId ? { conversationId } : {}),
        source: 'api',
        requestedLane: 'main',
        handoffQueue: 'realtime',
        ...(wechatMessage.integrationId ? { integrationId: wechatMessage.integrationId } : {})
      }
    }
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

  private normalizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const text = value.trim()
    return text || undefined
  }
}
