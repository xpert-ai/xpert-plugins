import { createHash, randomUUID } from 'crypto'
import { LanguagesEnum, STATE_VARIABLE_HUMAN, TChatRequest } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import {
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
  AgentChatDispatchPayload,
  HANDOFF_PERMISSION_SERVICE_TOKEN,
  HandoffMessage,
  HandoffPermissionService,
  type PluginContext,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { WechatMessage } from '../message.js'
import { WECHAT_PLUGIN_CONTEXT } from '../tokens.js'
import type { TIntegrationWechatOptions, WechatInboundFile } from '../types.js'
import {
  WECHAT_CHAT_CALLBACK_MESSAGE_TYPE,
  WechatChatCallbackContext
} from './wechat-chat.types.js'
import { withWechatChatContextLegacyAliases } from './wechat-chat-context.js'
import { WechatChatRunStateService } from './wechat-chat-run-state.service.js'

export type WechatChatDispatchInput = {
  xpertId: string
  input?: string
  files?: WechatInboundFile[]
  wechatMessage: WechatMessage
  conversationId?: string
  conversationUserKey?: string
  tenantId: string
  organizationId?: string
  endUserId?: string
  currentInboundLogIds?: string[]
  integrationOptions?: Pick<TIntegrationWechatOptions, 'agentCallbackIntermediateTextEnabled'>
}

@Injectable()
export class WechatChatDispatchService {
  private _handoffPermissionService: HandoffPermissionService

  constructor(
    private readonly runStateService: WechatChatRunStateService,
    @Inject(WECHAT_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get handoffPermissionService(): HandoffPermissionService {
    if (!this._handoffPermissionService) {
      this._handoffPermissionService = this.pluginContext.resolve(HANDOFF_PERMISSION_SERVICE_TOKEN)
    }
    return this._handoffPermissionService
  }

  async enqueueDispatch(input: WechatChatDispatchInput): Promise<WechatMessage> {
    const message = await this.buildDispatchMessage(input)
    await this.handoffPermissionService.enqueue(message, {
      delayMs: 0
    })
    return input.wechatMessage
  }

  async buildDispatchMessage(input: WechatChatDispatchInput): Promise<HandoffMessage<AgentChatDispatchPayload>> {
    const {
      xpertId,
      wechatMessage,
      input: textInput,
      files,
      conversationUserKey,
      tenantId,
      organizationId,
      endUserId,
      currentInboundLogIds
    } = input
    const runId = `wechat-chat-${randomUUID()}`
    const sessionKey =
      conversationUserKey ||
      `${wechatMessage.integrationId}:${wechatMessage.uuid}:${wechatMessage.contactId}:${wechatMessage.senderId || ''}`
    const language = (wechatMessage.language || RequestContext.getLanguageCode() || 'zh-Hans') as LanguagesEnum
    const sourceMessageLogIds = this.normalizeInboundLogIds(currentInboundLogIds) ?? []
    const runtimeContext = this.buildRuntimeContext(wechatMessage, sourceMessageLogIds, conversationUserKey)
    const responseStrategy = input.integrationOptions?.agentCallbackIntermediateTextEnabled === true
      ? 'intermediate_text'
      : 'final_text'

    const callbackContext: WechatChatCallbackContext = withWechatChatContextLegacyAliases({
      tenantId,
      organizationId,
      xpertId,
      from: 'wechat',
      channelType: 'wechat',
      wechatConversation: true,
      channelSource: 'wechat_webhook',
      integrationId: wechatMessage.integrationId,
      uuid: wechatMessage.uuid,
      ownerWxid: wechatMessage.ownerWxid,
      contactId: wechatMessage.contactId,
      chatId: wechatMessage.contactId,
      chatType: wechatMessage.chatType,
      senderId: wechatMessage.senderId,
      senderName: wechatMessage.senderName,
      responseStrategy,
      preferLanguage: language,
      conversationUserKey: conversationUserKey || undefined,
      currentInboundLogIds: sourceMessageLogIds,
      message: {
        id: wechatMessage.id || sourceMessageLogIds[0] || undefined,
        messageId: wechatMessage.messageId || undefined,
        status: wechatMessage.status,
        language
      }
    })

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
          from: 'wechat',
          fromEndUserId: endUserId || wechatMessage.senderId || wechatMessage.contactId,
          runtimePrincipal: {
            type: 'assistant',
            xpertId,
            sourceIntegrationId: wechatMessage.integrationId
          },
          tenantId,
          organizationId,
          language,
          context: runtimeContext,
          ...withWechatChatContextLegacyAliases({
            channelType: 'wechat',
            wechatConversation: true,
            channelSource: 'wechat_webhook',
            integrationId: wechatMessage.integrationId,
            uuid: wechatMessage.uuid,
            ownerWxid: wechatMessage.ownerWxid,
            contactId: wechatMessage.contactId,
            chatId: wechatMessage.contactId,
            chatType: wechatMessage.chatType,
            senderId: wechatMessage.senderId,
            channelUserId: wechatMessage.senderId,
            ...(sourceMessageLogIds.length ? { sourceMessageLogIds } : {})
          })
        },
        callback: {
          messageType: WECHAT_CHAT_CALLBACK_MESSAGE_TYPE,
          headers: {
            ...(organizationId ? { organizationId } : {}),
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
    files?: WechatInboundFile[]
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

  private buildRuntimeContext(
    wechatMessage: WechatMessage,
    sourceMessageLogIds: string[],
    conversationUserKey?: string
  ): Record<string, unknown> {
    return withWechatChatContextLegacyAliases({
      from: 'wechat',
      channelType: 'wechat',
      wechatConversation: true,
      channelSource: 'wechat_webhook',
      sourceIntegrationId: wechatMessage.integrationId,
      integrationId: wechatMessage.integrationId,
      uuid: wechatMessage.uuid,
      ownerWxid: wechatMessage.ownerWxid,
      contactId: wechatMessage.contactId,
      chatId: wechatMessage.contactId,
      chatType: wechatMessage.chatType,
      senderId: wechatMessage.senderId,
      senderName: wechatMessage.senderName,
      channelUserId: wechatMessage.senderId,
      ...(conversationUserKey ? { conversationUserKey } : {}),
      ...(sourceMessageLogIds.length
        ? {
            currentInboundLogIds: sourceMessageLogIds,
            sourceMessageLogIds
          }
        : {})
    })
  }

  private normalizeFiles(files?: WechatInboundFile[]): WechatInboundFile[] | undefined {
    if (!Array.isArray(files) || files.length === 0) {
      return undefined
    }

    const normalized = files
      .map((file) => this.normalizeFile(file))
      .filter((file): file is WechatInboundFile => Boolean(file))
    return normalized.length > 0 ? normalized : undefined
  }

  private normalizeInboundLogIds(ids?: string[]): string[] | undefined {
    const normalized = Array.from(
      new Set((ids ?? []).map((id) => this.normalizeString(id)).filter((id): id is string => Boolean(id)))
    )
    return normalized.length ? normalized : undefined
  }

  private normalizeFile(file: WechatInboundFile): WechatInboundFile | null {
    const fileUrl = this.normalizeString(file.fileUrl) || this.normalizeString(file.url)
    const fileId = this.normalizeString(file.fileId)
    const fileAssetId = this.normalizeString(file.fileAssetId)
    const storageFileId = this.normalizeString(file.storageFileId)
    const filePath = this.normalizeString(file.filePath)
    const workspacePath = this.normalizeString(file.workspacePath)
    if (!fileUrl && !fileId && !fileAssetId && !storageFileId && !filePath && !workspacePath) {
      return null
    }

    const mimeType = this.normalizeString(file.mimeType) || this.normalizeString(file.mimetype)
    const fileKey = this.normalizeString(file.fileKey)
    const id =
      this.normalizeString(file.id) ||
      fileAssetId ||
      fileId ||
      storageFileId ||
      (filePath || workspacePath ? this.stableFileId(filePath || workspacePath || fileKey || 'wechat-file') : undefined)
    const extension = this.normalizeString(file.extension) || this.inferExtension(file.originalName || file.name, mimeType)
    const originalName =
      this.normalizeString(file.originalName) ||
      this.normalizeString(file.name) ||
      this.basename(filePath || workspacePath) ||
      `wechat-file-${fileKey || id}${extension ? `.${extension}` : ''}`
    const name = this.normalizeString(file.name) || originalName
    const size = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : undefined
    const {
      id: _id,
      fileId: _fileId,
      fileAssetId: _fileAssetId,
      storageFileId: _storageFileId,
      filePath: _filePath,
      workspacePath: _workspacePath,
      fileUrl: _fileUrl,
      url: _url,
      mimeType: _mimeType,
      mimetype: _mimetype,
      ...rest
    } = file

    return {
      ...rest,
      ...(id ? { id } : {}),
      ...(fileId || fileAssetId ? { fileId: fileId || fileAssetId } : {}),
      ...(fileAssetId ? { fileAssetId } : {}),
      ...(storageFileId ? { storageFileId } : {}),
      ...(filePath ? { filePath } : {}),
      ...(workspacePath ? { workspacePath } : {}),
      ...(fileUrl ? { fileUrl, url: this.normalizeString(file.url) || fileUrl } : {}),
      ...(mimeType ? { mimeType, mimetype: this.normalizeString(file.mimetype) || mimeType } : {}),
      originalName,
      name,
      ...(fileKey ? { fileKey } : {}),
      ...(typeof size === 'number' ? { size } : {}),
      ...(extension ? { extension } : {})
    }
  }

  private buildClientMessageId(wechatMessage: WechatMessage, fallbackRunId: string): string {
    const raw = [
      'wechat',
      wechatMessage.integrationId,
      wechatMessage.uuid,
      wechatMessage.messageId || wechatMessage.id || fallbackRunId
    ]
      .map((part) => this.normalizeString(part))
      .filter((part): part is string => Boolean(part))
      .join(':')
    return raw || fallbackRunId
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

  private basename(value?: string): string | undefined {
    const normalized = this.normalizeString(value)?.replace(/\\/g, '/')
    if (!normalized) {
      return undefined
    }
    return normalized.split('/').filter(Boolean).pop()
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
