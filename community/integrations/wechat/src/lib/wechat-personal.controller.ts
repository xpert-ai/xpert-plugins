import { BadRequestException, Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Request } from '@nestjs/common'
import { IIntegration, IUser } from '@xpert-ai/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  RequestContext,
  runWithRequestContext,
  TChatEventContext,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Public } from './decorators.js'
import { WECHAT_PERSONAL_PROVIDER_KEY } from './constants.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from './tokens.js'
import { WechatPersonalConversationService } from './conversation.service.js'
import { TIntegrationWechatPersonalOptions, normalizeString } from './types.js'
import { WechatPersonalChannelStrategy } from './wechat-personal-channel.strategy.js'

type HttpRequestLike = {
  user?: unknown
  protocol?: string
  headers?: Record<string, unknown>
  get?: (name: string) => string | undefined
}

@Controller('wechat-personal')
export class WechatPersonalController {
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    private readonly conversation: WechatPersonalConversationService,
    private readonly wechatChannel: WechatPersonalChannelStrategy,
    @Inject(WECHAT_PERSONAL_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  @Public()
  @Post('webhook/:id')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async webhook(
    @Param('id') integrationId: string,
    @Request() req: HttpRequestLike,
    @Body() body: unknown,
    @Query('secret') querySecret?: string
  ): Promise<string> {
    const integration = await this.readWechatPersonalIntegration(integrationId)
    this.verifyCallbackSecret(integration, req, querySecret)

    const payload = this.parseBodyToObject(body)
    if (!payload) {
      return 'success'
    }

    const event = this.wechatChannel.normalizeWebhookEvent(payload)
    if (!event) {
      return 'success'
    }

    const ctx: TChatEventContext<TIntegrationWechatPersonalOptions> = {
      integration,
      tenantId: integration.tenantId,
      organizationId: integration.organizationId
    }
    const contextUser = RequestContext.currentUser() ?? (req.user as IUser) ?? {
      id: `wechat-personal:${integration.id}:anonymous`,
      tenantId: integration.tenantId,
      organizationId: integration.organizationId
    }
    const requestHeaders: Record<string, string> = {
      ['tenant-id']: integration.tenantId,
      ['organization-id']: integration.organizationId
    }
    if (integration.options?.preferLanguage) {
      requestHeaders.language = integration.options.preferLanguage
    }

    await new Promise<void>((resolve, reject) => {
      runWithRequestContext(
        {
          user: contextUser,
          headers: requestHeaders
        },
        {},
        () => {
          this.conversation.handleInboundEvent(event, ctx).then(() => resolve()).catch(reject)
        }
      )
    })

    return 'success'
  }

  @Get('integration-select-options')
  async getIntegrationSelectOptions(@Request() req: HttpRequestLike, @Query('keyword') keyword?: string) {
    const options = await this.fetchProviderSelectOptions(req, WECHAT_PERSONAL_PROVIDER_KEY)
    const normalizedKeyword = this.toSafeString(keyword).toLowerCase()
    if (!normalizedKeyword) {
      return options
    }

    return options.filter((item) => {
      const label = item.label.toLowerCase()
      const value = item.value.toLowerCase()
      const description = this.toSafeString(item.description).toLowerCase()
      return label.includes(normalizedKeyword) || value.includes(normalizedKeyword) || description.includes(normalizedKeyword)
    })
  }

  @Get(':integrationId/callback-config')
  async getCallbackConfig(@Param('integrationId') integrationId: string) {
    const integration = await this.readWechatPersonalIntegration(integrationId)
    return this.conversation.buildCallbackConfig(integration.id, integration.options?.callbackSecret)
  }

  @Post(':integrationId/accounts/:uuid/register-callback')
  async registerCallback(
    @Param('integrationId') integrationId: string,
    @Param('uuid') uuid: string,
    @Body() body: { callbackUrl?: string; enabled?: boolean }
  ) {
    const integration = await this.readWechatPersonalIntegration(integrationId)
    const callbackConfig = this.conversation.buildCallbackConfig(integration.id, integration.options?.callbackSecret)
    const result = await this.wechatChannel.registerCallback({
      integrationId: integration.id,
      uuid,
      callbackUrl: normalizeString(body?.callbackUrl) || callbackConfig.webhookUrl,
      enabled: body?.enabled !== false
    })
    if (!result.success) {
      throw new BadRequestException(result.error || 'Register wx2.0 callback failed')
    }
    return result
  }

  @Post(':integrationId/send-text')
  async sendText(
    @Param('integrationId') integrationId: string,
    @Body()
    body: {
      uuid?: string
      contactId?: string
      contactid?: string
      text?: string
      content?: string
      textcontent?: string
      atUsers?: string[]
      atusers?: string[]
    }
  ) {
    const integration = await this.readWechatPersonalIntegration(integrationId)
    const result = await this.wechatChannel.sendTextByIntegrationId(integration.id, {
      uuid: body?.uuid,
      contactId: body?.contactId || body?.contactid,
      content: body?.text || body?.content || body?.textcontent || '',
      atUsers: Array.isArray(body?.atUsers) ? body.atUsers : Array.isArray(body?.atusers) ? body.atusers : []
    })
    if (!result.success) {
      throw new BadRequestException(result.error || 'Send wx2.0 text failed')
    }
    return result
  }

  private async readWechatPersonalIntegration(
    integrationId: string
  ): Promise<IIntegration<TIntegrationWechatPersonalOptions>> {
    const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWechatPersonalOptions>>(
      integrationId,
      {
        relations: ['tenant']
      }
    )
    if (!integration) {
      throw new BadRequestException(
        `Integration ${integrationId} not found. Please save the personal WeChat integration first.`
      )
    }
    if (integration.provider !== WECHAT_PERSONAL_PROVIDER_KEY) {
      throw new BadRequestException(
        `Integration ${integrationId} is not provider '${WECHAT_PERSONAL_PROVIDER_KEY}'`
      )
    }
    return integration
  }

  private verifyCallbackSecret(
    integration: IIntegration<TIntegrationWechatPersonalOptions>,
    req: HttpRequestLike,
    querySecret?: string
  ): void {
    const expected = this.toSafeString(integration.options?.callbackSecret)
    if (!expected) {
      return
    }
    const provided =
      this.toSafeString(querySecret) ||
      this.toSafeString(req.headers['x-wechat-callback-secret']) ||
      this.toSafeString(req.headers['x-xpert-callback-secret'])
    if (provided !== expected) {
      throw new BadRequestException('Invalid personal WeChat callback secret')
    }
  }

  private async fetchProviderSelectOptions(
    req: HttpRequestLike,
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
        .map((item) => ({
          value: this.toSafeString(item.value),
          label: this.toSafeString(item.label) || this.toSafeString(item.value),
          description: this.toSafeString(item.description) || undefined,
          icon: this.toSafeString(item.icon) || undefined
        }))
        .filter((item) => Boolean(item.value))
    } catch {
      return []
    }
  }

  private parseBodyToObject(body: unknown): Record<string, unknown> | null {
    if (!body) {
      return null
    }
    if (typeof body === 'string') {
      const text = body.trim()
      if (!text) {
        return null
      }
      try {
        return JSON.parse(text) as Record<string, unknown>
      } catch {
        return null
      }
    }
    if (typeof body === 'object') {
      return body as Record<string, unknown>
    }
    return null
  }

  private toSafeString(value: unknown): string {
    if (Array.isArray(value)) {
      return this.toSafeString(value[0])
    }
    return typeof value === 'string' ? value.trim() : ''
  }
}
