import { type IIntegration } from '@metad/contracts'
import { Body, Controller, Post } from '@nestjs/common'
import { RAGFlowService } from './ragflow.service.js'

@Controller('ragflow')
export class RAGFlowController {
	constructor(
		private service: RAGFlowService,
	) {}

	@Post('test')
	async connect(@Body() integration: IIntegration) {
		await this.service.test(integration)
	}
}
