import { IIntegration } from '@metad/contracts'
import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import express from 'express'
import { Strategy } from 'passport'
import { DINGTALK_PLUGIN_CONTEXT } from '../tokens.js'
import { TIntegrationDingTalkOptions } from '../types.js'

@Injectable()
export class DingTalkTokenStrategy extends PassportStrategy(Strategy, 'dingtalk-token') {
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    @Inject(DINGTALK_PLUGIN_CONTEXT)
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

  override authenticate(req: express.Request): void {
    const integrationId = req.params.id as string

    ;(async () => {
      try {
        const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationDingTalkOptions>>(
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
        // Anonymous mode: do not force user provisioning at webhook layer.
        this.success({
          id: contextUserId ?? `dingtalk:${integrationId}:anonymous`,
          tenantId: integration.tenantId,
          organizationId: integration.organizationId
        })
      } catch (error) {
        this.fail(error instanceof Error ? error : new UnauthorizedException('Invalid integration'))
      }
    })()
  }

  validate(): never {
    throw new Error('Not used in custom authenticate flow')
  }

  private resolveContextUserId(integration: IIntegration<TIntegrationDingTalkOptions>): string | null {
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
