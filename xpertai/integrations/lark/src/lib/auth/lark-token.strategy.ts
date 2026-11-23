import { Injectable, Logger } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import express from 'express'
import { Strategy } from 'passport'
import { LarkInboundIdentityService } from '../lark-inbound-identity.service.js'

@Injectable()
export class LarkTokenStrategy extends PassportStrategy(Strategy, 'lark-token') {
	validate(...args: any[]): unknown {
		throw new Error('Method not implemented.')
	}
	readonly logger = new Logger(LarkTokenStrategy.name)

	constructor(private readonly inboundIdentityService: LarkInboundIdentityService) {
		super()
	}

	override authenticate(req: express.Request, options: { session: boolean; property: string }) {
		const integrationId = req.params.id as string
		let data = req.body

		this.logger.verbose('Lark webhook received')
		;(async () => {
			try {
				const integration = await this.inboundIdentityService.readIntegration(integrationId)
				req.headers['organization-id'] = integration.organizationId

				data = this.inboundIdentityService.decryptWebhookBody(data, integration)

				const token = integration.options?.verificationToken
				;(req as express.Request & { verifiedDecisionChannel?: boolean }).verifiedDecisionChannel =
					!!token && !!integration.options.appId && data.header?.token === token &&
					data.header.app_id === integration.options.appId
				if (data.type === 'url_verification') {
					this.success({})
				} else {
					const identity = await this.inboundIdentityService.resolveInboundIdentityForEvent(
						integration,
						data
					)
					;(req as any).larkInboundIdentity = identity.metadata

					// Set language header
					req.headers['language'] =
						integration.options?.preferLanguage || identity.requestUser.preferredLanguage
					this.success(identity.requestUser)
				}
			} catch (err) {
				this.logger.warn('Lark webhook identity validation failed for integration ' + integrationId)
				this.fail(this.inboundIdentityService.toUnauthorizedError(err))
			}
		})()
	}
}
