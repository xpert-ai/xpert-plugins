import { type IIntegration } from '@xpert-ai/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { FastGPTService } from './fastgpt.service.js'

@Controller('fastgpt')
export class FastGPTController {
	constructor(
		private service: FastGPTService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
