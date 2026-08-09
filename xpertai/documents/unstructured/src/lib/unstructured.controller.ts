import { type IIntegration } from '@xpert-ai/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { UnstructuredService } from './unstructured.service.js'
import { Unstructured } from './types.js'

@Controller(Unstructured)
export class UnstructuredController {
	constructor(
		private service: UnstructuredService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
