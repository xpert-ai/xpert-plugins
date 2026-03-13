import { IIntegration } from '@metad/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport'
import { WECOM_PLUGIN_CONTEXT } from '../tokens.js'
import { TIntegrationWeComOptions } from '../types.js'

@Injectable()
export class WeComTokenStrategy extends PassportStrategy(Strategy, 'wecom-token') {
  private readonly logger = new Logger(WeComTokenStrategy.name)
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    @Inject(WECOM_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {
    super()
  }

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  override authenticate(req: any): void {
    const integrationId = req?.params?.id as string

    ;(async () => {
      try {
        const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationWeComOptions>>(
          integrationId,
          {
            relations: ['tenant']
          }
        )

        if (!integration) {
          throw new UnauthorizedException(`Integration ${integrationId} not found`)
        }

        req.headers['organization-id'] = integration.organizationId
        const contextUserId = this.resolveContextUserId(integration)
        this.success({
          id: contextUserId ?? `wecom:${integrationId}:anonymous`,
          tenantId: integration.tenantId,
          organizationId: integration.organizationId
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid integration'
        this.logger.warn(`[authenticate] integration=${integrationId || 'unknown'} failed: ${message}`)
        this.fail(new UnauthorizedException(message))
      }
    })()
  }

  validate(): never {
    throw new Error('Not used in custom authenticate flow')
  }

  private resolveContextUserId(integration: IIntegration<TIntegrationWeComOptions>): string | null {
    const candidate = [integration?.createdById, integration?.updatedById]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find((value) => this.isUuid(value))

    return candidate || null
  }

  private isUuid(value: string | undefined | null): boolean {
    if (!value) {
      return false
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  }
}
