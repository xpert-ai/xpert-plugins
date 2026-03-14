import { IIntegration, IUser } from '@metad/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  runWithRequestContext,
  TChatEventContext,
  TChatEventHandlers,
  type PluginContext,
} from '@xpert-ai/plugin-sdk'
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Request,
  UseGuards
} from '@nestjs/common'
import express from 'express'
import { WeComAuthGuard } from './auth/wecom-auth.guard.js'
import { WeComConversationService } from './conversation.service.js'
import { Public } from './decorators/public.decorator.js'
import { WECOM_HTTP_SUBSCRIPTION_HINTS } from './wecom-integration.strategy.js'
import { WECOM_PLUGIN_CONTEXT } from './tokens.js'
import {
  decryptWeComMessage,
  INTEGRATION_WECOM,
  INTEGRATION_WECOM_LONG,
  TIntegrationWeComOptions,
  verifyWeComSignature,
} from './types.js'
import { WeComChannelStrategy } from './wecom-channel.strategy.js'
import { WeComLongConnectionService } from './wecom-long-connection.service.js'

@Controller('wecom')
export class WeComHooksController {
  private readonly logger = new Logger(WeComHooksController.name)
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    private readonly conversation: WeComConversationService,
    private readonly wecomChannel: WeComChannelStrategy,
    private readonly longConnection: WeComLongConnectionService,
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  @Public()
  @Get('webhook/:id')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async verifyWebhook(
    @Param('id') integrationId: string,
    @Query('msg_signature') msgSignature: string | string[],
    @Query('signature') signature: string | string[],
    @Query('timestamp') timestamp: string | string[],
    @Query('nonce') nonce: string | string[],
    @Query('echostr') echostr: string | string[]
  ): Promise<string> {
    try {
      const integration = await this.readShortIntegration(integrationId)
      const token = this.toSafeString(integration.options?.token)
      const encodingAesKey = this.toSafeString(integration.options?.encodingAesKey)

      if (!token || !encodingAesKey) {
        throw new BadRequestException('Integration token/encodingAesKey is required')
      }

      const signatureValue = this.getQueryString(msgSignature) || this.getQueryString(signature)
      const timestampValue = this.getQueryString(timestamp)
      const nonceValue = this.getQueryString(nonce)
      const echostrValue = this.getQueryString(echostr)

      if (!signatureValue && !timestampValue && !nonceValue && !echostrValue) {
        this.logger.debug(`[webhook-verify] integration=${integrationId} probe=true`)
        return 'success'
      }

      if (!signatureValue || !timestampValue || !nonceValue || !echostrValue) {
        throw new BadRequestException('Missing required query: msg_signature/timestamp/nonce/echostr')
      }

      if (
        !verifyWeComSignature({
          token,
          timestamp: timestampValue,
          nonce: nonceValue,
          encrypt: echostrValue,
          signature: signatureValue
        })
      ) {
        throw new BadRequestException('Invalid WeCom callback signature')
      }

      const plainEcho = decryptWeComMessage({
        encrypt: echostrValue,
        aesKey: encodingAesKey
      })

      this.logger.debug(`[webhook-verify] integration=${integrationId} verified=true`)
      return plainEcho
    } catch (error: any) {
      const message = error?.message || 'Unknown error'
      this.logger.error(`[verifyWebhook] integration=${integrationId} failed: ${message}`, error?.stack)
      if (error instanceof HttpException) {
        throw error
      }
      throw new BadRequestException(`WeCom verify webhook failed: ${message}`)
    }
  }

