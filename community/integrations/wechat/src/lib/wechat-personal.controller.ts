import { BadRequestException, Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Request, UseGuards } from '@nestjs/common'
import { IApiPrincipal, IIntegration } from '@xpert-ai/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  PluginWebhookAuth,
  PluginWebhookAuthGuard,
  runWithRequestContext,
  TChatEventContext,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Public } from './decorators.js'
import { WECHAT_PERSONAL_ICON, WECHAT_PERSONAL_PROVIDER_KEY } from './constants.js'
import { WECHAT_PERSONAL_PLUGIN_CONTEXT } from './tokens.js'
import { WechatPersonalConversationService } from './conversation.service.js'
import { TIntegrationWechatPersonalOptions, normalizeString } from './types.js'
import { WechatPersonalChannelStrategy } from './wechat-personal-channel.strategy.js'

type HttpRequestLike = {
  user?: unknown
  headers?: Record<string, unknown>
}

type WechatPersonalWebhookPrincipalContext = {
  user: IApiPrincipal
  headers: Record<string, string>
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
  @PluginWebhookAuth({
    provider: WECHAT_PERSONAL_PROVIDER_KEY,
    integrationParam: 'id',
    secretQueryParam: 'secret'
  })
  @UseGuards(PluginWebhookAuthGuard)
  @Post('webhook/:id')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async webhook(
    @Param('id') integrationId: string,
    @Request() req: HttpRequestLike,
    @Body() body: unknown
  ): Promise<string> {
    const integration = await this.readWechatPersonalIntegration(integrationId)

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
    const principalContext = this.resolveGuardedWebhookPrincipalContext(req, integration)

    await new Promise<void>((resolve, reject) => {
      runWithRequestContext(
        {
          user: principalContext.user,
          headers: principalContext.headers
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
  async getIntegrationSelectOptions(@Query('keyword') keyword?: string) {
    const options = await this.listWechatPersonalSelectOptions()
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
    return await this.conversation.buildCallbackConfig(integration.id)
  }

  @Post(':integrationId/accounts/:uuid/register-callback')
  async registerCallback(
    @Param('integrationId') integrationId: string,
    @Param('uuid') uuid: string,
    @Body() body: { callbackUrl?: string; enabled?: boolean }
  ) {
    const integration = await this.readWechatPersonalIntegration(integrationId)
    const callbackConfig = await this.conversation.buildCallbackConfig(integration.id, {
      requireActiveCredential: true
    })
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

  private async listWechatPersonalSelectOptions(): Promise<
    Array<{ value: string; label: string; description?: string; icon?: string }>
  > {
    const result = await this.integrationPermissionService.findAll<IIntegration<TIntegrationWechatPersonalOptions>>({
      where: {
        provider: WECHAT_PERSONAL_PROVIDER_KEY
      },
      order: {
        updatedAt: 'DESC'
      },
      take: 100
    })

    return (result.items ?? [])
      .filter((integration) => integration?.provider === WECHAT_PERSONAL_PROVIDER_KEY)
      .map((integration) => ({
        value: this.toSafeString(integration.id),
        label: this.toSafeString(integration.name) || this.toSafeString(integration.id),
        description: this.toSafeString(integration.description) || undefined,
        icon: WECHAT_PERSONAL_ICON
      }))
      .filter((item) => Boolean(item.value))
  }

  private resolveGuardedWebhookPrincipalContext(
    req: HttpRequestLike,
    integration: IIntegration<TIntegrationWechatPersonalOptions>
  ): WechatPersonalWebhookPrincipalContext {
    const user = req.user as IApiPrincipal | undefined
    if (!user?.apiKey) {
      throw new BadRequestException('Personal WeChat webhook principal is required')
    }

    const headers = this.resolveWebhookPrincipalHeaders(req, integration)
    return {
      user,
      headers
    }
  }

  private resolveWebhookPrincipalHeaders(
    req: HttpRequestLike,
    integration: IIntegration<TIntegrationWechatPersonalOptions>
  ): Record<string, string> {
    const headers = req.headers ?? {}
    const tenantId = this.toSafeString(headers['tenant-id']) || this.toSafeString(integration.tenantId)
    const organizationId = this.toSafeString(headers['organization-id']) || this.toSafeString(integration.organizationId)
    const principalHeaders: Record<string, string> = {
      'tenant-id': tenantId,
      'x-scope-level': organizationId ? 'organization' : 'tenant'
    }
    if (organizationId) {
      principalHeaders['organization-id'] = organizationId
    }
    const language = this.toSafeString(headers.language) || this.toSafeString(integration.options?.preferLanguage)
    if (language) {
      principalHeaders.language = language
    }
    return principalHeaders
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
