import { randomBytes } from 'crypto'
import { IIntegration, IUser } from '@metad/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  type PluginContext,
  RequestContext,
  runWithRequestContext,
  TChatEventContext,
  TChatEventHandlers,
} from '@xpert-ai/plugin-sdk'
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Request,
  Response,
  UseGuards
} from '@nestjs/common'
import express from 'express'
import { DingTalkAuthGuard } from './auth/dingtalk-auth.guard.js'
import { DingTalkConversationService } from './conversation.service.js'
import { Public } from './decorators/public.decorator.js'
import { DingTalkChannelStrategy } from './dingtalk-channel.strategy.js'
import { DINGTALK_HTTP_SUBSCRIPTION_HINTS } from './dingtalk-integration.strategy.js'
import { DINGTALK_PLUGIN_CONTEXT } from './tokens.js'
import {
  DINGTALK_END_CONVERSATION,
  computeDingTalkSignature,
  decryptDingTalkEncrypt,
  encryptDingTalkMessage,
  TIntegrationDingTalkOptions,
  verifyDingTalkSignature,
} from './types.js'

type ResolvedWebhookPayload = {
  body: Record<string, unknown>
  encrypted: boolean
  challenge?: string
}

@Controller('dingtalk')
export class DingTalkHooksController {
  private readonly logger = new Logger(DingTalkHooksController.name)
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    private readonly conversation: DingTalkConversationService,
    @Inject(DINGTALK_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    private readonly dingtalkChannel: DingTalkChannelStrategy
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  @Public()
  @UseGuards(DingTalkAuthGuard)
  @Post('webhook/:id')
  @HttpCode(200)
  async webhook(
    @Param('id') integrationId: string,
    @Request() req: express.Request,
    @Response() res: express.Response
  ): Promise<void> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationDingTalkOptions>>(
      integrationId,
      {
        relations: ['tenant'],
      }
    )
    if (!integration) {
      throw new BadRequestException(`Integration ${integrationId} not found`)
    }

    if (!integration.options?.httpCallbackEnabled) {
      throw new BadRequestException(`Integration ${integrationId} has httpCallbackEnabled=false`)
    }

    const payload = this.resolveWebhookPayload(req, integration.options)
    if (payload.challenge) {
      this.logger.log(
        `[webhook] integration=${integration.id} type=url_verification encrypted=${payload.encrypted}`
      )
      res.status(200).json({ challenge: payload.challenge })
      return
    }

    const eventBody = payload.body as Record<string, unknown>
    const eventType = this.toSafeString(eventBody?.EventType || eventBody?.eventType || eventBody?.type)
    const conversationId = this.toSafeString(
      eventBody?.conversationId || eventBody?.openConversationId || eventBody?.chatId || eventBody?.chat_id
    )
    const senderId = this.toSafeString(
      eventBody?.senderStaffId || eventBody?.senderId || (eventBody?.sender as any)?.staffId || (eventBody?.sender as any)?.openId
    )
    this.logger.log(
      `[webhook] integration=${integration.id} encrypted=${payload.encrypted} eventType=${eventType || 'unknown'} conversationId=${conversationId || 'unknown'} senderId=${senderId || 'unknown'}`
    )

    req.body = payload.body

    const ctx: TChatEventContext<TIntegrationDingTalkOptions> = {
      integration,
      tenantId: integration.tenantId,
      organizationId: integration.organizationId
    }

    const handlers: TChatEventHandlers = {
      onMessage: async (message, eventCtx) => {
        await this.conversation.handleMessage(message, eventCtx)
      },
      onMention: async (message, eventCtx) => {
        await this.conversation.handleMessage(message, eventCtx)
      },
      onCardAction: async (action, eventCtx) => {
        await this.conversation.handleCardAction(action, eventCtx)
      }
    }

    const handler = this.dingtalkChannel.createEventHandler(ctx, handlers)
    const contextUser = RequestContext.currentUser() ?? (req.user as IUser) ?? {
      id: `dingtalk:${integration.id}:anonymous`,
      tenantId: integration.tenantId,
      organizationId: integration.organizationId
    }

    const requestHeaders: Record<string, string> = {
      ['organization-id']: integration.organizationId,
      ['tenant-id']: integration.tenantId
    }
    if (integration.options?.preferLanguage) {
      requestHeaders['language'] = integration.options.preferLanguage
    }

    const internalRes = this.createInternalResponse()
    await new Promise<void>((resolve, reject) => {
      runWithRequestContext(
        {
          user: contextUser,
          headers: requestHeaders
        },
        {},
        () => {
          handler(req, internalRes as any).then(resolve).catch(reject)
        }
      )
    })

    if (payload.encrypted) {
      res.status(200).json(this.buildEncryptedSuccessAck(integration.options))
      return
    }

    res.status(200).send('success')
  }