  @Public()
  @UseGuards(WeComAuthGuard)
  @Post('webhook/:id')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async webhook(
    @Param('id') integrationId: string,
    @Request() req: express.Request
  ): Promise<string> {
    try {
      const integration = await this.readShortIntegration(integrationId)
      const token = this.toSafeString(integration.options?.token)
      const encodingAesKey = this.toSafeString(integration.options?.encodingAesKey)

      if (!token || !encodingAesKey) {
        throw new BadRequestException('Integration token/encodingAesKey is required')
      }

      const signature = this.getQueryString((req.query as any)?.msg_signature) || this.getQueryString((req.query as any)?.signature)
      const timestamp = this.getQueryString((req.query as any)?.timestamp)
      const nonce = this.getQueryString((req.query as any)?.nonce)
      const encrypt = this.extractEncrypt(req.body)
      let eventPayload: Record<string, unknown> | null = null

      if (encrypt) {
        if (!signature || !timestamp || !nonce) {
          throw new BadRequestException('Missing required query: msg_signature/timestamp/nonce')
        }

        if (!verifyWeComSignature({ token, timestamp, nonce, encrypt, signature })) {
          throw new BadRequestException('Invalid WeCom callback signature')
        }

        const decrypted = decryptWeComMessage({
          encrypt,
          aesKey: encodingAesKey
        })
        eventPayload = this.parsePayloadText(decrypted)
        this.logger.debug(
          `[webhook] integration=${integrationId} encrypted=true ${this.describePayload(decrypted)}`
        )
      } else {
        eventPayload = this.parseBodyToObject(req.body)
        this.logger.debug(
          `[webhook] integration=${integrationId} encrypted=false ${this.describePayload(JSON.stringify(eventPayload || {}))}`
        )
      }

      if (!eventPayload) {
        return 'success'
      }

      req.body = eventPayload as any

      const ctx: TChatEventContext<TIntegrationWeComOptions> = {
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
        }
      }

      const handler = this.wecomChannel.createEventHandler(ctx, handlers)
      const contextUser = RequestContext.currentUser() ?? (req.user as IUser) ?? {
        id: `wecom:${integration.id}:anonymous`,
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
            handler(req as any, internalRes as any).then(resolve).catch(reject)
          }
        )
      })

      return 'success'
    } catch (error: any) {
      const message = error?.message || 'Unknown error'
      this.logger.error(`[webhook] integration=${integrationId} failed: ${message}`, error?.stack)
      if (error instanceof HttpException) {
        throw error
      }
      throw new BadRequestException(`WeCom webhook failed: ${message}`)
    }
  }

  @Get('callback-config')
  async getCallbackConfig(@Query('integration') integrationId: string) {
    if (!integrationId) {
      throw new BadRequestException('Missing query parameter: integration')
    }

    const integration = await this.readShortIntegration(integrationId)
    const apiBaseUrl = process.env.API_BASE_URL

    return {
      mode: 'http',
      callbackUrl: `${apiBaseUrl}/api/wecom/webhook/${integration.id}`,
      signatureAlgorithm: 'sha1(sort(token,timestamp,nonce,encrypt))',
      encryptedAck: false,
      expectedAckMs: 1500,
      requiredConfig: {
        token: Boolean(this.toSafeString(integration.options?.token)),
        encodingAesKey: Boolean(this.toSafeString(integration.options?.encodingAesKey))
      },
      subscriptionHints: [...WECOM_HTTP_SUBSCRIPTION_HINTS]
    }
  }

  @Get('integration-select-options')
  async getIntegrationSelectOptions(
    @Request() req: express.Request,
    @Query('keyword') keyword?: string
  ) {
    const [shortOptions, longOptions] = await Promise.all([
      this.fetchProviderSelectOptions(req, INTEGRATION_WECOM),
      this.fetchProviderSelectOptions(req, INTEGRATION_WECOM_LONG)
    ])

    const merged = [
      ...this.decorateProviderOptions(shortOptions, 'short'),
      ...this.decorateProviderOptions(longOptions, 'long')
    ]

    const deduped = new Map<string, { value: string; label: string; description?: string; icon?: string }>()
    for (const item of merged) {
      if (!item.value) {
        continue
      }
      deduped.set(item.value, item)
    }

    const normalizedKeyword = this.toSafeString(keyword).toLowerCase()
    const values = [...deduped.values()]
    if (!normalizedKeyword) {
      return values
    }

    return values.filter((item) => {
      const label = item.label.toLowerCase()
      const value = item.value.toLowerCase()
      const description = this.toSafeString(item.description).toLowerCase()
      return label.includes(normalizedKeyword) || value.includes(normalizedKeyword) || description.includes(normalizedKeyword)
    })
  }

  @Post('long/:id/connect')
  async connectLong(@Param('id') integrationId: string) {
    try {
      return await this.longConnection.connect(integrationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new BadRequestException(`WeCom long connect failed: ${message}`)
    }
  }

  @Post('long/:id/disconnect')
  async disconnectLong(@Param('id') integrationId: string) {
    try {
      return await this.longConnection.disconnect(integrationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new BadRequestException(`WeCom long disconnect failed: ${message}`)
    }
  }

  @Get('long/:id/status')
  async statusLong(@Param('id') integrationId: string) {
    try {
      return await this.longConnection.status(integrationId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new BadRequestException(`WeCom long status failed: ${message}`)
    }
  }

  private async readIntegration(integrationId: string): Promise<IIntegration<TIntegrationWeComOptions>> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWeComOptions>>(
      integrationId,
      {
        relations: ['tenant']
      }
    )

    if (!integration) {
      throw new BadRequestException(
        `Integration ${integrationId} not found. Please save the integration first before configuring webhook URL in WeCom.`
      )
    }

    return integration
  }

  private async readShortIntegration(integrationId: string): Promise<IIntegration<TIntegrationWeComOptions>> {
    const integration = await this.readIntegration(integrationId)
    if (integration.provider !== INTEGRATION_WECOM) {
      throw new BadRequestException(
        `Integration ${integrationId} is not short connection provider '${INTEGRATION_WECOM}'`
      )
    }
    return integration
  }

  private async fetchProviderSelectOptions(
    req: express.Request,
    provider: string
  ): Promise<Array<{ value: string; label: string; description?: string; icon?: string }>> {
    try {
      const host = this.toSafeString(req.get('host'))
      if (!host) {
        return []
      }

      const protocol = this.toSafeString(req.protocol) || 'http'
      const url = new URL(`${protocol}://${host}/api/integration/select-options`)
      url.searchParams.set('provider', provider)

      const headers: Record<string, string> = {}
      const authorization = this.toSafeString(req.headers?.authorization)
      const organizationId = this.toSafeString(req.headers?.['organization-id'])
      const tenantId = this.toSafeString(req.headers?.['tenant-id'])
      const language = this.toSafeString(req.headers?.language)

      if (authorization) {
        headers.authorization = authorization
      }
      if (organizationId) {
        headers['organization-id'] = organizationId
      }
      if (tenantId) {
        headers['tenant-id'] = tenantId
      }
      if (language) {
        headers.language = language
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        return []
      }

      const payload = (await response.json().catch(() => null)) as unknown
      if (!Array.isArray(payload)) {
        return []
      }

      return payload
        .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => {
          return {
            value: this.toSafeString(item.value),
            label: this.toSafeString(item.label),
            description: this.toSafeString(item.description) || undefined,
            icon: this.toSafeString(item.icon) || undefined
          }
        })
        .filter((item) => Boolean(item.value))
    } catch {
      return []
    }
  }

  private decorateProviderOptions(
    options: Array<{ value: string; label: string; description?: string; icon?: string }>,
    mode: 'short' | 'long'
  ): Array<{ value: string; label: string; description?: string; icon?: string }> {
    return options.map((item) => {
      const label = item.label || item.value
      if (mode === 'short') {
        return {
          ...item,
          label: label.includes('短连接') ? label : `${label}（短连接）`
        }
      }
      return {
        ...item,
        label: label.includes('长连接') ? label : `${label}（长连接）`
      }
    })
  }

  private parseBodyToObject(body: unknown): Record<string, unknown> | null {
    if (!body) {
      return null
    }

    if (typeof body === 'string') {
      return this.parsePayloadText(body)
    }

    if (typeof body === 'object') {
      return body as Record<string, unknown>
    }

    return null
  }

  private parsePayloadText(payload: string): Record<string, unknown> | null {
    const text = payload.trim()
    if (!text) {
      return null
    }

    if (text.startsWith('{')) {
      try {
        return JSON.parse(text) as Record<string, unknown>
      } catch {
        return null
      }
    }

    return {
      MsgType: this.matchXmlTag(text, 'MsgType') || this.matchXmlTag(text, 'msgType'),
      Event: this.matchXmlTag(text, 'Event') || this.matchXmlTag(text, 'event'),
      Content: this.matchXmlTag(text, 'Content') || this.matchXmlTag(text, 'content'),
      text: {
        content: this.matchXmlTag(text, 'Content') || this.matchXmlTag(text, 'content')
      },
      voice: {
        content: this.matchXmlTag(text, 'Voice') || this.matchXmlTag(text, 'voice')
      },
      file: {
        url: this.matchXmlTag(text, 'FileUrl') || this.matchXmlTag(text, 'fileurl')
      },
      from: {
        userid:
          this.matchXmlTag(text, 'UserId') ||
          this.matchXmlTag(text, 'userid') ||
          this.matchXmlTag(text, 'FromUserName') ||
          this.matchXmlTag(text, 'fromUserName'),
        corpid: this.matchXmlTag(text, 'CorpId') || this.matchXmlTag(text, 'corpid')
      },
      FromUserName: this.matchXmlTag(text, 'FromUserName') || this.matchXmlTag(text, 'fromUserName'),
      ChatId: this.matchXmlTag(text, 'ChatId') || this.matchXmlTag(text, 'chatId'),
      chatid: this.matchXmlTag(text, 'chatid') || this.matchXmlTag(text, 'ChatId') || this.matchXmlTag(text, 'chatId'),
      chattype: this.matchXmlTag(text, 'chattype') || this.matchXmlTag(text, 'ChatType') || this.matchXmlTag(text, 'chatType'),
      response_url:
        this.matchXmlTag(text, 'response_url') ||
        this.matchXmlTag(text, 'ResponseUrl') ||
        this.matchXmlTag(text, 'responseUrl'),
      MsgId: this.matchXmlTag(text, 'MsgId') || this.matchXmlTag(text, 'msgId'),
      msgid: this.matchXmlTag(text, 'msgid') || this.matchXmlTag(text, 'MsgId') || this.matchXmlTag(text, 'msgId'),
      CreateTime: this.matchXmlTag(text, 'CreateTime') || this.matchXmlTag(text, 'createTime'),
      create_time:
        this.matchXmlTag(text, 'create_time') || this.matchXmlTag(text, 'CreateTime') || this.matchXmlTag(text, 'createTime')
    }
  }

  private createInternalResponse() {
    const response = {
      statusCode: 200,
      body: '',
      status(code: number) {
        this.statusCode = code
        return this
      },
      send(payload: unknown) {
        this.body = typeof payload === 'string' ? payload : JSON.stringify(payload)
        return this
      },
      json(payload: unknown) {
        this.body = JSON.stringify(payload)
        return this
      }
    }
    return response
  }

  private describePayload(payload: string): string {
    const text = payload.trim()
    if (!text) {
      return 'event=unknown'
    }

    if (text.startsWith('{')) {
      try {
        const json = JSON.parse(text) as Record<string, unknown>
        const msgType = this.toSafeString(json.MsgType || json.msgType)
        const event = this.toSafeString(json.Event || json.event)
        return `event=${event || 'unknown'} msgType=${msgType || 'unknown'}`
      } catch {
        return 'event=unknown msgType=json'
      }
    }

    const event = this.matchXmlTag(text, 'Event') || this.matchXmlTag(text, 'event')
    const msgType = this.matchXmlTag(text, 'MsgType') || this.matchXmlTag(text, 'msgType')
    return `event=${event || 'unknown'} msgType=${msgType || 'unknown'}`
  }

  private matchXmlTag(xml: string, tagName: string): string {
    const cdataRegex = new RegExp(`<${tagName}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tagName}>`, 'i')
    const plainRegex = new RegExp(`<${tagName}>(.*?)<\\/${tagName}>`, 'i')
    const cdata = xml.match(cdataRegex)
    if (cdata?.[1]) {
      return cdata[1].trim()
    }
    const plain = xml.match(plainRegex)
    return plain?.[1]?.trim() || ''
  }

  private extractEncrypt(body: unknown): string {
    if (!body) {
      return ''
    }

    if (typeof body === 'string') {
      return this.matchXmlTag(body, 'Encrypt') || this.matchXmlTag(body, 'encrypt')
    }

    if (typeof body === 'object') {
      const record = body as Record<string, unknown>
      const direct = this.toSafeString(record.encrypt)
      const directUpper = this.toSafeString(record.Encrypt)
      if (direct) {
        return direct
      }
      if (directUpper) {
        return directUpper
      }

      const xml = record.xml as Record<string, unknown> | undefined
      if (xml && typeof xml === 'object') {
        const xmlEncrypt = xml.Encrypt
        const xmlEncryptLower = xml.encrypt
        if (Array.isArray(xmlEncrypt)) {
          return this.toSafeString(xmlEncrypt[0])
        }
        const normalized = this.toSafeString(xmlEncrypt)
        if (normalized) {
          return normalized
        }
        if (Array.isArray(xmlEncryptLower)) {
          return this.toSafeString(xmlEncryptLower[0])
        }
        return this.toSafeString(xmlEncryptLower)
      }
    }

    return ''
  }

  private toSafeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }

  private getQueryString(value: unknown): string {
    if (Array.isArray(value)) {
      return this.toSafeString(value[0])
    }
    return this.toSafeString(value)
  }
}
