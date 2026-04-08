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

export const LARK_INBOUND_IDENTITY_KEY = 'larkInboundIdentity'

export type TLarkInboundIdentityMetadata = {
	integrationId: string
	unionId: string
	requestUserId: string
	mappedUserId?: string
	usedCreatorFallback: boolean
}

export type TLarkResolvedInboundIdentity = {
	requestUser: IUser
	mappedUser: IUser | null
	metadata: TLarkInboundIdentityMetadata
}

export function getLarkInboundIdentityMetadata(
	user?: IUser | null
): TLarkInboundIdentityMetadata | null {
	return ((user as any)?.[LARK_INBOUND_IDENTITY_KEY] as TLarkInboundIdentityMetadata | undefined) ?? null
}

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

	async resolveInboundIdentityForEvent(
		integration: IIntegration<TIntegrationLarkOptions>,
		payload: any
	): Promise<TLarkResolvedInboundIdentity> {
		const unionId = this.extractUnionId(payload)
		if (!unionId) {
			throw new UnauthorizedException(`Can't get union_id from Lark event`)
		}

		const client = this.larkChannel.getOrCreateLarkClient(integration).client
		const mappedUser = await this.larkChannel.getUser(
			client,
			integration.tenantId,
			unionId,
			integration.options?.userProvision,
			integration.organizationId
		)

		if (mappedUser) {
			return this.createResolvedIdentity(integration, unionId, mappedUser, mappedUser)
		}

		const creatorUser = await this.resolveIntegrationCreator(integration)
		if (!creatorUser) {
			throw new UnauthorizedException(
				`No mapped user found for union_id '${unionId}', and integration creator is unavailable`
			)
		}

		return this.createResolvedIdentity(integration, unionId, creatorUser, null)
	}

	async resolveUserForEvent(
		integration: IIntegration<TIntegrationLarkOptions>,
		payload: any
	): Promise<IUser> {
		return (await this.resolveInboundIdentityForEvent(integration, payload)).requestUser
	}

	private async resolveIntegrationCreator(
		integration: IIntegration<TIntegrationLarkOptions>
	): Promise<IUser | null> {
		if (!integration?.tenantId || !integration?.createdById) {
			this.logger.warn(
				`Unable to resolve integration creator for integration "${integration?.id ?? 'unknown'}": missing tenantId or createdById`
			)
			return null
		}
		return this.larkChannel.getUserById(integration.tenantId, integration.createdById)
	}

	private createResolvedIdentity(
		integration: IIntegration<TIntegrationLarkOptions>,
		unionId: string,
		requestUser: IUser,
		mappedUser: IUser | null
	): TLarkResolvedInboundIdentity {
		const metadata: TLarkInboundIdentityMetadata = {
			integrationId: integration.id,
			unionId,
			requestUserId: requestUser.id,
			mappedUserId: mappedUser?.id,
			usedCreatorFallback: !mappedUser
		}
		return {
			requestUser: {
				...requestUser,
				[LARK_INBOUND_IDENTITY_KEY]: metadata
			} as IUser,
			mappedUser,
			metadata
		}
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