  @Get('callback-config')
  async getCallbackConfig(@Query('integration') integrationId: string) {
    if (!integrationId) {
      throw new BadRequestException('Missing query parameter: integration')
    }

    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationDingTalkOptions>>(
      integrationId
    )
    if (!integration) {
      throw new BadRequestException(`Integration ${integrationId} not found`)
    }

    const apiBaseUrl = process.env.API_BASE_URL
    return {
      mode: 'http',
      callbackUrl: `${apiBaseUrl}/api/dingtalk/webhook/${integration.id}`,
      httpCallbackEnabled: integration.options?.httpCallbackEnabled !== false,
      signatureAlgorithm: 'sha1(sort(token,timestamp,nonce,encrypt))',
      encryptedAck: true,
      expectedAckMs: 1500,
      requiredConfig: {
        callbackToken: Boolean(integration.options?.callbackToken),
        callbackAesKey: Boolean(integration.options?.callbackAesKey),
        callbackAppKey: Boolean(this.resolveCallbackAppKey(integration.options))
      },
      subscriptionHints: [...DINGTALK_HTTP_SUBSCRIPTION_HINTS]
    }
  }

  @Public()
  @Get('action')
  async action(
    @Query('integrationId') integrationId: string,
    @Query('conversationUserKey') conversationUserKey: string,
    @Query('action') action: string,
    @Response() res: express.Response,
    @Query('xpertId') xpertId?: string
  ): Promise<void> {
    const normalizedAction = this.toSafeString(action)
    if (normalizedAction !== DINGTALK_END_CONVERSATION) {
      throw new BadRequestException(`Unsupported action: ${normalizedAction}`)
    }

    const normalizedIntegrationId = this.toSafeString(integrationId)
    const normalizedConversationUserKey = this.toSafeString(conversationUserKey)
    if (!normalizedIntegrationId || !normalizedConversationUserKey) {
      throw new BadRequestException('integrationId and conversationUserKey are required')
    }
    if (!normalizedConversationUserKey.startsWith(`${normalizedIntegrationId}:`)) {
      throw new BadRequestException('conversationUserKey does not match integrationId')
    }

    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationDingTalkOptions>>(
      normalizedIntegrationId
    )
    if (!integration) {
      throw new BadRequestException(`Integration ${normalizedIntegrationId} not found`)
    }

    const cleared = await this.conversation.clearConversationSessionByUserKey(
      normalizedConversationUserKey,
      this.toSafeString(xpertId) || undefined
    )

    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Xpert DingTalk</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;line-height:1.6;color:#111;"><h3 style="margin:0 0 12px 0;">${cleared ? '会话已结束' : '未找到可结束会话'}</h3><p style="margin:0;">${cleared ? '已清理当前会话状态。返回钉钉再次发送消息将开启新会话。' : '该会话可能已结束或会话信息已过期。可直接返回钉钉重新发起对话。'}</p></body></html>`
    res.status(200).contentType('text/html; charset=utf-8').send(html)
  }

  @Get('user-select-options')
  async getUserSelectOptions(
    @Query('integration') integrationId: string,
    @Query('keyword') keyword?: string,
    @Query('pageSize') pageSize?: string,
    @Query('pageToken') pageToken?: string
  ) {
    if (!integrationId) {
      return []
    }

    const result = await this.dingtalkChannel.listUsers(integrationId, {
      keyword,
      pageSize: this.toSafeNumber(pageSize, 50),
      pageToken
    })

    return result.items.map((item) => ({
      value: item.id,
      label: item.name,
      icon: item.avatar
    }))
  }

  @Get('chat-select-options')
  async getChatSelectOptions(
    @Query('integration') integrationId: string,
    @Query('keyword') keyword?: string,
    @Query('pageSize') pageSize?: string,
    @Query('pageToken') pageToken?: string
  ) {
    if (!integrationId) {
      return []
    }

    const result = await this.dingtalkChannel.listChats(integrationId, {
      keyword,
      pageSize: this.toSafeNumber(pageSize, 50),
      pageToken
    })

    return result.items.map((item) => ({
      value: item.id,
      label: item.name,
      icon: item.avatar
    }))
  }

