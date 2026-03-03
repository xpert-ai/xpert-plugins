import { ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard as PassportAuthGaurd } from '@nestjs/passport'

@Injectable()
export class DingTalkAuthGuard extends PassportAuthGaurd(['dingtalk-token']) {
	constructor(private readonly _reflector: Reflector) {
		super()
	}

	override canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest()
		const data = request.body

		// Allow url_verification requests to pass through without authentication
		// This is required for DingTalk webhook URL verification (challenge)
		if (data?.type === 'url_verification') {
			return true
		}

		return super.canActivate(context)
	}
}
