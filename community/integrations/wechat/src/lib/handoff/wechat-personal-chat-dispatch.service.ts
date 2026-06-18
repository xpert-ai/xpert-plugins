import { createHash, randomUUID } from 'crypto'
import { LanguagesEnum, STATE_VARIABLE_HUMAN, TChatRequest } from '@xpert-ai/contracts'
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
import type { WechatPersonalInboundFile } from '../types.js'
import {
  WECHAT_PERSONAL_CHAT_CALLBACK_MESSAGE_TYPE,
  WechatPersonalChatCallbackContext
} from './wechat-personal-chat.types.js'
import { WechatPersonalChatRunStateService } from './wechat-personal-chat-run-state.service.js'

export type WechatPersonalChatDispatchInput = {
  xpertId: string
  input?: string
  files?: WechatPersonalInboundFile[]
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
      files,
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

    const chatRequest = this.buildChatRequest({
      input: textInput,
      files,
      contactId: wechatMessage.contactId,
      clientMessageId: this.buildClientMessageId(wechatMessage, runId)
    })

    this.logger.log(
      `[wechat-personal-dispatch] build dispatch runId=${runId} xpertId=${xpertId} sessionKey=${sessionKey} integration=${wechatMessage.integrationId} ${this.summarizeChatRequest(chatRequest)}`
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
        request: chatRequest,
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
        source: 'api',
        requestedLane: 'main',
        handoffQueue: 'realtime',
        ...(wechatMessage.integrationId ? { integrationId: wechatMessage.integrationId } : {})
      }
    }
  }

  private buildChatRequest(params: {
    input?: string
    files?: WechatPersonalInboundFile[]
    contactId?: string
    clientMessageId?: string
  }): TChatRequest {
    const input = params.input ?? ''
    const files = this.normalizeFiles(params.files)
    const contactId = this.normalizeString(params.contactId)
    const contactState = contactId
      ? {
          contactId
        }
      : {}

    return {
      action: 'send',
      message: {
        ...(params.clientMessageId ? { clientMessageId: params.clientMessageId } : {}),
        input: {
          input,
          ...(files ? { files } : {}),
          ...contactState
        }
      },
      state: {
        ...contactState,
        [STATE_VARIABLE_HUMAN]: {
          input,
          ...(files ? { files } : {}),
          ...contactState
        }
      }
    } as unknown as TChatRequest
  }

  private normalizeFiles(files?: WechatPersonalInboundFile[]): WechatPersonalInboundFile[] | undefined {
    if (!Array.isArray(files) || files.length === 0) {
      return undefined
    }

    const normalized = files
      .map((file) => this.normalizeFile(file))
      .filter((file): file is WechatPersonalInboundFile => Boolean(file))
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeFile(file: WechatPersonalInboundFile): WechatPersonalInboundFile | null {
    const fileUrl = this.normalizeString(file.fileUrl) || this.normalizeString(file.url)
    if (!fileUrl) {
      return null
    }

    const mimeType = this.normalizeString(file.mimeType) || this.normalizeString(file.mimetype)
    const fileKey = this.normalizeString(file.fileKey)
    const fileAssetId = this.normalizeString(file.fileAssetId)
    const storageFileId = this.normalizeString(file.storageFileId)
    const id = fileAssetId || storageFileId ? this.normalizeString(file.id) || fileAssetId || storageFileId : undefined
    const extension = this.normalizeString(file.extension) || this.inferExtension(file.originalName || file.name, mimeType)
    const originalName =
      this.normalizeString(file.originalName) ||
      this.normalizeString(file.name) ||
      `wechat-image-${fileKey || this.stableFileId(fileUrl)}${extension ? `.${extension}` : ''}`
    const name = this.normalizeString(file.name) || originalName
    const size = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : undefined
    const { id: _id, fileUrl: _fileUrl, url: _url, mimeType: _mimeType, mimetype: _mimetype, ...rest } = file

    return {
      ...rest,
      ...(id ? { id } : {}),
      fileUrl,
      url: this.normalizeString(file.url) || fileUrl,
      ...(mimeType ? { mimeType, mimetype: this.normalizeString(file.mimetype) || mimeType } : {}),
      originalName,
      name,
      ...(fileKey ? { fileKey } : {}),
      ...(typeof size === 'number' ? { size } : {}),
      ...(extension ? { extension } : {})
    }
  }

  private buildClientMessageId(wechatMessage: WechatPersonalMessage, fallbackRunId: string): string {
    const raw = [
      'wechat-personal',
      wechatMessage.integrationId,
      wechatMessage.uuid,
      wechatMessage.messageId || wechatMessage.id || fallbackRunId
    ]
      .map((part) => this.normalizeString(part))
      .filter((part): part is string => Boolean(part))
      .join(':')
    return raw || fallbackRunId
  }

  private summarizeChatRequest(request: TChatRequest): string {
    if (request.action !== 'send') {
      return `action=${request.action}`
    }
    const input = request.message.input.input ?? ''
    const files = Array.isArray(request.message.input.files) ? request.message.input.files : []
    const stateHuman = (request.state as Record<string, unknown> | undefined)?.[STATE_VARIABLE_HUMAN] as
      | { input?: string; files?: unknown[] }
      | undefined
    return [
      `clientMessageId=${request.message.clientMessageId || '-'}`,
      `inputLength=${input.length}`,
      `inputPreview=${JSON.stringify(this.previewText(input))}`,
      `messageFiles=${files.length}`,
      `stateHumanInputLength=${typeof stateHuman?.input === 'string' ? stateHuman.input.length : 0}`,
      `stateHumanFiles=${Array.isArray(stateHuman?.files) ? stateHuman.files.length : 0}`,
      `files=${JSON.stringify(files.map((file) => this.summarizeFile(file as WechatPersonalInboundFile)))}`
    ].join(' ')
  }

  private summarizeFile(file: WechatPersonalInboundFile): Record<string, unknown> {
    const fileUrl = this.normalizeString(file.fileUrl) || this.normalizeString(file.url)
    return {
      name: this.normalizeString(file.originalName) || this.normalizeString(file.name),
      mimeType: this.normalizeString(file.mimeType) || this.normalizeString(file.mimetype),
      size: typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : undefined,
      fileKey: this.normalizeString(file.fileKey),
      hasId: !!this.normalizeString(file.id),
      hasFileAssetId: !!this.normalizeString(file.fileAssetId),
      hasStorageFileId: !!this.normalizeString(file.storageFileId),
      hasDataUrl: !!fileUrl?.startsWith('data:')
    }
  }

  private previewText(input: string): string {
    const normalized = input.replace(/\s+/g, ' ').trim()
    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
  }

  private inferExtension(name?: string, mimeType?: string): string | undefined {
    const normalizedName = this.normalizeString(name)
    const namedExtension = normalizedName?.includes('.') ? normalizedName.split('.').pop()?.trim() : undefined
    if (namedExtension) {
      return namedExtension
    }

    switch (mimeType) {
      case 'image/png':
        return 'png'
      case 'image/gif':
        return 'gif'
      case 'image/webp':
        return 'webp'
      case 'image/jpeg':
        return 'jpg'
      default:
        return undefined
    }
  }

  private stableFileId(fileUrl: string): string {
    return `wechat-file-${createHash('sha256').update(fileUrl).digest('hex').slice(0, 16)}`
  }

  private normalizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const text = value.trim()
    return text || undefined
  }
}
