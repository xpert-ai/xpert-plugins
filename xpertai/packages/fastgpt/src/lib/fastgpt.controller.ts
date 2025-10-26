import { type IIntegration } from '@metad/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { FastGPTService } from './fastgpt.service.js'

@Controller()
export class FastGPTController {
	constructor(
		private service: FastGPTService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
