import * as lark from '@larksuiteoapi/node-sdk'
import type { IIntegration, IUser } from '@metad/contracts'
import {
	getErrorMessage,
	INTEGRATION_PERMISSION_SERVICE_TOKEN,
	IntegrationPermissionService,
	type PluginContext
} from '@xpert-ai/plugin-sdk'
import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { LarkChannelStrategy } from './lark-channel.strategy.js'
import { LARK_PLUGIN_CONTEXT } from './tokens.js'
import { TIntegrationLarkOptions } from './types.js'

@Injectable()
export class LarkInboundIdentityService {
	private readonly logger = new Logger(LarkInboundIdentityService.name)
	private _integrationPermissionService: IntegrationPermissionService

	constructor(
		private readonly larkChannel: LarkChannelStrategy,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	private get integrationPermissionService(): IntegrationPermissionService {
		if (!this._integrationPermissionService) {
			this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
		}
		return this._integrationPermissionService
	}

	async readIntegration(integrationId: string): Promise<IIntegration<TIntegrationLarkOptions>> {
		const integration = await this.integrationPermissionService.read<IIntegration<TIntegrationLarkOptions>>(
			integrationId,
			{ relations: ['tenant'] }
		)

		if (!integration) {
			throw new BadRequestException(`Integration ${integrationId} not found`)
		}

		return integration
	}

	decryptWebhookBody(body: any, integration: IIntegration<TIntegrationLarkOptions>): any {
		if (!body?.encrypt) {
			return body
		}

		const encryptKey = integration.options?.encryptKey
		if (!encryptKey) {
			throw new BadRequestException('Encrypt Key is required for encrypted Lark webhook payload')
		}

		try {
			return JSON.parse(new lark.AESCipher(encryptKey).decrypt(body.encrypt))
		} catch (error: any) {
			throw new BadRequestException(`Failed to decrypt Lark webhook payload: ${error?.message || 'Unknown error'}`)
		}
	}

	async resolveUserForEvent(
		integration: IIntegration<TIntegrationLarkOptions>,
		payload: any
	): Promise<IUser> {
		const unionId = this.extractUnionId(payload)
		if (!unionId) {
			throw new UnauthorizedException(`Can't get union_id from Lark event`)
		}

		const client = this.larkChannel.getOrCreateLarkClient(integration).client
		const user = await this.larkChannel.getUser(
			client,
			integration.tenantId,
			unionId,
			integration.options?.userProvision,
			integration.organizationId
		)

		if (!user) {
			throw new UnauthorizedException(`No mapped user found for union_id '${unionId}'`)
		}

		return user
	}

	private extractUnionId(payload: any): string | null {
		const eventType = payload?.header?.event_type || payload?.event_type
		switch (eventType) {
			case 'card.action.trigger':
				return payload?.event?.operator?.union_id || payload?.operator?.union_id || null
			case 'im.message.receive_v1':
				return payload?.event?.sender?.sender_id?.union_id || payload?.sender?.sender_id?.union_id || null
			default:
				this.logger.warn(`Unsupported Lark event type for user resolution: ${String(eventType)}`)
				return null
		}
	}

	toUnauthorizedError(error: unknown): UnauthorizedException {
		return new UnauthorizedException('Invalid user', getErrorMessage(error))
	}
}