  @Get('recipient-select-options')
  async getRecipientSelectOptions(
    @Query('integration') integrationId: string,
    @Query('recipientType') recipientType?: string,
    @Query('keyword') keyword?: string,
    @Query('pageSize') pageSize?: string,
    @Query('pageToken') pageToken?: string
  ) {
    if (!integrationId) {
      return []
    }

    try {
      if (recipientType === 'chat_id') {
        const result = await this.dingtalkChannel.listChats(integrationId, {
          keyword,
          pageSize: this.toSafeNumber(pageSize, 50),
          pageToken
        })

        return result.items.map((item) => ({
          value: item.id,
          label: item.name,
          icon: item.avatar
        }))
      }

      const result = await this.dingtalkChannel.listUsers(integrationId, {
        keyword,
        pageSize: this.toSafeNumber(pageSize, 50),
        pageToken
      })

      return result.items.map((item) => ({
        value: item.id,
        label: item.name,
        icon: item.avatar
      }))
    } catch {
      return []
    }
  }

  private createInternalResponse() {
    return {
      status(_code: number) {
        return this
      },
      send(_body: unknown) {
        return this
      },
      json(_body: unknown) {
        return this
      }
    }
  }

  private resolveWebhookPayload(req: express.Request, options: TIntegrationDingTalkOptions): ResolvedWebhookPayload {
    let payload: Record<string, unknown> = req.body ?? {}
    let encrypted = false

    if (payload.encrypt) {
      encrypted = true
      const signature = this.getQueryString(req.query.signature ?? req.query.msg_signature)
      const timestamp = this.getQueryString(req.query.timestamp)
      const nonce = this.getQueryString(req.query.nonce)
      const encrypt = this.toSafeString(payload.encrypt)
      const callbackAppKey = this.resolveCallbackAppKey(options)

      if (!options.callbackToken || !options.callbackAesKey || !callbackAppKey) {
        throw new BadRequestException(
          'callbackToken/callbackAesKey are required, and callback appKey resolves from appKey or clientId'
        )
      }

      if (
        !verifyDingTalkSignature({
          token: options.callbackToken,
          timestamp,
          nonce,
          encrypt,
          signature
        })
      ) {
        throw new BadRequestException('Invalid DingTalk callback signature')
      }

      const decrypted = decryptDingTalkEncrypt({
        encrypt,
        aesKey: options.callbackAesKey,
        appKey: callbackAppKey
      })
      payload = JSON.parse(decrypted)
    }

    const payloadType = this.toSafeString(payload.type || payload.EventType)
    if (payloadType === 'url_verification') {
      const challenge = this.toSafeString(payload.challenge)
      if (!challenge) {
        throw new BadRequestException('Missing challenge for url_verification payload')
      }
      return {
        body: payload,
        encrypted,
        challenge
      }
    }

    return {
      body: payload,
      encrypted
    }
  }

  private buildEncryptedSuccessAck(options: TIntegrationDingTalkOptions) {
    const callbackAppKey = this.resolveCallbackAppKey(options)
    if (!options.callbackToken || !options.callbackAesKey || !callbackAppKey) {
      throw new BadRequestException(
        'callbackToken/callbackAesKey are required, and callback appKey resolves from appKey or clientId'
      )
    }

    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = randomBytes(8).toString('hex')
    const encrypt = encryptDingTalkMessage({
      message: 'success',
      aesKey: options.callbackAesKey,
      appKey: callbackAppKey
    })

    return {
      msg_signature: computeDingTalkSignature({
        token: options.callbackToken,
        timestamp,
        nonce,
        encrypt
      }),
      encrypt,
      timeStamp: timestamp,
      nonce
    }
  }

  private toSafeNumber(value: unknown, fallback: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }

  private toSafeString(value: unknown): string {
    return typeof value === 'string' ? value : ''
  }

  private getQueryString(value: unknown): string {
    if (Array.isArray(value)) {
      return typeof value[0] === 'string' ? value[0] : ''
    }
    return typeof value === 'string' ? value : ''
  }

  private resolveCallbackAppKey(options: TIntegrationDingTalkOptions): string {
    const appKey = typeof options?.appKey === 'string' ? options.appKey.trim() : ''
    if (appKey) {
      return appKey
    }
    const clientId = typeof options?.clientId === 'string' ? options.clientId.trim() : ''
    return clientId
  }
}
